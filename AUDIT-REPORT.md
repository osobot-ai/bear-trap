# Bear Trap UI/UX Overhaul — PR Audit Report

**Branch**: `feat/ui-ux-overhaul`
**Base**: `main`
**Date**: 2026-03-09
**Auditor**: Sisyphus (automated)
**Verdict**: **CONDITIONAL PASS** — 2 critical issues must be fixed before merge

---

## 1. Summary

| Category | Status |
|----------|--------|
| Build (`npm run build`) | PASS (zero TS errors; MetaMask SDK warnings are pre-existing) |
| LSP Diagnostics | PASS (zero errors across all 14 changed/new frontend files) |
| TypeScript Types | PASS (no `any` types, proper interfaces throughout) |
| Frontend Tests | N/A (none exist — see Test Coverage Gaps below) |
| Backend Tests | PASS (all tests updated for new `starts_at` parameter signature) |
| Security | PASS (no XSS vectors, no exposed secrets, no CORS issues introduced) |

**Files changed**: 46 (3,739 insertions, 372 deletions)
**New frontend components**: 9 (ActivePuzzle, BearTrapSVG, ClueDisplay, CountdownTimer, HallOfSolvers, IntentVisualizer, PrizeDisplay, Skeleton, TrapperError, TrapperMessage, SoundController)
**New libraries**: `canvas-confetti` (6kb), `chrono` (backend)

---

## 2. Critical Issues (MUST FIX before merge)

### C1. Frontend/Backend API Response Shape Mismatch

**Severity**: CRITICAL — ActivePuzzle component will never render puzzle data
**Files**: `frontend/src/components/ActivePuzzle.tsx` (lines 17-28) vs `backend/api/src/main.rs` (lines 96-109)

The frontend `ActivePuzzleResponse` interface expects a **nested** structure:
```typescript
// Frontend expects:
{ status: "live", puzzle: { id, clueURI, prizeEth, ... }, message: "..." }
```

But the backend `ActivePuzzleResponse` sends a **flat** structure:
```json
// Backend sends:
{ "id": 0, "clueURI": "...", "prizeEth": "0.1", "status": "live", "startsAt": null, ... }
```

**Impact**: `data.puzzle` will always be `undefined`, so all three page states (countdown, live, completed) will fall through to the `{!puzzle && ...}` catch-all showing "No Active Puzzle". The entire single-puzzle hero layout is non-functional.

Additionally, the backend doesn't send a `message` field, so `TrapperMessage` will always receive `undefined`.

**Fix options**:
- (A) Update the frontend interface to match the backend's flat shape
- (B) Update the backend to send the nested shape with `message`

Recommended: Option (A) — update frontend to match backend, and add a local message derivation based on status.

### C2. Missing Tailwind Animations — `animate-glow-gold`, `animate-glow-red`, `animate-border-glow`

**Severity**: CRITICAL — visual features silently broken, no glow effects render
**Files**: Used in `ActivePuzzle.tsx`, `PrizeDisplay.tsx`, `CountdownTimer.tsx`, `ClueDisplay.tsx`

These classes reference Tailwind animation utilities that don't exist in `tailwind.config.ts`:
- `animate-glow-gold` — used on prize amount and countdown digits (PrizeDisplay, CountdownTimer)
- `animate-glow-red` — used on "THE TRAP HAS BEEN" text (ActivePuzzle)
- `animate-border-glow` — used on clue image frame (ClueDisplay)

The CSS file defines `.glow-gold` and `.glow-red` as component classes (using `@layer components`), but these are different from `animate-glow-gold` and `animate-glow-red` (Tailwind utility format). The Tailwind config only defines `ember-glow`, `shimmer`, `shake`, `chain-break`, `pulse-slow`, `fade-in`, `slide-up`, and `flicker` animations.

**Impact**: The gold pulsing glow on prizes, red glow on completed state text, and the border glow on clue images will not render. These are core visual elements of the bear trap theme.

**Fix**: Add the missing animations to `tailwind.config.ts`, or switch components to use the CSS class names (`.glow-gold` etc.) directly.

---

## 3. Moderate Issues (Should Fix)

### M1. `SubmitGuess` sound effect `useEffect` missing `playMusic` and `stopMusic` in dependency array

