# Frontend conventions

This frontend uses Vite, React, TypeScript, and Tailwind CSS. Dependencies and npm
scripts are managed at the repository root.

- Read the root `agents.md` before any Pi integration. The frontend owner selects
  the Pi app; backend credentials must never be exposed through `VITE_*` variables.
- Preserve existing UI markup, styles, native navigation, and in-memory behavior
  unless the person explicitly requests an interface or behavior change.
- Tailwind Preflight is deliberately disabled. The original stylesheet remains
  unlayered so adding Tailwind does not reset existing elements or override it.
- Pages are pre-rendered at build time and hydrated in the browser. Keep the same
  public routes, metadata, and no-JavaScript output. Do not replace native links
  with a client-side router without approval.
- Use `usePopover` and `.popover` for anchored pop-ups, or `<dialog>` with
  `showModal()` for modal dialogs. Both apply the shared background blur.
- Run `npm run check`, `npm test`, `npm run build`, and `npm run probe`. When a
  saved UI reference exists, `npm run parity` compares pixels and UI state.
