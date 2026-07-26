# Project Memory — Zi Wei & Bazi Engine

Last verified against repository: 2026-07-27

## Product and runtime

Traditional Chinese browser app for Zi Wei Dou Shu and Bazi charts, interpretation,
60 topic questions, AI-copy prompts, comparison, saved charts, and related tools.
It uses Vite for development/build and GitHub Actions/GitHub Pages for deployment.
Calculations run in the browser.

## Actual module map

| Path | Responsibility |
|---|---|
| `src/engines/ziwei.js` | Zi Wei calculation adapter |
| `src/engines/bazi.js` | Bazi calculation adapter |
| `src/engines/compose*.js` | Interpretation/topic composition |
| `src/engines/interpret.js` | Interpretation orchestration |
| `src/engines/format-ai.js` | AI-copy formatting |
| `src/data/*.json`, `*.js` | Meanings, rules, profiles, Question Library content |
| `src/main.js` | UI orchestration and rendering |
| `test.js` | Core expected-chart regression |
| `cross-test.mjs` | Zi Wei independent-reference comparison |
| `cross-test-bazi.mjs` | Bazi independent-reference comparison |
| `smoke.mjs` | happy-dom UI flow smoke test |

## Confirmed dependencies and conventions

| Decision | Value |
|---|---|
| Zi Wei engine | iztro 2.5.8 |
| Zi Wei lineage | 中州派 (per project README) |
| Bazi/calendar engine | lunar-javascript 1.7.7 |
| Supported calendar range | 1900–2100 (per README) |
| Lunar leap-month input | Currently unsupported |
| Unknown birth hour | Temporarily uses 午時 with uncertainty warning |
| Hosting | Vite build to GitHub Pages |

Still unresolved/documentation needed: 子初/子正 boundary, true solar time policy,
historical timezone policy, exact solar-term boundary source, gender rule details,
and fixture provenance. AI agents must not infer these.

## Stable data flow

`birth input → ziwei/bazi engines → structured facts → compose/interpret engines
→ UI or format-ai → user-initiated copy`

Data files provide meanings/rules; they must not override calculated pillars,
palaces, stars, transformations, or limits.

## Protected contracts

- `convertToZiWei()` and `convertToBaZi()` result shapes
- Existing content-data keys and stable question IDs
- localStorage saved-chart format and privacy behavior
- `expected-chart-data.json` and cross-test expected values
- GitHub Pages build and PWA behavior

## Test baseline

- `npm test`: core chart regression plus divination
- `npm run smoke`: principal UI and AI-copy flows
- `npm run build`: wiki generation and production bundle
- `node cross-test.mjs`: Zi Wei reference comparison
- `node cross-test-bazi.mjs`: Bazi reference comparison

## Durable decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-07-27 | Preserve Vite + Vanilla JS architecture | Matches current deployment and tests |
| 2026-07-27 | Calculation baseline changes require provenance and review | Multiple schools can yield different results |

