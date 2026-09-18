# Agent harness

The harness is the stable spine for event-day parallel work. It runs a small, observable pipeline:

```text
intent-parser → design-planner → cad-builder → geometry-evaluator
```

Each agent has a typed input/output contract in `src/harness/types.ts`. The harness emits lifecycle events so the UI can show progress, timing, and failures without knowing how an agent works.

## Replaceable seams

`CadAdapter` in `src/cad/adapter.ts` is deliberately independent from the harness. The `MockCadAdapter` proves the pipeline, while the real implementation is now available in `src/cad/replicad-adapter.ts` and `src/cad/replicad-worker-adapter.ts`:

1. Initializes the bundled OpenCascade WASM runtime once.
2. Builds a deterministic spur gear with real OpenCascade solids.
3. Runs in `src/cad/replicad.worker.ts` when used through `ReplicadWorkerAdapter`.
4. Returns `mesh`, metrics, and STEP/STL Blobs through the same `CadBuildResult` contract.
5. Never leaks OpenCascade objects into React state.

The browser-facing harness should use:

```ts
const harness = new AgentHarness(new ReplicadWorkerAdapter());
const result = await harness.run(prompt);
```

The installed runtime has been smoke-tested by building a solid, measuring its volume, and producing both STEP and binary STL output.

The intent parser can later be replaced by an API-backed implementation without changing the orchestrator or UI event protocol.

## Event-day workflow

Merge this harness foundation first. Then split work into branches by seam: intent agent, Replicad worker, viewport, evaluator, export/history, and workspace UI. Changes should be additive and should preserve the contracts in `types.ts`.
