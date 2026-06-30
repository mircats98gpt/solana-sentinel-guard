# Example: TxODDS World Cup Oracle

> An agent that **sells verified World Cup data for devnet SOL**. The buyer finds it over CoralOS, the
> kit's escrow settles the deal, and an LLM turns raw TxODDS odds into the thing actually being sold.
> Free tier, devnet, no payment.

This example plugs [TxODDS' **TxLINE**](https://txline-docs.txodds.com) oracle into the kit's three
pillars. It is the worked answer to the track brief — *build an agent that sells a real service and
gets paid in SOL* — pointed at the hackathon's own dataset.

## What it is

```
examples/txodds/
  agent/
    txline.ts     modular TxLINE data client (guest auth + fixtures/odds/scores)
    service.ts    the deliverService() fork point: data -> LLM edge -> string the buyer pays for
  server/
    proxy.ts      real-data backend: subscribes on devnet, serves LIVE fixtures/odds to the app
  web/            React 18 app (no build) that renders the live data from the proxy
    index.html
    styles.css
    app.js
  README.md       (this file)
```

The deep design write-up — how each pillar attaches, the two-escrow distinction, the prediction-market
upgrade — is in **[../../docs/TXODDS_INTEGRATION.md](../../docs/TXODDS_INTEGRATION.md)**.

## The product

The seller sells three verbs (the buyer's request after the `txline` keyword):

| Request | Returns | Pillars |
|---|---|---|
| `txline fixtures` | upcoming World Cup / Int Friendlies fixtures | TxODDS + CoralOS + escrow |
| `txline odds <fixtureId>` | de-margined StablePrice odds | TxODDS + CoralOS + escrow |
| `txline edge <fixtureId>` | odds **+ an LLM value call** | **all three** + LLM |

`edge` is the on-thesis one: verified data in, an LLM-shaped insight out, paid for on delivery.

## Verified on devnet (2026-06) — real data, end to end

I ran the **full flow** on devnet with the kit's buyer wallet and pulled **live World Cup data**:

| Check | Value |
|---|---|
| Devnet program | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| Devnet API host | `https://txline-dev.txodds.com` |
| Free tier | service **level 1** — World Cup & Int Friendlies, on-chain price **0** |
| Live fixtures | **20** — 19 World Cup + 1 Friendlies (e.g. **Croatia v Ghana**, id `17588245`) |
| Live odds | Croatia v Ghana 1X2 de-margined → **36.4% / 47.1% / 16.5%** |

**Three corrections** vs. the published TxODDS examples — all already applied in `server/proxy.ts`,
worth raising with TxODDS before a workshop:
1. **Host:** use `txline-dev.txodds.com`. The repo scripts' `oracle-dev.txodds.com` does not resolve.
2. **Mint:** subscribe with the treasury's `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG`, **not** the
   IDL's `TXLINE_MINT` constant (stale → `InvalidMint`). `subscribe_v2` is in the IDL but **not deployed**
   on devnet (`InstructionFallbackNotFound`), so use the legacy `subscribe(1, 4)` with the real mint.
3. **Odds path:** `/api/odds/snapshot/{fixtureId}` — a path segment, not a query param.

## One-time setup (operator, off the hot path)

The on-chain subscription is a setup step done **once** — the agent then only holds the resulting
token, so the runtime stays devnet-pure. Following TxODDS' [quickstart](https://txline-docs.txodds.com):

1. Subscribe on devnet to the free tier (service level 1) with a devnet wallet.
2. Activate: `POST /auth/guest/start` → sign `${txSig}:${leagues}:${jwt}` → `POST /api/token/activate`.
3. Put the returned token in `.env` as `TXLINE_API_KEY` (and optionally `TXLINE_BASE_URL`).

From then on the agent fetches data with that token; payments are devnet SOL through the escrow.

## How it's wired into the seller

The shipped seller **already** sells `txline`: `txline` is in `KNOWN_SERVICES` and `deliverService()`'s
switch routes it to an inline `txlineService()` in
[`coral-agents/seller-agent/src/service.ts`](../../coral-agents/seller-agent/src/service.ts) that calls
TxLINE directly (its own `txlineGet`) and resolves team names + a deterministic fallback. So out of the
box, a buyer that broadcasts `WANT service=txline ...` is routed to a seller, pays into the escrow, and
receives the LLM-analysed World Cup edge on delivery — no wiring needed.

`agent/service.ts` here (`deliverTxOdds`) is a **standalone, minimal reference** for the same thing,
handy if you're forking. To use it instead of the seller's inline version, swap that one case:

```ts
import { deliverTxOdds } from '../../../examples/txodds/agent/service.js'
// inside deliverService()'s switch (txline is already in KNOWN_SERVICES):
case 'txline': return deliverTxOdds(payload)
```

## Run the e2e app (live data)

The React app fetches **real** World Cup fixtures and odds — it talks only to the local proxy, which
holds the wallet + token and does the on-chain subscribe.

```sh
cd examples/txodds && npm install
npm run proxy          # subscribes the kit's buyer wallet on devnet, serves http://localhost:8801
# then open web/index.html in a browser
```

The proxy needs `BUYER_KEYPAIR_B58` in the repo `.env` (from `node scripts/setup.js`) funded with a
little devnet SOL. Open [`web/index.html`](web/index.html): you'll see the live fixtures load; click one
(e.g. **Croatia v Ghana**) to fetch its **de-margined 1X2 odds board** — all real, all devnet. The
browser never sees the token or the key; everything sensitive stays in the proxy.