**File**: `SubmitGuess.tsx` line 136
**Current**: `[step, playSfx, playVoice]`
**Issue**: The effect calls `stopMusic()` and `playMusic("victory")` in the `"success"` case but these aren't in deps. Since they come from `useCallback` in the context they're stable, so this won't cause a bug in practice, but it's a React Hooks lint violation.
**Fix**: Add `playMusic, stopMusic` to the dependency array.

### M2. `AnimatedCounter` in SubmitGuess has no cleanup for `requestAnimationFrame`

**File**: `SubmitGuess.tsx` lines 80-96
**Issue**: The `useEffect` calls `requestAnimationFrame(animate)` in a loop but never stores the rAF ID or cancels it in the cleanup return. If the component unmounts mid-animation, the rAF callback will fire on an unmounted component.
**Fix**: Store the rAF ID and return `cancelAnimationFrame(id)` from the effect.

### M3. `CountdownTimer` recalculates `totalSeconds` twice

**File**: `CountdownTimer.tsx` lines 22-24 and 56
**Issue**: `totalSeconds` is computed at the component level (line 22) AND recomputed inside the `useEffect` (line 56 as `totalSec`). The useEffect version is slightly redundant but correct. The main concern is the `playSfx("countdown_tick")` could fire on mount if `timeLeft.seconds` starts as a non-zero value ≤10 (which it will, since the effect runs after the initial state is set by the other effect). This could cause an unwanted tick sound immediately on mount.
**Fix**: Initialize `lastSecondRef` to the current second value, not -1, to prevent the first-mount tick.

### M4. `HallOfSolvers` doesn't handle null/missing `winner` or `prizeEth`

**File**: `HallOfSolvers.tsx` lines 136-141
**Issue**: `truncateAddress(puzzle.winner)` will throw if `winner` is null (which it can be for unsolved puzzles that slip through the filter). Similarly, `formatPrize(puzzle.prizeEth)` could get a null value. The `solvedPuzzles` filter should prevent this, but the type `Puzzle.winner` is typed as `string` not `string | null`.
**Fix**: Add nullish coalescing: `puzzle.winner ?? "Unknown"` and `puzzle.prizeEth ?? "0"`.

### M5. `BuyTickets` uses `wagmi/experimental` for `useCapabilities` and `useSendCalls`

**File**: `BuyTickets.tsx` line 10
**Issue**: `wagmi/experimental` APIs may change between versions. The import `{ useCapabilities, useSendCalls } from "wagmi/experimental"` is fine for now but should be monitored for wagmi v3 stability.
**Risk**: Low — these hooks are widely used and unlikely to break.

### M6. Sound auto-play on countdown without user interaction

**File**: `ActivePuzzle.tsx` lines 64-71
**Issue**: `playVoice("trapper-teaser")` fires automatically 1.5s after the countdown state renders. While the `SoundEngine.playFile()` checks `this.muted` and the AudioContext resumes on user interaction, the very first page load on a countdown state could trigger audio before any user click (depending on browser autoplay policy). The `SoundProvider` sets up preloading on first click, but the voice line doesn't go through the preload gate — it goes directly via `playFile` which creates the AudioContext.
**Impact**: Most browsers will silently block the audio (no error, just no sound). Not a bug per se, but the sound won't play until user interacts first.
**Fix**: Consider gating first audio play behind the preload interaction flag.

### M7. `confetti` fires on both `isConfirmed` AND `step === "success"` independently

**File**: `SubmitGuess.tsx` lines 192-202
**Issue**: The `useEffect` fires confetti when `isConfirmed || step === "success"`. If both conditions become true at the same time (which they will — `isConfirmed` triggers the `mark-solved` call and both are true simultaneously), the effect fires once. But if somehow `step` is set to `"success"` separately from `isConfirmed`, confetti fires twice. The current flow doesn't set `step = "success"` explicitly (the "success" rendering is controlled by `isConfirmed`), so this is a minor logical oddity rather than a bug.

---

## 4. Minor Issues (Nice to Have)

### N1. `BearTrapSVG` — `originX`/`originY` use percentage and pixel values respectively

**File**: `BearTrapSVG.tsx` lines 143, 171
**Issue**: `style={{ originX: "50%", originY: "52px" }}` — mixing percentage and pixel units for transform origin. This works in framer-motion because it handles the conversion, but it's unusual and could confuse future maintainers.

### N2. `IntentVisualizer` particle positions generated with `Math.random()` in `useMemo` with empty deps

