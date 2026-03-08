use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

/// Database wrapper for Bear Trap puzzle storage.
pub struct Db {
    conn: Connection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Puzzle {
    pub id: i64,
    pub environment: String,
    pub solution_hash: String,
    pub clue_uri: String,
    pub solved: bool,
    pub winner: Option<String>,
    /// Prize from active delegation (joined at query time).
    pub prize_eth: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delegation {
    pub id: i64,
    pub environment: String,
    pub puzzle_id: i64,
    pub delegation_json: String,
    pub prize_eth: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofRequest {
    pub id: i64,
    pub environment: String,
    pub puzzle_id: i64,
    pub solver_address: String,
    pub boundless_request_id: Option<String>,
    pub status: String,
    pub result_json: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: Option<i64>,
}

const _CURRENT_SCHEMA_VERSION: i32 = 2;

impl Db {
    /// Open (or create) a SQLite database at the given path.
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        Ok(Self { conn })
    }

    fn get_schema_version(&self) -> Result<i32> {
        let table_exists: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='schema_version'",
            [],
            |row| row.get(0),
        )?;
        if !table_exists {
            return Ok(0);
        }
        let version: i32 = self.conn.query_row(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
            [],
            |row| row.get(0),
        )?;
        Ok(version)
    }

    fn set_schema_version(&self, version: i32) -> Result<()> {
        self.conn.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            params![version],
        )?;
        Ok(())
    }

