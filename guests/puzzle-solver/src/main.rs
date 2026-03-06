// Puzzle Solver — RISC0 Guest Program for Bear Trap
//
// This guest program runs inside the RISC0 zkVM to prove that a player
// knows the solution to a puzzle without revealing it.
//
// It also verifies an operator signature to ensure the proof was authorized
// by the backend (after ticket burn), preventing offline proof generation.
//
// Private inputs (via stdin): ABI-encoded PuzzleInput
// Public outputs (journal):   ABI-encoded PuzzleOutput

#![no_main]
#![no_std]

extern crate alloc;

use alloc::vec::Vec;
use alloy_primitives::{Address, Keccak256, B256};
use alloy_sol_types::{sol, SolValue};
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use risc0_zkvm::guest::env;
use sha2::{Digest, Sha256};

risc0_zkvm::guest::entry!(main);

sol! {
    /// Input structure: guess + solver identity + expected hash + operator attestation
    struct PuzzleInput {
        string guess;
        address solverAddress;
        bytes32 expectedHash;
        uint256 puzzleId;
        bytes operatorSig;
        address operatorAddress;
    }

    /// Output structure committed to the journal
    struct PuzzleOutput {
        address solverAddress;
        bytes32 solutionHash;
        uint256 puzzleId;
        bytes operatorSig;
    }
}

fn main() {
    // Read ABI-encoded input from the host via stdin
    use std::io::Read;
    let mut input_bytes = Vec::<u8>::new();
    env::stdin().read_to_end(&mut input_bytes).unwrap();

    // Decode the ABI-encoded input
    let input = PuzzleInput::abi_decode(&input_bytes).unwrap();

    // ── Step 1: Verify operator signature ────────────────────
    // The operator signs keccak256(abi.encodePacked(solverAddress, puzzleId, expectedHash))
    // This ensures only backend-authorized proofs (after ticket burn) are valid.
    {
        // Build the message hash: keccak256(abi.encodePacked(address, uint256, bytes32))
        // encodePacked: address=20 bytes, uint256=32 bytes, bytes32=32 bytes
        let mut hasher = Keccak256::new();
        hasher.update(input.solverAddress.as_slice()); // 20 bytes
        hasher.update(input.puzzleId.to_be_bytes::<32>()); // 32 bytes
        hasher.update(input.expectedHash.as_slice()); // 32 bytes
        let msg_hash: B256 = hasher.finalize();

        // Parse the 65-byte operator signature (r[32] || s[32] || v[1])
        let sig_bytes = &input.operatorSig;
        assert!(
            sig_bytes.len() == 65,
            "Operator signature must be 65 bytes"
        );

        let r_s = &sig_bytes[..64];
        let v = sig_bytes[64];
        // v is either 0/1 or 27/28 (Ethereum convention)
        let recovery_id = if v >= 27 { v - 27 } else { v };
        assert!(
            recovery_id == 0 || recovery_id == 1,
            "Invalid recovery id"
        );

        let signature =
            Signature::from_slice(r_s).expect("Invalid ECDSA signature bytes");
        let recid =
            RecoveryId::new(recovery_id != 0, false);

        // Recover the public key from the signature
        let recovered_key =
            VerifyingKey::recover_from_prehash(msg_hash.as_slice(), &signature, recid)
                .expect("ECDSA recovery failed");

        // Derive the Ethereum address from the recovered public key
        // Ethereum address = keccak256(uncompressed_pubkey_without_prefix)[12..32]
        let pubkey_bytes = recovered_key
            .to_encoded_point(false);
        let pubkey_uncompressed = &pubkey_bytes.as_bytes()[1..]; // skip 0x04 prefix

        let mut addr_hasher = Keccak256::new();
        addr_hasher.update(pubkey_uncompressed);
        let addr_hash: B256 = addr_hasher.finalize();

        let mut recovered_addr = [0u8; 20];
        recovered_addr.copy_from_slice(&addr_hash[12..32]);
        let recovered_address = Address::from(recovered_addr);

        assert_eq!(
            recovered_address, input.operatorAddress,
            "Operator signature does not match operatorAddress"
        );
    }

    // ── Step 2: Verify the guess hash ────────────────────────
    let mut hasher = Sha256::new();
    hasher.update(input.guess.as_bytes());
    let guess_hash: [u8; 32] = hasher.finalize().into();

    let expected: [u8; 32] = input.expectedHash.into();
    assert_eq!(
        guess_hash, expected,
        "Guess hash does not match expected solution hash"
    );

    // ── Step 3: Commit the public output to the journal ──────
    // This binds the proof to: (1) the solver's address, (2) the solution hash,
    // (3) the puzzleId, and (4) the operator signature (for on-chain operator verification)
    let output = PuzzleOutput {
        solverAddress: input.solverAddress,
        solutionHash: input.expectedHash,
        puzzleId: input.puzzleId,
        operatorSig: input.operatorSig.clone(),
    };
    env::commit_slice(&output.abi_encode());
}
