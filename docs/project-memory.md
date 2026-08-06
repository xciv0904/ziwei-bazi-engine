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
| `src/data/star-palace-application.json` | 824 entries: how each star behaves in each palace |
| `src/data/double-star-palace.json` | 276 entries: how each of the 23 double-star pairs reads in each palace |
| `src/engines/compose-modifiers.js` | The modifier layer: how auxiliary/malefic/minor stars and mutagens adjust a palace |
| `src/data/star-glossary.json` | 94 chart stars + 四化 + flying-star concepts, Southern-school glossary |
| `src/data/life-stage-details.json` | 12 palaces × 14 major stars: what each decade actually looks like |
| `src/engines/learning-palace.js` | Learning mode: five-step palace lesson, evidence chain, quiz |
| `src/engines/learning-progress.js` | Learning mode: per-chart progress in localStorage |
| `src/data/learning-mode.js` | Palace axis relations, mutagen primer, glossary, empty-palace guide |
| `src/engines/annual-learning.js` | Annual learning: eight-step facts, evidence dedupe, focus analysis, conclusion and year compare |
| `src/engines/annual-learning-storage.js` | Annual learning progress and six-part notes, keyed by chart/year/topic in localStorage |
| `src/data/annual-learning.js` | Annual lesson order, topic evidence scopes and safety rules |
| `src/main.js` | UI orchestration and rendering |
| `test.js` | Core expected-chart regression |
| `cross-test.mjs` | Zi Wei independent-reference comparison |
| `cross-test-bazi.mjs` | Bazi independent-reference comparison |
| `smoke.mjs` | happy-dom UI flow smoke test |
| `tests/star-application.mjs` | Application data coverage, per-palace variation and level gating |
| `tests/double-star-palace.mjs` | Double-star per-palace coverage, pairwise non-duplication, end-to-end lookup |
| `tests/reading-modes.mjs` | Plain mode must contain zero jargon; learn mode must differ from plain and stay chart-grounded |
| `tests/modifiers.mjs` | Auxiliary stars and mutagens must actually change the reading, in the UI and in the AI prompts |
| `tests/wiki-structure.mjs` | Wiki page hierarchy, category isolation, no broken links, no name collisions |
| `tests/star-glossary.mjs` | Glossary covers every star the engine can output; schools kept separate |
| `tests/life-manual.mjs` | Life manual stage coverage, personalisation and chart-derived facts |
| `tests/topic-on-question.mjs` | Topic answers must stay on question, never reuse generic star personality |
| `tests/learning-mode.mjs` | Learning mode vs calculation engine consistency |
| `tests/annual-learning.mjs` | 2026 golden case, topic evidence, dedupe, notes/progress and year comparison |

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
- `npm run wiki-structure`: rebuilds the wiki then checks its page hierarchy and links
- `npm run star-application`: star-in-palace application coverage and learning level gating
- `npm run double-star`: double-star per-palace coverage and 552-line pairwise similarity
- `npm run reading-modes`: the two-mode boundary (no jargon in plain, sourced jargon in learn)
- `npm run modifiers`: auxiliary/malefic/mutagen influence across the site and the AI prompts
- `npm run star-glossary`: glossary coverage against engine output and school separation
- `npm run life-manual`: life manual stage coverage and per-chart narrative checks
- `npm run learning-mode`: learning mode lessons, evidence chain and progress storage
- `npm run annual-learning`: annual eight-step lesson, 2026 golden facts, small-limit landing, dedupe and storage

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
| 2026-08-04 | Learning mode step 1 teaches the Southern reading order (主星→廟旺→雙星→四化→吉煞→雜曜) | Listing star names taught recognition but not application; users could not tell what to look at first |
| 2026-08-04 | Wiki index split into Southern Zi Wei / Northern Zi Wei / Bazi | One flat list mixed two unrelated systems and two schools, with colliding star names |
| 2026-08-04 | Wiki drops 常見命盤組合 and 案例解讀 in favour of the 23 double-star pairs | Users reported both were unreadable: one mixed structural formations with same-palace pairs, the other dumped engine output without context |
| 2026-08-04 | Wiki has four levels: index → section → category → term | Category links used to point at the section page, so every category showed the whole section |
| 2026-08-04 | Wiki term names must be unique; `emit()` throws on collision | Bazi 神煞 and Zi Wei stars share five names (孤辰、空亡、喪門、劫煞、將星) and silently overwrote each other's pages |
| 2026-08-04 | Every technical line carries a plain-language twin, shown per reading mode | Correct terminology alone taught nothing: users could not tell what a flying transformation meant for their life |
| 2026-08-04 | Conclusions are written as 因為…所以… with a source tag per sentence | The conclusion previously listed phenomena then jumped to star keywords, so readers could not follow the reasoning |
| 2026-08-04 | `conclusion` holds display strings only; structured data lives beside it | Putting an object array in `conclusion` leaked "[object Object]" into user-facing text |
| 2026-08-04 | Borrowed stars carry brightness and birth transformation; palace-level stars, stem and flights stay behind | 借星安宮 borrows the star, not the palace. Listing only star names left users unable to tell what was actually borrowed |
| 2026-08-04 | Where schools disagree (borrowing when the palace already has 吉煞), state both and pick neither | The site is not a lineage; presenting one reading as the only one would mislead learners |
| 2026-08-04 | Learning mode has three levels; the level is a personal preference stored separately from chart progress | Showing every layer at once made the page too long to learn from |
| 2026-08-04 | Level flags must be monotonically increasing (basic ⊆ intermediate ⊆ advanced) | A lower level showing something a higher level hides would make levels incoherent; enforced by test |
| 2026-08-04 | Minor stars are written per palace group, not per palace | Same-group palaces differ too little to justify 480 near-duplicate lines |
| 2026-08-05 | Double stars ARE written per palace (not per group) | Unlike minor stars, the same pair reads completely differently in 命宮 vs 夫妻宮; the whole complaint was that the generic line is unreadable |
| 2026-08-05 | Step numbers are derived from display order, never stored | Storing them caused 初階 to render 1, 2, 5 |
| 2026-08-05 | Two reading modes only: plain and learn. 'study' survives as an internal composer value, not a user-facing mode | Three modes produced only two distinct screens, and the third leaked jargon into plain mode |
| 2026-08-05 | Plain mode hides every technical block site-wide, including collapsed ones | A collapsed block still renders its text; users reported seeing 廟旺 while in plain mode |
| 2026-08-05 | Learn mode never replaces plain text — it appends the source chain | The old study mode swapped plain out for jargon, so each mode was missing half of what a learner needs |
| 2026-08-06 | Decadal/annual mutagens are split into lands-here vs lands-elsewhere | They are per-decade/per-year, not per-palace; listing all four flat made every palace look identical and users read it as a bug |
| 2026-08-06 | Quiz questions retire as they are answered: concept after 1, drill after 3, chart never | Twelve palaces asking the same template felt like revising the same thing twelve times |
| 2026-08-06 | Auxiliary stars are a modifier layer appended after the main-star conclusion, never a rewrite | Keeps the 840-answer library and existing copy intact, and the reader can see which sentence was changed by what |
| 2026-08-06 | The modifier layer is its own field and its own UI block, never pushed into `explanation` | Three pages slice explanation to 1-3 items, so appended lines were silently dropped everywhere except topic analysis |
| 2026-08-06 | Modifier copy is second-person and scenario-based, written separately from the teaching copy in learning-mode.js | The two answer different questions: 'what does this star do' vs 'so what am I like'. Abstract praise lands on nobody |
| 2026-08-06 | Plain modifier lines use the per-palace copy, never the star's generic copy | Generic copy is palace-independent, so 夫妻宮 showed '你反應快，學東西上手' and the reader could not see the connection |
| 2026-08-06 | Modifier lines carry no good/bad label | Per-palace copy is neutral-descriptive and repeatedly contradicted the star's 吉/煞 classification; a wrong label is worse than none |
| 2026-08-06 | The narrative version must not invent a relationship between boosts and drags | They come from different stars and different aspects; 'two forces pulling at you' was an interpretation the data cannot support, and users read it as incomprehensible |
| 2026-08-06 | Topic analysis renders the modifier block at topic level, not per question | All six questions in a topic resolve to the same palace, so a per-question block printed the same text six times |
| 2026-08-06 | Two renderings of the same facts: list for cards, narrative for the full report | Both pages read the same card; identical sentences would recreate the 'these two pages are the same' complaint |
| 2026-08-06 | Sentence variants are picked by a hash of the palace name, not its index | The full report always uses 命宮/官祿宮/夫妻宮/疾厄宮 (indices 0, 8, 2, 5); any linear map mod 4 collides on 0 and 8 |
| 2026-08-06 | No numeric strength score for a palace | Chinese astrology has no agreed weighting; a number would invent false precision that users would trust |
| 2026-08-06 | Tone-framed sentences use the generic effect, never the per-palace text | Per-palace copy is neutral-descriptive; 火星 in 官祿宮 reads positive and would contradict a 'but also count this in' frame |
| 2026-08-06 | Any field named `technical` or `evidence` is source material and is excluded from the plain-mode jargon check, at any depth | Makes the zero-jargon rule enforceable by structure rather than by remembering to strip fields |
