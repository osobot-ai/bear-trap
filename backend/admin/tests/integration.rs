use shared::Db;

fn test_db() -> Db {
    let db = Db::open(":memory:").unwrap();
    db.init().unwrap();
    db
}

fn sha256_hex(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("0x{}", hex::encode(hasher.finalize()))
}

// ── CreatePuzzle + ListPuzzles ──────────────────────────────

#[test]
fn create_and_list_puzzles() {
    let db = test_db();
    let env = "testnet";

    let hash = sha256_hex("secret answer");
    let id = db.create_puzzle(env, 0, &hash, "ipfs://clue").unwrap();

    let puzzles = db.list_puzzles(env).unwrap();
    assert_eq!(puzzles.len(), 1);
    assert_eq!(puzzles[0].id, id);
    assert_eq!(puzzles[0].solution_hash, hash);
    assert_eq!(puzzles[0].clue_uri, "ipfs://clue");
    assert!(!puzzles[0].solved);
}

#[test]
fn create_multiple_puzzles_different_envs() {
    let db = test_db();

    let h1 = sha256_hex("answer1");
    let h2 = sha256_hex("answer2");
    db.create_puzzle("testnet", 0, &h1, "ipfs://1").unwrap();
    db.create_puzzle("mainnet", 1, &h2, "ipfs://2").unwrap();

    assert_eq!(db.list_puzzles("testnet").unwrap().len(), 1);
    assert_eq!(db.list_puzzles("mainnet").unwrap().len(), 1);
}

// ── MarkSolved ──────────────────────────────────────────────

#[test]
fn mark_solved_valid_puzzle() {
    let db = test_db();
    let env = "testnet";

    let id = db.create_puzzle(env, 0, "0xaaa", "").unwrap();
    db.mark_solved(env, id, "0xWINNER").unwrap();

    let p = db.get_puzzle(env, id).unwrap().unwrap();
    assert!(p.solved);
    assert_eq!(p.winner.as_deref(), Some("0xWINNER"));
}

#[test]
fn mark_solved_nonexistent_puzzle_does_not_error() {
    let db = test_db();
    let result = db.mark_solved("testnet", 999, "0xwinner");
    assert!(result.is_ok());
}

#[test]
fn mark_solved_wrong_env_does_not_affect_puzzle() {
    let db = test_db();

    let id = db.create_puzzle("testnet", 0, "0xaaa", "").unwrap();
    db.mark_solved("mainnet", id, "0xwinner").unwrap();

    let p = db.get_puzzle("testnet", id).unwrap().unwrap();
    assert!(!p.solved, "Puzzle should not be solved in wrong env");
}

// ── AddDelegation + UpdateDelegation ────────────────────────

#[test]
fn add_and_update_delegation() {
    let db = test_db();
    let env = "testnet";

    let pid = db.create_puzzle(env, 0, "0xaaa", "").unwrap();

    db.add_delegation(env, pid, r#"{"v":1}"#, "0.5").unwrap();
    let d1 = db.get_active_delegation(env, pid).unwrap().unwrap();
    assert_eq!(d1.prize_eth, "0.5");
    assert_eq!(d1.delegation_json, r#"{"v":1}"#);

    db.update_delegation(env, pid, r#"{"v":2}"#, "1.5").unwrap();
    let d2 = db.get_active_delegation(env, pid).unwrap().unwrap();
    assert_eq!(d2.prize_eth, "1.5");
    assert_eq!(d2.delegation_json, r#"{"v":2}"#);
    assert_ne!(d1.id, d2.id, "Update should create a new delegation row");
}

#[test]
fn delegation_shows_in_puzzle_prize() {
    let db = test_db();
    let env = "testnet";

    let pid = db.create_puzzle(env, 0, "0xaaa", "").unwrap();
    assert!(
        db.get_puzzle(env, pid).unwrap().unwrap().prize_eth.is_none(),
        "No delegation yet"
    );

    db.add_delegation(env, pid, r#"{"v":1}"#, "2.0").unwrap();
    assert_eq!(
        db.get_puzzle(env, pid)
            .unwrap()
            .unwrap()
            .prize_eth
            .as_deref(),
        Some("2.0")
    );
}

// ── SHA-256 Hashing Logic ───────────────────────────────────

#[test]
fn sha256_produces_correct_hex() {
    let hash = sha256_hex("hello");
    assert_eq!(
        hash,
        "0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
}

#[test]
fn sha256_empty_string() {
    let hash = sha256_hex("");
    assert_eq!(
        hash,
        "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
}

#[test]
fn sha256_different_inputs_produce_different_hashes() {
    let h1 = sha256_hex("input1");
    let h2 = sha256_hex("input2");
    assert_ne!(h1, h2);
}
