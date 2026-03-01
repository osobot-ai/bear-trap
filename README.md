# Bear Trap 🐻

An ERC-7710 delegation puzzle game on Base. Players burn $OSO tokens to buy guess tickets, then submit ZK proofs (via RISC0/Boundless) attempting to solve cryptographic puzzles. If the proof is valid, the ERC-7710 delegation is redeemed and the player receives the ETH prize. If the proof is invalid, the ticket is still consumed — creating an economic deterrent against brute-force attempts.

**The first real-money ERC-7710 puzzle game.**

## Architecture

```
Player                     Boundless              BearTrap Contract
  │                           │                        │
  │── 1. buyTickets(n) ──────────────────────────────>│
  │    ($OSO burned)          │                        │
  │                           │                        │
  │── 2. Generate proof ─────>│                        │
  │    (guess as private      │                        │
  │     input to RISC0)       │                        │
  │                           │                        │
  │                     3. Boundless proves             │
  │                        via zkVM                    │
  │                           │                        │
  │── 4. submitGuess(proof) ─────────────────────────>│
  │                           │                        │
  │                        5. tickets[player]--        │
  │                           │                        │
  │                        6. try {                    │
  │                             redeemDelegations()    │
  │                             → ZKPEnforcer checks   │
  │                               proof in args        │
  │                             → NativeTransfer       │
  │                               enforcer allows ETH  │
  │                           }                        │
  │                           catch { WrongGuess }     │
  │                           │                        │
  │<─────────────── 7. ETH prize (if correct) ────────│
```

### How It Works

1. **Buy Tickets**: Players burn $OSO tokens (sent to `0xdead`) to purchase guess tickets
2. **Generate Proof**: Player runs the CLI prover with their guess — RISC0 generates a ZK proof via the Boundless proving network that the guess hashes to the puzzle's solution hash, without revealing the guess
3. **Submit Guess**: Player pastes the proof (seal + journal) into the frontend, which constructs a delegation redemption transaction and submits it on-chain
4. **Verify & Reward**: The BearTrap contract decrements the ticket (before try/catch — so burns persist on wrong guesses), then attempts to redeem the ERC-7710 delegation. The ZKPEnforcer validates the proof on-chain. If valid, the puzzle is marked solved and the ETH prize transfers to the winner

### Key Design: Try/Catch Burn Pattern

```solidity
tickets[msg.sender]--;          // Burns BEFORE try block
try delegationManager.redeemDelegations(...) {
    puzzles[puzzleId].solved = true;
    puzzles[puzzleId].winner = msg.sender;
    emit PuzzleSolved(puzzleId, msg.sender);
} catch {
    emit WrongGuess(puzzleId, msg.sender);  // Ticket already consumed
}
```

This ensures economic cost for every attempt, whether correct or not.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.23, Foundry |
| ZK Circuit | Rust, RISC0 zkVM |
| Proof Market | Boundless Network (Base) |
| On-chain Verifier | Boundless verifier contract (IRiscZeroVerifier) |
| Delegation Framework | MetaMask Delegation Framework (ERC-7710) |
| Token | $OSO on Base (`0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e`) |
| Frontend | Next.js 14, viem, wagmi, ConnectKit |
| Deployment | Base mainnet (chainId: 8453) |

## Project Structure

```
bear-trap/
├── contracts/                # Solidity contracts (Foundry)
│   ├── src/
│   │   ├── BearTrap.sol           # Main puzzle game contract
│   │   ├── IBearTrap.sol          # Interface + events + errors
│   │   ├── ZKPEnforcer.sol        # Custom ERC-7710 caveat enforcer
│   │   └── ImageID.sol            # Auto-generated RISC0 image ID
│   ├── test/
│   │   ├── BearTrap.t.sol         # 23 tests (all passing)
│   │   └── Elf.sol                # Auto-generated ELF binary
│   └── scripts/
│       └── Deploy.s.sol           # Deployment script
├── guests/                   # RISC0 guest programs (Rust)
│   └── puzzle-solver/
│       └── src/main.rs            # ZK circuit: hash + assert + commit
├── apps/                     # Proof request CLI (Rust)
│   └── src/main.rs                # Boundless proof generation + output
├── frontend/                 # Next.js web app
│   ├── src/
│   │   ├── app/                   # Next.js app router
│   │   ├── components/
│   │   │   ├── BuyTickets.tsx     # $OSO approve + burn for tickets
│   │   │   ├── SubmitGuess.tsx    # Hash + proof paste + delegation submit
│   │   │   ├── PuzzleList.tsx     # Active puzzle display
│   │   │   ├── PuzzleCard.tsx     # Individual puzzle card
│   │   │   ├── Leaderboard.tsx    # PuzzleSolved/WrongGuess events
│   │   │   └── WalletButton.tsx   # ConnectKit wallet button
│   │   └── lib/
│   │       ├── abi/               # Contract ABIs
│   │       ├── contracts.ts       # Addresses + constants
│   │       └── wagmi.ts           # Wagmi config (Base)
│   └── package.json
├── lib/                      # Git submodules
│   ├── delegation-framework/      # MetaMask Delegation Framework
│   └── risc0-ethereum/            # RISC0 Ethereum contracts
├── SPEC.md                   # Full architecture specification
├── foundry.toml              # Foundry configuration
├── Cargo.toml                # Rust workspace root
└── README.md                 # This file
```

