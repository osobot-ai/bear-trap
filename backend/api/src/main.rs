//! Bear Trap API Server — axum-based HTTP backend for the Bear Trap puzzle game.
//!
//! Endpoints:
//! - GET  /api/puzzles      — list all puzzles with prize info
//! - GET  /api/puzzles/:id  — get a single puzzle
//! - POST /api/prove        — burn ticket + generate ZK proof

use std::{
    collections::HashMap,
    env,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::Instant,
};

use alloy::{
    network::EthereumWallet,
    primitives::Address,
    providers::ProviderBuilder,
    signers::local::PrivateKeySigner,
    sol,
};
use axum::{
    extract::{ConnectInfo, Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

use prover::ProverConfig;
use shared::Db;

// Generate typed bindings for the BearTrap contract's useTicket function + errors.
sol! {
    #[sol(rpc)]
    contract BearTrap {
        error NoTickets();
        error AlreadySolved();
        error InvalidPuzzleId();

        function useTicket(address user, uint256 puzzleId) external;
        function markSolved(uint256 puzzleId, address winner) external;
    }
}

// ── Application State ────────────────────────────────────────

struct AppState {
    db: Mutex<Db>,
    prover_config: ProverConfig,
    environment: String,
    operator_signer: PrivateKeySigner,
    rpc_url: String,
    bear_trap_address: String,
    rate_limiter: Mutex<HashMap<IpAddr, Vec<Instant>>>,
}

const RATE_LIMIT_MAX_REQUESTS: usize = 5;
const RATE_LIMIT_WINDOW_SECS: u64 = 60;

// ── Request / Response Types ────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProveRequest {
    passphrase: String,
    solver_address: String,
    puzzle_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PuzzleResponse {
    id: i64,
    #[serde(rename = "clueURI")]
    clue_uri: String,
    prize_eth: Option<String>,
    solved: bool,
    winner: Option<String>,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ticket_burned: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProveSuccessResponse {
    seal: String,
    journal: String,
    solver_address: String,
    solution_hash: String,
    delegation: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkSolvedRequest {
    puzzle_id: i64,
    winner: String,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/puzzles — list all puzzles with prize info from active delegation.
async fn list_puzzles(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.list_puzzles(&state.environment) {
        Ok(puzzles) => {
            let response: Vec<PuzzleResponse> = puzzles
                .into_iter()
                .map(|p| PuzzleResponse {
                    id: p.id,
                    clue_uri: p.clue_uri,
                    prize_eth: p.prize_eth,
                    solved: p.solved,
                    winner: p.winner,
                })
                .collect();
            (StatusCode::OK, Json(serde_json::to_value(response).unwrap())).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to list puzzles: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to read puzzles".into(),
                    ticket_burned: None,
                }),
            )
                .into_response()
        }
    }
}

/// GET /api/puzzles/:id — get a single puzzle with delegation prize.
async fn get_puzzle(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_puzzle(&state.environment, id) {
        Ok(Some(p)) => (
            StatusCode::OK,
            Json(PuzzleResponse {
                id: p.id,
                clue_uri: p.clue_uri,
                prize_eth: p.prize_eth,
                solved: p.solved,
                winner: p.winner,
            }),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("No puzzle found with id {id}"),
                ticket_burned: None,
            }),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to get puzzle {id}: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to read puzzle".into(),
                    ticket_burned: None,
                }),
            )
                .into_response()
        }
    }
}

