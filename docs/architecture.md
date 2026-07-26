# Architecture — Zi Wei & Bazi Engine

## Layers

1. `src/main.js` validates input, coordinates screens, and renders results.
2. `src/engines/ziwei.js` and `bazi.js` adapt third-party calculation libraries to
   project-owned structured facts.
3. `compose*.js` and `interpret.js` combine facts with rules/content.
4. `src/data/` stores versionable meanings, profiles, and assembly rules.
5. `format-ai.js` serializes existing facts for user-initiated AI copy.

```text
UI → calculation adapters → chart facts
UI → interpretation composers → view content
AI copy → formatter → existing facts + selected interpretation
```

Calculation adapters must not import UI code or prose datasets. Content and
formatting code must not recalculate pillars or palaces.

## Data contracts

Prefer additive changes to engine output. Every breaking change needs an explicit
migration of UI, composers, formatters, tests, and saved profiles. Record library
versions and calculation assumptions in future fixture metadata.

## Build and static hosting

Vite is an approved build dependency. Production must remain deployable below the
repository's GitHub Pages base path. No required server, secret, or external AI API
may be introduced without a product decision.

## Known architecture risks

- `src/main.js` spans many UI concerns; edit narrowly.
- Shared calendar assumptions can change both systems.
- Large content datasets can drift from engine keys.
- Generated wiki/service-worker outputs may change during build; review them
  separately from hand-written changes.

