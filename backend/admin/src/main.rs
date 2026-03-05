//! Bear Trap Admin CLI — puzzle and delegation management tool.
//!
//! Usage via Railway: `railway run bear-trap-admin <command> [options]`

use std::env;

use clap::{Parser, Subcommand};
use sha2::{Digest, Sha256};
use shared::{Db, validate_delegation_json};
use alloy::primitives::{Address, B256, U256, keccak256};
use alloy::signers::local::PrivateKeySigner;

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

    /// Create and sign a delegation for a puzzle (via DelegationManager off-chain signing).
    /// Generates an open delegation (ANY_DELEGATE) with three caveats:
    /// - ZKPEnforcer: ZK proof verification + operator attestation
    /// - NativeTokenTransferAmountEnforcer: limits ETH transfer to prize amount
    /// - ExactCalldataEnforcer: ensures calldata is empty (ETH-only transfer)
    CreateDelegation {
        /// Puzzle ID for the delegation.
        #[arg(long)]
        puzzle_id: i64,

        /// Delegator private key (hex). The wallet funding the prize.
        #[arg(long)]
        private_key: String,

        /// ZKPEnforcer contract address.
        #[arg(long)]
        enforcer: String,

        /// NativeTokenTransferAmountEnforcer contract address.
        #[arg(long)]
        native_transfer_enforcer: String,

        /// ExactCalldataEnforcer contract address.
        #[arg(long)]
        calldata_enforcer: String,

        /// RISC0 image ID (bytes32 hex).
        #[arg(long)]
        image_id: String,

        /// Operator address (backend signer).
        #[arg(long)]
        operator: String,

        /// Prize amount in ETH (e.g., "0.01").
        #[arg(long)]
        prize: String,
    },

    /// Update the prize amount and/or delegation JSON for an existing puzzle delegation.
    UpdatePrize {
        /// Puzzle ID to update.
        #[arg(long)]
        puzzle_id: i64,

        /// New prize amount in ETH.
        #[arg(long)]
        prize: Option<String>,

        /// New delegation JSON (optional, to update the full delegation).
        #[arg(long)]
        delegation: Option<String>,
    },

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

