# Bear Trap UI/UX Overhaul — Gameplan

## The Lore

**The Trapper** — a mysterious, shadowy figure who has *trapped* ETH inside cryptographic cages. No one knows who The Trapper is or why they do it. The only way to free the ETH is to solve the puzzle and prove your answer with zero-knowledge cryptography.

The name "Bear Trap" carries multiple layers:
- **Hunting**: A bear trap is a device that captures — here, ETH is captured inside an intent-based permission
- **Crypto**: We're in a bear market — The Trapper thrives in chaos
- **The Bear**: Osobot (🐻) — is he The Trapper? Or just another player?
- **Intent Permissions**: The ETH is "trapped" behind an ERC-7710 delegation. The intent has two sides: the **proof** (ZK verification of your guess) and the **prize** (ETH transfer). Both must be valid for the intent to resolve and the prize to be freed.

**Tagline**: *"The ETH is trapped. Can you free it?"*

**Tone**: Dark, mysterious, slightly menacing. The Trapper speaks in short, cryptic messages. The UI feels like you're interacting with something dangerous — like defusing a bomb or cracking a vault.

---

## Architecture Overview

### Current State
- Multi-puzzle grid layout (PuzzleList → PuzzleCard[])
- Separate approve + buy ticket flow (2 transactions)
- Clue is an external link
- Basic loading spinners for proof generation
- No countdown, no sound, no dramatic animations
- Static success/failure states

### Target State
- Single-puzzle hero layout (only 1 puzzle live at a time)
- `wallet_sendCalls` batched approve+buy (with `useCapabilities` fallback)
- Inline clue image rendering
- Dramatic countdown timer pre-launch
- Bear trap themed animations for wrong/right guesses
- Intent visualization (two-sided lock mechanism)
- Sound effects + optional ElevenLabs voiceover
- "Last winner" display when no puzzle is live

---

## Phase 1: Foundation & Theme (Backend + Design System)

### 1a. Backend: Add `starts_at` to puzzles

**Files**: `backend/shared/src/lib.rs`, `backend/admin/src/main.rs`, `backend/api/src/main.rs`

- Add `starts_at TEXT` column to `puzzles` table (nullable, ISO 8601 datetime)
- Schema migration v3: `ALTER TABLE puzzles ADD COLUMN starts_at TEXT`
- Update `CreatePuzzle` CLI command:
  ```
  bear-trap-admin create-puzzle --answer "secret" --clue-uri "https://..." --starts-at "2026-03-15T18:00:00Z"
  ```
- Update `Puzzle` struct to include `starts_at: Option<String>`
- Update `GET /api/puzzles` and `GET /api/puzzles/:id` to return `startsAt`
- Add `GET /api/puzzle/active` endpoint — returns the single active puzzle (not solved, started or about to start) with full clue info
- If puzzle hasn't started yet → return puzzle with `status: "countdown"` and `startsAt` timestamp
- If no puzzle is active → return last solved puzzle with `status: "completed"`

### 1b. Color Palette & Design System

Extend the existing dark theme with bear trap colors:

```typescript
// tailwind.config.ts additions
trap: {
  // Existing...
  brown: "#8B4513",        // Saddle brown — bear/trap/earth
  "brown-dim": "#654321",  // Dark brown
  "brown-light": "#A0522D", // Sienna
  rust: "#B7410E",         // Rusty red — danger, urgency
  "rust-dim": "#8B2500",   // Deep rust
  ember: "#FF4500",        // Orange-red — fire/wrong guess
  gold: "#FFD700",         // Prize glow
  "gold-dim": "#DAA520",   // Goldenrod
  steel: "#708090",        // Trap mechanism
}
```

New CSS utilities:
- `.glow-gold` — pulsing gold shadow for prize display
- `.glow-ember` — fire glow for wrong guess
- `.glow-rust` — danger glow for trap mechanism
- `.trap-gradient` — dark-to-brown gradient for backgrounds
- `.intent-glow` — split green/red glow for intent visualization

### 1c. Typography & Font Updates

Keep existing fonts but add:
- **Creepster** or **Nosifer** (Google Fonts) for The Trapper's messages — spooky, dramatic headers
- Use sparingly: countdown timer, "THE ETH IS TRAPPED", The Trapper's quotes

