//! Bear Trap Prover — Boundless proof generation library.
//!
//! This crate wraps the Boundless SDK to generate RISC0 ZK proofs for puzzle guesses.
//! It is the library equivalent of the old `apps/src/main.rs` CLI tool.
//!
//! # TODO: Boundless SDK Integration
//!
//! The Boundless SDK (`boundless-market` crate) and RISC0 dependencies require
//! specific setup that may involve git dependencies from the Boundless repo.
//! Once those are resolved, this module should:
//!
//! 1. Import the guest ELF via `guests::PUZZLE_SOLVER_ELF`
//! 2. ABI-encode `PuzzleInput { guess, solverAddress, expectedHash }`
//! 3. Build a Boundless `Client` with the configured RPC + private key
//! 4. Submit a proof request and wait for fulfillment
//! 5. Return the seal + journal as `ProofResult`

use anyhow::Result;
use serde::{Deserialize, Serialize};

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

/// Generate a ZK proof that `guess` hashes to `expected_hash`.
///
/// # TODO: Implement with Boundless SDK
///
/// This function currently returns a stub error. Once the Boundless SDK
/// dependencies are resolved, implement the following flow:
///
/// 1. Compute SHA-256 of `guess` and verify it matches `expected_hash`
///    (fail fast before submitting to Boundless if obviously wrong)
/// 2. ABI-encode the input: `PuzzleInput { guess, solverAddress, expectedHash }`
/// 3. Build a `boundless_market::client::Client` from the config
/// 4. Create a proof request with `PUZZLE_SOLVER_ELF` and the encoded input
/// 5. Submit on-chain and wait for fulfillment
/// 6. Construct and return `ProofResult` with the seal + journal
///
/// See `apps/src/main.rs` (now deleted) for the original implementation.
pub async fn generate_proof(
    _config: &ProverConfig,
    guess: &str,
    _solver_address: &str,
    expected_hash: &str,
) -> Result<ProofResult> {
    // Quick local check: hash the guess and compare to expected hash.
    // This lets us fail fast without hitting Boundless if the guess is obviously wrong.
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(guess.as_bytes());
    let guess_hash = hex::encode(hasher.finalize());
    let expected_clean = expected_hash.strip_prefix("0x").unwrap_or(expected_hash);

    if guess_hash != expected_clean {
        anyhow::bail!("Wrong guess. Your ticket has been consumed.");
    }

    // TODO: Implement actual Boundless proof generation.
    // For now, return a placeholder that indicates the architecture is correct
    // but the prover integration is pending.
    //
    // When implementing:
    // ```rust
    // use boundless_market::client::Client;
    // use guests::PUZZLE_SOLVER_ELF;
    // use alloy::signers::local::PrivateKeySigner;
    // use alloy_sol_types::SolValue;
    //
    // let client = Client::builder()
    //     .with_rpc_url(config.rpc_url.parse()?)
    //     .with_private_key(config.private_key.parse::<PrivateKeySigner>()?)
    //     .build()
    //     .await?;
    //
    // let input = PuzzleInput {
    //     guess: guess.to_string(),
    //     solverAddress: solver_address.parse()?,
    //     expectedHash: expected_hash.parse()?,
    // };
    //
    // let request = client.new_request()
    //     .with_program(PUZZLE_SOLVER_ELF)
    //     .with_stdin(input.abi_encode());
    //
    // let (request_id, expires_at) = client.submit_onchain(request).await?;
    // let fulfillment = client
    //     .wait_for_request_fulfillment(request_id, Duration::from_secs(10), expires_at)
    //     .await?;
    //
    // Ok(ProofResult {
    //     seal: fulfillment.seal,
    //     journal: PuzzleOutput { solverAddress, solutionHash }.abi_encode(),
    //     solver_address: solver_address.to_string(),
    //     solution_hash: expected_hash.to_string(),
    // })
    // ```

    anyhow::bail!(
        "Boundless SDK integration is not yet implemented. \
         The guess hash matches, but proof generation requires the boundless-market crate. \
         See prover/src/lib.rs for implementation notes."
    );
}
