//! End-to-end integration tests for Bear Trap.
//!
//! Tests the full flow: DB operations → mock proof generation → API endpoint logic.
//! On-chain tests (useTicket, redeemDelegations) require a running Base Sepolia node
//! and are gated behind the `onchain` feature.

use alloy::signers::local::PrivateKeySigner;
use prover::generate_mock_proof;
use shared::Db;

fn test_operator_signer() -> PrivateKeySigner {
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        .parse()
        .unwrap()
}

// ── Database Integration Tests ──────────────────────────────

#[test]
fn e2e_puzzle_lifecycle() {
    let db = Db::open(":memory:").unwrap();
    db.init().unwrap();

    // Create puzzle (0-indexed to match on-chain)
    let puzzle_id = db
        .create_puzzle("testnet", 0, "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", "ipfs://clue1")
        .unwrap();
    assert_eq!(puzzle_id, 0);

    // Verify puzzle exists
    let puzzle = db.get_puzzle("testnet", puzzle_id).unwrap().unwrap();
    assert_eq!(puzzle.clue_uri, "ipfs://clue1");
    assert!(!puzzle.solved);
    assert!(puzzle.winner.is_none());

    // List puzzles
    let puzzles = db.list_puzzles("testnet").unwrap();
    assert_eq!(puzzles.len(), 1);

    // Mark solved
    db.mark_solved("testnet", puzzle_id, "0xdead").unwrap();
    let solved = db.get_puzzle("testnet", puzzle_id).unwrap().unwrap();
    assert!(solved.solved);
    assert_eq!(solved.winner.as_deref(), Some("0xdead"));
}

#[test]
fn e2e_delegation_lifecycle() {
    let db = Db::open(":memory:").unwrap();
    db.init().unwrap();

    let puzzle_id = db
        .create_puzzle("testnet", 0, "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", "ipfs://clue")
        .unwrap();

    // Add delegation
    let delegation_json = r#"{"chain":84532,"delegate":"0xabc"}"#;
    db.add_delegation("testnet", puzzle_id, delegation_json, "0.5")
        .unwrap();

    // Get active delegation
    let delegation = db
        .get_active_delegation("testnet", puzzle_id)
        .unwrap()
        .unwrap();
    assert_eq!(delegation.prize_eth, "0.5");
    assert_eq!(delegation.delegation_json, delegation_json);

    // Update delegation
    let new_json = r#"{"chain":84532,"delegate":"0xdef"}"#;
    db.update_delegation("testnet", puzzle_id, new_json, "1.0")
        .unwrap();

    let updated = db
        .get_active_delegation("testnet", puzzle_id)
        .unwrap()
        .unwrap();
    assert_eq!(updated.prize_eth, "1.0");
    assert_eq!(updated.delegation_json, new_json);
}

#[test]
fn e2e_environment_isolation() {
    let db = Db::open(":memory:").unwrap();
    db.init().unwrap();

    // Create puzzle in testnet
    let testnet_id = db
        .create_puzzle("testnet", 0, "aaaa", "ipfs://testnet")
        .unwrap();

    // Create puzzle in mainnet (globally unique ID)
    let mainnet_id = db
        .create_puzzle("mainnet", 1, "bbbb", "ipfs://mainnet")
        .unwrap();

    // Each env only sees its own puzzles
    let testnet_puzzles = db.list_puzzles("testnet").unwrap();
    assert_eq!(testnet_puzzles.len(), 1);
    assert_eq!(testnet_puzzles[0].clue_uri, "ipfs://testnet");

    let mainnet_puzzles = db.list_puzzles("mainnet").unwrap();
    assert_eq!(mainnet_puzzles.len(), 1);
    assert_eq!(mainnet_puzzles[0].clue_uri, "ipfs://mainnet");

    // Can't see testnet puzzle from mainnet query
    assert!(db.get_puzzle("mainnet", testnet_id).unwrap().is_none());
    assert!(db.get_puzzle("testnet", mainnet_id).unwrap().is_none());
}

// ── Mock Proof Integration Tests ────────────────────────────