/// POST /api/prove — main proving endpoint.
///
/// Flow:
/// 1. Read puzzle from DB, check not solved
/// 2. Read active delegation from DB
/// 3. Call useTicket(solverAddress, puzzleId) on BearTrap contract
/// 4. Wait for tx confirmation
/// 5. Call prover with (guess, solverAddress, solutionHash)
/// 6. Return proof data or error
async fn prove(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<ProveRequest>,
) -> impl IntoResponse {
    {
        let mut limiter = state.rate_limiter.lock().await;
        let now = Instant::now();
        let window = std::time::Duration::from_secs(RATE_LIMIT_WINDOW_SECS);
        let timestamps = limiter.entry(addr.ip()).or_default();
        timestamps.retain(|t| now.duration_since(*t) < window);
        if timestamps.len() >= RATE_LIMIT_MAX_REQUESTS {
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(ErrorResponse {
                    error: "Rate limit exceeded. Try again later.".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
        timestamps.push(now);
    }

    if req.passphrase.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "passphrase is required".into(),
                ticket_burned: None,
            }),
        )
            .into_response();
    }

    if req.solver_address.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "solverAddress is required".into(),
                ticket_burned: None,
            }),
        )
            .into_response();
    }

    // Step 1 & 2: Read puzzle and delegation from DB (hold lock briefly)
    let (puzzle, delegation) = {
        let db = state.db.lock().await;

        let puzzle = match db.get_puzzle(&state.environment, req.puzzle_id) {
            Ok(Some(p)) => p,
            Ok(None) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("No puzzle found with id {}", req.puzzle_id),
                        ticket_burned: None,
                    }),
                )
                    .into_response();
            }
            Err(e) => {
                tracing::error!("DB error reading puzzle: {e}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to read puzzle".into(),
                        ticket_burned: None,
                    }),
                )
                    .into_response();
            }
        };

        if puzzle.solved {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "This puzzle has already been solved".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }

        let delegation = match db.get_active_delegation(&state.environment, req.puzzle_id) {
            Ok(d) => d,
            Err(e) => {
                tracing::error!("DB error reading delegation: {e}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to read delegation".into(),
                        ticket_burned: None,
                    }),
                )
                    .into_response();
            }
        };

        (puzzle, delegation)
    }; // DB lock released here

    // Step 3: Call useTicket on-chain
    let solver_addr: Address = match req.solver_address.parse() {
        Ok(a) => a,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid solver address".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    let bear_trap_addr: Address = match state.bear_trap_address.parse() {
        Ok(a) => a,
        Err(_) => {
            tracing::error!("Invalid BEAR_TRAP_ADDRESS: {}", state.bear_trap_address);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Server misconfiguration: invalid contract address".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    let signer = state.operator_signer.clone();

    let rpc_url: url::Url = match state.rpc_url.parse() {
        Ok(u) => u,
        Err(_) => {
            tracing::error!("Invalid RPC_URL: {}", state.rpc_url);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Server misconfiguration: invalid RPC URL".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    let wallet = EthereumWallet::from(signer);
    let provider = ProviderBuilder::new()
        .wallet(wallet)
        .connect_http(rpc_url);

    let contract = BearTrap::new(bear_trap_addr, provider);
    let puzzle_id_u256 = alloy::primitives::U256::from(req.puzzle_id as u64);

    tracing::info!(
        "Calling useTicket for {} on puzzle {}",
        req.solver_address,
        req.puzzle_id
    );

    let receipt = match contract.useTicket(solver_addr, puzzle_id_u256).send().await {
        Ok(tx) => match tx.get_receipt().await {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("useTicket tx failed to confirm: {e}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Ticket burn transaction failed to confirm".into(),
                        ticket_burned: None,
                    }),
                )
                    .into_response();
            }
        },
        Err(e) => {
            let err_string = format!("{e}");
            tracing::error!("useTicket reverted: {err_string}");

            let user_error = if err_string.contains("NoTickets") {
                "You have no tickets. Buy tickets first."
            } else if err_string.contains("AlreadySolved") {
                "This puzzle has already been solved."
            } else if err_string.contains("InvalidPuzzleId") {
                "Invalid puzzle ID."
            } else {
                "On-chain ticket burn failed. Please try again."
            };

            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: user_error.into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    tracing::info!(
        "useTicket confirmed in block {:?}, tx: {}",
        receipt.block_number,
        receipt.transaction_hash,
    );

    // Step 4: Generate ZK proof (mock or real depending on environment)
    let proof_result = if state.environment == "testnet" {
        tracing::info!("Using mock proving (testnet mode)");
        prover::generate_mock_proof(
            &req.passphrase,
            &req.solver_address,
            &puzzle.solution_hash,
        )
        .await
    } else {
        prover::generate_proof(
            &state.prover_config,
            &req.passphrase,
            &req.solver_address,
            &puzzle.solution_hash,
        )
        .await
    };

    match proof_result {
        Ok(result) => {
            // Parse delegation JSON for inclusion in response
            let delegation_value = delegation.and_then(|d| {
                serde_json::from_str::<serde_json::Value>(&d.delegation_json).ok()
            });

            (
                StatusCode::OK,
                Json(ProveSuccessResponse {
                    seal: format!("0x{}", hex::encode(&result.seal)),
                    journal: format!("0x{}", hex::encode(&result.journal)),
                    solver_address: result.solver_address,
                    solution_hash: result.solution_hash,
                    delegation: delegation_value,
                }),
            )
                .into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            let is_wrong_guess = msg.contains("Wrong guess");

            if is_wrong_guess {
                (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    Json(ErrorResponse {
                        error: "Wrong guess. Your ticket has been consumed.".into(),
                        ticket_burned: Some(true),
                    }),
                )
                    .into_response()
            } else {
                tracing::error!("Proof generation failed: {msg}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: msg,
                        ticket_burned: Some(true), // ticket was already burned on-chain
                    }),
                )
                    .into_response()
            }
        }
    }
}

/// Health check endpoint.
async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({"status": "ok"})))
}

