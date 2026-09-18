# Agent harness

The harness is the stable spine for event-day parallel work. It runs a small, observable pipeline:

```text
intent-parser → design-planner → cad-builder → geometry-evaluator
```

Each agent has a typed input/output contract in `src/harness/types.ts`. The harness emits lifecycle events so the UI can show progress, timing, and failures without knowing how an agent works.

## Replaceable seams

`CadAdapter` in `src/cad/adapter.ts` is deliberately independent from the harness. The current `MockCadAdapter` proves the pipeline. The Replicad implementation should:

1. Live in `src/cad/replicad-adapter.ts`.
2. Run OpenCascade in a Web Worker.
3. Return `mesh`, metrics, and STEP/STL Blobs through the same `CadBuildResult` contract.
4. Never leak OpenCascade objects into React state.

The intent parser can later be replaced by an API-backed implementation without changing the orchestrator or UI event protocol.

## Event-day workflow

Merge this harness foundation first. Then split work into branches by seam: intent agent, Replicad worker, viewport, evaluator, export/history, and workspace UI. Changes should be additive and should preserve the contracts in `types.ts`.
