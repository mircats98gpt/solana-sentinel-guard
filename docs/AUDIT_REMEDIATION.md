# Audit remediation plan

A prioritized, actionable plan to close every finding from the deep audit of `solana-coralos`
(2026-06). Each item lists the problem, root cause, exact files, a fix sketch, how to verify, and the
risk of the change. Work top-to-bottom: Phase 1 is the only one that touches a safety invariant.

> **Audit baseline (do not regress):** all 7 packages typecheck; **62 unit tests pass** (runtime 29,
> seller 17, buyer 8, feed 8). `.env` + keypairs gitignored, no committed secrets. The escrow Anchor
> program itself is clean. This plan changes *clients, docs, and config* — not the on-chain program.

> ✅ **Status — 2026-06-27: all of F1–F9 implemented and verified.** Test count is now **68** (seller
> 18, buyer 13 with the new F1/F3 guards; runtime 29, feed 8 unchanged); every package still typechecks.
> Note: F2's trust-model write-up landed in [`README.md`](../README.md) (there is no `docs/MARKETPLACE.md`
> in the repo).

---

## Finding summary

| ID | Severity | Title | Effort | Phase |
|----|----------|-------|--------|-------|
| F1 | 🔴 High | Devnet guard bypassed on the escrow (primary money) path | S | 1 |
| F2 | 🟡 Medium | Buyer can take delivery then withhold release (seller grief) | S (doc) / L (code) | 2 |
| F3 | 🟡 Medium | Buyer trusts the `seller=` pubkey in `ESCROW_REQUIRED` | M | 2 |
| F4 | 🟢 Low | `docker-compose.yml` omits `TXLINE_API_KEY`; doc says otherwise | S | 3 |
| F5 | 🟢 Low | `coral.toml` comments stale (wallet.ts, persona list) | S | 3 |
| F6 | 🟢 Low | Default `BUYER_SERVICE` mismatch (jupiter vs coingecko) | S | 3 |
| F7 | 🟢 Low | `runLoop` AbortSignal path is dead / mis-described | S | 3 |
| F8 | 🟢 Low | Failed mint leaves stale `BUYER_SERVICE=txline` in `.env` | M | 4 |
| F9 | 🟢 Low | `@coral-xyz/anchor` version split (0.31.1 vs 0.32.1) | S | 4 |

Effort: S ≤ 30 min · M ≤ 2 h · L = design + impl.

---

## Phase 1 — Safety (do first, ship alone)

### F1 — Route the escrow Connection through the devnet guard

**Problem.** The escrow clients build a raw `new Connection(rpcUrl, 'confirmed')`, bypassing the
`assertDevnet`/`solanaConnection` guard. The kit's documented invariant ("agent payment code builds its
`Connection` via `solanaConnection()` … throws on a mainnet RPC unless `ALLOW_MAINNET=1`") therefore
does **not** hold on the actual settlement path. A mainnet `SOLANA_RPC_URL` + a funded mainnet key in
`BUYER_KEYPAIR_B58` would move real SOL with no guard tripping. The legacy direct-transfer path
([`payment.ts`](../coral-agents/seller-agent/src/payment.ts)) is already guarded — this is drift from
when escrow became primary.

**Root cause.** `escrow.ts` imports `Connection` from `@solana/web3.js` and instantiates it directly,
rather than importing the guarded factory from `@pay/agent-runtime`.