async fn mark_solved(
    State(state): State<Arc<AppState>>,
    Json(req): Json<MarkSolvedRequest>,
) -> impl IntoResponse {
    let winner_addr: Address = match req.winner.parse() {
        Ok(a) => a,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid winner address".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    let bear_trap_addr: Address = match state.bear_trap_address.parse() {
        Ok(a) => a,
        Err(_) => {
            tracing::error!("Invalid BEAR_TRAP_ADDRESS: {}", state.bear_trap_address);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Server misconfiguration: invalid contract address".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    let rpc_url: url::Url = match state.rpc_url.parse() {
        Ok(u) => u,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Server misconfiguration: invalid RPC URL".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    let wallet = EthereumWallet::from(state.operator_signer.clone());
    let provider = ProviderBuilder::new()
        .wallet(wallet)
        .connect_http(rpc_url);

    let contract = BearTrap::new(bear_trap_addr, provider);
    let puzzle_id_u256 = alloy::primitives::U256::from(req.puzzle_id as u64);

    tracing::info!(
        "Calling markSolved for puzzle {} winner {}",
        req.puzzle_id,
        req.winner
    );

    match contract.markSolved(puzzle_id_u256, winner_addr).send().await {
        Ok(tx) => match tx.get_receipt().await {
            Ok(receipt) => {
                tracing::info!(
                    "markSolved confirmed in block {:?}, tx: {}",
                    receipt.block_number,
                    receipt.transaction_hash,
                );
            }
            Err(e) => {
                tracing::error!("markSolved tx failed to confirm: {e}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "markSolved transaction failed to confirm".into(),
                        ticket_burned: None,
                    }),
                )
                    .into_response();
            }
        },
        Err(e) => {
            let err_string = format!("{e}");
            tracing::error!("markSolved reverted: {err_string}");

            let user_error = if err_string.contains("AlreadySolved") {
                "Puzzle already marked as solved."
            } else if err_string.contains("InvalidPuzzleId") {
                "Invalid puzzle ID."
            } else {
                "On-chain markSolved failed."
            };

            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: user_error.into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    }

    {
        let db = state.db.lock().await;
        if let Err(e) = db.mark_solved(&state.environment, req.puzzle_id, &req.winner) {
            tracing::error!("Failed to mark puzzle solved in DB: {e}");
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({"status": "solved", "puzzleId": req.puzzle_id, "winner": req.winner})),
    )
        .into_response()
}

// ── Main ────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // Load configuration from environment
    let database_path = env::var("DATABASE_PATH").unwrap_or_else(|_| "./data/puzzles.db".into());
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let frontend_url = env::var("FRONTEND_URL").unwrap_or_else(|_| "*".into());
    let rpc_url = env::var("RPC_URL").unwrap_or_default();
    let operator_private_key = env::var("OPERATOR_PRIVATE_KEY").unwrap_or_default();
    let boundless_private_key = env::var("BOUNDLESS_PRIVATE_KEY").unwrap_or_default();
    let pinata_jwt = env::var("PINATA_JWT").ok();
    let bear_trap_address = env::var("BEAR_TRAP_ADDRESS").unwrap_or_default();
    let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "testnet".into());

    // Ensure data directory exists
    if let Some(parent) = std::path::Path::new(&database_path).parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Open database and initialize tables
    let db = Db::open(&database_path)?;
    db.init()?;
    tracing::info!("Database initialized at {database_path}");
    tracing::info!("Bear Trap API running in {} mode", environment);

    let operator_signer: PrivateKeySigner = if operator_private_key.is_empty() {
        tracing::warn!("OPERATOR_PRIVATE_KEY not set — prove endpoint will fail");
        "0x0000000000000000000000000000000000000000000000000000000000000001"
            .parse()
            .expect("fallback key must parse")
    } else {
        operator_private_key
            .parse()
            .expect("OPERATOR_PRIVATE_KEY is not a valid private key")
    };

    let prover_config = ProverConfig {
        rpc_url: rpc_url.clone(),
        private_key: boundless_private_key,
        pinata_jwt,
    };

    let state = Arc::new(AppState {
        db: Mutex::new(db),
        prover_config,
        environment,
        operator_signer,
        rpc_url,
        bear_trap_address,
        rate_limiter: Mutex::new(HashMap::new()),
    });

    // Configure CORS
    let cors = if frontend_url == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::new()
            .allow_origin(
                frontend_url
                    .parse::<axum::http::HeaderValue>()
                    .expect("Invalid FRONTEND_URL"),
            )
            .allow_methods(Any)
            .allow_headers(Any)
    };

    // Build router
    let app = Router::new()
        .route("/api/puzzles", get(list_puzzles))
        .route("/api/puzzles/{id}", get(get_puzzle))
        .route("/api/prove", post(prove))
        .route("/api/mark-solved", post(mark_solved))
        .route("/health", get(health))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Bear Trap API server listening on {addr}");
    tracing::info!("CORS: allowing origin {frontend_url}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
