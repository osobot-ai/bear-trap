// Puzzle Solver — RISC0 Guest Program for Bear Trap
//
// This guest program runs inside the RISC0 zkVM to prove that a player
// knows the solution to a puzzle without revealing it.
//
// Private inputs (via stdin): ABI-encoded (string guess, address solverAddress, bytes32 expectedHash)
// Public outputs (journal):   ABI-encoded (address solverAddress, bytes32 solutionHash)

#![no_main]
#![no_std]

extern crate alloc;

use alloc::vec::Vec;
use alloy_primitives::{Address, FixedBytes};
use alloy_sol_types::{sol, SolValue};
use risc0_zkvm::guest::env;
use sha2::{Digest, Sha256};

sol! {
    /// Input structure: guess + solver identity + expected hash
    struct PuzzleInput {
        string guess;
        address solverAddress;
        bytes32 expectedHash;
    }

    /// Output structure committed to the journal
    struct PuzzleOutput {
        address solverAddress;
        bytes32 solutionHash;
    }
}

fn main() {
    // Read ABI-encoded input from the host via stdin
    let mut input_bytes = Vec::<u8>::new();
    env::stdin().read_to_end(&mut input_bytes).unwrap();

    // Decode the ABI-encoded input
    let input = PuzzleInput::abi_decode(&input_bytes, true).unwrap();

    // Hash the guess using SHA-256
    let mut hasher = Sha256::new();
    hasher.update(input.guess.as_bytes());
    let guess_hash: [u8; 32] = hasher.finalize().into();

    // Assert the hash matches the expected solution hash
    let expected: [u8; 32] = input.expectedHash.into();
    assert_eq!(
        guess_hash, expected,
        "Guess hash does not match expected solution hash"
    );

    // Commit the public output to the journal
    // This binds the proof to: (1) the solver's address and (2) the solution hash
    let output = PuzzleOutput {
        solverAddress: input.solverAddress,
        solutionHash: input.expectedHash,
    };
    env::commit_slice(&output.abi_encode());
}