fn parse_eth_to_wei(eth: &str) -> U256 {
    let parts: Vec<&str> = eth.split('.').collect();
    match parts.len() {
        1 => {
            let whole: u128 = parts[0].parse().expect("Invalid ETH amount");
            U256::from(whole) * U256::from(10u64).pow(U256::from(18))
        }
        2 => {
            let whole: u128 = parts[0].parse().expect("Invalid ETH amount");
            let decimal_str = parts[1];
            let decimal_len = decimal_str.len().min(18);
            let padded = format!("{:0<18}", &decimal_str[..decimal_len]);
            let decimal: u128 = padded.parse().expect("Invalid decimal in ETH amount");
            U256::from(whole) * U256::from(10u64).pow(U256::from(18)) + U256::from(decimal)
        }
        _ => panic!("Invalid ETH amount format"),
    }
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
            // Validate delegation JSON schema before storing
            validate_delegation_json(&delegation).expect("Delegation JSON validation failed");
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
            // Validate delegation JSON schema before storing
            validate_delegation_json(&delegation).expect("Delegation JSON validation failed");
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

        Commands::CreateDelegation {
            puzzle_id,
            private_key,
            enforcer,
            native_transfer_enforcer,
            calldata_enforcer,
            image_id,
            operator,
            prize,
        } => {
            let db = get_db();
            db.init().expect("Failed to initialize database");

            let signer: PrivateKeySigner = private_key
                .parse()
                .expect("Invalid private key");
            let delegator = signer.address();

            // ANY_DELEGATE for open delegation
            let delegate_addr: Address = "0x0000000000000000000000000000000000000a11"
                .parse()
                .unwrap();

            // ROOT_AUTHORITY
            let authority = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

            // === Caveat 1: ZKPEnforcer ===
            let image_id_bytes: B256 = image_id.parse().expect("Invalid image ID");
            let puzzle_id_u256 = U256::from(puzzle_id as u64);
            let operator_addr: Address = operator.parse().expect("Invalid operator address");

            let mut zkp_terms = Vec::with_capacity(96);
            zkp_terms.extend_from_slice(image_id_bytes.as_slice());
            zkp_terms.extend_from_slice(&puzzle_id_u256.to_be_bytes::<32>());
            let mut addr_padded = [0u8; 32];
            addr_padded[12..].copy_from_slice(operator_addr.as_slice());
            zkp_terms.extend_from_slice(&addr_padded);
            let zkp_terms_hex = format!("0x{}", hex::encode(&zkp_terms));

            // === Caveat 2: NativeTokenTransferAmountEnforcer ===
            let prize_wei = parse_eth_to_wei(&prize);
            let mut native_terms = Vec::with_capacity(32);
            native_terms.extend_from_slice(&prize_wei.to_be_bytes::<32>());
            let native_terms_hex = format!("0x{}", hex::encode(&native_terms));

            // === Caveat 3: ExactCalldataEnforcer ===
            let calldata_terms_hex = "0x";

            let enforcer_addr: Address = enforcer.parse().expect("Invalid ZKPEnforcer address");
            let native_enforcer_addr: Address = native_transfer_enforcer.parse().expect("Invalid NativeTokenTransferAmountEnforcer address");
            let calldata_enforcer_addr: Address = calldata_enforcer.parse().expect("Invalid ExactCalldataEnforcer address");

            let delegation_json = serde_json::json!({
                "delegate": format!("{:?}", delegate_addr),
                "delegator": format!("{:?}", delegator),
                "authority": authority,
                "caveats": [
                    {
                        "enforcer": format!("{:?}", enforcer_addr),
                        "terms": zkp_terms_hex,
                        "args": "0x"
                    },
                    {
                        "enforcer": format!("{:?}", native_enforcer_addr),
                        "terms": native_terms_hex,
                        "args": "0x"
                    },
                    {
                        "enforcer": format!("{:?}", calldata_enforcer_addr),
                        "terms": calldata_terms_hex,
                        "args": "0x"
                    }
                ],
                "salt": "0",
                "signature": "0x"
            });

            let delegation_str = serde_json::to_string(&delegation_json).unwrap();
            validate_delegation_json(&delegation_str).expect("Generated delegation failed validation");

            let id = db
                .add_delegation(environment, puzzle_id, &delegation_str, &prize)
                .expect("Failed to add delegation");

            println!("Created open delegation #{id} for puzzle #{puzzle_id} ({environment})");
            println!("  Delegator:  {:?}", delegator);
            println!("  Delegate:   ANY_DELEGATE (0x...0a11)");
            println!("  Prize:      {} ETH ({} wei)", prize, prize_wei);
            println!("  Caveats:");
            println!("    1. ZKPEnforcer:                       {:?}", enforcer_addr);
            println!("    2. NativeTokenTransferAmountEnforcer: {:?}", native_enforcer_addr);
            println!("    3. ExactCalldataEnforcer:              {:?}", calldata_enforcer_addr);
            println!();
            println!("NOTE: Delegation signature is a placeholder (0x).");
            println!("Sign via DelegationManager on-chain, then update with:");
            println!("  bear-trap-admin update-delegation --puzzle-id {} --delegation '<signed json>' --prize {}", puzzle_id, prize);
            println!();
            println!("Delegation JSON:");
            println!("{}", serde_json::to_string_pretty(&delegation_json).unwrap());
        }

        Commands::UpdatePrize {
            puzzle_id,
            prize,
            delegation,
        } => {
            let db = get_db();
            db.init().expect("Failed to initialize database");

            if let Some(ref d) = delegation {
                validate_delegation_json(d).expect("Delegation JSON validation failed");
            }

            if let (Some(new_prize), Some(new_delegation)) = (&prize, &delegation) {
                db.update_delegation(environment, puzzle_id, new_delegation, new_prize)
                    .expect("Failed to update delegation");
                println!("Updated delegation AND prize for puzzle #{puzzle_id} ({environment}) to {} ETH", new_prize);
            } else if let Some(new_prize) = &prize {
                db.update_prize(environment, puzzle_id, new_prize)
                    .expect("Failed to update prize");
                println!("Updated prize for puzzle #{puzzle_id} ({environment}) to {} ETH", new_prize);
            } else if let Some(new_delegation) = &delegation {
                let current = db.get_active_delegation(environment, puzzle_id)
                    .expect("Failed to get current delegation")
                    .expect("No active delegation found for this puzzle");
                db.update_delegation(environment, puzzle_id, new_delegation, &current.prize_eth)
                    .expect("Failed to update delegation");
                println!("Updated delegation JSON for puzzle #{puzzle_id} ({environment})");
            } else {
                println!("Nothing to update. Provide --prize and/or --delegation.");
            }
        }

                Commands::MarkSolved { puzzle_id, winner } => {
            let db = get_db();
            db.mark_solved(environment, puzzle_id, &winner)
                .expect("Failed to mark puzzle as solved");
            println!("Marked puzzle #{puzzle_id} ({environment}) as solved (winner: {winner})");
        }
    }
}
