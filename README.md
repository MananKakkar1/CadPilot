# Agentic CAD

An 8-hour MVP for natural-language, parametric CAD built with Replicad and OpenCascade.

## Current slice

The first vertical slice is a spur-gear workspace: a design brief, parametric inspector, dependency graph, and CAD viewport shell. The next implementation step is wiring the Replicad OpenCascade worker to the viewport and replacing the placeholder gear with a real solid.

## Agent harness

The repository now includes a typed, observable agent pipeline:

```text
intent-parser → design-planner → cad-builder → geometry-evaluator
```

The harness lives in `src/harness/`. CAD execution is isolated behind `src/cad/adapter.ts`, so Replicad/OpenCascade can be implemented independently in a worker without changing orchestration or UI contracts. See [`docs/harness.md`](docs/harness.md) and [`AGENTS.md`](AGENTS.md) for the event-day split plan.

## Run locally

```bash
npm install
npm run dev
```

Build verification:

```bash
npm run build
```

## MVP roadmap

1. Replicad + OpenCascade Web Worker
2. Deterministic spur-gear generator
3. Mesh rendering in Three.js
4. Natural-language parameter edits
5. Geometry metrics and evaluation
6. STEP/STL export and version history