---

## Phase 2: Single-Puzzle Hero Layout

### 2a. New Page Structure

Replace the current grid layout with a single-puzzle-centric design:

```
┌─────────────────────────────────────────────┐
│  Header (logo + wallet + network badge)     │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  THE TRAPPER'S CHALLENGE            │    │
│  │  ─────────────────────────          │    │
│  │  [Countdown Timer / Puzzle Status]  │    │
│  │                                     │    │
│  │  ┌─────────┐  ┌──────────────────┐  │    │
│  │  │  CLUE   │  │  INTENT STATUS   │  │    │
│  │  │ (image) │  │  ┌────┐ ┌────┐   │  │    │
│  │  │         │  │  │PROOF│ │PRIZE│  │  │    │
│  │  │         │  │  │ 🔒  │ │ 🔒  │  │  │    │
│  │  └─────────┘  │  └────┘ └────┘   │  │    │
│  │               └──────────────────┘  │    │
│  │                                     │    │
│  │  Prize: X.XX ETH (gold glow)       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──────────────────┐ ┌──────────────────┐  │
│  │   BUY TICKETS    │ │   SUBMIT GUESS   │  │
│  │   (batched tx)   │ │   (passphrase)   │  │
│  └──────────────────┘ └──────────────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  HALL OF SOLVERS (past winners)     │    │
│  └─────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│  Footer                                     │
└─────────────────────────────────────────────┘
```

### 2b. Page States

**State 1: Countdown** (puzzle exists but `startsAt` is in the future)
- Full-screen dramatic countdown timer (days:hours:minutes:seconds)
- The Trapper's cryptic teaser message: *"Something is coming. The trap is being set..."*
- Prize amount revealed with golden glow
- Pulsing bear trap icon animation
- Optional: ElevenLabs narration plays on first visit

**State 2: Live Puzzle** (puzzle started, not solved)
- Clue image rendered inline (fetched from URI, displayed in a styled frame)
- Intent visualization: two locks side by side
  - Left lock: "PROOF" (currently locked/red)
  - Right lock: "PRIZE" (currently locked/red)
- Prize pool with dramatic gold pulsing
- Buy Tickets + Submit Guess sections below
- Ticket count displayed prominently

**State 3: No Active Puzzle** (last puzzle solved, no new one)
- "THE TRAP HAS BEEN SPRUNG" header
- Last winner display with confetti remnants
- Winner address, prize amount, solve timestamp
- *"The Trapper will return..."* message
- Hall of Solvers (all past winners)

### 2c. New Components

| Component | Description |
|-----------|-------------|
| `ActivePuzzle` | Main hero component, fetches `/api/puzzle/active` |
| `CountdownTimer` | Dramatic countdown with flip-clock style digits |
| `ClueDisplay` | Renders clue image inline with styled frame |
| `IntentVisualizer` | Two-sided lock visualization for ERC-7710 intent |
| `PrizeDisplay` | Animated prize amount with gold particle effects |
| `TrapperMessage` | Styled message component for The Trapper's cryptic text |
| `HallOfSolvers` | Past winners display (replaces Leaderboard) |
| `SoundController` | Global audio context manager |

**Removed Components**:
- `PuzzleList` → replaced by `ActivePuzzle`
- `PuzzleCard` → no longer needed (single puzzle)
- `Leaderboard` → replaced by `HallOfSolvers`

---

## Phase 3: Batched Transactions (wallet_sendCalls)

### 3a. Capability Detection

Use wagmi's `useCapabilities` hook to detect if the connected wallet supports EIP-5792 atomic batching:

```typescript
import { useCapabilities } from 'wagmi';

function useBatchSupport() {
  const { data: capabilities } = useCapabilities();
  const chainIdHex = `0x${BASE_CHAIN_ID.toString(16)}`;

  const atomicStatus = capabilities?.[chainIdHex]?.atomic?.status;

  return {
    supportsBatch: atomicStatus === 'supported' || atomicStatus === 'ready',
    needsUpgrade: atomicStatus === 'ready', // will prompt 7702 upgrade
    capabilities,
  };
}
```

### 3b. Batched Approve + Buy Flow

