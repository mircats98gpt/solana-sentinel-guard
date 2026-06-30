# Full e2e demo — one page, one button, the whole thesis

Goal: a judge clicks **one button** and watches, on **one screen**, the complete loop:

> **real World Cup odds → LLM edge → agents bid over CoralOS → Solana escrow settles → release**

This reuses the kit's existing marketplace **dashboard** (which already has the button, the live round
feed, bids, and Explorer-linked settlement) and makes it show the *World Cup* data the round trades.

## Why this is small

The dashboard already renders a live round from the feed: `WANT → BID → AWARD → DEPOSITED → DELIVERED
→ RELEASED`, with deposit/release linked to the devnet Explorer. And the round object already carries
`want.arg` (the fixture id) and `delivered.data` (the seller's edge JSON). Two changes make it the
World Cup demo:

| Change | File | Why |
|---|---|---|
| `edge` delivers the de-margined odds, not just the call | `coral-agents/seller-agent/src/service.ts` | so the round's `delivered.data` carries the 1X2 board |
| RoundCard renders a World Cup panel for `txline-edge` | `examples/marketplace/web/src/components/RoundCard.tsx` | the odds bars + the LLM value call, in the same card as the settlement |

No new backend: the feed's **Start** button already runs `start.ts`, which is World-Cup-configured
(`seller-worldcup` + `BUYER_SERVICE=txline` + `BUYER_ARG=<fixture>` when `TXLINE_API_KEY` is set).

## What the one screen shows

```
[ The Agent Marketplace ]                          (•) connected
  ────────────────────────────────────────────────────────────
  [ Start a market ]

  Round 1 — WANT txline 17588245  (Croatia v Ghana)
    seller-cheap     declined (not in inventory)
    seller-worldcup  BID 0.0005  "verified odds + edge"      ← specialist wins
    AWARD → seller-worldcup
    ╔══ World Cup edge ═══════════════════════════════╗
    ║ Croatia  ███████████ 36%                         ║   ← real de-margined odds
    ║ Draw     ████████████████ 48%                    ║
    ║ Ghana    █████ 16%                                ║
    ║ call: "value on the draw"  · confidence 0.6       ║   ← the LLM edge
    ╚══════════════════════════════════════════════════╝
    deposit 0.0005 SOL ↗explorer   ·   release ↗explorer   ← real devnet txns
```

## Run it

One command — `just dev` mints a fresh token, rebuilds, brings up a clean coral (so `seller-worldcup`
registers), and opens the dashboard:

```sh
just dev             # then click "Start a market" in the browser
```

Or step by step:

```sh
cd examples/txodds && npm install && npm run mint   # token + WANT (a live fixture) → .env
docker compose up -d coral                           # coordinator (start it fresh)
node scripts/dashboard.js                            # feed :4000 + dashboard :5173 → Start a market
```

The token is short-lived (devnet free tier) — re-run `just mint` (or `npm run mint`) before a demo.

## Robust fallback (no live devnet)

The feed supports `FEED_FIXTURE=<recorded-extended-state.json>` — serve a recorded World Cup round so
the dashboard renders the **real fold/parse path** deterministically, with no on-chain calls. Use this
when demoing on flaky wifi.
