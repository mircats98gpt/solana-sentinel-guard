// World Cup Oracle — a real React 18 app (no build) that renders LIVE TxODDS devnet data.
// It talks only to the local proxy (../server/proxy.ts), which holds the wallet + API token and
// fetches from txline-dev.txodds.com. Start the proxy first, then open this page.

import React, { useState, useEffect } from 'https://esm.sh/react@18.3.1'
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client'
import htm from 'https://esm.sh/htm@3.1.1'

const html = htm.bind(React.createElement)
const PROXY = window.TXODDS_PROXY ?? 'http://localhost:8801'

/** 1X2 de-margined odds board for one fixture (PriceNames part1/draw/part2 + implied %). */
function OddsBoard({ fixture, odds, loading }) {
  if (loading) return html`<div class="odds muted">fetching odds…</div>`
  if (!odds) return html`<div class="odds muted">Select a fixture to see de-margined odds.</div>`
  const m = Array.isArray(odds) ? odds.find((x) => x.SuperOddsType?.includes('1X2')) ?? odds[0] : odds
  if (!m?.Pct) return html`<div class="odds muted">No 1X2 market for this fixture yet.</div>`
  const labels = { part1: fixture.Participant1, draw: 'Draw', part2: fixture.Participant2 }
  return html`
    <div class="odds">
      <div class="odds-head">${m.Bookmaker} · ${m.SuperOddsType}</div>
      <div class="odds-rows">
        ${m.PriceNames.map((name, i) => html`
          <div class="odds-row" key=${name}>
            <span class="sel">${labels[name] ?? name}</span>
            <span class="pct">${Number(m.Pct[i]).toFixed(1)}%</span>
            <div class="bar"><div class="bar-fill" style=${{ width: `${Math.min(100, Number(m.Pct[i]))}%` }}></div></div>
          </div>`)}
      </div>
    </div>`
}

function FixtureRow({ fx, selected, onSelect }) {
  return html`
    <li class=${'fx' + (selected ? ' on' : '')} onClick=${() => onSelect(fx)}>
      <span class="fx-teams">${fx.Participant1} <em>v</em> ${fx.Participant2}</span>
      <span class="fx-meta">${fx.Competition} · ${new Date(fx.StartTime).toISOString().slice(0, 10)}</span>
    </li>`
}

function App() {
  const [fixtures, setFixtures] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [odds, setOdds] = useState(null)
  const [loadingOdds, setLoadingOdds] = useState(false)

  useEffect(() => {
    fetch(`${PROXY}/api/fixtures`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) ? setFixtures(d) : setError(d.error || 'bad response'))
      .catch((e) => setError(`proxy not reachable at ${PROXY} — start it first (${e.message})`))
  }, [])

  function select(fx) {
    setSelected(fx); setOdds(null); setLoadingOdds(true)
    fetch(`${PROXY}/api/odds?fixtureId=${fx.FixtureId}`)
      .then((r) => r.json())
      .then((d) => setOdds(d))
      .catch(() => setOdds(null))
      .finally(() => setLoadingOdds(false))
  }

  const byComp = fixtures
    ? fixtures.reduce((a, f) => ((a[f.Competition] = (a[f.Competition] || 0) + 1), a), {})
    : {}

  return html`
    <header class="hero">
      <div class="badge">live · devnet · free World Cup tier</div>
      <h1>World Cup Oracle</h1>
      <p class="tagline">
        Real TxODDS data — verified on Solana, fetched through the kit's wallet, settled in devnet SOL.
        ${fixtures && html` <b>${fixtures.length}</b> live fixtures · ${Object.entries(byComp).map(([k, v]) => `${k} ${v}`).join(' · ')}.`}
      </p>
    </header>
    <main>
      <section class="panel">
        <h2>Fixtures <span class="src">${PROXY}/api/fixtures</span></h2>
        ${error && html`<p class="err">${error}</p>`}
        ${!fixtures && !error && html`<p class="muted">loading live fixtures…</p>`}
        <ul class="fixtures">
          ${fixtures?.map((fx) => html`<${FixtureRow} key=${fx.FixtureId} fx=${fx} selected=${selected?.FixtureId === fx.FixtureId} onSelect=${select} />`)}
        </ul>
      </section>
      <aside class="panel">
        <h2>De-margined odds ${selected && html`<span class="src">#${selected.FixtureId}</span>`}</h2>
        <${OddsBoard} fixture=${selected ?? {}} odds=${odds} loading=${loadingOdds} />
        <p class="note">
          Verified-data → LLM edge → escrow settlement is the on-thesis product; this board shows the
          raw verified input. The agent sells the analysed call (<code>txline edge &lt;id&gt;</code>).
        </p>
      </aside>
    </main>`
}

createRoot(document.getElementById('root')).render(html`<${App} />`)
