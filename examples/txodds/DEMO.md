# Live demo: an agent sells a World Cup edge for devnet SOL

This is the "money shot" round — Demo A (the marketplace) settling Demo B (real TxODDS data) in
**one live round**: the buyer wants a World Cup edge, a specialist seller fetches verified odds, an LLM
turns them into a value call, and the buyer pays for it through the escrow. **Config only — no agent
code changes** (the `txline` service is already in the seller image).

## The pieces

| Piece | What changes | Why |
|---|---|---|
| `coral-agents/seller-worldcup/coral-agent.toml` | **new persona** over the seller image, `SERVICES=txline` | a seller that bids on `txline` (auto-registered from `/agents/*`) |
| `examples/marketplace/start.ts` | add `seller-worldcup` to the session, forward `TXLINE_API_KEY`, pass `BUYER_ARG` | so the persona launches with the token and the buyer's WANT carries the fixture |
| `.env` | `TXLINE_API_KEY`, `BUYER_SERVICE=txline`, `BUYER_ARG=edge 17588245` | the token (one-time mint) + the WANT the buyer broadcasts |

## How a round resolves

```
buyer        WANT service=txline arg="edge 17588245" budget=0.001
seller-cheap   …silent (txline not in [jupiter,coingecko])      ← non-specialists decline
seller-worldcup BID  price=0.0005  note="verified odds + edge"
buyer        AWARD → seller-worldcup
seller-worldcup ESCROW_REQUIRED → buyer DEPOSIT → on-chain
seller-worldcup deliverService("txline edge 17588245")
                 → fetch de-margined odds (txline-dev) → Claude value call
                 → DELIVERED {"call":"…","confidence":…}
buyer        RELEASED 0.0005 SOL → seller-worldcup   (real devnet tx)
```

The bidder's hard guard (`bidder.ts`: `!services.includes(want.service)`) makes the non-specialist
personas sit out automatically, so the World Cup specialist wins — a clean "right agent for the job"
story.

## Run it

```sh
# 1. mint a fresh TXLINE_API_KEY into .env  (one-time subscribe+activate on devnet)
#    — done by scripts in examples/txodds; the token is the only thing the seller needs
# 2. set the WANT in .env:
#    BUYER_SERVICE=txline
#    BUYER_ARG=edge 17588245        # Croatia v Ghana
# 3. rebuild not needed (txline already in the image). Fresh session:
docker compose up -d coral
cd examples/marketplace && npm start
docker logs -f <buyer-container>   # WANT(txline) → AWARD seller-worldcup → DEPOSITED → RELEASED
```

## Notes

- The activated API token is time-limited (tied to the 4-week free subscription) — mint it fresh
  shortly before demoing.
- `seller-worldcup` reuses the **already-built `seller-agent:0.1.0` image**; only its persona/options
  differ, so there is no rebuild.
- Fixture `17588245` is Croatia v Ghana; swap `BUYER_ARG` for any live fixture id from
  `GET /api/fixtures/snapshot`.