When batch is supported, combine approve + buyTickets into a single `wallet_sendCalls`:

```typescript
import { useSendCalls } from 'wagmi';
import { encodeFunctionData } from 'viem';

// Encode approve calldata
const approveData = encodeFunctionData({
  abi: erc20Abi,
  functionName: 'approve',
  args: [BEAR_TRAP_ADDRESS, totalCost],
});

// Encode buyTickets calldata
const buyData = encodeFunctionData({
  abi: bearTrapAbi,
  functionName: 'buyTickets',
  args: [BigInt(ticketAmount)],
});

sendCalls.mutate({
  calls: [
    { to: OSO_TOKEN_ADDRESS, data: approveData },
    { to: BEAR_TRAP_ADDRESS, data: buyData },
  ],
});
```

### 3c. Fallback for Non-Supporting Wallets

When `useCapabilities` indicates no batch support, fall back to the current 2-step flow (approve → buy) using `useWriteContract`. The UI should:
- Show the 2-step indicator (current behavior)
- **Not** show the batch option
- Work identically to today

### 3d. UX for Batch Flow

When batch IS supported:
- Single "Buy X Tickets" button (no approve step shown)
- One wallet popup for the user
- Loading state: "Confirming batch transaction..."
- Success: "Tickets purchased!" (single confirmation)

Track batch status with `useCallsStatus` (wagmi) if needed, or use `useSendCallsSync` for simpler synchronous flow.

---

## Phase 4: Dramatic Animations

### 4a. Wrong Guess — "THE TRAP HOLDS"

When the user's guess is wrong, show a dramatic sequence using framer-motion:

1. **Screen shake** (200ms, subtle CSS transform)
2. **Intent visualization update**:
   - Left lock (PROOF): Turns RED, "X" mark, fire particles emit from it
   - Right lock (PRIZE): Stays locked, text: "PRIZE REMAINS TRAPPED"
   - Connecting chain between locks GLOWS RED then fades
3. **Bear trap animation**: A bear trap jaw SNAPS shut (SVG animation)
4. **The Trapper speaks**: *"Wrong. The trap holds. Your ticket is consumed."*
5. **Fire/ember particle effect** across the wrong guess area (canvas or CSS particles)
6. **Fade to reset** after 3-4 seconds

Implementation:
- Use framer-motion `AnimatePresence` for enter/exit transitions
- CSS `@keyframes` for screen shake
- SVG bear trap jaw animation (simple path morph: open → closed)
- Canvas-based particle system for fire (lightweight, ~50 particles)

### 4b. Correct Guess — "THE TRAP IS BROKEN"

When proof generation succeeds (proof-ready state):

1. **Intent visualization update** (before claiming):
   - Left lock (PROOF): Turns GREEN, checkmark, golden sparkles
   - Right lock (PRIZE): Still locked but PULSING — "PROOF VERIFIED. CLAIM TO UNLOCK."
   - Chain between locks is HALF-BROKEN (one side green, one side pulsing)
2. **The Trapper**: *"Impressive. The proof is valid. Now claim what's yours..."*

When the claim transaction confirms (success state):

3. **Both locks UNLOCK simultaneously** — dramatic animation
4. **Chain SHATTERS** with particle explosion
5. **"THE TRAP IS BROKEN"** in large dramatic text
6. **Confetti explosion** (gold + green particles)
7. **ETH amount flies from the trap to the winner's address** (animated counter)
8. **The Trapper**: *"You've freed the ETH. But The Trapper will return..."*
9. **Bear trap OPENS** (SVG animation: closed → open)

Implementation:
- framer-motion spring animations for lock transitions
- Canvas confetti library (e.g., `canvas-confetti` — lightweight, 6kb)
- Animated number counter for ETH amount
- SVG bear trap open/close animation

### 4c. Countdown Timer Animation

Dramatic flip-clock style countdown:
- Each digit in its own card that flips on change
- Pulsing red glow as time approaches zero
- At T-10 seconds: screen darkens, The Trapper's voice: *"The trap is set. Begin."*
- At T-0: Flash of light, puzzle REVEALS with a dramatic unveil animation
- Clock digits: large, mono font, styled with metallic/steel texture

### 4d. Proving State Animation

