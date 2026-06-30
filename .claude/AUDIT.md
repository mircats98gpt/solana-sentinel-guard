# Codebase Audit — Full Pass

**Date:** 2026-06-25
**Scope:** Whole repo, post agent-economy restructure + renames. Lens: the Solana Dev skill's
security/pre-deployment checklist + the Coral architecture model (per `SKILLS.md`). Excludes
`ref/`/`node_modules` (gitignored) and `.claude/*` historical snapshots.

---

## Verdict

| Dimension | State |
|---|---|
| **Correctness** | ✅ All packages typecheck **0 errors** (coral-agents need `npm install` to re-link the renamed `@pay/agent-runtime`; clean after). |
| **Structure / naming** | ✅ `packages/{agent-runtime,coral-client}` + `api-server` — self-describing, consistent. |
| **Docs** | ✅ 13/13 dirs have READMEs; stale Rust/Axum/port refs fixed (this pass). |
| **Secrets** | ✅ None tracked; `.env` untracked; `.gitignore` covers `.env*`, `*.key`, `*.pem`, keypairs. |
| **Dead/alien files** | ⚠️ → fixed: removed an alien Lua rockspec + stale `e2e`/doc refs. |
| **Hardening** | ⚠️ Known devnet-demo gaps (below) — acceptable for a teaching kit, listed for production. |

---

## Fixed this pass

| Finding | Fix |
|---|---|
| `pay-0.1.1-1.rockspec` — an **alien LuaRocks/Kong plugin** spec from `solana-foundation/pay`, unrelated to this TS kit | **removed** |
| `e2e/playwright.config.ts` — `cd ../api && cargo run` + `:8080` (the removed Rust backend) | → `cd ../api-server && npm run dev`, `:8081` |
| `e2e/tests/api.spec.ts`, `web/.env.local.example` — `:8080` | → `:8081` |
| `DEMO.md` — "Buyer (Helius Monitor Agent)", "identical concepts to Rust" | → "LLM Buyer Agent"; Rust ref dropped |
| `SKILLS.md` — `/coral-agent-swarm` demo claimed a spawned "Helius Monitor" + "Helius detects payment" | → accurate buyer/seller flow with on-chain verify |

Verified: **zero** `cargo` / `:8080` / `api-ts` / `rockspec` references remain in active files.

> Note: `SKILLS.md`'s **Anchor Integration** section (escrow, `programs/escrow/src/lib.rs`, on-chain
> registry, x402 facilitator) is intentionally **aspirational** — "what you could build with the
> Solana dev skill" — so it's left as forward-looking, not treated as stale claims.

---

## Hardening notes (not bugs — devnet-demo posture)

| Area | Observation | Production move |
|---|---|---|
| **Auth** | `CORAL_TOKEN ?? 'dev'` default (matches `coral.toml [auth] keys=["dev"]`) | Real token from secrets for any shared deployment |
| **Mainnet guard** | `agent.ts` auto-selects `mainnet-beta` if the RPC URL contains "mainnet"; no hard block | Add an explicit `ALLOW_MAINNET` gate; kit is devnet-only by convention only |
| **Replay** | Seller verifies a sig's recipient+amount but doesn't track **consumed** sigs | Record spent sigs/references; reject reuse. Rate-limit seller endpoints |
| **Input validation** | Bridge/seller parse message text with regex; minimal validation | Schema-validate order/payment inputs |
| **Tests/CI** | Smoke gates + e2e exist; not wired to run every package's typecheck on push | CI matrix: typecheck + test all packages + `npm audit` |
| **Provider lock-in** | LLM calls are Anthropic-only | Make buyer/seller provider-flexible (OpenAI/Anthropic) |

Priority if hardening: replay + rate-limit (the one real security gap) → CI → mainnet guard → the rest.

**Full roadmap:** [`docs/PRODUCTION_HARDENING.md`](../docs/PRODUCTION_HARDENING.md) expands each item
with what/why/how/effort/priority and a prioritized table. (The mainnet guard is now ✅ done.)

## Disk-only cruft (untracked, not in git)
- Root `package-lock.json` with **no** root `package.json` — orphan from a stray `npm` at root. Safe to delete from disk.
