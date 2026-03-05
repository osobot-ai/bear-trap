# AGENTS.md — Testnet Support + Environment Separation

## Overview
Add full testnet (Base Sepolia) support for end-to-end testing without real funds.
Add environment separation (testnet/mainnet) to the backend database.

## 1. Mock Contracts for Testnet

### MockRiscZeroVerifier.sol (`contracts/src/mocks/MockRiscZeroVerifier.sol`)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IRiscZeroVerifier} from "risc0/IRiscZeroVerifier.sol";

/// @title MockRiscZeroVerifier
/// @notice Always-passing verifier for testnet. verify() never reverts.
contract MockRiscZeroVerifier is IRiscZeroVerifier {
    function verify(bytes calldata, bytes32, bytes32) external view {}
    // Implement any other required interface methods as no-ops
}
```
Check the actual IRiscZeroVerifier interface to make sure ALL methods are implemented. Read the interface file at `lib/risc0-ethereum/contracts/src/IRiscZeroVerifier.sol`.

### MockOSO.sol (`contracts/src/mocks/MockOSO.sol`)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ERC20} from "openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockOSO
/// @notice Mintable ERC20 for testnet. Anyone can mint.
contract MockOSO is ERC20 {
    constructor() ERC20("Mock OSO", "OSO") {}
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

### Deploy script for testnet (`contracts/scripts/DeployTestnet.s.sol`)
Deploys:
1. MockRiscZeroVerifier
2. MockOSO  
3. ZKPEnforcer (using MockRiscZeroVerifier address)
4. BearTrap (using MockOSO address, owner = deployer)

Prints all addresses at the end. Uses the same ticket price (1000 * 1e18).

Keep the existing `Deploy.s.sol` for mainnet (just rename to `DeployMainnet.s.sol` or keep as-is).

## 2. Database Environment Separation

### Schema changes (`backend/shared/src/db.rs`)
Add `environment TEXT NOT NULL DEFAULT 'testnet'` column to BOTH tables:

```sql
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
```

### All DB query methods need environment parameter
Every query in `db.rs` should accept `environment: &str` and filter by it:
- `create_puzzle(env, solution_hash, clue_uri)`
- `get_puzzle(env, id)` 
- `list_puzzles(env)`
- `mark_solved(env, id, winner)`
- `add_delegation(env, puzzle_id, delegation_json, prize_eth)`
- `update_delegation(env, puzzle_id, delegation_json, prize_eth)`
- `get_active_delegation(env, puzzle_id)`

The puzzle IDs should still be unique globally (AUTOINCREMENT handles this). The environment filter just scopes what's visible.

### API server environment (`backend/api/src/main.rs`)
- Read `ENVIRONMENT` env var (default: `testnet`)
- Pass it to all DB queries
- When `ENVIRONMENT=testnet`:
  - Use mock proving: skip Boundless SDK, return a mock seal+journal that the MockRiscZeroVerifier will accept
  - The mock seal can be any bytes (e.g., `0x00`), and the mock journal should be properly ABI-encoded `(solverAddress, solutionHash)` so the ZKPEnforcer can decode it
  - Still call `useTicket()` on-chain (on Base Sepolia)
- When `ENVIRONMENT=mainnet`:
  - Use real Boundless proving
  - Real on-chain calls to Base mainnet
- Log the environment on startup: `info!("Bear Trap API running in {} mode", environment)`

### Admin CLI environment (`backend/admin/src/main.rs`)
- Add `--env <testnet|mainnet>` global flag (default: `testnet`)
- All commands scope to the specified environment
- Display environment in output: `Created puzzle #0 (testnet) ...`

## 3. Frontend Chain Switching

### Add chain config (`frontend/src/lib/contracts.ts`)
```typescript
export const BASE_SEPOLIA_CHAIN_ID = 84532;

// Chain-specific addresses
export const CONTRACTS = {
  mainnet: {
    bearTrap: process.env.NEXT_PUBLIC_BEAR_TRAP_ADDRESS as `0x${string}`,
    delegationManager: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as `0x${string}`,
    osoToken: "0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e" as `0x${string}`,
    chainId: 8453,
  },
  testnet: {
    bearTrap: process.env.NEXT_PUBLIC_BEAR_TRAP_ADDRESS as `0x${string}`,
    delegationManager: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as `0x${string}`,
    osoToken: process.env.NEXT_PUBLIC_OSO_TOKEN_ADDRESS as `0x${string}`,
    chainId: 84532,
  },
};

export const ACTIVE_ENV = (process.env.NEXT_PUBLIC_ENVIRONMENT || "testnet") as "testnet" | "mainnet";
export const ACTIVE_CONTRACTS = CONTRACTS[ACTIVE_ENV];
```

### Update wagmi.ts
- Import `baseSepolia` from `wagmi/chains`
- Use `ACTIVE_ENV` to determine which chain to configure
- If testnet: use `baseSepolia` chain
- If mainnet: use `base` chain

### Update all components
Components that reference `BASE_CHAIN_ID`, `BEAR_TRAP_ADDRESS`, `OSO_TOKEN_ADDRESS` should use `ACTIVE_CONTRACTS` instead.

### Update .env.local.example
```
# Environment
NEXT_PUBLIC_ENVIRONMENT=testnet  # testnet or mainnet

# Contract addresses (set after deployment)
NEXT_PUBLIC_BEAR_TRAP_ADDRESS=0x...
NEXT_PUBLIC_OSO_TOKEN_ADDRESS=0x...  # MockOSO on testnet, real $OSO on mainnet

# Backend
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_DELEGATION_MANAGER_ADDRESS=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
```

## 4. Backend Mock Proving

In `backend/prover/src/lib.rs`, add a mock mode:

```rust
pub async fn generate_mock_proof(
    solver_address: &str,
    solution_hash: &str,
) -> Result<ProofResult> {
    // Return a mock seal (any bytes) and properly ABI-encoded journal
    // The MockRiscZeroVerifier on testnet will accept any seal
    let journal = encode_journal(solver_address, solution_hash);
    Ok(ProofResult {
        seal: vec![0u8; 32],  // mock seal
        journal,
        solver_address: solver_address.to_string(),
        solution_hash: solution_hash.to_string(),
    })
}

fn encode_journal(solver_address: &str, solution_hash: &str) -> Vec<u8> {
    // ABI encode (address, bytes32) matching guest output format
    // Use alloy for encoding
}
```

In `backend/api/src/main.rs` prove endpoint:
```rust
let proof = if environment == "testnet" {
    prover::generate_mock_proof(&solver_address, &solution_hash).await?
} else {
    prover::generate_proof(&config, &passphrase, &solver_address, &solution_hash).await?
};
```

## 5. README Updates
- Add "Testing on Base Sepolia" section
- Document testnet deployment steps
- Document environment switching
- Add testnet faucet links (Base Sepolia ETH faucet)

## 6. Tests
- Add tests for MockRiscZeroVerifier
- Add tests for MockOSO (mint function)
- Existing BearTrap tests should still pass (they use their own mock verifier already)

## Build Verification
1. `forge build` — must compile including mocks
2. `forge test` — all tests pass
3. `cargo check` in backend/ — must compile with mock proving
4. `npm run build` in frontend/ — must pass with testnet config

## Branch
You are on `feat/option-b-refactor`. Commit to THIS branch.
