//! Bear Trap Prover — Boundless proof generation library.
//!
//! This crate wraps the Boundless SDK to generate RISC0 ZK proofs for puzzle guesses.
//! It supports two modes:
//! - **Testnet (mock):** Returns mock proofs accepted by MockRiscZeroVerifier
//! - **Mainnet (real):** Submits to Boundless Market (offchain-first, falls back to onchain)

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Configuration for the Boundless prover.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProverConfig {
    /// RPC URL for the target chain (Base).
    pub rpc_url: String,
    /// Private key for signing Boundless market transactions.
    pub private_key: String,
    /// Optional Pinata JWT for uploading guest ELF to IPFS.
    pub pinata_jwt: Option<String>,
}

/// Result of a successful proof generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofResult {
    /// The RISC0 proof seal bytes.
    pub seal: Vec<u8>,
    /// The RISC0 journal bytes (contains solverAddress + solutionHash).
    pub journal: Vec<u8>,
    /// The solver's Ethereum address.
    pub solver_address: String,
    /// The solution hash that was proven against.
    pub solution_hash: String,
}

/// Generate a mock ZK proof for testnet.
///
/// Returns a mock seal (32 zero bytes) and a properly ABI-encoded journal
/// containing `(solverAddress, solutionHash)`. The MockRiscZeroVerifier on
/// testnet will accept any seal, so this is sufficient for end-to-end testing.
pub async fn generate_mock_proof(
    guess: &str,
    solver_address: &str,
    expected_hash: &str,
) -> Result<ProofResult> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(guess.as_bytes());
    let guess_hash = hex::encode(hasher.finalize());
    let expected_clean = expected_hash.strip_prefix("0x").unwrap_or(expected_hash);

    if guess_hash != expected_clean {
        anyhow::bail!("Wrong guess. Your ticket has been consumed.");
    }

    let journal = encode_journal(solver_address, expected_hash)?;

    Ok(ProofResult {
        seal: vec![0u8; 32],
        journal,
        solver_address: solver_address.to_string(),
        solution_hash: expected_hash.to_string(),
    })
}

/// ABI-encode `(address, bytes32)` matching the guest program's journal output format.
fn encode_journal(solver_address: &str, solution_hash: &str) -> Result<Vec<u8>> {
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

    let mut encoded = Vec::with_capacity(64);
    let mut addr_padded = [0u8; 32];
    addr_padded[12..32].copy_from_slice(&addr_bytes);
    encoded.extend_from_slice(&addr_padded);
    encoded.extend_from_slice(&hash_bytes);

    Ok(encoded)
}

/// Generate a real ZK proof via Boundless Market.
///
/// Uses offchain-first submission (falls back to onchain if needed).
///
/// Flow:
/// 1. Verify the guess hash matches expected (fail fast)
/// 2. ABI-encode guest input: PuzzleInput { guess, solverAddress, expectedHash }
/// 3. Build Boundless Client
/// 4. Upload guest ELF and submit proof request
/// 5. Wait for fulfillment
/// 6. Return seal + journal
pub async fn generate_proof(
    config: &ProverConfig,
    guess: &str,
    solver_address: &str,
    expected_hash: &str,
) -> Result<ProofResult> {
    use alloy_primitives::{Address, FixedBytes};
    use alloy_sol_types::{sol, SolValue};
    use boundless_market::client::Client;

    // Quick local check first
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(guess.as_bytes());
    let guess_hash = hex::encode(hasher.finalize());
    let expected_clean = expected_hash.strip_prefix("0x").unwrap_or(expected_hash);

    if guess_hash != expected_clean {
        anyhow::bail!("Wrong guess. Your ticket has been consumed.");
    }

    // Define the same sol types as the guest program
    sol! {
        struct PuzzleInput {
            string guess;
            address solverAddress;
            bytes32 expectedHash;
        }
    }

    // ABI-encode the input for the guest program
    let solver_addr: Address = solver_address.parse()?;
    let expected_hash_bytes: FixedBytes<32> = expected_hash.parse()?;

    let input = PuzzleInput {
        guess: guess.to_string(),
        solverAddress: solver_addr,
        expectedHash: expected_hash_bytes,
    };
    let encoded_input = input.abi_encode();

    // Load the guest ELF binary
    let guest_elf = std::fs::read(
        "guests/puzzle-solver/target/riscv-guest/riscv32im-risc0-zkvm-elf/release/puzzle-solver",
    )
    .or_else(|_| std::fs::read("/app/puzzle-solver.elf"))
    .map_err(|e| {
        anyhow::anyhow!(
            "Failed to read guest ELF binary. Ensure the guest is built. Error: {e}"
        )
    })?;

    let rpc_url: url::Url = config.rpc_url.parse()?;

    // Configure Pinata if available
    if let Some(ref jwt) = config.pinata_jwt {
        std::env::set_var("PINATA_JWT", jwt);
    }

    let client = Client::builder()
        .with_rpc_url(rpc_url)
        .with_private_key_str(&config.private_key)?
        .build()
        .await?;

    tracing::info!("Submitting proof request to Boundless Market (offchain-first)...");

    // client.submit() tries offchain first, falls back to onchain
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

    // Wait for the proof to be generated
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_journal() {
        let addr = "0x000000000000000000000000000000000000bEEF";
        let hash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        let journal = encode_journal(addr, hash).unwrap();
        assert_eq!(journal.len(), 64);
        assert_eq!(journal[30], 0xbe);
        assert_eq!(journal[31], 0xef);
    }

    #[tokio::test]
    async fn test_mock_proof_correct_guess() {
        use sha2::{Digest, Sha256};
        let guess = "secret answer";
        let mut hasher = Sha256::new();
        hasher.update(guess.as_bytes());
        let hash = format!("0x{}", hex::encode(hasher.finalize()));

        let result = generate_mock_proof(
            guess,
            "0x000000000000000000000000000000000000bEEF",
            &hash,
        )
        .await
        .unwrap();

        assert_eq!(result.seal.len(), 32);
        assert!(result.seal.iter().all(|&b| b == 0));
        assert_eq!(result.journal.len(), 64);
    }

    #[tokio::test]
    async fn test_mock_proof_wrong_guess() {
        let result = generate_mock_proof(
            "wrong answer",
            "0x000000000000000000000000000000000000bEEF",
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Wrong guess"));
    }
}
