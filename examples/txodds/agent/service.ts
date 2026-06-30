/**
 * TxODDS service — a self-contained reference for selling verified TxLINE World Cup data for SOL.
 *
 * Note: the shipped seller already integrates `txline` *inline* — see `txlineService()` in
 * `coral-agents/seller-agent/src/service.ts`, which calls TxLINE directly (its own `txlineGet`) and
 * adds team names + a deterministic fallback. This module is the standalone, minimal version of the
 * same idea (used by nothing else in the kit); read it to understand the shape, then either fork the
 * seller's inline `txlineService` or wire this in as `case 'txline': return deliverTxOdds(payload)`.
 *
 * Request grammar (the buyer's request string after the `txline` keyword):
 *   "fixtures"          -> upcoming World Cup / Int Friendlies fixtures              (data only)
 *   "odds <fixtureId>"  -> de-margined StablePrice odds for a fixture                (data only)
 *   "edge <fixtureId>"  -> odds + an LLM value call                                  (all three pillars)
 *
 * Pillars in play:
 *   - CoralOS  carries this string in/out (it's the DELIVERED payload) — handled by the runtime.
 *   - Solana   gates delivery: the seller only calls this after the escrow PDA is funded.
 *   - LLM      turns raw odds into a sellable insight in the `edge` verb (`complete()` from the kit).
 */
import { TxLineClient } from './txline.js'
import { complete } from '@pay/agent-runtime'

export async function deliverTxOdds(request: string): Promise<string> {
  const tokens = request.trim().split(/\s+/).filter(Boolean)
  // A bare fixture id (single numeric token) is treated as `edge <id>` — the on-thesis product, and it
  // survives the single-token WANT `arg` the marketplace broadcasts (e.g. BUYER_ARG=17588245).
  let verb = (tokens[0] ?? 'fixtures').toLowerCase()
  let rest = tokens.slice(1)
  if (/^\d+$/.test(verb)) { rest = [verb]; verb = 'edge' }
  const client = new TxLineClient()

  try {
    switch (verb) {
      case 'fixtures': {
        const fixtures = await client.fixtures()
        return JSON.stringify({
          service: 'txline-fixtures',
          count: fixtures.length,
          fixtures: fixtures.slice(0, 10),
          timestamp: new Date().toISOString(),
        })
      }

      case 'odds': {
        const fixtureId = Number(rest[0])
        if (!fixtureId) return JSON.stringify({ error: 'usage: odds <fixtureId>' })
        const odds = await client.odds(fixtureId)
        return JSON.stringify({ service: 'txline-odds', fixtureId, odds, timestamp: new Date().toISOString() })
      }

      // The on-thesis product: verified data in, LLM-shaped insight out, paid in SOL.
      case 'edge': {
        const fixtureId = Number(rest[0])
        if (!fixtureId) return JSON.stringify({ error: 'usage: edge <fixtureId>' })
        const odds = await client.odds(fixtureId)
        const analysis = await complete({
          system:
            'You are a disciplined football trading analyst. Given de-margined World Cup odds, ' +
            'state any value edge and a single one-line call. Be concise; never invent data.',
          user: `Fixture ${fixtureId} odds: ${JSON.stringify(odds).slice(0, 1500)}`,
          maxTokens: 256,
        })
        return JSON.stringify({
          service: 'txline-edge',
          fixtureId,
          analysis,
          timestamp: new Date().toISOString(),
        })
      }

      default:
        return JSON.stringify({ error: `unknown txline verb: ${verb} (try: fixtures | odds | edge)` })
    }
  } catch (e) {
    // Match the kit convention: failures come back as a string the buyer can read, not a throw.
    return JSON.stringify({ error: `txline delivery failed: ${(e as Error).message}` })
  }
}
