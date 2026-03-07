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
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
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

// ZKPEnforcer ProofVerified event for tx receipt log parsing.
sol! {
    event ProofVerified(address indexed redeemer, bytes32 indexed solutionHash, bytes32 indexed imageId, uint256 puzzleId, address operatorAddress);
}

// ── Application State ────────────────────────────────────────

struct AppState {
    db: std::sync::Mutex<Db>,
    prover_config: ProverConfig,
    environment: String,
    operator_signer: PrivateKeySigner,
    rpc_url: String,
    bear_trap_address: String,
    zkp_enforcer_address: Address,
    rate_limiter: tokio::sync::Mutex<HashMap<IpAddr, Vec<Instant>>>,
    mark_solved_last_call: tokio::sync::Mutex<Option<Instant>>,
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
    signature: String,
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
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ticket_burned: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProveSubmittedResponse {
    proof_request_id: i64,
    status: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofStatusResponse {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    seal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    journal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    solver_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    solution_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    delegation: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prize_eth: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    puzzle_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkSolvedRequest {
    tx_hash: String,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/puzzles — list all puzzles with prize info from active delegation.
async fn list_puzzles(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let env = state.environment.clone();
    let db_result = {
        let state = Arc::clone(&state);
        tokio::task::spawn_blocking(move || {
            let db = state.db.lock().expect("db mutex poisoned");
            db.list_puzzles(&env)
        })
        .await
        .expect("spawn_blocking panicked")
    };

    match db_result {
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
    let env = state.environment.clone();
    let db_result = {
        let state = Arc::clone(&state);
        tokio::task::spawn_blocking(move || {
            let db = state.db.lock().expect("db mutex poisoned");
            db.get_puzzle(&env, id)
        })
        .await
        .expect("spawn_blocking panicked")
    };

    match db_result {
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
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Json(req): Json<ProveRequest>,
) -> impl IntoResponse {
    // Extract real client IP from proxy headers, falling back to socket address.
    // X-Forwarded-For is a comma-separated list; the leftmost IP is the original client.
    let client_ip: IpAddr = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .and_then(|s| s.trim().parse::<IpAddr>().ok())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.trim().parse::<IpAddr>().ok())
        })
        .unwrap_or_else(|| addr.ip());

    {
        let mut limiter = state.rate_limiter.lock().await;
        let now = Instant::now();
        let window = std::time::Duration::from_secs(RATE_LIMIT_WINDOW_SECS);
        let timestamps = limiter.entry(client_ip).or_default();
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

    // Verify EIP-191 signature proves caller owns solver_address (prevents ticket griefing)
    {
        let message = format!("Bear Trap: solve puzzle {} with {}", req.puzzle_id, req.passphrase.trim());
        let prefixed = format!("\x19Ethereum Signed Message:\n{}{}", message.len(), message);
        let hash = alloy::primitives::keccak256(prefixed.as_bytes());

        let sig: alloy::signers::Signature = match req.signature.parse() {
            Ok(s) => s,
            Err(_) => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(ErrorResponse {
                        error: "Invalid signature format".into(),
                        ticket_burned: None,
                    }),
                )
                    .into_response();
            }
        };

        let recovered = match sig.recover_address_from_prehash(&hash) {
            Ok(addr) => addr,
            Err(_) => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(ErrorResponse {
                        error: "Signature recovery failed".into(),
                        ticket_burned: None,
                    }),
                )
                    .into_response();
            }
        };

        let expected_addr: Address = match req.solver_address.parse() {
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

        if recovered != expected_addr {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Signature does not match solver address".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    }

    let env = state.environment.clone();
    let puzzle_id = req.puzzle_id;
    let db_result = {
        let state = Arc::clone(&state);
        tokio::task::spawn_blocking(move || {
            let db = state.db.lock().expect("db mutex poisoned");
            let puzzle = db.get_puzzle(&env, puzzle_id).map_err(|e| e.to_string())?;
            let delegation = db.get_active_delegation(&env, puzzle_id).map_err(|e| e.to_string())?;
            Ok::<_, String>((puzzle, delegation))
        })
        .await
        .expect("spawn_blocking panicked")
    };

    let (puzzle, delegation) = match db_result {
        Ok((Some(puzzle), delegation)) => {
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
            (puzzle, delegation)
        }
        Ok((None, _)) => {
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
            tracing::error!("DB error reading puzzle/delegation: {e}");
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

    // Check for duplicate active proof request (prevent double-burn)
    {
        let env_check = state.environment.clone();
        let solver_check = req.solver_address.clone();
        let pid = puzzle_id;
        let state_check = Arc::clone(&state);
        let existing = tokio::task::spawn_blocking(move || {
            let db = state_check.db.lock().expect("db mutex poisoned");
            db.find_active_proof_request(&env_check, pid, &solver_check)
        })
        .await
        .expect("spawn_blocking panicked");

        if let Ok(Some(active)) = existing {
            tracing::warn!(
                "Active proof request {} already exists for solver {} puzzle {}",
                active.id, req.solver_address, puzzle_id
            );
            return (
                StatusCode::CONFLICT,
                Json(ProveSubmittedResponse {
                    proof_request_id: active.id,
                    status: active.status,
                    message: "A proof request is already in progress. Poll for status.".into(),
                }),
            )
                .into_response();
        }
    }

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

    // Create proof request record in DB
    let env_for_db = state.environment.clone();
    let solver_for_db = req.solver_address.clone();
    let proof_request_id = {
        let state = Arc::clone(&state);
        tokio::task::spawn_blocking(move || {
            let db = state.db.lock().expect("db mutex poisoned");
            db.create_proof_request(&env_for_db, puzzle_id, &solver_for_db)
        })
        .await
        .expect("spawn_blocking panicked")
    };

    let proof_request_id = match proof_request_id {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Failed to create proof request: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create proof request".into(),
                    ticket_burned: Some(true),
                }),
            )
                .into_response();
        }
    };

    if state.environment == "testnet" {
        tracing::info!("Using mock proving (testnet mode)");
        let mock_result = prover::generate_mock_proof(
            &req.passphrase,
            &req.solver_address,
            &puzzle.solution_hash,
            req.puzzle_id as u64,
            &state.operator_signer,
        )
        .await;

        match mock_result {
            Ok(result) => {
                let (delegation_value, prize_eth) = match &delegation {
                    Some(d) => (
                        serde_json::from_str::<serde_json::Value>(&d.delegation_json).ok(),
                        Some(d.prize_eth.clone()),
                    ),
                    None => (None, None),
                };

                let fulfilled_data = serde_json::json!({
                    "seal": format!("0x{}", hex::encode(&result.seal)),
                    "journal": format!("0x{}", hex::encode(&result.journal)),
                    "solverAddress": result.solver_address,
                    "solutionHash": result.solution_hash,
                    "puzzleId": result.puzzle_id,
                    "delegation": delegation_value,
                    "prizeEth": prize_eth,
                });

                let pr_id = proof_request_id.clone();
                let state2 = Arc::clone(&state);
                let data_str = fulfilled_data.to_string();
                let _ = tokio::task::spawn_blocking(move || {
                    let db = state2.db.lock().expect("db mutex poisoned");
                    if let Err(e) = db.update_proof_request_result(pr_id, &data_str) {
                        tracing::error!("Failed to update proof request result: {e}");
                    }
                })
                .await;
            }
            Err(e) => {
                let msg = e.to_string();
                let is_wrong_guess = msg.contains("Wrong guess");

                let pr_id = proof_request_id.clone();
                let state2 = Arc::clone(&state);
                let error_msg = msg.clone();
                let _ = tokio::task::spawn_blocking(move || {
                    let db = state2.db.lock().expect("db mutex poisoned");
                    if let Err(e) = db.update_proof_request_error(pr_id, &error_msg) {
                        tracing::error!("Failed to update proof request error: {e}");
                    }
                })
                .await;

                if is_wrong_guess {
                    return (
                        StatusCode::UNPROCESSABLE_ENTITY,
                        Json(ErrorResponse {
                            error: "Wrong guess. Your ticket has been consumed.".into(),
                            ticket_burned: Some(true),
                        }),
                    )
                        .into_response();
                } else {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: msg,
                            ticket_burned: Some(true),
                        }),
                    )
                        .into_response();
                }
            }
        }
    } else {
        // Mainnet: submit to Boundless and spawn background task
        let submit_result = prover::submit_proof(
            &state.prover_config,
            &req.passphrase,
            &req.solver_address,
            &puzzle.solution_hash,
            req.puzzle_id as u64,
            &state.operator_signer,
        )
        .await;

        match submit_result {
            Ok(submission) => {
                // Save boundless request ID to DB
                let pr_id = proof_request_id.clone();
                let boundless_id = submission.boundless_request_id.clone();
                let exp = submission.expires_at as i64;
                let state2 = Arc::clone(&state);
                let _ = tokio::task::spawn_blocking(move || {
                    let db = state2.db.lock().expect("db mutex poisoned");
                    if let Err(e) = db.update_proof_request_boundless_id(pr_id, &boundless_id, exp) {
                        tracing::error!("Failed to update boundless request ID: {e}");
                    }
                })
                .await;

                // Spawn background task to wait for fulfillment
                let pr_id = proof_request_id.clone();
                let state_bg = Arc::clone(&state);
                let env_bg = state.environment.clone();
                let delegation_bg = delegation;
                let puzzle_id_bg = req.puzzle_id;
                tokio::spawn(async move {
                    // Update status to "locked" after a short delay
                    // (Boundless typically locks within 30-60s)
                    {
                        let state_lock = Arc::clone(&state_bg);
                        let pr_id_lock = pr_id;
                        tokio::spawn(async move {
                            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                            let _ = tokio::task::spawn_blocking(move || {
                                let db = state_lock.db.lock().expect("db mutex poisoned");
                                // Only update if still "submitted" (not already fulfilled/failed)
                                if let Ok(Some(pr)) = db.get_proof_request(pr_id_lock) {
                                    if pr.status == "submitted" {
                                        let _ = db.update_proof_request_status(pr_id_lock, "locked");
                                    }
                                }
                            }).await;
                        });
                    }

                    let result = submission.fulfillment_future.await;
                    match result {
                        Ok(proof_result) => {
                            let (delegation_value, prize_eth) = match &delegation_bg {
                                Some(d) => (
                                    serde_json::from_str::<serde_json::Value>(&d.delegation_json).ok(),
                                    Some(d.prize_eth.clone()),
                                ),
                                None => (None, None),
                            };

                            let fulfilled_data = serde_json::json!({
                                "seal": format!("0x{}", hex::encode(&proof_result.seal)),
                                "journal": format!("0x{}", hex::encode(&proof_result.journal)),
                                "solverAddress": proof_result.solver_address,
                                "solutionHash": proof_result.solution_hash,
                                "puzzleId": proof_result.puzzle_id,
                                "delegation": delegation_value,
                                "prizeEth": prize_eth,
                            });

                            let data_str = fulfilled_data.to_string();
                            let _ = tokio::task::spawn_blocking(move || {
                                let db = state_bg.db.lock().expect("db mutex poisoned");
                                if let Err(e) = db.update_proof_request_result(pr_id, &data_str) {
                                    tracing::error!("Failed to update proof request result: {e}");
                                }
                            })
                            .await;

                            tracing::info!("Background proof fulfilled for puzzle {puzzle_id_bg} (env={env_bg})");
                        }
                        Err(e) => {
                            let error_msg = e.to_string();
                            tracing::error!("Background proof failed for puzzle {puzzle_id_bg}: {error_msg}");
                            let _ = tokio::task::spawn_blocking(move || {
                                let db = state_bg.db.lock().expect("db mutex poisoned");
                                if let Err(e) = db.update_proof_request_error(pr_id, &error_msg) {
                                    tracing::error!("Failed to update proof request error: {e}");
                                }
                            })
                            .await;
                        }
                    }
                });
            }
            Err(e) => {
                let msg = e.to_string();
                let is_wrong_guess = msg.contains("Wrong guess");

                let pr_id = proof_request_id.clone();
                let state2 = Arc::clone(&state);
                let error_msg = msg.clone();
                let _ = tokio::task::spawn_blocking(move || {
                    let db = state2.db.lock().expect("db mutex poisoned");
                    if let Err(e) = db.update_proof_request_error(pr_id, &error_msg) {
                        tracing::error!("Failed to update proof request error: {e}");
                    }
                })
                .await;

                if is_wrong_guess {
                    return (
                        StatusCode::UNPROCESSABLE_ENTITY,
                        Json(ErrorResponse {
                            error: "Wrong guess. Your ticket has been consumed.".into(),
                            ticket_burned: Some(true),
                        }),
                    )
                        .into_response();
                } else {
                    tracing::error!("Proof submission failed: {msg}");
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: msg,
                            ticket_burned: Some(true),
                        }),
                    )
                        .into_response();
                }
            }
        }
    }

    (
        StatusCode::OK,
        Json(ProveSubmittedResponse {
            proof_request_id,
            status: "submitted".into(),
            message: "Proof request submitted. Poll /api/prove/status/{id} for updates.".into(),
        }),
    )
        .into_response()
}