While waiting for ZK proof generation (can take minutes):
- Animated progress indicators (not a simple spinner):
  - "Burning ticket..." → fire consuming ticket icon
  - "Submitting to prover..." → signal broadcasting animation
  - "Prover locked..." → gear/mechanism turning animation
  - "Generating proof..." → matrix-style cascading numbers
- Intent visualizer shows PROOF lock with "processing" state (rotating gears inside)
- Estimated time remaining if possible (based on typical proving times)

---

## Phase 5: Sound Design

### 5a. Web Audio API Synth Sounds (No External Files)

Create a `SoundEngine` class using the Web Audio API:

| Sound | Trigger | Description |
|-------|---------|-------------|
| `countdown_tick` | Each second in final 10s | Deep metallic tick, increasing urgency |
| `countdown_zero` | Timer hits 0 | Low boom + reverb, dramatic reveal |
| `ticket_burn` | Ticket consumed | Quick fire crackle |
| `wrong_guess` | Wrong answer | Metal clang + buzz, bear trap snap |
| `proof_ready` | Proof verified | Ascending chime, hopeful |
| `prize_claimed` | TX confirmed | Triumphant fanfare, chain breaking |
| `trap_ambient` | Background (optional) | Low, ominous drone |

Implementation: All sounds generated procedurally with Web Audio API oscillators, filters, and envelopes. No audio files needed. ~200 lines of code.

### 5b. ElevenLabs — Sound Effects, Voiceover & Music (MANDATORY)

ElevenLabs is **required** for all audio in Bear Trap. No placeholder synth sounds — everything ships with ElevenLabs-generated audio.

**Voiceover Lines (The Trapper — deep, gravelly voice):**
- *"The trap is set. Begin."* (countdown end)
- *"Wrong. The trap holds."* (wrong guess)
- *"The proof is valid. Claim what's yours."* (proof ready)
- *"The trap is broken. But I'll return."* (prize claimed)
- *"Something is coming. The trap is being set..."* (countdown teaser)
- *"The connection is unstable. The trap waits..."* (error state)

**Sound Effects (ElevenLabs Sound Generation):**
- Metallic countdown tick (final 10 seconds)
- Deep boom + reverb (puzzle reveal at T-0)
- Fire crackle (ticket burn)
- Metal clang + bear trap snap (wrong guess)
- Ascending chime (proof verified)
- Chain breaking + triumphant fanfare (prize claimed)
- Low ominous ambient drone (background, optional toggle)

**Music:**
- Short ambient loop for the puzzle page (dark, tense, minimal)
- Victory stinger (5-10 seconds, plays on successful claim)

All audio served as `.mp3` from `/public/audio/`. Play on user interaction (respecting autoplay policies).

**Need**: ElevenLabs API key from Ryan.

### 5c. Sound Toggle

- Mute/unmute button in header (🔊/🔇)
- Default: muted (respect user preference)
- Store preference in localStorage
- First interaction prompt: "Enable sound for the full Bear Trap experience?"

---

## Phase 6: Clue Display

### 6a. Inline Image Rendering

Replace the external "View Clue" link with an inline image component:

```tsx
function ClueDisplay({ clueUri }: { clueUri: string }) {
  // Render image directly — clueUri is always an image URL
  return (
    <div className="clue-frame">
      <div className="clue-header">THE TRAPPER'S CLUE</div>
      <img
        src={clueUri}
        alt="Puzzle clue"
        className="clue-image"
        loading="eager"
      />
    </div>
  );
}
```

Styling:
- Dark ornate frame (CSS border with metallic gradient)
- Subtle vignette overlay on the image
- Hover to zoom (framer-motion scale)
- Mobile: full-width with aspect ratio preservation

---

## Phase 7: Intent Visualization

This is the **centerpiece** of the UX — it communicates what ERC-7710 does in a visual way.

### 7a. The Intent Lock Component

Two locks connected by a chain, representing the two sides of the intent:

```
   ┌──────────┐         ┌──────────┐
   │  🔒 PROOF │═══╗═══│  🔒 PRIZE │
   │           │   ║    │           │
   │  ZK Proof │   ║    │  ETH Transfer │
   │  of Guess │   ║    │  to Winner    │
   └──────────┘   ║    └──────────┘
                   ║
            [INTENT CHAIN]
```

