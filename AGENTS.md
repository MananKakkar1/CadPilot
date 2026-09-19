# Component usage rules

These rules apply to every change in this repository.

## Use pre-built components first

- Reuse an existing component from `components/ui`, `components/magicui`, or the Magic UI/shadcn registry before writing a new component.
- Search the existing component directories and registry names before adding UI code. A new component needs a clear behavior or API that an existing component cannot provide.
- Prefer composing pre-built components with props, variants, and children. Do not copy a component into a second file just to change its styling.
- Keep shared primitives generic. Page-specific layout and styling belong in the page or feature component that uses them.

## Magic UI and shadcn conventions

- Treat Magic UI components as source components installed into this repository, not as a runtime library import.
- Keep Magic UI components under `components/magicui` and shadcn primitives under `components/ui`.
- Preserve the generated component API and accessibility behavior. Put project-specific styling in wrapper classes or shared theme CSS instead of editing generated internals when possible.
- Use the aliases in `components.json` and the `cn` helper from `lib/utils.ts`; do not introduce a second class-name utility.
- Install a registry component with the project’s configured CLI so its dependencies are recorded in `package.json` and `package-lock.json`.

## Dependency and implementation discipline

- Do not add a second UI library when an installed component or the Magic UI registry provides the needed behavior.
- Do not replace a pre-built component with bespoke markup for visual reasons alone.
- When a generated component must be modified, preserve its license/header and document the reason in the change.
- Run the type check or production build after adding or changing components, especially when registry code adds a new dependency.
