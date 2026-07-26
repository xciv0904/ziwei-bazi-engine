# Coding Style — Zi Wei & Bazi Engine

- Use ES modules and explicit relative imports.
- Prefer pure calculation and composition functions.
- Use `const` by default; avoid global mutable state.
- Keep DOM access in UI code, not calculation engines.
- Use domain-specific names and structured error/warning objects.
- Document every non-universal school or calendar choice.
- Keep machine keys stable and labels/content in Traditional Chinese UTF-8.
- Store numeric facts as numbers with documented units.
- Validate external and localStorage input at boundaries.
- Keep JSON content free of comments; put provenance in a documented metadata key.
- Do not reformat large data files during a focused content change.
- Preserve semantic HTML, keyboard access, visible focus, and reduced-motion
  behavior.

Tests must be deterministic: pass a fixed `refDate` when age/year-dependent output
is asserted. Never use today's date implicitly in a Golden baseline.