**States**:

| State | Proof Lock | Chain | Prize Lock |
|-------|-----------|-------|------------|
| Idle | 🔒 Grey | Grey | 🔒 Grey |
| Proving | ⚙️ Spinning (amber) | Pulsing amber | 🔒 Grey |
| Wrong | ❌ Red (fire) | Red → broken (one side) | 🔒 Stays locked |
| Proof Ready | ✅ Green (glowing) | Half-lit green→grey | 🔒 Pulsing gold |
| Claiming | ✅ Green | Full green pulse | ⚙️ Spinning (gold) |
| Claimed | ✅ Green | Shattered (particles) | ✅ Gold (open) |

### 7b. Implementation

- SVG-based locks with framer-motion path animations
- Chain as an animated SVG line/path between the locks
- Particle effects at state transitions (canvas overlay)
- Each state transition has a ~1s animation with easing

---

## Phase 8: Polish & Mobile

### 8a. Responsive Design
- Mobile: stack everything vertically, clue image takes full width
- Countdown timer digits resize
- Intent visualizer stacks vertically on small screens
- Touch-friendly buttons (min 48px tap targets)

### 8b. Loading States
- Skeleton screens for initial data fetch
- Shimmer effects on loading elements

### 8c. Error States
- The Trapper-themed error messages
- Network errors: *"The connection is unstable. The trap waits..."*
- Transaction errors: *"The chain rejected your attempt."*

---

## Implementation Order

| # | Task | Estimated Effort | Priority |
|---|------|-----------------|----------|
| 1 | Backend: `starts_at` + active puzzle endpoint | 2-3 hours | P0 |
| 2 | Color palette + design system update | 1 hour | P0 |
| 3 | Single-puzzle hero layout (State 2: Live) | 3-4 hours | P0 |
| 4 | Inline clue image rendering | 1 hour | P0 |
| 5 | Intent Visualizer component | 3-4 hours | P0 |
| 6 | `wallet_sendCalls` batched approve+buy | 2-3 hours | P0 |
| 7 | Countdown timer (State 1) | 2-3 hours | P1 |
| 8 | No-puzzle state (State 3) | 1-2 hours | P1 |
| 9 | Wrong guess animation | 2-3 hours | P1 |
| 10 | Correct guess + claim animation | 3-4 hours | P1 |
| 11 | ElevenLabs audio generation (SFX + voiceover + music) | 3-4 hours | P1 |
| 12 | Audio integration + sound controller | 2-3 hours | P1 |
| 13 | Proving state animation | 1-2 hours | P2 |
| 14 | Mobile responsiveness pass | 2 hours | P1 |
| 15 | Hall of Solvers | 1-2 hours | P2 |

**Total estimated: ~28-38 hours of implementation**

---

## New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `canvas-confetti` | Confetti explosion on prize claim | ~6kb gzipped |
| (none needed) | framer-motion — already installed | — |
| (none needed) | wagmi `useSendCalls` + `useCapabilities` — already included | — |

Minimal new dependencies — most work is custom components + animations.

---

## API Changes Summary

### New Endpoints
- `GET /api/puzzle/active` — returns active puzzle with status field

### Modified Endpoints
- `GET /api/puzzles` — now includes `startsAt` field
- `GET /api/puzzles/:id` — now includes `startsAt` field

### New CLI Flags
- `create-puzzle --starts-at <ISO8601>` — when the puzzle goes live

### DB Migration (v3)
- `ALTER TABLE puzzles ADD COLUMN starts_at TEXT`

---

## Resolved Decisions

1. **Clue image format** — 4:3 aspect ratio image with clue text on it. Resizable. Render inline.
2. **Sound default** — ON by default. First visit plays audio immediately (with browser autoplay handling).
3. **ElevenLabs voice** — Deep, gravelly voice for The Trapper. ElevenLabs is MANDATORY for all audio (voiceover, SFX, music). No synth placeholders.
4. **Bear trap SVG** — Custom-created SVG that fits the dark/mysterious theme. No stock icons.

## Open Questions

1. **Past winners data** — Do we have historical data to populate Hall of Solvers, or start fresh?
