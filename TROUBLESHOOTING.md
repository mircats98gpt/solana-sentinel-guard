# Troubleshooting

**First step, always:** run the readiness check — it diagnoses most of this and prints the fix.

```sh
just doctor          # or:  node scripts/doctor.js
```

---

## Setup & toolchain

### `node: command not found` (Windows, via `just`)
The justfile uses `cmd.exe` (`set windows-shell := ["cmd.exe", "/c"]`), which has the full PATH. If
you still hit it, reopen your terminal after installing Node, or run the manual README commands.

### `just` isn't installed
It's optional (`winget install Casey.Just`). Every recipe in the `justfile` is a one-liner you can copy.

### `Cannot find module '@solana/web3.js'` running setup/doctor
The `scripts/` deps aren't installed: `cd scripts && npm install`, then retry.

---

## Funding (the #1 hour-1 blocker)

### "Where are my wallet addresses?"
After `node scripts/setup.js` they're printed **and saved to `WALLETS.txt`**. Re-run it anytime to reprint.

### The faucet won't give me SOL / "rate limited"
[faucet.solana.com](https://faucet.solana.com) is the **only** way (CLI/RPC `airdrop` is gated). It
needs **GitHub sign-in** and rate-limits per account.
- Make sure you're signed in with GitHub.
- Request a small amount (1 SOL is plenty — a deposit is ~0.0002).
- Fund **both** the buyer and seller wallets; devnet SOL persists, so you only fund once.

### Agents start but the buyer never deposits / "insufficient funds"
The buyer wallet is empty. `just doctor` checks both balances — fund the one it flags (`WALLETS.txt`).

---

## Docker & the stack

### `Cannot connect to the Docker daemon` / coral exits immediately
Docker Desktop isn't running. Start it, wait, then `docker compose up -d coral`.

### coral is up but no agents appear
coral launches the agents as containers — they must be **built first**:
```sh
bash build-agents.sh        # or: just build
```
No bash or `just` (e.g. Windows without Git Bash)? `npm run dev` builds the images for you, or run the
two `docker build` commands from the README "by hand" path directly.
Check: `docker images | grep agent`. coral needs the Docker socket (mounted in `docker-compose.yml`).

### Native Linux Docker (not Docker Desktop): agents can't reach coral
`examples/agent-economy/config/coral.toml` sets `[docker] address = "host.docker.internal"`, which
**Docker Desktop** (Windows/macOS — the documented prereq) resolves automatically but **native Linux
Docker** does not, so coral-spawned agent containers can't dial back to coral. Either:
- set `[docker] address` in `coral.toml` to the Docker bridge gateway (usually `172.17.0.1`), or
- ensure spawned containers map `host.docker.internal:host-gateway` (Docker Engine 20.10+).

On Docker Desktop none of this applies.

### First round is slow
On the first session coral pulls/launches the agent containers — give it **~20 seconds**. Watch with
`docker compose logs -f coral`.

### Port `:5555` already in use
```sh
docker compose down
#   Windows:  netstat -ano | findstr :5555      macOS/Linux:  lsof -i :5555
```

---

## Agents, LLM & the market

### Sellers never bid
They need an LLM key — `ANTHROPIC_API_KEY` (or `LLM_PROVIDER=openai` + `OPENAI_API_KEY`) in `.env`,
forwarded to the agents. Without it `decideBid` falls back to a floor bid only if the hard guards pass;
check the key is set and the seller's `SERVICES` inventory includes `BUYER_SERVICE`.

### `NO_SELLERS` every round
No seller carries `BUYER_SERVICE` in its inventory, or none came online. Default `BUYER_SERVICE=coingecko`
is carried by `seller-cheap` + `seller-premium`. Give the session ~20s on first run.

### `DELIVERED` / `RELEASED` never comes back
Trace it: `docker compose logs -f coral`, or set `TRACE=1`. Common causes in order: wallets unfunded →
agent images not built → LLM key missing → escrow program unreachable (RPC) → the seller's upstream API down.

---

## World Cup demo (TxLINE)

### `npm run dev` opens the *generic* market, not the World Cup
The TxLINE mint step is fault-tolerant: if it fails, the demo clears the stale txline keys from `.env`
and falls back to the generic market. The mint needs a **funded buyer wallet** and the TxLINE dev host
(`txline-dev.txodds.com`) reachable. Fund the buyer, then re-run `npm run dev` (or `just mint`).

### World Cup rounds error on delivery / `TXLINE_API_KEY not set`
The TxLINE free-tier token is **short-lived** — re-mint before a demo with `just mint` (or `npm run dev`).
If the host is unreachable, only the generic services (coingecko / jupiter / news / inference) will
deliver; the World Cup specialist sits out.

---

## Escrow contract

### `escrow IDL not found on-chain`
The agents fetch the IDL from the deployed program. The default `PROGRAM_ID`
(`R5NW…CeXet`) is on **devnet** — make sure `SOLANA_RPC_URL` points at devnet. If you redeployed your
own program, run `anchor keys sync` and update the id in the agents' `escrow.ts`.
Still failing on devnet with the default id? The shared demo deployment may have been removed — deploy
your own and repoint:
```sh
cd examples/agent-economy/escrow && anchor build && anchor deploy --provider.cluster devnet
anchor keys sync     # then update PROGRAM_ID in coral-agents/*/src/escrow.ts
```

### `anchor build` fails (only if you fork the contract)
Needs the Solana + Anchor toolchain (Anchor **0.32.x**). On Windows, if `target/deploy/escrow.so` is
missing after a build, run `cd programs/escrow && cargo build-sbf`. The contract is opt-in; the demo
runs against the already-deployed program with no build.

---

## Cleanup — orphaned agent containers

coral launches a fresh agent container per session and doesn't reap them, so they pile up:
```sh
just clean          # or: node scripts/clean.js   (only removes containers from the agent images)
```
A full reset: `docker compose down && just clean && docker compose up -d coral`.

---

## Still stuck?
Run `just doctor` and paste its output into an issue — it captures Node, Docker, wallet, and stack state.
