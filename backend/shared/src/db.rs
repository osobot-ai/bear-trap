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

impl Db {
    /// Open (or create) a SQLite database at the given path.
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        // Enable WAL mode for better concurrent read performance.
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        Ok(Self { conn })
    }

    /// Create tables if they don't exist.
    pub fn init(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS puzzles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        Ok(())
    }

    // ── Puzzles ──────────────────────────────────────────────

    /// Insert a new puzzle. Returns the new puzzle ID.
    pub fn create_puzzle(&self, env: &str, solution_hash: &str, clue_uri: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO puzzles (environment, solution_hash, clue_uri) VALUES (?1, ?2, ?3)",
            params![env, solution_hash, clue_uri],
        )?;
        Ok(self.conn.last_insert_rowid())
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
        let id = db.create_puzzle("testnet", "0xabcdef", "ipfs://clue").unwrap();
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
        db.create_puzzle("testnet", "0x111", "ipfs://1").unwrap();
        db.create_puzzle("testnet", "0x222", "ipfs://2").unwrap();
        let puzzles = db.list_puzzles("testnet").unwrap();
        assert_eq!(puzzles.len(), 2);
    }

    #[test]
    fn test_environment_isolation() {
        let db = test_db();
        db.create_puzzle("testnet", "0x111", "ipfs://1").unwrap();
        db.create_puzzle("mainnet", "0x222", "ipfs://2").unwrap();

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
        let id = db.create_puzzle("testnet", "0xaaa", "").unwrap();
        db.mark_solved("testnet", id, "0xwinner").unwrap();
        let puzzle = db.get_puzzle("testnet", id).unwrap().unwrap();
        assert!(puzzle.solved);
        assert_eq!(puzzle.winner.as_deref(), Some("0xwinner"));
    }

    #[test]
    fn test_delegation_lifecycle() {
        let db = test_db();
        let pid = db.create_puzzle("testnet", "0xaaa", "").unwrap();

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
        let pid = db.create_puzzle("testnet", "0xaaa", "").unwrap();

        db.add_delegation("testnet", pid, r#"{"v":1}"#, "1.0").unwrap();

        // Should not find delegation in mainnet environment
        let d = db.get_active_delegation("mainnet", pid).unwrap();
        assert!(d.is_none());
    }
}
