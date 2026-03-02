//! Bear Trap API Server — axum-based HTTP backend for the Bear Trap puzzle game.
//!
//! Endpoints:
//! - GET  /api/puzzles      — list all puzzles with prize info
//! - GET  /api/puzzles/:id  — get a single puzzle
//! - POST /api/prove        — burn ticket + generate ZK proof

use std::{env, net::SocketAddr, sync::Arc};

use axum::{
    extract::{Path, State},
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

// ── Application State ────────────────────────────────────────

struct AppState {
    db: Mutex<Db>,
    prover_config: ProverConfig,
    environment: String,
    #[allow(dead_code)]
    operator_private_key: String,
    #[allow(dead_code)]
    rpc_url: String,
    #[allow(dead_code)]
    bear_trap_address: String,
}

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
/// 3. Call useTicket(solverAddress, puzzleId) on BearTrap contract (TODO: on-chain call)
/// 4. Wait for tx confirmation
/// 5. Call prover with (guess, solverAddress, solutionHash)
/// 6. Return proof data or error
async fn prove(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ProveRequest>,
) -> impl IntoResponse {
    // Validate request fields
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
    // TODO: Implement on-chain useTicket call via alloy.
    //
    // ```rust
    // let signer: PrivateKeySigner = state.operator_private_key.parse()?;
    // let provider = ProviderBuilder::new()
    //     .with_recommended_fillers()
    //     .wallet(EthereumWallet::from(signer))
    //     .on_http(state.rpc_url.parse()?);
    //
    // let contract = BearTrap::new(state.bear_trap_address.parse()?, provider);
    // let tx = contract.useTicket(req.solver_address.parse()?, req.puzzle_id.into());
    // let receipt = tx.send().await?.get_receipt().await?;
    // ```
    tracing::info!(
        "Would call useTicket for {} on puzzle {} (on-chain call pending implementation)",
        req.solver_address,
        req.puzzle_id
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
                    StatusCode::OK,
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

    let prover_config = ProverConfig {
        rpc_url: rpc_url.clone(),
        private_key: boundless_private_key,
        pinata_jwt,
    };

    let state = Arc::new(AppState {
        db: Mutex::new(db),
        prover_config,
        environment,
        operator_private_key,
        rpc_url,
        bear_trap_address,
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
        .route("/health", get(health))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Bear Trap API server listening on {addr}");
    tracing::info!("CORS: allowing origin {frontend_url}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