## How to Play

### Prerequisites

- Web3 wallet (MetaMask, etc.) connected to Base
- $OSO tokens on Base for ticket purchases
- Rust toolchain (for proof generation)

### Step 1: Buy Tickets

1. Connect your wallet on the Bear Trap frontend
2. Approve $OSO spend (1,000 $OSO per ticket)
3. Click "Buy Tickets" to burn $OSO and receive guess tickets

### Step 2: Generate ZK Proof

Run the CLI prover with your guess:

```bash
cargo run --bin bear-trap-app -- \
  --guess "your secret passphrase" \
  --solver-address 0xYourAddress \
  --puzzle-id 0 \
  --rpc-url https://mainnet.base.org \
  --private-key $PRIVATE_KEY \
  --bear-trap-address $BEAR_TRAP_ADDRESS \
  --output-only
```

This outputs JSON with `seal` and `journal` hex values.

### Step 3: Submit On-Chain

1. In the frontend, select the puzzle and enter your passphrase
2. Click "Hash Passphrase & Continue"
3. Paste the `seal` and `journal` hex from the CLI output
4. Click "Submit Proof On-Chain"
5. Confirm the transaction in your wallet

If your proof is valid, the puzzle is solved and the ETH prize is yours!

## Development

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for Solidity)
- [Rust](https://rustup.rs/) (nightly, for RISC0)
- [Node.js](https://nodejs.org/) 18+ (for frontend)

### Smart Contracts

```bash
# Run tests (23 tests)
forge test

# Deploy
source .env
forge script contracts/scripts/Deploy.s.sol --rpc-url $RPC_URL --broadcast -vv
```

Required `.env` for deployment:

```env
VERIFIER_ADDRESS=       # IRiscZeroVerifier (RiscZeroVerifierRouter on Base)
OSO_TOKEN=0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e
DELEGATION_MANAGER=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
TICKET_PRICE=1000000000000000000000   # 1000 * 1e18 (1000 $OSO)
RPC_URL=https://mainnet.base.org
PRIVATE_KEY=            # Deployer private key
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # Development server at localhost:3000
npm run build   # Production build
```

Required `.env.local`:

```env
NEXT_PUBLIC_BEAR_TRAP_ADDRESS=0x...    # Deployed BearTrap contract
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=  # WalletConnect project ID
```

### Creating a Puzzle (Admin)

After deployment, the contract owner can create puzzles:

```bash
cast send $BEAR_TRAP_ADDRESS \
  "createPuzzle(bytes32,uint256,string)" \
  $(cast keccak "the secret answer") \
  1000000000000000000 \
  "ipfs://QmClueData" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

Then fund the contract with the prize ETH:

```bash
cast send $BEAR_TRAP_ADDRESS --value 1ether --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

Finally, create an ERC-7710 delegation from the Treasury Safe to the BearTrap contract with:
- **ZKPEnforcer** caveat (terms: solutionHash + imageId)
- **NativeTokenTransferAmountEnforcer** (maxAmount = prize ETH)
- **LimitedCallsEnforcer** (limit: 1)

## Contracts

| Contract | Description |
|----------|-------------|
| `BearTrap.sol` | Main game — ticket sales, guess submission with try/catch, puzzle lifecycle |
| `ZKPEnforcer.sol` | Custom ERC-7710 caveat enforcer — validates RISC0 proofs during delegation redemption |
| `IBearTrap.sol` | Interface defining Puzzle struct, events, errors |
| `ImageID.sol` | Auto-generated RISC0 guest program image ID |

### Contract Addresses

_Placeholder — update after deployment:_

| Contract | Address |
|----------|---------|
| BearTrap | `TBD` |
| ZKPEnforcer | `TBD` |
| $OSO Token | `0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e` |
| Treasury Safe | `0x78201183f67A82f687e4033Be5Af66e62a1c41e6` |
| DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |

## Security

1. **Front-running protection**: ZKP ensures the answer is never visible in the mempool
2. **Proof bound to solver**: Journal commits solver address, preventing proof theft
3. **Anti-brute-force**: Multi-clue passphrase design — puzzles require knowledge from multiple sources (newsletter issues, on-chain data, social posts) making the answer effectively impossible to guess
4. **Economic deterrent**: $OSO burns on every on-chain attempt (ticket consumed before try/catch)
5. **Single winner**: LimitedCallsEnforcer ensures only the first correct solver claims the prize
6. **On-chain verification**: Proofs are verified by the Boundless verifier contract (IRiscZeroVerifier)

## References

- [SPEC.md](./SPEC.md) — Full architecture specification
- [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710) — Delegation standard
- [MetaMask Delegation Framework](https://github.com/MetaMask/delegation-framework)
- [RISC0 zkVM](https://dev.risczero.com/api/zkvm/guest-code-101)
- [Boundless Network](https://docs.boundless.network/developers/quick-start)
- [Boundless SDK](https://docs.boundless.network/developers/tooling/sdk)
- [Boundless Foundry Template](https://github.com/boundless-xyz/boundless-foundry-template)

## License

MIT
