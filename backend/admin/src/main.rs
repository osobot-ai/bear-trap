//! Bear Trap Admin CLI — puzzle and delegation management tool.
//!
//! Usage via Railway: `railway run bear-trap-admin <command> [options]`

use std::env;

use clap::{Parser, Subcommand};
use sha2::{Digest, Sha256};
use shared::Db;

#[derive(Parser)]
#[command(name = "bear-trap-admin")]
#[command(about = "Bear Trap puzzle and delegation management CLI")]
struct Cli {
    /// Environment to operate in: testnet or mainnet (default: testnet).
    #[arg(long, default_value = "testnet", global = true)]
    env: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize the database (create tables).
    Init,

    /// Create a new puzzle. Auto-computes SHA-256 of the answer.
    CreatePuzzle {
        /// The secret answer/passphrase.
        #[arg(long)]
        answer: String,

        /// IPFS URI for the puzzle clue (optional).
        #[arg(long, default_value = "")]
        clue_uri: String,
    },

    /// Add a signed delegation for a puzzle. Deactivates any existing active delegation.
    AddDelegation {
        /// Puzzle ID to attach the delegation to.
        #[arg(long)]
        puzzle_id: i64,

        /// Full signed delegation JSON.
        #[arg(long)]
        delegation: String,

        /// Prize amount in ETH (e.g., "1.0").
        #[arg(long)]
        prize: String,
    },

    /// Update (replace) the active delegation for a puzzle.
    UpdateDelegation {
        /// Puzzle ID to update.
        #[arg(long)]
        puzzle_id: i64,

        /// New signed delegation JSON.
        #[arg(long)]
        delegation: String,

        /// New prize amount in ETH.
        #[arg(long)]
        prize: String,
    },

    /// List all puzzles with their active delegation prize.
    ListPuzzles,

    /// Mark a puzzle as solved with a winner address.
    MarkSolved {
        /// Puzzle ID to mark as solved.
        #[arg(long)]
        puzzle_id: i64,

        /// Winner's Ethereum address.
        #[arg(long)]
        winner: String,
    },
}

fn get_db() -> Db {
    let path = env::var("DATABASE_PATH").unwrap_or_else(|_| "./data/puzzles.db".into());

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).expect("Failed to create data directory");
    }

    Db::open(&path).expect("Failed to open database")
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("0x{}", hex::encode(hasher.finalize()))
}

fn main() {
    let cli = Cli::parse();
    let environment = &cli.env;

    match cli.command {
        Commands::Init => {
            let db = get_db();
            db.init().expect("Failed to initialize database");
            let path = env::var("DATABASE_PATH").unwrap_or_else(|_| "./data/puzzles.db".into());
            println!("Database initialized at {path}");
        }

        Commands::CreatePuzzle { answer, clue_uri } => {
            let db = get_db();
            db.init().expect("Failed to initialize database");

            let solution_hash = sha256_hex(&answer);
            let next_id = db
                .next_puzzle_id(environment)
                .expect("Failed to query next puzzle ID");
            let id = db
                .create_puzzle(environment, next_id, &solution_hash, &clue_uri)
                .expect("Failed to create puzzle");

            println!("Created puzzle #{id} ({environment}) (hash: {solution_hash})");
        }

        Commands::AddDelegation {
            puzzle_id,
            delegation,
            prize,
        } => {
            let db = get_db();
            let id = db
                .add_delegation(environment, puzzle_id, &delegation, &prize)
                .expect("Failed to add delegation");
            println!("Added delegation #{id} for puzzle #{puzzle_id} ({environment}) (prize: {prize} ETH)");
        }

        Commands::UpdateDelegation {
            puzzle_id,
            delegation,
            prize,
        } => {
            let db = get_db();
            db.update_delegation(environment, puzzle_id, &delegation, &prize)
                .expect("Failed to update delegation");
            println!("Updated delegation for puzzle #{puzzle_id} ({environment}) (prize: {prize} ETH)");
        }

        Commands::ListPuzzles => {
            let db = get_db();
            db.init().expect("Failed to initialize database");

            let puzzles = db.list_puzzles(environment).expect("Failed to list puzzles");

            if puzzles.is_empty() {
                println!("No puzzles found ({environment}).");
                return;
            }

            println!("\nPuzzles — {environment} ({} total):\n", puzzles.len());
            println!(
                "  {:<4} | {:<11} | {:<22} | {:<6} | {}",
                "ID", "Prize (ETH)", "Hash (first 18)", "Solved", "Winner"
            );
            println!("  {}", "-".repeat(75));

            for p in &puzzles {
                let hash_short = if p.solution_hash.len() > 18 {
                    format!("{}...", &p.solution_hash[..18])
                } else {
                    p.solution_hash.clone()
                };
                let prize = p.prize_eth.as_deref().unwrap_or("-");
                let winner = p.winner.as_deref().unwrap_or("-");
                println!(
                    "  {:<4} | {:<11} | {:<22} | {:<6} | {}",
                    p.id, prize, hash_short, p.solved, winner
                );
            }
            println!();
        }

        Commands::MarkSolved { puzzle_id, winner } => {
            let db = get_db();
            db.mark_solved(environment, puzzle_id, &winner)
                .expect("Failed to mark puzzle as solved");
            println!("Marked puzzle #{puzzle_id} ({environment}) as solved (winner: {winner})");
        }
    }
}
