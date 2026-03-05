# Bear Trap 🐻 — Architecture Specification

## Overview

Bear Trap is an ERC-7710 delegation puzzle game on Base. Players burn $OSO tokens to buy guess tickets, then submit ZK proofs (via RISC0/Boundless) attempting to solve a puzzle. If the proof is valid, the ERC-7710 delegation is redeemed and the player receives the ETH prize. If the proof is invalid, the ticket is still consumed (burned) thanks to a try/catch pattern.

**This is the first real-money ERC-7710 puzzle game.**

## Core Concepts

- **ERC-7710 Delegation Framework**: The ETH prize is locked behind a delegation from a treasury Safe with caveat enforcers
- **RISC0 zkVM / Boundless**: Players generate ZK proofs that they know the puzzle solution without revealing it
- **$OSO Token Burns**: Each guess attempt costs $OSO tokens which are burned permanently, creating deflationary pressure
- **Try/Catch Pattern**: Ticket deduction happens BEFORE the delegation redemption attempt, so burns persist even on wrong guesses

## Token Details

- **$OSO Token (Base)**: `0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e`
- **Treasury**: `0x78201183f67A82f687e4033Be5Af66e62a1c41e6`
- **Chain**: Base (chainId: 8453)

## Architecture

### Flow

```
Player                     Boundless              PuzzleContract
  |                           |                        |
  |-- 1. buyTickets(n) -------------------------------->|
  |    ($OSO burned)          |                        |
  |                           |                        |
  |-- 2. Generate proof ----->|                        |
  |    (guess as private      |                        |
  |     input to RISC0)       |                        |
  |                           |                        |
  |                     3. Boundless proves             |
  |                        via zkVM                    |
  |                           |                        |
  |-- 4. submitGuess(proof) --------------------------->|
  |                           |                        |
  |                        5. tickets[player]--        |
  |                           |                        |
  |                        6. try {                    |
  |                             redeemDelegations()    |
  |                             -> ZKPEnforcer checks  |
  |                               proof in args        |
  |                             -> NativeTransfer      |
  |                               enforcer allows ETH  |
  |                           }                        |
  |                           catch { revert }     |
  |                           |                        |
  |<--------------- 7. ETH prize (if correct) ---------|
```

### Components

#### 1. BearTrap Contract (Solidity)

The main game contract that manages:
- Ticket sales (burn $OSO -> increment ticket count)
- Guess submissions (decrement ticket -> try/catch redeemDelegations)
- Puzzle lifecycle (create puzzles, set prizes, mark solved)

Key design: tickets are deducted BEFORE the try block, so they persist even when the ZKP enforcer reverts on wrong answers.

#### 2. ZKPEnforcer (Custom Caveat Enforcer)

A new ERC-7710 caveat enforcer that validates RISC0 ZK proofs during the delegation redemption lifecycle.

- terms (set by delegator): solutionHash + imageId
- args (set by redeemer at redemption): proof + solverAddress
- beforeHook verifies the proof via Boundless on-chain verifier
- Reverts if proof is invalid (caught by BearTrap try/catch)

#### 3. RISC0 Guest Program (Rust)

The ZK circuit that runs inside RISC0 zkVM:
- Private input: player's guess
- Public input: solution hash, solver address
- Logic: hash(guess) == solutionHash, assert, commit solver + hash to journal
- Proof generation fails if guess is wrong (assert fails)

#### 4. Frontend (Next.js)

Web app where players can:
- View active puzzles and clues
- Buy tickets (connect wallet, approve $OSO, burn)
- Submit guesses (generate proof via Boundless, submit to contract)
- See leaderboard of attempts and winners

### ERC-7710 Delegation Structure

Treasury creates a delegation for each puzzle:

Delegator: Treasury Safe (0x78201183f67A82f687e4033Be5Af66e62a1c41e6)
Delegate: BearTrap contract address
Caveats:
  - NativeTokenTransferAmountEnforcer (maxAmount = prize ETH)
  - ZKPEnforcer (terms: solutionHash, imageId)
  - LimitedCallsEnforcer (limit: 1, first solver wins)

### Puzzle Design Philosophy

Puzzles require knowledge from multiple sources to prevent brute forcing:
- Clues hidden across 3+ Caveat newsletter issues
- Combined with onchain data, X posts, or other public sources
- The combined answer forms a passphrase that is effectively impossible to brute force
- Think: "guessing a private key" level of difficulty

### Security Considerations

1. Front-running protection: ZKP ensures the answer is not visible in the mempool
2. Proof bound to solver: Journal commits solver address, preventing proof theft
3. Anti-brute-force: Multi-clue passphrase design, not computationally guessable
4. Economic deterrent: $OSO burns on every on-chain attempt
5. Single winner: LimitedCallsEnforcer ensures only first correct solver claims prize

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity, Foundry |
| ZK Circuit | Rust, RISC0 zkVM |
| Proof Market | Boundless Network (Base) |
| On-chain Verifier | Boundless verifier contract |
| Delegation Framework | MetaMask Delegation Framework (ERC-7710) |
| Token | $OSO on Base |
| Frontend | Next.js, viem, wagmi |
| Deployment | Base mainnet |

## Reference Documentation

- RISC0 Guest Code: https://dev.risczero.com/api/zkvm/guest-code-101
- RISC0 Quick Start: https://dev.risczero.com/api/zkvm/quickstart
- RISC0 Remote Proving: https://dev.risczero.com/api/generating-proofs/remote-proving
- RISC0 JSON Example: https://github.com/risc0/risc0/tree/release-3.0/examples/json
- Awesome RISC0: https://github.com/inversebrah/awesome-risc0
- Boundless SDK: https://docs.boundless.network/developers/tooling/sdk
- Boundless Quick Start: https://docs.boundless.network/developers/quick-start
- Boundless Foundry Template: https://github.com/boundless-xyz/boundless-foundry-template
- MetaMask Delegation Framework: https://github.com/MetaMask/delegation-framework
- Smart Accounts Kit Skill: ~/.openclaw/workspace/skills/smart-accounts-kit/SKILL.md
- ERC-7710: https://eips.ethereum.org/EIPS/eip-7710

## Directory Structure

```
bear-trap/
├── contracts/           # Solidity contracts (Foundry)
│   ├── src/
│   │   ├── BearTrap.sol         # Main puzzle contract
│   │   └── ZKPEnforcer.sol      # Custom caveat enforcer
│   ├── test/
│   │   └── BearTrap.t.sol       # Tests
│   └── foundry.toml
├── guests/              # RISC0 guest programs (Rust)
│   └── puzzle-solver/
│       ├── Cargo.toml
│       └── src/
│           └── main.rs
├── apps/                # Proof request application (Rust)
│   ├── Cargo.toml
│   └── src/
│       └── main.rs
├── frontend/            # Next.js web app
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   ├── package.json
│   └── next.config.js
├── Cargo.toml           # Workspace Cargo.toml
├── SPEC.md              # This file
└── README.md
```
