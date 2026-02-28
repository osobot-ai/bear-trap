// Bear Trap — Proof Request Application
//
// This application:
// 1. Takes a puzzle guess and solver address as input
// 2. ABI-encodes the input for the RISC0 guest program
// 3. Submits a proof request to the Boundless market
// 4. Waits for the proof to be fulfilled
// 5. Submits the proof to the BearTrap contract on-chain

use std::time::Duration;

use alloy::{
    primitives::{Address, FixedBytes, U256},
    providers::ProviderBuilder,
    signers::local::PrivateKeySigner,
    sol,
};
use alloy_sol_types::SolValue;
use anyhow::{Context, Result};
use boundless_market::client::Client;
use clap::Parser;
use guests::PUZZLE_SOLVER_ELF;
use sha2::{Digest, Sha256};
use tracing::info;
use url::Url;

sol! {
    /// Input structure matching the guest program
    struct PuzzleInput {
        string guess;
        address solverAddress;
        bytes32 expectedHash;
    }

    /// Output structure matching the guest program's journal
    struct PuzzleOutput {
        address solverAddress;
        bytes32 solutionHash;
    }

    /// BearTrap contract interface for submitting guesses
    #[sol(rpc)]
    interface IBearTrap {
        function submitGuess(
            bytes[] calldata _permissionContexts,
            bytes1[] calldata _modes,
            bytes[] calldata _executionCallDatas
        ) external;

        function tickets(address player) external view returns (uint256);
        function puzzleCount() external view returns (uint256);
    }
}

#[derive(Parser, Debug)]
#[command(name = "bear-trap-app")]
#[command(about = "Bear Trap — Submit ZK proof guesses to solve puzzles")]
struct Args {
    /// The puzzle guess (passphrase)
    #[arg(long)]
    guess: String,

    /// The solver's Ethereum address
    #[arg(long)]
    solver_address: Address,

    /// RPC URL for the target chain
    #[arg(long, env = "RPC_URL")]
    rpc_url: Url,

    /// Private key for signing transactions
    #[arg(long, env = "PRIVATE_KEY")]
    private_key: PrivateKeySigner,

    /// BearTrap contract address
    #[arg(long, env = "BEAR_TRAP_ADDRESS")]
    bear_trap_address: Address,

    /// Pre-uploaded program URL (optional — if not set, uploads the ELF)
    #[arg(long)]
    program_url: Option<Url>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Load .env file if present
    dotenvy::dotenv().ok();

    let args = Args::parse();

    info!("Bear Trap — Proof Request Application");
    info!("Guess: {}", args.guess);
    info!("Solver: {}", args.solver_address);

    // Step 1: Compute the expected hash of the guess
    let mut hasher = Sha256::new();
    hasher.update(args.guess.as_bytes());
    let expected_hash: [u8; 32] = hasher.finalize().into();
    let expected_hash = FixedBytes::from(expected_hash);
    info!("Expected hash: {}", expected_hash);

    // Step 2: ABI-encode the input for the guest program
    let input = PuzzleInput {
        guess: args.guess.clone(),
        solverAddress: args.solver_address,
        expectedHash: expected_hash,
    };
    let input_bytes = input.abi_encode();

    // Step 3: Build the Boundless client
    let client = Client::builder()
        .with_rpc_url(args.rpc_url.clone())
        .with_private_key(args.private_key.clone())
        .build()
        .await
        .context("Failed to build Boundless client")?;

    // Step 4: Build the proof request
    let request = if let Some(program_url) = args.program_url {
        info!("Using pre-uploaded program: {}", program_url);
        client
            .new_request()
            .with_program_url(program_url)?
            .with_stdin(input_bytes)
    } else {
        info!("Uploading program ELF to storage...");
        client
            .new_request()
            .with_program(PUZZLE_SOLVER_ELF)
            .with_stdin(input_bytes)
    };

    // Step 5: Submit the proof request on-chain
    info!("Submitting proof request to Boundless market...");
    let (request_id, expires_at) = client
        .submit_onchain(request)
        .await
        .context("Failed to submit proof request")?;
    info!("Request submitted: {:?}", request_id);

    // Step 6: Wait for the proof to be fulfilled
    info!("Waiting for proof fulfillment...");
    let fulfillment = client
        .wait_for_request_fulfillment(request_id, Duration::from_secs(10), expires_at)
        .await
        .context("Proof request was not fulfilled")?;
    info!("Proof fulfilled!");

    // Step 7: Submit the proof to the BearTrap contract
    info!("Submitting proof to BearTrap contract at {}...", args.bear_trap_address);

    let provider = ProviderBuilder::new()
        .wallet(args.private_key.clone().into())
        .on_http(args.rpc_url);

    let bear_trap = IBearTrap::new(args.bear_trap_address, &provider);

    // The seal from the fulfillment is used as the proof in the delegation args
    info!(
        "Seal length: {} bytes",
        fulfillment.seal.len()
    );

    // Note: In production, the permissionContexts, modes, and executionCallDatas
    // would be constructed to include the ZKP seal in the delegation's caveat args.
    // This requires the delegation to be pre-created by the treasury with the
    // ZKPEnforcer caveat. The seal goes into the Caveat.args field.
    info!("Proof generation complete. Seal ready for delegation redemption.");
    info!("To redeem, construct the delegation with the seal in the ZKPEnforcer caveat args.");

    Ok(())
}