**File**: `IntentVisualizer.tsx` lines 13-19
**Issue**: `useMemo(() => Array.from({ length: 8 }, () => ({ x: (Math.random() - 0.5) * 80, ... })), [])` — This is intentional (generate once, keep stable), but the randomness means the shatter effect looks different on each mount. Consider using deterministic positions for consistent UX.

### N3. `ClueDisplay` uses `<img src={clueURI}>` without `next/image`

**File**: `ClueDisplay.tsx` line 72-86
**Issue**: External images bypass Next.js Image optimization. Since clue URIs are external/IPFS URLs, `next/image` would require domain whitelisting. Using `<img>` is the practical choice here, but there's no `loading="lazy"` (the gameplan said `loading="eager"` which is fine for above-the-fold content).

### N4. `PrizeDisplay` shimmer overlay might cause layout issues on some browsers

**File**: `PrizeDisplay.tsx` lines 69-73
**Issue**: Absolute-positioned duplicate text for shimmer effect. The `opacity-30` + `bg-clip-text` combo may render differently across browsers. Not a functional issue.

### N5. No `Creepster` or `Nosifer` fonts loaded

**File**: `globals.css` line 5, `tailwind.config.ts` lines 33-36
**Issue**: The gameplan specified Creepster/Nosifer for The Trapper's messages. The implementation uses `DM Serif Display` throughout. This is a design choice deviation, not a bug.

### N6. Duplicate keyframe definitions

**File**: `globals.css` (lines 198-202, 219-226) and `tailwind.config.ts` (lines 69-78, 79-81)
**Issue**: `shake`, `shimmer`, and `ember-glow` keyframes are defined in both globals.css (`@keyframes`) and tailwind.config.ts (`keyframes`). The Tailwind versions take precedence when using `animate-*` classes, while the CSS versions apply for direct class usage. Not a bug but adds maintenance burden.

### N7. `page.tsx` uses `--` instead of `—` for em dashes

**File**: `page.tsx` line 52
**Issue**: `Bear Trap Protocol -- Built on Base` — stylistic; consider `—` for proper typography.

---

## 5. Test Coverage Gaps

### Frontend (NO tests exist)

The following components should have tests:

| Component | Priority | What to test |
|-----------|----------|-------------|
| `ActivePuzzle` | HIGH | API response parsing, three state renders (countdown/live/completed), error/loading states |
| `SubmitGuess` | HIGH | Form validation, step transitions, proof polling, prize redemption flow |
| `BuyTickets` | HIGH | Batch vs fallback detection, approval flow, balance checks |
| `IntentVisualizer` | MEDIUM | State rendering for all 6 proof/prize combinations |
| `CountdownTimer` | MEDIUM | Time calculation, urgency states, zero-crossing behavior |
| `SoundEngine` | MEDIUM | Mute toggle, audio context lifecycle, preloading |
| `ClueDisplay` | LOW | Loading/error/success image states |
| `BearTrapSVG` | LOW | Renders without errors for all 4 states |
| `HallOfSolvers` | LOW | API data rendering, empty state, error state |

**Recommendation**: At minimum, add tests for the API response parsing in `ActivePuzzle` (especially given critical issue C1) and the step state machine in `SubmitGuess`.

### Backend

Backend tests exist and all pass. The new `starts_at` parameter and `get_active_puzzle` method have good coverage with 8 new tests in `db.rs`.

---

## 6. Accessibility Gaps

