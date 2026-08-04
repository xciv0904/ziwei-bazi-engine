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
| `src/data/topic-star-answers.json` | 60 questions × 14 major stars: the on-question answer for each question |
| `src/engines/life-manual.js` | Life manual narrative: opening, decade stages, recurring themes, turning points |
| `src/data/life-manual.js` | Palace decade themes, star approaches, turning-point closers |
| `src/data/star-glossary.json` | 94 chart stars + 四化 + flying-star concepts, Southern-school glossary |
| `src/data/life-stage-details.json` | 12 palaces × 14 major stars: what each decade actually looks like |
| `src/engines/learning-palace.js` | Learning mode: five-step palace lesson, evidence chain, quiz |
| `src/engines/learning-progress.js` | Learning mode: per-chart progress in localStorage |
| `src/data/learning-mode.js` | Palace axis relations, mutagen primer, glossary, empty-palace guide |
| `src/main.js` | UI orchestration and rendering |
| `test.js` | Core expected-chart regression |
| `cross-test.mjs` | Zi Wei independent-reference comparison |
| `cross-test-bazi.mjs` | Bazi independent-reference comparison |
| `smoke.mjs` | happy-dom UI flow smoke test |
| `tests/star-glossary.mjs` | Glossary covers every star the engine can output; schools kept separate |
| `tests/life-manual.mjs` | Life manual stage coverage, personalisation and chart-derived facts |
| `tests/topic-on-question.mjs` | Topic answers must stay on question, never reuse generic star personality |
| `tests/learning-mode.mjs` | Learning mode vs calculation engine consistency |

## Confirmed dependencies and conventions

| Decision | Value |
|---|---|
| Zi Wei engine | iztro 2.5.8 |
| Zi Wei star placement | iztro default algorithm |
| Four-transformation table | Qintian/flying-star version (庚 太陰化科, 壬 左輔化科, 戊 右弼化科), verified against 文墨天機 |
| Interpretation lineage | 三合派 (Southern) for prose and glossary; flying-star concepts labelled separately |
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
- `npm run on-question`: topic answer coverage, on-question checks and text quality
- `npm run star-glossary`: glossary coverage against engine output and school separation
- `npm run life-manual`: life manual stage coverage and per-chart narrative checks
- `npm run learning-mode`: learning mode lessons, evidence chain and progress storage

## Durable decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-07-27 | Preserve Vite + Vanilla JS architecture | Matches current deployment and tests |
| 2026-07-27 | Calculation baseline changes require provenance and review | Multiple schools can yield different results |
| 2026-08-03 | Reading mode is a single three-value state (`public`/`learn`/`study`) | A second parallel toggle would let plain and study text drift apart |
| 2026-08-03 | Learning mode derives every fact from existing engine output | Teaching content must never introduce a chart fact the engines did not produce |
| 2026-08-03 | Full-width punctuation for prose; fixtures and engine format strings excluded | Fixture punctuation is an expected value, not prose |
| 2026-08-03 | Topic answers come from a per-question × per-star library, not from palace cards | Palace cards are written per palace, so seven palaces answered every question with generic personality text |
| 2026-08-03 | The safety fallback only triggers when no major star resolves | A valid star answer must never be replaced by the "insufficient signal" canned line |
| 2026-08-03 | Comprehensive report opens with a life-stage narrative instead of an advice checklist | The checklist repeated the same sentence across four fields and read like a to-do list |
| 2026-08-03 | Each decade stage is written per palace × per star, not composed from a generic star line | Composing from a shared style sentence made everyone with the same limit palace read the same decade |
| 2026-08-04 | Glossary follows 三合派 (Southern); 自化/飛化/來因宮 are labelled as 飛星派 (Northern) in their own category | The two schools answer different questions; mixing them teaches contradictions |
| 2026-08-04 | Documentation now states the actual four-transformation table instead of 中州派 | The code has always used the Qintian/flying-star table; only the docs were wrong. Calculation unchanged |

