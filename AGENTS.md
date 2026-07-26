# AI Agent Guide — Zi Wei & Bazi Engine

Read `docs/project-memory.md`, `docs/architecture.md`,
`docs/coding-style.md`, `docs/development-rules.md`, and `README.md` before edits.

## Project facts

- Vite + Vanilla JavaScript, deployed to GitHub Pages.
- Zi Wei uses iztro 2.5.8; Bazi/calendar uses lunar-javascript 1.7.7.
- `src/engines/` owns calculations/composition; `src/data/` owns meanings/content.
- Birth data is calculated in-browser; saved charts use localStorage.

## Non-negotiable rules

- Change only requested modules; no opportunistic refactor.
- Never silently change school, calendar, leap-month, day-boundary, solar-term,
  timezone, gender, or uncertain-hour assumptions.
- Do not modify engine facts from renderers, content data, prompts, or Question
  Library logic.
- Do not update expected chart data simply to make tests pass.
- Do not add dependencies, APIs, analytics, or data transmission without approval.
- Do not commit private birth data. Existing fixtures must be treated as test data,
  not user profiles.
- Keep GitHub Pages build and browser-only calculation working.

## Required checks

Run, in order:

```sh
npm test
npm run smoke
npm run build
```

For engine changes also run the relevant `cross-test*.mjs`. Review generated files
and do not commit `actual-chart-data.json` unless explicitly intended.

## Stop and ask

Stop before changing calculation conventions, public result shapes, dependencies,
approved expected values, persistent data formats, or shared utilities affecting
both Zi Wei and Bazi.