| Issue | Component | Severity |
|-------|-----------|----------|
| `SoundToggle` has good `aria-label` | SoundController.tsx | OK |
| `BearTrapSVG` lacks `role="img"` and `aria-label` | BearTrapSVG.tsx | MEDIUM |
| `IntentVisualizer` lock states have no `aria-live` region for screen readers | IntentVisualizer.tsx | MEDIUM |
| `CountdownTimer` final-10-seconds overlay blocks screen reader navigation | CountdownTimer.tsx | LOW |
| `ClueDisplay` image has `alt="Puzzle clue"` — acceptable | ClueDisplay.tsx | OK |
| Interactive buttons all have visible text or aria-labels | Various | OK |
| All buttons meet 48px touch target with `min-h-12` | Various | OK |
| Color contrast: gold (#FFD700) on dark (#0a0a0a) = 11.6:1 ratio | Various | OK |
| Color contrast: muted (#666666) on dark (#0a0a0a) = 4.2:1 ratio | Various | BORDERLINE (4.5:1 needed for WCAG AA body text, but used only for labels) |
| No keyboard trap issues found | Various | OK |

---

## 7. Performance Concerns

| Concern | Impact | File |
|---------|--------|------|
| First load JS: 826kB for `/` route | HIGH | Build output — already large due to wagmi/viem/web3auth bundle |
| `canvas-confetti` adds ~6kb gzipped | LOW | Acceptable |
| `CountdownTimer` runs `setInterval` every 1s | LOW | Standard approach |
| `ActivePuzzle` polls every 30s | LOW | Acceptable |
| `SubmitGuess` polls proof status every 10s | LOW | Only during active proving |
| SoundEngine preloads ALL voice+SFX files on first click | MEDIUM | 14 audio files loaded at once (~1.1MB total) — consider lazy loading |
| `PrizeDisplay` shimmer uses absolute overlay | LOW | Minimal GPU impact |
| All framer-motion animations use `transform`/`opacity` | OK | GPU-composited |

**Bundle size note**: The 826kB first-load JS is dominated by Web3Auth and wagmi/viem, not this PR's changes. `canvas-confetti` and `framer-motion` (already present) are the only new additions.

---

## 8. Missing Features vs Gameplan

| Gameplan Feature | Status | Notes |
|-----------------|--------|-------|
| Backend `starts_at` + active puzzle endpoint | IMPLEMENTED | Schema migration v3, CLI flag, API endpoint |
| Color palette + design system | IMPLEMENTED | All trap colors in tailwind.config.ts |
| Single-puzzle hero layout | IMPLEMENTED | ActivePuzzle component with 3 states |
| Inline clue image rendering | IMPLEMENTED | ClueDisplay with loading/error states |
| Intent Visualizer | IMPLEMENTED | All 6 states, chain animations, particle shatter |
| `wallet_sendCalls` batched transactions | IMPLEMENTED | With `useCapabilities` detection and fallback |
| Countdown timer | IMPLEMENTED | With sound triggers and urgency states |
| No-puzzle completed state | IMPLEMENTED | Winner display, Hall of Solvers |
| Wrong guess animation | IMPLEMENTED | Screen shake, BearTrapSVG snap, sound effects |
| Correct guess + claim animation | IMPLEMENTED | Confetti, animated counter, BearTrapSVG open |
| ElevenLabs audio | IMPLEMENTED | All voice lines + SFX + music as MP3 files |
| Sound controller + toggle | IMPLEMENTED | Context-based, localStorage persistence |
| Proving state animation | IMPLEMENTED | Spinner, status messages, polling |
| Mobile responsiveness | IMPLEMENTED | Responsive grid, clamp sizes, touch targets |
| Hall of Solvers | IMPLEMENTED | Fetches from API, shows solved puzzles |
| Skeleton loading states | IMPLEMENTED | Full skeleton for ActivePuzzle |
| Error states | IMPLEMENTED | TrapperError component with themed messages |
| `canvas-confetti` dependency | IMPLEMENTED | Added to package.json |
| Creepster/Nosifer font | NOT IMPLEMENTED | Uses DM Serif Display instead (design choice) |
| Canvas-based fire particle system | NOT IMPLEMENTED | Uses simpler CSS/framer-motion shake instead |
| Flip-clock style countdown digits | NOT IMPLEMENTED | Uses large text digits with glow (simpler) |
| ETH amount "flies from trap to winner" animation | NOT IMPLEMENTED | Uses AnimatedCounter instead (simpler) |

**Coverage**: ~90% of gameplan features are implemented. Missing items are all P2 visual polish that were likely deprioritized intentionally.

---

## 9. Checklist for Merge

- [x] Build passes (`npm run build` — zero TS errors)
- [x] LSP diagnostics clean (zero errors across all files)
- [x] No `any` types or type suppressions
- [x] No security vulnerabilities introduced
- [x] No broken imports or circular dependencies
- [x] Contract ABIs unchanged
- [x] Backend tests updated and passing (signature changes for `starts_at`)
- [ ] **FIX C1**: Frontend/Backend API response shape mismatch
- [ ] **FIX C2**: Missing Tailwind animations (`animate-glow-gold`, `animate-glow-red`, `animate-border-glow`)
- [ ] Add `requestAnimationFrame` cleanup to `AnimatedCounter` (M2)
- [ ] Add missing deps to SubmitGuess sound effect (M1)
