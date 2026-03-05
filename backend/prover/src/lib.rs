//! Bear Trap Prover — Boundless proof generation library.
//!
//! Supports two modes:
//! - **Testnet (mock):** Returns mock proofs accepted by MockRiscZeroVerifier
//! - **Mainnet (real):** Submits to Boundless Market (offchain-first, falls back to onchain)

use alloy::signers::{local::PrivateKeySigner, Signer};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProverConfig {
    pub rpc_url: String,
    pub private_key: String,
    pub pinata_jwt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofResult {
    pub seal: Vec<u8>,
    pub journal: Vec<u8>,
    pub solver_address: String,
    pub solution_hash: String,
    pub puzzle_id: u64,
}

/// Sign the operator attestation message: keccak256(abi.encodePacked(solverAddress, puzzleId, expectedHash))
async fn sign_operator_attestation(
    operator_signer: &PrivateKeySigner,
    solver_address: &str,
    puzzle_id: u64,
    expected_hash: &str,
) -> Result<(Vec<u8>, String)> {
    use alloy::primitives::{keccak256, Address, B256, U256};

    let addr: Address = solver_address.parse()?;
    let hash: B256 = expected_hash.parse()?;
    let puzzle_id_u256 = U256::from(puzzle_id);

    // abi.encodePacked(address, uint256, bytes32) = 20 + 32 + 32 = 84 bytes
    let mut packed = Vec::with_capacity(84);
    packed.extend_from_slice(addr.as_slice()); // 20 bytes
    packed.extend_from_slice(&puzzle_id_u256.to_be_bytes::<32>()); // 32 bytes
    packed.extend_from_slice(hash.as_slice()); // 32 bytes

    let msg_hash = keccak256(&packed);

    let sig = operator_signer.sign_hash(&msg_hash).await?;
    let sig_bytes = {
        let mut buf = Vec::with_capacity(65);
        buf.extend_from_slice(&sig.as_bytes()[..64]); // r + s
        let v_bit: u8 = if sig.v() { 1 } else { 0 };
        buf.push(v_bit + 27); // v in Ethereum convention (27/28)
        buf
    };

    let operator_address = format!("{:?}", operator_signer.address());

    Ok((sig_bytes, operator_address))
}

pub async fn generate_mock_proof(
    guess: &str,
    solver_address: &str,
    expected_hash: &str,
    puzzle_id: u64,
    operator_signer: &PrivateKeySigner,
) -> Result<ProofResult> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(guess.as_bytes());
    let guess_hash = hex::encode(hasher.finalize());
    let expected_clean = expected_hash.strip_prefix("0x").unwrap_or(expected_hash);

    if guess_hash != expected_clean {
        anyhow::bail!("Wrong guess. Your ticket has been consumed.");
    }

    // Sign operator attestation (validates the mock flow matches real flow)
    let (_sig_bytes, _operator_address) =
        sign_operator_attestation(operator_signer, solver_address, puzzle_id, expected_hash)
            .await?;

    let journal = encode_journal(solver_address, expected_hash, puzzle_id)?;

    Ok(ProofResult {
        seal: vec![0u8; 32],
        journal,
        solver_address: solver_address.to_string(),
        solution_hash: expected_hash.to_string(),
        puzzle_id,
    })
}

