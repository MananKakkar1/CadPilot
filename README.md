# Agentic CAD

Next.js app for an intent-first parametric CAD workspace.

The first screen is designed as a calm technical instrument: the viewport is the visual anchor, the prompt is the primary action, and the inspector stays quiet until needed. Motion follows Emil Kowalski's design-engineering principles and Apple-style interaction guidance: fast feedback, restrained material motion, interruptible transitions, and a reduced-motion fallback.

## Run

Use Node.js 20 or newer. Install with npm on macOS, Windows, or Linux; npm selects the appropriate optional native packages for the current platform.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). This is a Next.js app, so serve it with `next dev` or `next start`; a static file server or an Express server will return `Cannot GET /` because it does not understand the App Router.

For a production check:

```bash
npm run build
npm run start
```

To build and start the production server in one command, use `npm run start:prod`.
