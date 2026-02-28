// Integration test for the puzzle-solver guest program.
// Runs the guest in the RISC0 executor (no proving) to verify correctness.

use alloy_primitives::{Address, FixedBytes};
use alloy_sol_types::{sol, SolValue};
use risc0_zkvm::{default_executor, ExecutorEnv};
use sha2::{Digest, Sha256};

sol! {
    struct PuzzleInput {
        string guess;
        address solverAddress;
        bytes32 expectedHash;
    }

    struct PuzzleOutput {
        address solverAddress;
        bytes32 solutionHash;
    }
}

#[test]
fn test_correct_guess() {
    let guess = "the answer is 42";
    let solver = Address::from([0x42; 20]);

    // Compute the expected hash
    let mut hasher = Sha256::new();
    hasher.update(guess.as_bytes());
    let expected_hash: [u8; 32] = hasher.finalize().into();
    let expected_hash = FixedBytes::from(expected_hash);

    // ABI-encode the input
    let input = PuzzleInput {
        guess: guess.to_string(),
        solverAddress: solver,
        expectedHash: expected_hash,
    };
    let input_bytes = input.abi_encode();

    // Build the executor environment
    let env = ExecutorEnv::builder()
        .write_slice(&input_bytes)
        .build()
        .unwrap();

    // Execute the guest (no proving, just execution)
    let executor = default_executor();
    let session = executor.execute(env, guests::PUZZLE_SOLVER_ELF).unwrap();

    // Decode the journal
    let output = PuzzleOutput::abi_decode(&session.journal.bytes, true).unwrap();

    assert_eq!(output.solverAddress, solver);
    assert_eq!(output.solutionHash, expected_hash);
}

#[test]
#[should_panic(expected = "Guess hash does not match expected solution hash")]
fn test_wrong_guess() {
    let guess = "wrong answer";
    let solver = Address::from([0x42; 20]);

    // Use a hash that doesn't match the guess
    let wrong_hash = FixedBytes::from([0xAB; 32]);

    let input = PuzzleInput {
        guess: guess.to_string(),
        solverAddress: solver,
        expectedHash: wrong_hash,
    };
    let input_bytes = input.abi_encode();

    let env = ExecutorEnv::builder()
        .write_slice(&input_bytes)
        .build()
        .unwrap();

    let executor = default_executor();
    // This should panic because the hash doesn't match
    executor.execute(env, guests::PUZZLE_SOLVER_ELF).unwrap();
}
