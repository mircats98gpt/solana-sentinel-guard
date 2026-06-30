# scripts

Helper scripts for the kit.

## `setup.js` — one-time wallet setup

```sh
cd scripts && npm install && cd ..
node scripts/setup.js
```

Generates a buyer + seller devnet keypair, writes them into the repo-root `.env` (filling
`WALLET` and `BUYER_KEYPAIR_B58` from `.env.example`), and prints both addresses to **fund** at
[faucet.solana.com](https://faucet.solana.com). Re-run after deleting `.env` for fresh keys.

## `smoke/` — deterministic smoke tests

| Script | Gate | What it asserts |
|--------|------|-----------------|
| `smoke-mcp.ts` | MCP handshake | a CoralOS echo round-trips via the puppet API (coral-server must be running) |
| `smoke-buyer.ts` | pay-per-call | the bare-metal 402 loop challenges + (optionally) settles against a running seller |

```sh
npx tsx scripts/smoke/smoke-mcp.ts      # CORAL_SERVER_URL default http://localhost:5555
npx tsx scripts/smoke/smoke-buyer.ts    # ENDPOINT default http://localhost:3001/api/data
```

Devnet only.