**Files.**
- [`coral-agents/buyer-agent/src/escrow.ts:30-34`](../coral-agents/buyer-agent/src/escrow.ts#L30-L34)
- [`coral-agents/seller-agent/src/escrow.ts:29-34`](../coral-agents/seller-agent/src/escrow.ts#L29-L34)
- (optional, operator tooling) [`examples/txodds/server/mint.ts:45`](../examples/txodds/server/mint.ts#L45), [`examples/txodds/server/proxy.ts:47`](../examples/txodds/server/proxy.ts#L47)

**Fix.** Build the provider's connection with the guarded factory. `solanaConnection(url)` already uses
`'confirmed'` commitment, so this is a drop-in:

```ts
// escrow.ts (both buyer and seller)
import { solanaConnection } from '@pay/agent-runtime'   // remove the raw Connection import if now unused
// ...
const provider = new AnchorProvider(
  solanaConnection(rpcUrl),                 // was: new Connection(rpcUrl, 'confirmed')
  new anchor.Wallet(buyer /* or Keypair.generate() on the seller */),
  { commitment: 'confirmed' },
)
```

For the txodds operator scripts, the minimal version is a guard call before the raw connection (they
intentionally keep their own connection for the SPL token flow):

```ts
import { assertDevnet } from '@pay/agent-runtime'
assertDevnet(RPC)
const connection = new Connection(RPC, 'confirmed')
```

**Verify.**
1. `cd coral-agents/buyer-agent && npx tsc --noEmit` and same for seller — must stay clean.
2. Add a unit test (no network needed — the guard throws before any RPC call):
   ```ts
   // escrow.guard.test.ts
   it('refuses a mainnet RPC', async () => {
     await expect(makeProgram(Keypair.generate(), 'https://api.mainnet-beta.solana.com'))
       .rejects.toThrow(/devnet-only/)
   })
   ```
3. Re-run the suites: buyer + seller tests green.

**Risk.** Very low — behavior is identical on devnet; only adds a throw on mainnet URLs. No program/IDL
change, no redeploy.

**Done when:** both `makeProgram()` reject a mainnet RPC (covered by a test), and `grep -rn "new Connection(" coral-agents` returns nothing.

---

## Phase 2 — Trust model (decide: document vs. harden)

These are design limitations, not bugs. Default recommendation: **document now, harden only if the demo
needs to defend against an adversarial agent.**

### F2 — Buyer can withhold release after delivery

**Problem.** Flow is deposit → seller verifies funded → seller delivers → **buyer** releases. `release`
is solely the buyer's call, so a buyer can consume the delivered service and then `refund` after the
deadline, leaving the seller unpaid. The deadline protects the *buyer*, not the seller.

**Options.**
- **(A) Document (recommended).** Add a "Trust model & limitations" section to
  [`docs/MARKETPLACE.md`](MARKETPLACE.md) and soften the README line "released only on delivery" to make
  clear escrow guarantees *the buyer can't lose funds without a refund path*, not that the seller is
  guaranteed payment. Lowest effort, honest.
- **(B) Harden (future).** Add an on-chain auto-release: seller submits a delivery proof/attestation and
  `release` becomes claimable by the seller after a *delivery deadline* if the buyer doesn't dispute.
  This is a real escrow redesign (new instruction + state) — out of scope for a hackathon kit unless
  prediction-market settlement needs it.

**Files (A).** [`README.md`](../README.md) (pillar/escrow wording), [`docs/MARKETPLACE.md`](MARKETPLACE.md).

**Done when:** the trust assumption (buyer-grief possible, no dispute path) is written down where a
forker will read it.

### F3 — Bind the awarded seller to the `ESCROW_REQUIRED` payout pubkey

**Problem.** After `AWARD to=<name>`, the buyer deposits to whatever `seller=<pubkey>` arrives for that
round ([`buyer index.ts:121-122`](../coral-agents/buyer-agent/src/index.ts#L121-L122)); the awarded
*name* is never tied to the payout *pubkey*. In the demo all sellers share one wallet, so it's moot, but
a spoofing thread participant could supply a different payout target.

**Fix.** Maintain a `name → expected wallet` map and assert the `ESCROW_REQUIRED` seller matches the
awarded seller before depositing. The expected wallets are already known to `start.ts` (all personas
share `WALLET`), so pass them to the buyer as an option (e.g. `SELLER_WALLETS=name:pubkey,...`) or, since
they're identical today, assert `terms.seller === EXPECTED_SELLER_WALLET`:

```ts
// buyer index.ts, after waitFor(ESCROW_REQUIRED)
if (EXPECTED_WALLET && terms.seller !== EXPECTED_WALLET) {
  console.error(`[buyer] round ${round}: seller pubkey mismatch — skipping`); await sleep(CYCLE_MS); continue
}
```

**Files.** [`coral-agents/buyer-agent/src/index.ts`](../coral-agents/buyer-agent/src/index.ts),
[`examples/marketplace/start.ts`](../examples/marketplace/start.ts) (pass the expected wallet(s)).

**Verify.** Unit-test the guard with a mismatched `seller=` in a synthetic `EscrowTerms`.

**Risk.** Low; additive check. Only meaningful once personas have distinct wallets.

**Done when:** a mismatched payout pubkey is rejected before any deposit.

---

## Phase 3 — Doc & config drift (fast, batch into one commit)

### F4 — `docker-compose.yml` vs. `DATA_PROVIDERS.md` on `TXLINE_API_KEY`

**Reality.** Per-agent options (incl. `TXLINE_API_KEY`) are delivered by
[`start.ts`](../examples/marketplace/start.ts#L71-L80) in the session request, **not** by
`docker-compose.yml`. The compose env list is for the by-hand `docker compose` path only.

**Fix (pick one, do both ideally).**
- Update [`docs/DATA_PROVIDERS.md` "Where the key goes"](DATA_PROVIDERS.md) to say the marketplace
  delivers keys via `start.ts` session options; `docker-compose.yml` only matters for the manual path.
- For parity, add `TXLINE_API_KEY=${TXLINE_API_KEY}` (and `TXLINE_BASE_URL`, `INFERENCE_MODEL`) to
  [`docker-compose.yml`](../docker-compose.yml) env block so the by-hand path can sell `txline` too.

**Done when:** the doc and compose agree on how `TXLINE_API_KEY` reaches the seller.

### F5 — Stale `coral.toml` comments

**Files.** [`examples/agent-economy/config/coral.toml`](../examples/agent-economy/config/coral.toml).
- Line ~4: "payments happen agent-side (… buyer wallet.ts)" → buyer settles via `escrow.ts`; `wallet.ts`
  is legacy. Reword to reference the escrow client.
- Line ~17: "(cheap/premium/lazy)" → add `worldcup` (the `/agents/*` glob already discovers it; comment
  only).

**Done when:** comments match the shipped agents.

### F6 — Unify the default `BUYER_SERVICE`

**Problem.** [`buyer index.ts:29`](../coral-agents/buyer-agent/src/index.ts#L29) defaults to `'jupiter'`;
[`start.ts:88`](../examples/marketplace/start.ts#L88) defaults to `'coingecko'`. Harmless (start.ts wins
in the demo) but confusing.

**Fix.** Pick one canonical default (recommend `coingecko` — keyless, always works) and use it in both
places, or have `start.ts` omit the option and let the agent default stand.

**Done when:** one default, asserted by reading both files.

### F7 — Reconcile `runLoop`/AbortSignal docs with reality

**Reality.** The agents run a manual `while (true)` loop over `ctx.waitForMention()`; clean shutdown
comes from the `SIGINT`/`SIGTERM` → `disconnect()` → `process.exit(0)` handler in
[`server.ts:91-97`](../packages/agent-runtime/src/coral/server.ts#L91-L97). `runLoop(handler, signal)`'s
`AbortSignal` branch is never exercised by the kit.

**Fix (pick one).**
- **Docs:** correct the CLAUDE.md "Key Constraints" bullet to describe the real mechanism (SIGINT →
  disconnect), and note `runLoop` is an optional convenience the agents don't use.
- **Code (optional):** delete the unused `signal` plumbing in `runLoop`, **or** wire `startCoralAgent`
  to create an `AbortController`, abort it in `shutdown`, and pass `signal` into `run` so manual loops
  can cooperate. Only worth it if you want graceful drain instead of `process.exit`.

**Files.** [`CLAUDE.md`](../CLAUDE.md), optionally
[`packages/agent-runtime/src/coral/mcp.ts`](../packages/agent-runtime/src/coral/mcp.ts) /
[`server.ts`](../packages/agent-runtime/src/coral/server.ts).

**Done when:** the documented shutdown mechanism matches the code path actually taken.

---

## Phase 4 — Demo robustness & hygiene

### F8 — A failed mint leaves stale `BUYER_SERVICE=txline` in `.env`

**Problem.** [`mint.ts:101-105`](../examples/txodds/server/mint.ts#L101-L105) writes
`BUYER_SERVICE=txline` (+ fixture ids) to `.env` permanently. On a later `npm run dev` where the mint
step fails (expired token / txline down), `.env` still says `txline`: the buyer broadcasts `txline`
WANTs and `seller-worldcup` launches with a stale token, so it wins the round but delivery errors, while
the generalists decline. The "fault-tolerant" demo assumes a clean `.env`.

**Fix (pick one).**
- In [`scripts/demo.js`](../scripts/demo.js), when the mint step fails, reset the txline keys in `.env`
  (`BUYER_SERVICE`/`BUYER_ARG(S)`/`TXLINE_API_KEY`) so the fallback truly is the generic market.
- Or: have `start.ts` only set `BUYER_SERVICE=txline` when **both** `TXLINE_API_KEY` is present *and*
  validated; otherwise fall back to `coingecko` regardless of the stale `.env` value.

**Files.** [`scripts/demo.js`](../scripts/demo.js), [`examples/marketplace/start.ts`](../examples/marketplace/start.ts).

**Verify.** Manually: corrupt `TXLINE_API_KEY`, run `npm run dev`, confirm the dashboard opens to the
generic market with no failed-delivery rounds.

**Done when:** a failed/stale mint cannot produce a `txline` round.

### F9 — Align the Anchor client version

**Problem.** [`examples/txodds/package.json`](../examples/txodds/package.json) pins
`@coral-xyz/anchor ^0.31.1`; the escrow program, its client, and both agents use `^0.32.1`. Independent
program client, so non-breaking — just drift.

**Fix.** Bump txodds to `^0.32.1`, `npm install`, re-run `npx tsc --noEmit` in `examples/txodds`.

**Done when:** one Anchor major/minor across the repo (or a comment explaining a deliberate pin).

---

## Verification matrix (run after each phase)

```sh
# Runtime (foundation) — build first so file: deps resolve
cd packages/agent-runtime && npm run typecheck && npm test && npm run build

# Agents
cd coral-agents/seller-agent && npx tsc --noEmit && npx vitest run
cd coral-agents/buyer-agent  && npx tsc --noEmit && npx vitest run

# Example surfaces
cd examples/marketplace      && npx tsc --noEmit
cd examples/marketplace/feed && npx tsc --noEmit && npx vitest run
cd examples/marketplace/web  && npx tsc --noEmit
cd examples/txodds           && npx tsc --noEmit

# Guard regression (after F1)
grep -rn "new Connection(" coral-agents   # expect: no matches
```

Baseline to preserve: **70 passing tests, all typechecks clean.** F1 should *add* one test.

## Suggested commits / sequencing

1. `fix(escrow): route deposit/release through the devnet guard` — F1 + its test. **Ship alone.**
2. `docs: document escrow trust model + seller-identity assumption` — F2(A), F3 note.
3. `fix(buyer): bind awarded seller to the escrow payout pubkey` — F3 code (if hardening).
4. `docs+config: reconcile keys, personas, defaults, shutdown` — F4, F5, F6, F7.
5. `fix(demo): clean stale txline state on mint failure; align anchor` — F8, F9.

## Out of scope (future hardening, not in this plan)
- On-chain dispute / auto-release for F2 (escrow redesign).
- Authn on the feed server's `POST /api/start` and binding it to localhost (currently dev-only, CORS `*`).
- Distinct per-persona wallets (would make F3's check load-bearing).
- Mainnet readiness (the kit is intentionally devnet-only).
