# Agentic CAD

Agentic CAD turns a design brief into a validated, editable OpenCascade BREP. It preserves the engineering record around every result: structured intent, parametric plan, Replicad source, validation report, preview mesh, STEP, STL, and a compact conversation that explains what changed.

## Product model

A user creates a private project, describes an object, and receives a server-built CAD revision. The project is the durable workspace: it owns the chat, revisions, exports, validation evidence, and publication controls. A validated revision can be published to a stable public project URL and appears on its creator’s public profile.

Agentic CAD produces parametric systems rather than disposable visual meshes. Replicad and OpenCascade are the geometry authority. A revision can only export or publish after deterministic BREP validation succeeds.

## Agent pipeline

1. **Intent agent** converts the request into constrained JSON: object, millimetre units, dimensions, constraints, materials, and requested edit.
2. **Parametric planner** selects editable features and their dependency order.
3. **Replicad generator** writes JavaScript against the verified local Replicad API.
4. **Compiler** executes the code inside the dedicated CAD worker, builds the BREP, and produces preview, STEP, and STL artifacts.
5. **BREP evaluator** measures volume, surface area, bounds, part count, and mesh size, then records a deterministic validation report.
6. **Repair agent** receives compiler diagnostics only and has at most two retries.

The workspace shows the current agent, tool invocation, result, validation findings, and concise design rationale. It does not show private chain-of-thought or hidden prompts.

## Architecture and security

- **Next.js application:** authentication, project APIs, server-sent job events, profiles, and artifact authorization.
- **PostgreSQL via Prisma:** users, profiles, projects, revisions, build jobs/events, conversations, and artifact metadata.
- **Dedicated Node CAD worker:** claims queued jobs, calls the model, runs the isolated CAD compiler, and writes artifacts to a shared volume. Deploy it separately from the web server.
- **Shared artifact storage:** local disk during development through `CAD_ARTIFACT_DIR`; mount an S3-compatible shared artifact volume or replace the storage adapter in production.
- **Execution policy:** generated source is length-limited, blocked from imports, process access, networking, timers, dynamic evaluation, and WebAssembly. Production deployment must run the worker in a container with no network egress, no application secrets, CPU/memory quotas, and a hard execution timeout.

## Workspace UI

The project detail page is the operational surface:

- Persistent design chat and revision-linked assistant responses.
- Live server-sent agent activity using shadcn Marker components.
- Safe rendered engineering Markdown: GitHub-flavored tables, KaTeX equations, and Mermaid diagrams in agent responses. Raw HTML is never rendered; Mermaid runs in strict security mode.
- Expandable generated source, parametric plan, validation report, preview mesh, STEP, STL, and audit files.
- A shared PBR Three.js viewer for validated geometry.
- Indigo actions, cyan/violet agent context, and neutral material surfaces consistent with the landing page. UI uses installed Magic UI and shadcn primitives with reduced-motion support.

## Run locally

Use Node.js 20+ and Postgres.

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run cad:worker
npm run dev
```

Open `http://localhost:3000`. Keep the worker running in a second terminal so queued builds are processed. For a production validation:

```bash
npm run build
npm run start
```

## Environment

`DATABASE_URL` and `DIRECT_URL` configure Supabase/Postgres. `AUTH_SECRET` secures session tokens. `GEMINI_API_KEY` remains server-only and belongs only in the web service/worker secret store. `CAD_ARTIFACT_DIR` points both services to their shared artifact directory. Prisma automatically reads `.env`; use that filename for database commands.

## Database lifecycle

```bash
npm run prisma:generate
npm run prisma:migrate
```

The platform migration creates project, revision, job, event, artifact, conversation, message, and profile tables. Existing users and sessions remain intact.