async fn proof_status(
    State(state): State<Arc<AppState>>,
    Path(proof_request_id): Path<i64>,
) -> impl IntoResponse {
    let db_result = {
        let state = Arc::clone(&state);
        tokio::task::spawn_blocking(move || {
            let db = state.db.lock().expect("db mutex poisoned");
            db.get_proof_request(proof_request_id)
        })
        .await
        .expect("spawn_blocking panicked")
    };

    match db_result {
        Ok(Some(pr)) => {
            match pr.status.as_str() {
                "submitted" => (
                    StatusCode::OK,
                    Json(ProofStatusResponse {
                        status: "submitted".into(),
                        message: Some("Proof request is queued...".into()),
                        error: None,
                        seal: None,
                        journal: None,
                        solver_address: None,
                        solution_hash: None,
                        delegation: None,
                        prize_eth: None,
                        puzzle_id: None,
                    }),
                )
                    .into_response(),
                "locked" => (
                    StatusCode::OK,
                    Json(ProofStatusResponse {
                        status: "locked".into(),
                        message: Some("A prover is generating your proof...".into()),
                        error: None,
                        seal: None,
                        journal: None,
                        solver_address: None,
                        solution_hash: None,
                        delegation: None,
                        prize_eth: None,
                        puzzle_id: None,
                    }),
                )
                    .into_response(),
                "fulfilled" => {
                    let result: serde_json::Value = pr
                        .result_json
                        .and_then(|r| serde_json::from_str(&r).ok())
                        .unwrap_or_default();

                    (
                        StatusCode::OK,
                        Json(ProofStatusResponse {
                            status: "fulfilled".into(),
                            message: None,
                            error: None,
                            seal: result.get("seal").and_then(|v| v.as_str()).map(String::from),
                            journal: result.get("journal").and_then(|v| v.as_str()).map(String::from),
                            solver_address: result.get("solverAddress").and_then(|v| v.as_str()).map(String::from),
                            solution_hash: result.get("solutionHash").and_then(|v| v.as_str()).map(String::from),
                            delegation: result.get("delegation").cloned(),
                            prize_eth: result.get("prizeEth").and_then(|v| v.as_str()).map(String::from),
                            puzzle_id: result.get("puzzleId").and_then(|v| v.as_i64()),
                        }),
                    )
                        .into_response()
                }
                "failed" => (
                    StatusCode::OK,
                    Json(ProofStatusResponse {
                        status: "failed".into(),
                        message: None,
                        error: Some(pr.error_message.unwrap_or_else(|| "Proof generation failed".into())),
                        seal: None,
                        journal: None,
                        solver_address: None,
                        solution_hash: None,
                        delegation: None,
                        prize_eth: None,
                        puzzle_id: None,
                    }),
                )
                    .into_response(),
                "expired" => (
                    StatusCode::OK,
                    Json(ProofStatusResponse {
                        status: "expired".into(),
                        message: None,
                        error: Some("Proof request expired".into()),
                        seal: None,
                        journal: None,
                        solver_address: None,
                        solution_hash: None,
                        delegation: None,
                        prize_eth: None,
                        puzzle_id: None,
                    }),
                )
                    .into_response(),
                _ => (
                    StatusCode::OK,
                    Json(ProofStatusResponse {
                        status: pr.status,
                        message: Some("Unknown status".into()),
                        error: None,
                        seal: None,
                        journal: None,
                        solver_address: None,
                        solution_hash: None,
                        delegation: None,
                        prize_eth: None,
                        puzzle_id: None,
                    }),
                )
                    .into_response(),
            }
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Proof request not found".into(),
                ticket_burned: None,
            }),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to get proof request: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to read proof request".into(),
                    ticket_burned: None,
                }),
            )
                .into_response()
        }
    }
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({"status": "ok"})))
}