/// ABI-encode `(address, bytes32, uint256)` matching the guest program's journal output format.
fn encode_journal(solver_address: &str, solution_hash: &str, puzzle_id: u64) -> Result<Vec<u8>> {
    let addr_clean = solver_address.strip_prefix("0x").unwrap_or(solver_address);
    let hash_clean = solution_hash.strip_prefix("0x").unwrap_or(solution_hash);

    let addr_bytes = hex::decode(addr_clean)?;
    if addr_bytes.len() != 20 {
        anyhow::bail!(
            "Invalid solver address length: expected 20 bytes, got {}",
            addr_bytes.len()
        );
    }

    let hash_bytes = hex::decode(hash_clean)?;
    if hash_bytes.len() != 32 {
        anyhow::bail!(
            "Invalid solution hash length: expected 32 bytes, got {}",
            hash_bytes.len()
        );
    }

    // ABI encode: (address=32, bytes32=32, uint256=32) = 96 bytes
    let mut encoded = Vec::with_capacity(96);

    let mut addr_padded = [0u8; 32];
    addr_padded[12..32].copy_from_slice(&addr_bytes);
    encoded.extend_from_slice(&addr_padded);

    encoded.extend_from_slice(&hash_bytes);

    let mut puzzle_id_padded = [0u8; 32];
    puzzle_id_padded[24..32].copy_from_slice(&puzzle_id.to_be_bytes());
    encoded.extend_from_slice(&puzzle_id_padded);

    Ok(encoded)
}