    fn migrate(&self) -> Result<()> {
        let current = self.get_schema_version()?;

        if current < 1 {
            self.conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS puzzles (
                    id INTEGER PRIMARY KEY,
                    environment TEXT NOT NULL DEFAULT 'testnet',
                    solution_hash TEXT NOT NULL,
                    clue_uri TEXT NOT NULL DEFAULT '',
                    solved INTEGER NOT NULL DEFAULT 0,
                    winner TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS delegations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    environment TEXT NOT NULL DEFAULT 'testnet',
                    puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
                    delegation_json TEXT NOT NULL,
                    prize_eth TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                ",
            )?;
            self.set_schema_version(1)?;
        }

        if current < 2 {
            self.conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS proof_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    environment TEXT NOT NULL,
                    puzzle_id INTEGER NOT NULL,
                    solver_address TEXT NOT NULL,
                    boundless_request_id TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    result_json TEXT,
                    error_message TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    expires_at INTEGER
                );
                ",
            )?;
            self.set_schema_version(2)?;
        }

        Ok(())
    }

    pub fn init(&self) -> Result<()> {
        self.migrate()
    }

    // ── Puzzles ──────────────────────────────────────────────

    /// Insert a new puzzle with an explicit ID (must match the on-chain puzzleId).
    pub fn create_puzzle(&self, env: &str, id: i64, solution_hash: &str, clue_uri: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO puzzles (id, environment, solution_hash, clue_uri) VALUES (?1, ?2, ?3, ?4)",
            params![id, env, solution_hash, clue_uri],
        )?;
        Ok(id)
    }

    /// Return the next available puzzle ID for this environment.
    /// On-chain puzzles are 0-indexed, so this returns max(id)+1 or 0 if none exist.
    pub fn next_puzzle_id(&self, env: &str) -> Result<i64> {
        let mut stmt = self.conn.prepare(
            "SELECT COALESCE(MAX(id) + 1, 0) FROM puzzles WHERE environment = ?1",
        )?;
        let next_id: i64 = stmt.query_row(params![env], |row| row.get(0))?;
        Ok(next_id)
    }

    /// Fetch a single puzzle by ID, scoped to environment, with prize from active delegation.
    pub fn get_puzzle(&self, env: &str, id: i64) -> Result<Option<Puzzle>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.environment, p.solution_hash, p.clue_uri, p.solved, p.winner, d.prize_eth, p.created_at
             FROM puzzles p
             LEFT JOIN delegations d ON d.puzzle_id = p.id AND d.active = 1 AND d.environment = p.environment
             WHERE p.id = ?1 AND p.environment = ?2",
        )?;

        let mut rows = stmt.query_map(params![id, env], |row| {
            Ok(Puzzle {
                id: row.get(0)?,
                environment: row.get(1)?,
                solution_hash: row.get(2)?,
                clue_uri: row.get(3)?,
                solved: row.get::<_, i32>(4)? != 0,
                winner: row.get(5)?,
                prize_eth: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        match rows.next() {
            Some(Ok(puzzle)) => Ok(Some(puzzle)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    /// List all puzzles with their active delegation prize, scoped to environment.
    pub fn list_puzzles(&self, env: &str) -> Result<Vec<Puzzle>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.environment, p.solution_hash, p.clue_uri, p.solved, p.winner, d.prize_eth, p.created_at
             FROM puzzles p
             LEFT JOIN delegations d ON d.puzzle_id = p.id AND d.active = 1 AND d.environment = p.environment
             WHERE p.environment = ?1
             ORDER BY p.id",
        )?;

        let puzzles = stmt
            .query_map(params![env], |row| {
                Ok(Puzzle {
                    id: row.get(0)?,
                    environment: row.get(1)?,
                    solution_hash: row.get(2)?,
                    clue_uri: row.get(3)?,
                    solved: row.get::<_, i32>(4)? != 0,
                    winner: row.get(5)?,
                    prize_eth: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(puzzles)
    }

    /// Mark a puzzle as solved with the winner's address, scoped to environment.
    pub fn mark_solved(&self, env: &str, id: i64, winner: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE puzzles SET solved = 1, winner = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND environment = ?3",
            params![winner, id, env],
        )?;
        Ok(())
    }

    // ── Delegations ──────────────────────────────────────────

    /// Add a new delegation for a puzzle. Deactivates any existing active delegation first.
    pub fn add_delegation(
        &self,
        env: &str,
        puzzle_id: i64,
        delegation_json: &str,
        prize_eth: &str,
    ) -> Result<i64> {
        // Deactivate existing active delegations for this puzzle in this environment.
        self.conn.execute(
            "UPDATE delegations SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE puzzle_id = ?1 AND active = 1 AND environment = ?2",
            params![puzzle_id, env],
        )?;

        self.conn.execute(
            "INSERT INTO delegations (environment, puzzle_id, delegation_json, prize_eth) VALUES (?1, ?2, ?3, ?4)",
            params![env, puzzle_id, delegation_json, prize_eth],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Replace the active delegation for a puzzle (deactivate old, insert new).
    pub fn update_delegation(
        &self,
        env: &str,
        puzzle_id: i64,
        delegation_json: &str,
        prize_eth: &str,
    ) -> Result<()> {
        self.add_delegation(env, puzzle_id, delegation_json, prize_eth)?;
        Ok(())
    }

    /// Update only the prize amount for the active delegation of a puzzle.
    pub fn delete_puzzle(&self, env: &str, id: i64) -> Result<bool> {
        // Delete associated delegations first
        self.conn.execute(
            "DELETE FROM delegations WHERE puzzle_id = ?1 AND environment = ?2",
            params![id, env],
        )?;
        let rows = self.conn.execute(
            "DELETE FROM puzzles WHERE id = ?1 AND environment = ?2",
            params![id, env],
        )?;
        Ok(rows > 0)
    }

    pub fn update_prize(&self, env: &str, puzzle_id: i64, prize_eth: &str) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE delegations SET prize_eth = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE puzzle_id = ?2 AND active = 1 AND environment = ?3",
            params![prize_eth, puzzle_id, env],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    /// Get the currently active delegation for a puzzle, scoped to environment.
    pub fn get_active_delegation(&self, env: &str, puzzle_id: i64) -> Result<Option<Delegation>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, environment, puzzle_id, delegation_json, prize_eth, active, created_at
             FROM delegations
             WHERE puzzle_id = ?1 AND active = 1 AND environment = ?2
             LIMIT 1",
        )?;

        let mut rows = stmt.query_map(params![puzzle_id, env], |row| {
            Ok(Delegation {
                id: row.get(0)?,
                environment: row.get(1)?,
                puzzle_id: row.get(2)?,
                delegation_json: row.get(3)?,
                prize_eth: row.get(4)?,
                active: row.get::<_, i32>(5)? != 0,
                created_at: row.get(6)?,
            })
        })?;

        match rows.next() {
            Some(Ok(d)) => Ok(Some(d)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    // ── Proof Requests ──────────────────────────────────────

    pub fn create_proof_request(
        &self,
        env: &str,
        puzzle_id: i64,
        solver_address: &str,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO proof_requests (environment, puzzle_id, solver_address) VALUES (?1, ?2, ?3)",
            params![env, puzzle_id, solver_address],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_proof_request(&self, id: i64) -> Result<Option<ProofRequest>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, environment, puzzle_id, solver_address, boundless_request_id, status, result_json, error_message, created_at, updated_at, expires_at
             FROM proof_requests WHERE id = ?1",
        )?;

        let mut rows = stmt.query_map(params![id], |row| {
            Ok(ProofRequest {
                id: row.get(0)?,
                environment: row.get(1)?,
                puzzle_id: row.get(2)?,
                solver_address: row.get(3)?,
                boundless_request_id: row.get(4)?,
                status: row.get(5)?,
                result_json: row.get(6)?,
                error_message: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                expires_at: row.get(10)?,
            })
        })?;

        match rows.next() {
            Some(Ok(pr)) => Ok(Some(pr)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn update_proof_request_result(&self, id: i64, result_json: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE proof_requests SET status = 'fulfilled', result_json = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![result_json, id],
        )?;
        Ok(())
    }

    pub fn update_proof_request_error(&self, id: i64, error_message: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE proof_requests SET status = 'failed', error_message = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![error_message, id],
        )?;
        Ok(())
    }

    /// Check if there's already an active (pending) proof request for this solver+puzzle.
    pub fn find_active_proof_request(
        &self,
        env: &str,
        puzzle_id: i64,
        solver_address: &str,
    ) -> Result<Option<ProofRequest>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, environment, puzzle_id, solver_address, boundless_request_id, status, result_json, error_message, created_at, updated_at, expires_at
             FROM proof_requests WHERE environment = ?1 AND puzzle_id = ?2 AND solver_address = ?3 AND status = 'pending'
             ORDER BY created_at DESC LIMIT 1",
        )?;

        let mut rows = stmt.query_map(params![env, puzzle_id, solver_address], |row| {
            Ok(ProofRequest {
                id: row.get(0)?,
                environment: row.get(1)?,
                puzzle_id: row.get(2)?,
                solver_address: row.get(3)?,
                boundless_request_id: row.get(4)?,
                status: row.get(5)?,
                result_json: row.get(6)?,
                error_message: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                expires_at: row.get(10)?,
            })
        })?;

        match rows.next() {
            Some(Ok(pr)) => Ok(Some(pr)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn update_proof_request_boundless_id(
        &self,
        id: i64,
        boundless_request_id: &str,
        expires_at: i64,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE proof_requests SET boundless_request_id = ?1, expires_at = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![boundless_request_id, expires_at, id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Db {
        let db = Db::open(":memory:").unwrap();
        db.init().unwrap();
        db
    }

    #[test]
    fn test_create_and_get_puzzle() {
        let db = test_db();
        let id = db.create_puzzle("testnet", 0, "0xabcdef", "ipfs://clue").unwrap();
        assert_eq!(id, 0);
        let puzzle = db.get_puzzle("testnet", id).unwrap().unwrap();
        assert_eq!(puzzle.solution_hash, "0xabcdef");
        assert_eq!(puzzle.clue_uri, "ipfs://clue");
        assert_eq!(puzzle.environment, "testnet");
        assert!(!puzzle.solved);
        assert!(puzzle.winner.is_none());
        assert!(puzzle.prize_eth.is_none());
    }

    #[test]
    fn test_list_puzzles() {
        let db = test_db();
        db.create_puzzle("testnet", 0, "0x111", "ipfs://1").unwrap();
        db.create_puzzle("testnet", 1, "0x222", "ipfs://2").unwrap();
        let puzzles = db.list_puzzles("testnet").unwrap();
        assert_eq!(puzzles.len(), 2);
    }

    #[test]
    fn test_environment_isolation() {
        let db = test_db();
        db.create_puzzle("testnet", 0, "0x111", "ipfs://1").unwrap();
        db.create_puzzle("mainnet", 1, "0x222", "ipfs://2").unwrap();

        let testnet_puzzles = db.list_puzzles("testnet").unwrap();
        assert_eq!(testnet_puzzles.len(), 1);
        assert_eq!(testnet_puzzles[0].solution_hash, "0x111");

        let mainnet_puzzles = db.list_puzzles("mainnet").unwrap();
        assert_eq!(mainnet_puzzles.len(), 1);
        assert_eq!(mainnet_puzzles[0].solution_hash, "0x222");
    }

    #[test]
    fn test_mark_solved() {
        let db = test_db();
        let id = db.create_puzzle("testnet", 0, "0xaaa", "").unwrap();
        db.mark_solved("testnet", id, "0xwinner").unwrap();
        let puzzle = db.get_puzzle("testnet", id).unwrap().unwrap();
        assert!(puzzle.solved);
        assert_eq!(puzzle.winner.as_deref(), Some("0xwinner"));
    }

    #[test]
    fn test_delegation_lifecycle() {
        let db = test_db();
        let pid = db.create_puzzle("testnet", 0, "0xaaa", "").unwrap();

        // Add first delegation
        db.add_delegation("testnet", pid, r#"{"v":1}"#, "1.0").unwrap();
        let d = db.get_active_delegation("testnet", pid).unwrap().unwrap();
        assert_eq!(d.prize_eth, "1.0");
        assert_eq!(d.environment, "testnet");

        // Update delegation — old one deactivated
        db.update_delegation("testnet", pid, r#"{"v":2}"#, "2.0").unwrap();
        let d = db.get_active_delegation("testnet", pid).unwrap().unwrap();
        assert_eq!(d.prize_eth, "2.0");
        assert_eq!(d.delegation_json, r#"{"v":2}"#);

        // Puzzle should show prize from active delegation
        let puzzle = db.get_puzzle("testnet", pid).unwrap().unwrap();
        assert_eq!(puzzle.prize_eth.as_deref(), Some("2.0"));
    }

    #[test]
    fn test_delegation_environment_isolation() {
        let db = test_db();
        let pid = db.create_puzzle("testnet", 0, "0xaaa", "").unwrap();

        db.add_delegation("testnet", pid, r#"{"v":1}"#, "1.0").unwrap();

        // Should not find delegation in mainnet environment
        let d = db.get_active_delegation("mainnet", pid).unwrap();
        assert!(d.is_none());
    }

    #[test]
    fn test_next_puzzle_id() {
        let db = test_db();
        assert_eq!(db.next_puzzle_id("testnet").unwrap(), 0);

        db.create_puzzle("testnet", 0, "0x111", "").unwrap();
        assert_eq!(db.next_puzzle_id("testnet").unwrap(), 1);

        db.create_puzzle("testnet", 1, "0x222", "").unwrap();
        assert_eq!(db.next_puzzle_id("testnet").unwrap(), 2);

        // Different environment starts at 0
        assert_eq!(db.next_puzzle_id("mainnet").unwrap(), 0);
    }

    // ── Proof Request Tests ─────────────────────────────────

    #[test]
    fn test_create_proof_request_returns_autoincrement_id() {
        let db = test_db();
        let id1 = db.create_proof_request("mainnet", 0, "0xsolver1").unwrap();
        let id2 = db.create_proof_request("mainnet", 0, "0xsolver2").unwrap();
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
    }

    #[test]
    fn test_get_proof_request() {
        let db = test_db();
        let id = db.create_proof_request("mainnet", 42, "0xsolver").unwrap();
        let pr = db.get_proof_request(id).unwrap().unwrap();
        assert_eq!(pr.id, id);
        assert_eq!(pr.environment, "mainnet");
        assert_eq!(pr.puzzle_id, 42);
        assert_eq!(pr.solver_address, "0xsolver");
        assert_eq!(pr.status, "pending");
        assert!(pr.boundless_request_id.is_none());
        assert!(pr.result_json.is_none());
        assert!(pr.error_message.is_none());
    }

    #[test]
    fn test_get_proof_request_not_found() {
        let db = test_db();
        let pr = db.get_proof_request(999).unwrap();
        assert!(pr.is_none());
    }

    #[test]
    fn test_update_proof_request_boundless_id() {
        let db = test_db();
        let id = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        db.update_proof_request_boundless_id(id, "abc123def456", 1700000000).unwrap();
        let pr = db.get_proof_request(id).unwrap().unwrap();
        assert_eq!(pr.boundless_request_id.as_deref(), Some("abc123def456"));
        assert_eq!(pr.expires_at, Some(1700000000));
        assert_eq!(pr.status, "pending"); // status unchanged
    }

    #[test]
    fn test_update_proof_request_result_sets_fulfilled() {
        let db = test_db();
        let id = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        let result_json = r#"{"seal":"0x1234","journal":"0x5678"}"#;
        db.update_proof_request_result(id, result_json).unwrap();
        let pr = db.get_proof_request(id).unwrap().unwrap();
        assert_eq!(pr.status, "fulfilled");
        assert_eq!(pr.result_json.as_deref(), Some(result_json));
    }

    #[test]
    fn test_update_proof_request_error_sets_failed() {
        let db = test_db();
        let id = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        db.update_proof_request_error(id, "Wrong guess").unwrap();
        let pr = db.get_proof_request(id).unwrap().unwrap();
        assert_eq!(pr.status, "failed");
        assert_eq!(pr.error_message.as_deref(), Some("Wrong guess"));
    }

    #[test]
    fn test_find_active_proof_request_pending() {
        let db = test_db();
        let id = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        let active = db.find_active_proof_request("mainnet", 0, "0xsolver").unwrap();
        assert!(active.is_some());
        assert_eq!(active.unwrap().id, id);
    }

    #[test]
    fn test_find_active_proof_request_none_after_fulfilled() {
        let db = test_db();
        let id = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        db.update_proof_request_result(id, r#"{"seal":"0x"}"#).unwrap();
        let active = db.find_active_proof_request("mainnet", 0, "0xsolver").unwrap();
        assert!(active.is_none());
    }

    #[test]
    fn test_find_active_proof_request_none_after_failed() {
        let db = test_db();
        let id = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        db.update_proof_request_error(id, "timeout").unwrap();
        let active = db.find_active_proof_request("mainnet", 0, "0xsolver").unwrap();
        assert!(active.is_none());
    }

    #[test]
    fn test_find_active_proof_request_environment_isolation() {
        let db = test_db();
        db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        let active = db.find_active_proof_request("testnet", 0, "0xsolver").unwrap();
        assert!(active.is_none());
    }

    #[test]
    fn test_find_active_proof_request_solver_isolation() {
        let db = test_db();
        db.create_proof_request("mainnet", 0, "0xsolver1").unwrap();
        let active = db.find_active_proof_request("mainnet", 0, "0xsolver2").unwrap();
        assert!(active.is_none());
    }

    #[test]
    fn test_find_active_proof_request_puzzle_isolation() {
        let db = test_db();
        db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        let active = db.find_active_proof_request("mainnet", 1, "0xsolver").unwrap();
        assert!(active.is_none());
    }

    #[test]
    fn test_duplicate_guard_allows_retry_after_failure() {
        let db = test_db();
        // First attempt fails
        let id1 = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        db.update_proof_request_error(id1, "network error").unwrap();

        // Should allow new attempt since first is failed
        let active = db.find_active_proof_request("mainnet", 0, "0xsolver").unwrap();
        assert!(active.is_none());

        // New request succeeds
        let id2 = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        assert_ne!(id1, id2);
        let active = db.find_active_proof_request("mainnet", 0, "0xsolver").unwrap();
        assert!(active.is_some());
    }

    #[test]
    fn test_schema_migration_idempotent() {
        let db = test_db();
        // init() already called, calling again should be safe
        db.init().unwrap();
        // proof_requests table should still work
        let id = db.create_proof_request("mainnet", 0, "0xsolver").unwrap();
        assert_eq!(id, 1);
    }
}
