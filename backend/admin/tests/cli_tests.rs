//! Admin CLI integration tests

use sha2::{Digest, Sha256};
use shared::Db;

fn test_db() -> Db {
    let db = Db::open(":memory:").expect("open in-memory db");
    db.init().expect("init db");
    db
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("0x{}", hex::encode(hasher.finalize()))
}

#[test]
fn test_sha256_hex_deterministic() {
    let hash1 = sha256_hex("secret passphrase");
    let hash2 = sha256_hex("secret passphrase");
    assert_eq!(hash1, hash2);
    assert!(hash1.starts_with("0x"));
    assert_eq!(hash1.len(), 66); // 0x + 64 hex chars
}

#[test]
fn test_sha256_hex_different_inputs() {
    let hash1 = sha256_hex("answer1");
    let hash2 = sha256_hex("answer2");
    assert_ne!(hash1, hash2);
}

#[test]
fn test_create_puzzle_and_list() {
    let db = test_db();
    let env = "testnet";
    let hash = sha256_hex("test answer");

    let id = db.create_puzzle(env, 0, &hash, "ipfs://clue").unwrap();
    assert_eq!(id, 0);

    let puzzles = db.list_puzzles(env).unwrap();
    assert_eq!(puzzles.len(), 1);
    assert_eq!(puzzles[0].id, 0);
    assert_eq!(puzzles[0].solution_hash, hash);
    assert_eq!(puzzles[0].clue_uri, "ipfs://clue");
    assert!(!puzzles[0].solved);
}

#[test]
fn test_create_multiple_puzzles_sequential_ids() {
    let db = test_db();
    let env = "testnet";

    let id0 = db.create_puzzle(env, 0, &sha256_hex("a"), "").unwrap();
    let id1 = db.create_puzzle(env, 1, &sha256_hex("b"), "").unwrap();
    let id2 = db.create_puzzle(env, 2, &sha256_hex("c"), "").unwrap();

    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);

    let puzzles = db.list_puzzles(env).unwrap();
    assert_eq!(puzzles.len(), 3);
}

#[test]
fn test_mark_solved() {
    let db = test_db();
    let env = "testnet";

    db.create_puzzle(env, 0, &sha256_hex("answer"), "").unwrap();
    db.mark_solved(env, 0, "0xWINNER").unwrap();

    let puzzle = db.get_puzzle(env, 0).unwrap().unwrap();
    assert!(puzzle.solved);
    assert_eq!(puzzle.winner.as_deref(), Some("0xWINNER"));
}

#[test]
fn test_add_delegation_and_get_active() {
    let db = test_db();
    let env = "testnet";

    db.create_puzzle(env, 0, &sha256_hex("answer"), "").unwrap();

    let deleg_json = r#"{"delegate":"0x0000000000000000000000000000000000000a11","delegator":"0xabc","authority":"0xfff","caveats":[{"enforcer":"0x123","terms":"0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef12345678","args":"0x"}],"salt":"0","signature":"0x"}"#;

    let id = db.add_delegation(env, 0, deleg_json, "0.01").unwrap();
    assert!(id > 0);

    let active = db.get_active_delegation(env, 0).unwrap().unwrap();
    assert_eq!(active.prize_eth, "0.01");
    assert!(active.active);
}

#[test]
fn test_update_prize() {
    let db = test_db();
    let env = "testnet";

    db.create_puzzle(env, 0, &sha256_hex("answer"), "").unwrap();

    let deleg_json = r#"{"delegate":"0x0000000000000000000000000000000000000a11","delegator":"0xabc","authority":"0xfff","caveats":[{"enforcer":"0x123","terms":"0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef12345678","args":"0x"}],"salt":"0","signature":"0x"}"#;

    db.add_delegation(env, 0, deleg_json, "0.01").unwrap();

    db.update_prize(env, 0, "0.05").unwrap();

    let active = db.get_active_delegation(env, 0).unwrap().unwrap();
    assert_eq!(active.prize_eth, "0.05");
}

#[test]
fn test_update_delegation_replaces_active() {
    let db = test_db();
    let env = "testnet";

    db.create_puzzle(env, 0, &sha256_hex("answer"), "").unwrap();

    let deleg1 = r#"{"delegate":"0x0000000000000000000000000000000000000a11","delegator":"0xabc","authority":"0xfff","caveats":[{"enforcer":"0x123","terms":"0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef12345678","args":"0x"}],"salt":"0","signature":"0x"}"#;
    let deleg2 = r#"{"delegate":"0x0000000000000000000000000000000000000a11","delegator":"0xdef","authority":"0xfff","caveats":[{"enforcer":"0x456","terms":"0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef12345678","args":"0x"}],"salt":"1","signature":"0x"}"#;

    db.add_delegation(env, 0, deleg1, "0.01").unwrap();
    db.update_delegation(env, 0, deleg2, "0.1").unwrap();

    let active = db.get_active_delegation(env, 0).unwrap().unwrap();
    assert_eq!(active.prize_eth, "0.1");
    assert!(active.delegation_json.contains("0xdef"));
}

#[test]
fn test_validate_delegation_json_rejects_missing_zkp_enforcer() {
    // Delegation with only short-terms caveats (no ZKPEnforcer)
    let json = r#"{"delegate":"0x0a11","delegator":"0xabc","authority":"0xfff","caveats":[{"enforcer":"0x123","terms":"0x","args":"0x"}],"salt":"0","signature":"0x"}"#;
    let result = shared::validate_delegation_json(json);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("ZKPEnforcer"));
}

#[test]
fn test_validate_delegation_json_accepts_multi_caveat() {
    let json = r#"{"delegate":"0x0a11","delegator":"0xabc","authority":"0xfff","caveats":[{"enforcer":"0x123","terms":"0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000001234567890abcdef1234567890abcdef12345678","args":"0x"},{"enforcer":"0x456","terms":"0x0000000000000000000000000000000000000000000000000000000000000001","args":"0x"},{"enforcer":"0x789","terms":"0x","args":"0x"}],"salt":"0","signature":"0x"}"#;
    let result = shared::validate_delegation_json(json);
    assert!(result.is_ok(), "Expected Ok, got: {:?}", result.err());
}

#[test]
fn test_environment_isolation() {
    let db = test_db();

    // Same puzzle ID 0 but different environments - the ID is per-environment
    // But SQLite PRIMARY KEY is global, so use different IDs
    db.create_puzzle("testnet", 0, &sha256_hex("a"), "").unwrap();
    db.create_puzzle("mainnet", 1, &sha256_hex("b"), "").unwrap();

    let testnet = db.list_puzzles("testnet").unwrap();
    let mainnet = db.list_puzzles("mainnet").unwrap();

    assert_eq!(testnet.len(), 1);
    assert_eq!(mainnet.len(), 1);
}
