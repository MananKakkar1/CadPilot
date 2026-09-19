# Chili3D (vendored build)

This directory contains an unmodified production build of [Chili3D](https://github.com/xiangechen/chili3d),
a browser-based 3D CAD application, licensed under the GNU AGPL-3.0 (see `LICENSE` in this folder).

- Source: https://github.com/xiangechen/chili3d
- Commit: `03a6a542e841a7f1952f67aa729e0658a8096c08`
- Version: 0.7.1
- Built: 2026-09-19, via `npm install && rspack build` from the upstream source, no source changes.

The only modification made to this build's output is `index.html`, where the upstream
Microsoft Clarity analytics snippet was removed and a stylesheet link to
`/chili3d-bridge/theme-override.css` was added, so the embedded editor doesn't silently phone
home to a third-party analytics service and matches this site's visual theme. No application
code or WASM binary was changed.

Rebuild this directory at any time with:

```bash
node scripts/build-chili3d.mjs
```

That script clones the pinned commit above, builds it with the upstream tooling, and copies the
output here (re-applying the same `index.html` patch).

The `agentic-cad-bridge` plugin loaded via `?plugin=` at runtime (see `/chili3d-bridge/plugins/agentic-cad-bridge`)
is original code written for this project, kept outside this vendored directory so it survives a rebuild.