#[tokio::test]
async fn e2e_mock_proof_correct_answer() {
    use sha2::{Digest, Sha256};

    let answer = "the bear trap is set";
    let mut hasher = Sha256::new();
    hasher.update(answer.as_bytes());
    let expected_hash = format!("0x{}", hex::encode(hasher.finalize()));
    let solver = "0x000000000000000000000000000000000000bEEF";

    let result = generate_mock_proof(answer, solver, &expected_hash, 0, &test_operator_signer())
        .await
        .unwrap();

    assert_eq!(result.seal.len(), 32, "Mock seal should be 32 zero bytes");
    assert!(result.seal.iter().all(|&b| b == 0), "Mock seal should be all zeros");
    assert_eq!(result.journal.len(), 256, "Journal should be 256 bytes (address + bytes32 + uint256 + bytes w/ 65-byte sig)");

    assert_eq!(result.journal[30], 0xbe);
    assert_eq!(result.journal[31], 0xef);

    let hash_bytes = hex::decode(expected_hash.strip_prefix("0x").unwrap()).unwrap();
    assert_eq!(&result.journal[32..64], &hash_bytes[..]);
}

#[tokio::test]
async fn e2e_mock_proof_wrong_answer() {
    use sha2::{Digest, Sha256};

    let correct_answer = "the bear trap is set";
    let mut hasher = Sha256::new();
    hasher.update(correct_answer.as_bytes());
    let expected_hash = format!("0x{}", hex::encode(hasher.finalize()));

    let wrong_answer = "not the right answer";
    let solver = "0x000000000000000000000000000000000000bEEF";

    let result = generate_mock_proof(wrong_answer, solver, &expected_hash, 0, &test_operator_signer()).await;
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("Wrong guess"),
        "Error should indicate wrong guess, got: {err}"
    );
}

#[tokio::test]
async fn e2e_mock_proof_empty_guess() {
    let solver = "0x000000000000000000000000000000000000bEEF";
    let hash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    let result = generate_mock_proof("", solver, hash, 0, &test_operator_signer()).await;
    assert!(result.is_err(), "Empty guess should fail hash check");
}

// ── Full Flow Test (DB + Proof) ─────────────────────────────

#[tokio::test]
async fn e2e_full_testnet_flow() {
    use sha2::{Digest, Sha256};

    // 1. Setup DB with a puzzle
    let db = Db::open(":memory:").unwrap();
    db.init().unwrap();

    let answer = "secret passphrase";
    let mut hasher = Sha256::new();
    hasher.update(answer.as_bytes());
    let solution_hash = format!("{}", hex::encode(hasher.finalize()));

    let puzzle_id = db
        .create_puzzle("testnet", 0, &solution_hash, "ipfs://puzzle-clue")
        .unwrap();

    // 2. Add a delegation for the puzzle
    let delegation_json = serde_json::json!({
        "chain": 84532,
        "delegate": "0x000000000000000000000000000000000000bEEF",
        "authority": "0x0000000000000000000000000000000000000000000000000000000000000001"
    })
    .to_string();
    db.add_delegation("testnet", puzzle_id, &delegation_json, "0.1")
        .unwrap();

    // 3. Verify puzzle and delegation exist
    let puzzle = db.get_puzzle("testnet", puzzle_id).unwrap().unwrap();
    assert!(!puzzle.solved);
    let delegation = db
        .get_active_delegation("testnet", puzzle_id)
        .unwrap()
        .unwrap();
    assert_eq!(delegation.prize_eth, "0.1");

    // 4. Generate mock proof (simulating correct guess)
    let solver_address = "0x000000000000000000000000000000000000bEEF";
    let result = generate_mock_proof(answer, solver_address, &format!("0x{}", solution_hash), 0, &test_operator_signer())
        .await
        .unwrap();

    assert_eq!(result.seal.len(), 32);
    assert_eq!(result.journal.len(), 256);

    // 5. Mark puzzle as solved
    db.mark_solved("testnet", puzzle_id, solver_address).unwrap();
    let solved_puzzle = db.get_puzzle("testnet", puzzle_id).unwrap().unwrap();
    assert!(solved_puzzle.solved);
    assert_eq!(solved_puzzle.winner.as_deref(), Some(solver_address));

    // 6. Verify you can't solve again (by checking DB state)
    // In real flow, useTicket would revert with AlreadySolved
    assert!(solved_puzzle.solved);
}

