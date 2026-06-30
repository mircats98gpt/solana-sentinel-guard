# TxODDS × CoralOS × LLM × Solana Pay × escrow — a deep integration

How TxODDS' **TxLINE** sports oracle plugs into the kit's three pillars to make an *agent that earns* —
selling **verified World Cup data** for devnet SOL. This is the design doc behind
[`examples/txodds`](../examples/txodds).

---

## 1. Why it fits

TxLINE and this kit are the same shape — both are **Solana-native and about verifiable on-chain value**:

- **TxLINE** publishes hourly **Merkle roots on-chain** and serves cryptographic proofs for every
  fixture / odds / scores update. It is *verifiable data*.
- **The kit** settles agent deals through an Anchor **escrow** bound to a Solana Pay `reference`. It is
  *verifiable settlement*.

They meet in the middle: **verifiable data in → verifiable settlement out.** That pairing is exactly
the TxODDS hackathon's flagship ("oracle tooling, on-chain proof integrations").

---

## 2. The pillars, one by one

### CoralOS — coordination (no change needed)

TxLINE is just an HTTP endpoint to CoralOS. A seller agent's `deliverService()` fetches fixtures/odds,
and the result rides the existing market protocol as the `DELIVERED` payload:

```
WANT service=txline-edge → BID → AWARD → ESCROW_REQUIRED → DEPOSITED → DELIVERED → RELEASED
```

The buyer-as-broker opens one `market` thread; sellers bid; the winner delivers TxODDS data. CoralOS
neither knows nor cares that the goods are sports odds — the data is the *good*, CoralOS is the *rail*.

### LLM — the edge (the on-thesis bit)

Raw odds are a commodity; an *analysed* edge is a product. The `edge` verb fetches de-margined odds
and runs the kit's `complete()` shim over them — "find the value, give one call". The LLM sits **in the
product**, not just in bid/selection. Flip `LLM_PROVIDER=openai` and the whole thing runs on the
sponsor's stack, no code change.

### Solana Pay — binding

The agent↔agent payment is the kit's reference-bound SOL flow: a fresh `reference` is minted per order,
the buyer pays/deposits against it, the seller verifies it. **TxLINE's own subscription** (buying
access) is a *separate* SPL flow (TxL/USDT) and is **not** Solana Pay — see §4.

### Escrow — settlement

Delivery is gated on-chain: the seller only calls `deliverService()` after the escrow PDA — seeded by
`(buyer, reference)` — is funded. Pay first is impossible; deliver-then-skip-payment is impossible.

### The linchpin: one `reference`

A single key ties all four together — it **binds** the Solana Pay payment, **seeds** the escrow PDA,
and **rides** the CoralOS `ESCROW_REQUIRED/DEPOSITED` messages. That is what makes this one system, not
four adjacent demos.

---

## 3. Data flow

```
            one-time (operator, mainnet or devnet)        per-order (devnet, in the agent loop)
            ───────────────────────────────────────       ─────────────────────────────────────
 subscribe(level 1, free)  ──► activate ──► TXLINE_API_KEY
                                                  │
   buyer  ──WANT──►  CoralOS  ──►  seller agent ──┤ fetch odds (TxLINE, X-Api-Token)
                                                  ├ complete()  → LLM value call   (the edge)
   buyer  ──deposit SOL──►  escrow PDA  ◄─────────┘ verify funded → DELIVERED → RELEASED
```

The subscription is **out of band** so the runtime stays devnet-pure: the agent only ever holds the
resulting `TXLINE_API_KEY`. (See [`examples/txodds/agent/txline.ts`](../examples/txodds/agent/txline.ts).)

---

## 4. The two-escrow distinction (read this before a workshop)

There are **two** escrows in play. Do not conflate them:

| Escrow | Job | Settles on |
|---|---|---|
| **Kit escrow** (`examples/agent-economy/escrow`) | pay an agent for the data/analysis service | buyer **release** on delivery |
| **TxODDS `txoracle`** | their native binary-options prediction trades | **Merkle proof** of a scores event |

What works at each level:

- **Pay an agent for TxODDS data, trustlessly** → kit escrow, **today**. `deposit → deliver → release`.
- **Resolve a match-outcome market on TxODDS' verified result** → MVP: an **oracle agent** fetches the
  verified result and calls `release` (you trust the agent). Trustless: verify the **Merkle proof
  on-chain** — either extend the kit escrow, or use TxODDS' own `txoracle` (which already does it).

The kit escrow does **not** verify TxLINE Merkle proofs on-chain today — that is the deliberate stretch
seam. Be precise: the kit settles the *service deal* trustlessly; *match settlement* is oracle-trusted
(kit) or done by `txoracle`.

---

## 5. The data-broker pattern (where the agent economy gets interesting)

Because settlement is built in, agents can **trade the data among themselves**:

> One **data-broker agent** holds the TxLINE subscription and resells World Cup data query-by-query to a
> swarm of trader agents over CoralOS, each micro-purchase settled in the escrow.

That turns *one* subscription into a data marketplace — and on **premium** tiers (one subscribed wallet)
it's a real business model: buy access once, resell it on-chain to many agents.

---

## 6. Verified devnet facts (2026-06)

Driven live against the devnet program with the kit's buyer wallet:

| Fact | Value |
|---|---|
| Devnet program | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` (on-chain IDL published) |
| Devnet API | `https://txline-dev.txodds.com` (guest auth → 200 + JWT) |
| Free tier | on-chain `pricing_matrix` row 1: price `0`, bundle 1 = World Cup & Int Friendlies |
| Catalog | International Friendlies = competition `430` |
| Instruction set | `subscribe`/`subscribe_v2`, `validate_fixture/odds/stat`, `create_trade`/`settle_trade`, `request_devnet_faucet` |

**Gotchas:** repo scripts hardcode the non-resolving `oracle-dev.txodds.com` (use `txline-dev`); the
legacy `subscribe` rejected the IDL's `TXLINE_MINT` on devnet (`InvalidMint`) — confirm the exact
devnet subscribe call / mint with TxODDS. The tier is free and configured; the published constant is off.

---

## 7. Build ladder

- **Starter** — `txline fixtures` / `txline odds`: an agent reselling free World Cup data for SOL.
- **Core** — `txline edge`: + an LLM value call (all three pillars in the product).
- **Spicy** — a data-broker agent + trader agents buying from it over CoralOS.
- **Flagship** — a prediction market: stake on an outcome, resolve on TxLINE's verified result.
  MVP via an oracle agent; trustless via on-chain Merkle verification (extend the escrow, or `txoracle`).
