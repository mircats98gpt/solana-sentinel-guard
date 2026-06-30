# Contributing

Contributions are welcome. The `main` branch is the integration branch — target all PRs at `main`.

## Repo Layout

| Directory | Language | Typical changes |
|-----------|----------|-----------------|
| `packages/agent-runtime/` | TypeScript | The three-pillar runtime: CoralOS client, Solana Pay, the LLM shim, the market protocol |
| `coral-agents/` | TypeScript | The buyer/seller agents + seller personas; fork `seller-agent/src/service.ts` |
| `examples/marketplace/` | TypeScript | The market launcher (`start.ts`) + the React dashboard (`web/`) + feed server |
| `examples/agent-economy/escrow/` | Rust (Anchor) | The escrow settlement contract |

## Prerequisites

- Node.js 20+
- Docker Desktop (coral-server launches the agents)

## Development Commands

```sh
# build the runtime first — coral-agents/examples depend on its dist via file: deps
cd packages/agent-runtime && npm install && npm run build && npm run typecheck && npm test

# typecheck + test the agents
cd coral-agents/seller-agent && npm install && npm run typecheck && npm test
cd coral-agents/buyer-agent && npm install && npm run typecheck && npm test

# the dashboard (runs offline against fixtures — no devnet)
cd examples/marketplace/web && npm install && npm test && npm run e2e
```

## PR Workflow

1. Open an issue or comment on an existing one to discuss your change.
2. Fork the repo and create a feature branch from `main`.
3. Make your change. Add tests for new behavior.
4. Run lint and typecheck locally before pushing.
5. Use [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.).
6. Open a PR against `main`.

## Code Style

- **TypeScript:** run `npm run typecheck && npm test` in `packages/agent-runtime/` (and the package you changed) before committing.
- **Documentation:** READMEs should explain *why* a module exists, not just *what* it does.

## Security

See [SECURITY.md](./SECURITY.md) for the security policy and vulnerability reporting process.