#[tokio::test]
async fn e2e_multiple_puzzles_independent() {
    use sha2::{Digest, Sha256};

    let db = Db::open(":memory:").unwrap();
    db.init().unwrap();

    // Create two puzzles with different answers
    let answer1 = "puzzle one answer";
    let answer2 = "puzzle two answer";

    let hash1 = {
        let mut h = Sha256::new();
        h.update(answer1.as_bytes());
        hex::encode(h.finalize())
    };
    let hash2 = {
        let mut h = Sha256::new();
        h.update(answer2.as_bytes());
        hex::encode(h.finalize())
    };

    let id1 = db.create_puzzle("testnet", 0, &hash1, "ipfs://puzzle1").unwrap();
    let id2 = db.create_puzzle("testnet", 1, &hash2, "ipfs://puzzle2").unwrap();

    // Add delegations
    db.add_delegation("testnet", id1, r#"{"chain":84532}"#, "0.5").unwrap();
    db.add_delegation("testnet", id2, r#"{"chain":84532}"#, "1.0").unwrap();

    // Solve puzzle 1 only
    let solver = "0x000000000000000000000000000000000000bEEF";
    let proof1 = generate_mock_proof(answer1, solver, &format!("0x{}", hash1), 0, &test_operator_signer())
        .await
        .unwrap();
    assert_eq!(proof1.journal.len(), 256);
    db.mark_solved("testnet", id1, solver).unwrap();

    // Puzzle 1 solved, puzzle 2 still open
    assert!(db.get_puzzle("testnet", id1).unwrap().unwrap().solved);
    assert!(!db.get_puzzle("testnet", id2).unwrap().unwrap().solved);

    // Wrong answer for puzzle 2
    let wrong = generate_mock_proof("wrong answer", solver, &format!("0x{}", hash2), 1, &test_operator_signer()).await;
    assert!(wrong.is_err());
}

// ── Invalid Input Tests ─────────────────────────────────────

#[tokio::test]
async fn e2e_mock_proof_invalid_solver_address() {
    use sha2::{Digest, Sha256};

    let answer = "test answer";
    let mut hasher = Sha256::new();
    hasher.update(answer.as_bytes());
    let hash = format!("0x{}", hex::encode(hasher.finalize()));

    let result = generate_mock_proof(answer, "not-a-hex-address", &hash, 0, &test_operator_signer()).await;
    assert!(result.is_err(), "Non-hex solver address should fail");
}

#[tokio::test]
async fn e2e_mock_proof_empty_solver_address() {
    use sha2::{Digest, Sha256};

    let answer = "test answer";
    let mut hasher = Sha256::new();
    hasher.update(answer.as_bytes());
    let hash = format!("0x{}", hex::encode(hasher.finalize()));

    let result = generate_mock_proof(answer, "", &hash, 0, &test_operator_signer()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn e2e_mock_proof_invalid_solution_hash_length() {
    let solver = "0x000000000000000000000000000000000000bEEF";

    let result = generate_mock_proof("anything", solver, "0xabcd", 0, &test_operator_signer()).await;
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("Invalid solution hash length") || err.contains("Wrong guess"),
        "Expected hash length or wrong guess error, got: {err}"
    );
}

#[tokio::test]
async fn e2e_mock_proof_invalid_solution_hash_not_hex() {
    let solver = "0x000000000000000000000000000000000000bEEF";

    let result =
        generate_mock_proof("anything", solver, "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", 0, &test_operator_signer()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn e2e_mock_proof_solution_hash_without_0x_prefix() {
    use sha2::{Digest, Sha256};

    let answer = "prefix test";
    let mut hasher = Sha256::new();
    hasher.update(answer.as_bytes());
    let hash_no_prefix = hex::encode(hasher.finalize());
    let solver = "0x000000000000000000000000000000000000bEEF";

    let result = generate_mock_proof(answer, solver, &hash_no_prefix, 0, &test_operator_signer()).await;
    assert!(result.is_ok(), "Hash without 0x prefix should still work");
}
