# Agentic CAD contributor guide

This repository is intentionally split into stable seams so event-day work can happen in parallel.

## Boundaries

- `src/harness/` owns orchestration, agent contracts, run events, and cancellation.
- `src/cad/` owns CAD-domain types and the Replicad adapter boundary.
- `src/viewport/` owns Three.js rendering and camera state.
- `src/app/` owns product UI and user interaction.
- `docs/` owns architecture and runbooks.

Agents should prefer adding a new adapter or implementation behind an existing interface rather than changing the shared protocol.

## Branching

Start from an up-to-date `main` and use one branch per slice:

```bash
git fetch origin
git switch main
git pull --ff-only
git switch -c feat/intent-agent
```

Suggested event-day branches:

- `feat/intent-agent`
- `feat/replicad-worker`
- `feat/viewport`
- `feat/evaluation`
- `feat/export-history`
- `feat/workspace-ui`

Keep commits small and scoped. Merge the harness contract first, then independent adapters and UI slices.