fn load_guest_elf() -> Result<Vec<u8>> {
    const LOCAL_DEV_PATH: &str =
        "guests/puzzle-solver/target/riscv-guest/riscv32im-risc0-zkvm-elf/release/puzzle-solver";
    const DOCKER_PATH: &str = "/app/puzzle-solver.elf";

    let paths: Vec<(String, &str)> = if let Ok(env_path) = std::env::var("GUEST_ELF_PATH") {
        vec![
            (env_path, "GUEST_ELF_PATH"),
            (LOCAL_DEV_PATH.to_string(), "local dev"),
            (DOCKER_PATH.to_string(), "Docker/Railway"),
        ]
    } else {
        vec![
            (LOCAL_DEV_PATH.to_string(), "local dev"),
            (DOCKER_PATH.to_string(), "Docker/Railway"),
        ]
    };

    for (path, label) in &paths {
        if let Ok(elf) = std::fs::read(path) {
            tracing::info!("Loaded guest ELF from {} path: {}", label, path);
            return Ok(elf);
        }
    }

    anyhow::bail!(
        "Failed to read guest ELF binary from any path. Tried: {}",
        paths
            .iter()
            .map(|(p, _)| p.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    )
}

pub async fn generate_proof(
    config: &ProverConfig,
    guess: &str,
    solver_address: &str,
    expected_hash: &str,
    puzzle_id: u64,
    operator_signer: &PrivateKeySigner,
) -> Result<ProofResult> {
    use alloy_primitives::{Address, FixedBytes, U256};
    use alloy_sol_types::{sol, SolValue};
    use boundless_market::client::Client;

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(guess.as_bytes());
    let guess_hash = hex::encode(hasher.finalize());
    let expected_clean = expected_hash.strip_prefix("0x").unwrap_or(expected_hash);

    if guess_hash != expected_clean {
        anyhow::bail!("Wrong guess. Your ticket has been consumed.");
    }

    let (sig_bytes, operator_address) =
        sign_operator_attestation(operator_signer, solver_address, puzzle_id, expected_hash)
            .await?;

    sol! {
        struct PuzzleInput {
            string guess;
            address solverAddress;
            bytes32 expectedHash;
            uint256 puzzleId;
            bytes operatorSig;
            address operatorAddress;
        }
    }

    let solver_addr: Address = solver_address.parse()?;
    let expected_hash_bytes: FixedBytes<32> = expected_hash.parse()?;
    let operator_addr: Address = operator_address.parse()?;

    let input = PuzzleInput {
        guess: guess.to_string(),
        solverAddress: solver_addr,
        expectedHash: expected_hash_bytes,
        puzzleId: U256::from(puzzle_id),
        operatorSig: sig_bytes.into(),
        operatorAddress: operator_addr,
    };
    let encoded_input = input.abi_encode();

    let guest_elf = load_guest_elf()?;

    let rpc_url: url::Url = config.rpc_url.parse()?;

    let client = Client::builder()
        .with_rpc_url(rpc_url)
        .with_private_key_str(&config.private_key)?
        .build()
        .await?;

    tracing::info!("Submitting proof request to Boundless Market (offchain-first)...");

    let request = client
        .new_request()
        .with_program(guest_elf)
        .with_stdin(encoded_input);

    let (request_id, expires_at) = client.submit(request).await?;

    tracing::info!(
        "Proof request submitted: id={:x}, expires_at={}",
        request_id,
        expires_at
    );

    let fulfillment = client
        .wait_for_request_fulfillment(request_id, Duration::from_secs(10), expires_at)
        .await?;

    tracing::info!("Proof request {:x} fulfilled!", request_id);

    let fulfillment_data = fulfillment.data().map_err(|e| anyhow::anyhow!("Failed to parse fulfillment data: {e}"))?;
    let seal = fulfillment.seal.to_vec();
    let journal = fulfillment_data.journal().ok_or_else(|| anyhow::anyhow!("Missing journal in fulfillment"))?.to_vec();

    Ok(ProofResult {
        seal,
        journal,
        solver_address: solver_address.to_string(),
        solution_hash: expected_hash.to_string(),
        puzzle_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_operator_signer() -> PrivateKeySigner {
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
            .parse()
            .unwrap()
    }

    #[test]
    fn test_encode_journal() {
        let addr = "0x000000000000000000000000000000000000bEEF";
        let hash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        let journal = encode_journal(addr, hash, 42).unwrap();
        assert_eq!(journal.len(), 96);
        assert_eq!(journal[30], 0xbe);
        assert_eq!(journal[31], 0xef);
        // puzzleId = 42 at offset 64..96 (big-endian u256)
        assert_eq!(journal[95], 42);
    }

    #[tokio::test]
    async fn test_mock_proof_correct_guess() {
        use sha2::{Digest, Sha256};
        let guess = "secret answer";
        let mut hasher = Sha256::new();
        hasher.update(guess.as_bytes());
        let hash = format!("0x{}", hex::encode(hasher.finalize()));

        let signer = test_operator_signer();
        let result = generate_mock_proof(
            guess,
            "0x000000000000000000000000000000000000bEEF",
            &hash,
            0,
            &signer,
        )
        .await
        .unwrap();

        assert_eq!(result.seal.len(), 32);
        assert!(result.seal.iter().all(|&b| b == 0));
        assert_eq!(result.journal.len(), 96);
        assert_eq!(result.puzzle_id, 0);
    }

    #[tokio::test]
    async fn test_mock_proof_wrong_guess() {
        let signer = test_operator_signer();
        let result = generate_mock_proof(
            "wrong answer",
            "0x000000000000000000000000000000000000bEEF",
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            0,
            &signer,
        )
        .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Wrong guess"));
    }

    #[tokio::test]
    async fn test_mock_proof_with_puzzle_id() {
        use sha2::{Digest, Sha256};
        let guess = "secret answer";
        let mut hasher = Sha256::new();
        hasher.update(guess.as_bytes());
        let hash = format!("0x{}", hex::encode(hasher.finalize()));

        let signer = test_operator_signer();
        let result = generate_mock_proof(
            guess,
            "0x000000000000000000000000000000000000bEEF",
            &hash,
            7,
            &signer,
        )
        .await
        .unwrap();

        assert_eq!(result.puzzle_id, 7);
        // puzzleId encoded in journal at bytes 64..96
        assert_eq!(result.journal[95], 7);
    }

    #[tokio::test]
    async fn test_operator_attestation_signature() {
        let signer = test_operator_signer();
        let (sig_bytes, operator_address) = sign_operator_attestation(
            &signer,
            "0x000000000000000000000000000000000000bEEF",
            0,
            "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        )
        .await
        .unwrap();

        assert_eq!(sig_bytes.len(), 65);
        assert!(!operator_address.is_empty());
        // v byte should be 27 or 28
        assert!(sig_bytes[64] == 27 || sig_bytes[64] == 28);
    }
}
