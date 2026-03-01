// Bear Trap — Pure Proof Service CLI
//
// This application:
// 1. Takes a puzzle guess, solver address, and expected hash as input
// 2. ABI-encodes the input for the RISC0 guest program
// 3. Submits a proof request to the Boundless market
// 4. Waits for the proof to be fulfilled
// 5. Outputs JSON to stdout: { seal, journal, solverAddress, solutionHash }
//
// The expected hash comes from the backend (not from chain), preventing
// free offline checking of answers.

use std::time::Duration;

use alloy::{
    primitives::{Address, FixedBytes},
    signers::local::PrivateKeySigner,
};
use alloy_sol_types::SolValue;
use anyhow::{Context, Result};
use boundless_market::client::Client;
use clap::Parser;
use guests::PUZZLE_SOLVER_ELF;
use sha2::{Digest, Sha256};
use url::Url;

alloy::sol! {
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
}

#[derive(Parser, Debug)]
#[command(name = "bear-trap-app")]
#[command(about = "Bear Trap — Generate ZK proofs for puzzle guesses via Boundless")]
struct Args {
    /// The puzzle guess (passphrase)
    #[arg(long)]
    guess: String,

    /// The solver's Ethereum address
    #[arg(long)]
    solver_address: Address,

    /// The expected answer hash (provided by backend, NOT from chain)
    #[arg(long)]
    expected_hash: FixedBytes<32>,

    /// RPC URL for the target chain
    #[arg(long, env = "RPC_URL")]
    rpc_url: Url,

    /// Private key for signing Boundless market transactions
    #[arg(long, env = "PRIVATE_KEY")]
    private_key: PrivateKeySigner,

    /// Pre-uploaded program URL (optional — if not set, uploads the ELF)
    #[arg(long)]
    program_url: Option<Url>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging (to stderr so stdout stays clean for JSON)
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    // Load .env file if present
    dotenvy::dotenv().ok();

    let args = Args::parse();

    eprintln!("Bear Trap — Proof Service");
    eprintln!("Guess: {}", args.guess);
    eprintln!("Solver: {}", args.solver_address);
    eprintln!("Expected hash: {}", args.expected_hash);

    // Step 1: Compute the hash of the guess for verification
    let mut hasher = Sha256::new();
    hasher.update(args.guess.as_bytes());
    let guess_hash: [u8; 32] = hasher.finalize().into();
    let guess_hash = FixedBytes::from(guess_hash);
    eprintln!("Guess hash: {}", guess_hash);

    // Step 2: ABI-encode the input for the guest program
    // The guest will assert that hash(guess) == expectedHash
    let input = PuzzleInput {
        guess: args.guess.clone(),
        solverAddress: args.solver_address,
        expectedHash: args.expected_hash,
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
        eprintln!("Using pre-uploaded program: {}", program_url);
        client
            .new_request()
            .with_program_url(program_url)?
            .with_stdin(input_bytes)
    } else {
        eprintln!("Uploading program ELF to storage...");
        client
            .new_request()
            .with_program(PUZZLE_SOLVER_ELF)
            .with_stdin(input_bytes)
    };

    // Step 5: Submit the proof request on-chain
    eprintln!("Submitting proof request to Boundless market...");
    let (request_id, expires_at) = client
        .submit_onchain(request)
        .await
        .context("Failed to submit proof request")?;
    eprintln!("Request submitted: {:?}", request_id);

    // Step 6: Wait for the proof to be fulfilled
    eprintln!("Waiting for proof fulfillment...");
    let fulfillment = client
        .wait_for_request_fulfillment(request_id, Duration::from_secs(10), expires_at)
        .await
        .context("Proof request was not fulfilled")?;
    eprintln!("Proof fulfilled!");

    let journal = PuzzleOutput {
        solverAddress: args.solver_address,
        solutionHash: args.expected_hash,
    }
    .abi_encode();

    // Step 7: Output JSON to stdout
    let output = serde_json::json!({
        "seal": format!("0x{}", hex::encode(&fulfillment.seal)),
        "journal": format!("0x{}", hex::encode(&journal)),
        "solverAddress": format!("{}", args.solver_address),
        "solutionHash": format!("{}", args.expected_hash),
    });
    println!("{}", serde_json::to_string(&output)?);

    Ok(())
}
