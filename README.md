# Agentic CAD

An 8-hour MVP for natural-language, parametric CAD built with Replicad and OpenCascade.

## Current slice

The first vertical slice is a spur-gear workspace: a design brief, parametric inspector, dependency graph, and CAD viewport shell. The next implementation step is wiring the Replicad OpenCascade worker to the viewport and replacing the placeholder gear with a real solid.

## Run locally

```bash
npm install
npm run dev
```

## MVP roadmap

1. Replicad + OpenCascade Web Worker
2. Deterministic spur-gear generator
3. Mesh rendering in Three.js
4. Natural-language parameter edits
5. Geometry metrics and evaluation
6. STEP/STL export and version history
