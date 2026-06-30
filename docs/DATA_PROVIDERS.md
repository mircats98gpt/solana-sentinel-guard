# Data providers — a build-for shortlist

Five curated data sources your seller agent can wrap in `deliverService()`
([service.ts](../coral-agents/seller-agent/src/service.ts)) and sell for devnet SOL. The agent fetches
on demand; the buyer pays through the escrow. Not exhaustive — these are the high-signal starting points.

Payment vs. data network — keep them separate. The payment is always devnet SOL (free, faucet-funded).
The Devnet column means "does this serve devnet chain data?":

- Yes — serves devnet data; demo the whole loop on devnet.
- Mainnet — data lives on mainnet, but the agent only reads it. No real funds move, so it is fine here;
  the SOL you charge is still devnet.

The Key column is the env var to set (or none). Verify current tiers before relying on them.

---

## Build-for shortlist

| # | Provider | Devnet | Key (env var) | What it is -> what an agent sells |
|---|---|---|---|---|
| 1 | [Public RPC](https://solana.com/docs/rpc) | Yes | none | baseline JSON-RPC — balances, token holdings, tx lookup, account info -> "devnet wallet portfolio", "tx explainer". Start here: no key, reads the same devnet you settle on. |
| 2 | [Helius](https://docs.helius.dev) | Yes | `HELIUS_API_KEY` | enhanced RPC + DAS API (tokens/NFTs incl. compressed) + parsed txns + webhooks -> "explain this transaction", "NFT portfolio". One key unlocks the most. |
| 3 | [Jupiter](https://dev.jup.ag) | Mainnet | `JUPITER_API_KEY` (optional) | best swap route + Price API + token list -> "SOL->token quote", "token price". Already wired as the kit default — the template to copy. |
| 4 | [Pyth Network](https://docs.pyth.network) | Yes | none | high-fidelity price feeds (pull oracle); Hermes serves price + proof -> "verifiable price", an oracle for a market. Pairs with the escrow's verifiable settlement. |
| 5 | [TxLine / TxODDS](https://txline-docs.txodds.com/documentation/quickstart) | API | `TXLINE_API_KEY` (add when wiring) | verifiable sports data — odds/scores/fixtures with Merkle roots on-chain -> "live odds feed", an oracle to resolve a match market. Free World Cup tier; the data API is cluster-independent. |

The arc: 1–3 read Solana (raw -> enhanced -> DeFi prices); 4–5 are verifiable oracles — the on-thesis
pair for prediction markets and trustless settlement.

## Already wired (runs today)

These ship in `deliverService()` now — fork-ready examples to copy:

| Service | Key (env var) | What it returns |
|---|---|---|
| `coingecko` | none | token price in USD |
| `jupiter` | `JUPITER_API_KEY` (optional) | best SOL->token swap quote |
| `news` | `NEWS_API_KEY` | top crypto headlines (NewsAPI) |
| `inference` / `claude` | `ANTHROPIC_API_KEY` | a Claude completion — also the agents' bidding/selection brain |

## Where the key goes

1. Put the value in `.env` (copy [`.env.example`](../.env.example)).
2. Get it to the seller. There are **two delivery paths**, depending on how you launch:
   - **Marketplace (`npm run dev` / `npm start`):** [`examples/marketplace/start.ts`](../examples/marketplace/start.ts)
     reads `.env` and passes options **per-agent in the session request** (this is how `TXLINE_API_KEY`
     reaches `seller-worldcup`). Add your key there if a persona needs it — `docker-compose.yml` is **not**
     on this path.
   - **By-hand (`docker compose up`):** [`docker-compose.yml`](../docker-compose.yml) forwards env to the
     agents coral launches — it passes `HELIUS_API_KEY`, `JUPITER_API_KEY`, `NEWS_API_KEY`,
     `ANTHROPIC_API_KEY`, and `TXLINE_API_KEY`. Add a new line there for a new key.
3. The service reads it with `process.env.NAME`.

Keyless services (`coingecko`, Public RPC, Pyth) need none of this.

## Add one

```ts
// coral-agents/seller-agent/src/service.ts
const KNOWN_SERVICES = new Set([..., 'pyth'])   // 1. register the name
case 'pyth': return pythPrice(payload)          // 2. add a branch in deliverService()
// 3. write the fetch helper — any HTTP call that returns a string
```

If it needs a key, do the three steps under "Where the key goes" above.