async fn mark_solved(
    State(state): State<Arc<AppState>>,
    Json(req): Json<MarkSolvedRequest>,
) -> impl IntoResponse {
    // Global rate limit: 1 request per 60 seconds from any caller
    {
        let mut last_call = state.mark_solved_last_call.lock().await;
        let now = Instant::now();
        if let Some(prev) = *last_call {
            if now.duration_since(prev) < std::time::Duration::from_secs(60) {
                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(ErrorResponse {
                        error: "Rate limited. Try again in 1 minute.".into(),
                        ticket_burned: None,
                    }),
                )
                    .into_response();
            }
        }
        *last_call = Some(now);
    }

    let tx_hash: alloy::primitives::B256 = match req.tx_hash.parse() {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid or missing txHash".into(),
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

    let read_provider = ProviderBuilder::new().connect_http(rpc_url.clone());

    use alloy::providers::Provider;
    let receipt = match read_provider.get_transaction_receipt(tx_hash).await {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Transaction not found or not yet confirmed".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("Failed to fetch tx receipt: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to fetch transaction receipt".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    // Find the ProofVerified event emitted by the ZKPEnforcer contract
    use alloy_sol_types::SolEvent;
    let enforcer_addr = state.zkp_enforcer_address;

    let proof_log = receipt.inner.logs().iter().find(|log| {
        log.address() == enforcer_addr
            && log.data().topics().first() == Some(&ProofVerified::SIGNATURE_HASH)
            && log.data().topics().len() == 4
    });

    let log = match proof_log {
        Some(l) => l,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "No ProofVerified event found in transaction receipt".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    // Indexed: topic1=redeemer, topic2=solutionHash, topic3=imageId
    // Non-indexed: puzzleId in log.data
    let redeemer = Address::from_word(log.data().topics()[1]);
    let solution_hash_bytes = log.data().topics()[2];

    let decoded = match ProofVerified::decode_log_data(log.data()) {
        Ok(d) => d,
        Err(e) => {
            tracing::error!("Failed to decode ProofVerified log data: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to decode event data".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };
    let puzzle_id = decoded.puzzleId;
    let puzzle_id_i64 = puzzle_id.to::<u64>() as i64;

    // Look up puzzle in DB and verify solutionHash matches
    let env = state.environment.clone();
    let db_result = {
        let state = Arc::clone(&state);
        tokio::task::spawn_blocking(move || {
            let db = state.db.lock().expect("db mutex poisoned");
            db.get_puzzle(&env, puzzle_id_i64)
        })
        .await
        .expect("spawn_blocking panicked")
    };

    let puzzle = match db_result {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("No puzzle found with id {puzzle_id_i64}"),
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
                    error: "Failed to read puzzle from database".into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    };

    // Verify solutionHash from the event matches the DB
    let db_hash_clean = puzzle.solution_hash.strip_prefix("0x").unwrap_or(&puzzle.solution_hash);
    let event_hash_hex = hex::encode(solution_hash_bytes.as_slice());
    if db_hash_clean != event_hash_hex {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "solutionHash in event does not match any puzzle".into(),
                ticket_burned: None,
            }),
        )
            .into_response();
    }

    if puzzle.solved {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Puzzle already solved".into(),
                ticket_burned: None,
            }),
        )
            .into_response();
    }

    // Call BearTrap.markSolved(puzzleId, redeemer) on-chain
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

    let wallet = EthereumWallet::from(state.operator_signer.clone());
    let write_provider = ProviderBuilder::new()
        .wallet(wallet)
        .connect_http(rpc_url);

    let contract = BearTrap::new(bear_trap_addr, write_provider);
    let winner_str = format!("{:?}", redeemer);

    tracing::info!(
        "Calling markSolved for puzzle {} winner {}",
        puzzle_id_i64,
        winner_str
    );

    match contract.markSolved(puzzle_id, redeemer).send().await {
        Ok(tx) => match tx.get_receipt().await {
            Ok(mark_receipt) => {
                tracing::info!(
                    "markSolved confirmed in block {:?}, tx: {}",
                    mark_receipt.block_number,
                    mark_receipt.transaction_hash,
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
                "Puzzle already marked as solved on-chain."
            } else if err_string.contains("InvalidPuzzleId") {
                "Invalid puzzle ID."
            } else {
                "On-chain markSolved failed."
            };

            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: user_error.into(),
                    ticket_burned: None,
                }),
            )
                .into_response();
        }
    }

    {
        let env = state.environment.clone();
        let winner = winner_str.clone();
        let state = Arc::clone(&state);
        let _ = tokio::task::spawn_blocking(move || {
            let db = state.db.lock().expect("db mutex poisoned");
            if let Err(e) = db.mark_solved(&env, puzzle_id_i64, &winner) {
                tracing::error!("Failed to mark puzzle solved in DB: {e}");
            }
        })
        .await;
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({"status": "solved", "puzzleId": puzzle_id_i64, "winner": winner_str})),
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
    let zkp_enforcer_address: Address = env::var("ZKP_ENFORCER_ADDRESS")
        .unwrap_or_default()
        .parse()
        .unwrap_or_else(|_| {
            tracing::warn!("ZKP_ENFORCER_ADDRESS not set or invalid — mark-solved endpoint will fail");
            Address::ZERO
        });
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
        db: std::sync::Mutex::new(db),
        prover_config,
        environment,
        operator_signer,
        rpc_url,
        bear_trap_address,
        zkp_enforcer_address,
        rate_limiter: tokio::sync::Mutex::new(HashMap::new()),
        mark_solved_last_call: tokio::sync::Mutex::new(None),
    });

    let cors = if frontend_url == "*" {
        tracing::warn!("⚠️  CORS is set to wildcard (*). Set FRONTEND_URL for production.");
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
        .route("/api/prove/status/{proof_request_id}", get(proof_status))
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
