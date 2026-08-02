# Scoped Development Rules

Define before editing:

```text
Goal:
Allowed files/modules:
Protected calculation behavior:
Acceptance checks:
Out of scope:
```

## Forbidden without approval

- Changing calculation school/conventions or normalizing discrepant references
  without documentation
- Updating expected values to follow current output
- Reorganizing `src/main.js`, engines, or data during feature work
- Changing both Zi Wei and Bazi when only one is requested
- Adding packages, network calls, analytics, authentication, or AI API calls
- Renaming stable data keys, question IDs, DOM hooks, storage keys, or exports
- Editing generated output as the source of truth
- Repository-wide formatting or deletion of apparently unused rules

## Default scope

| Task | Default files | Protected |
|---|---|---|
| Zi Wei math | `ziwei.js`, focused tests | Bazi, prose, UI |
| Bazi math | `bazi.js`, focused tests | Zi Wei, prose, UI |
| Interpretation | named `compose*` + matching data/tests | chart facts |
| Question content | matching data/composer/tests | calculation adapters |
| AI copy | `format-ai.js` + copy smoke tests | calculations |
| UI | named `main.js` region/style/smoke | expected chart output |

Shared calendar utilities require both systems' regression and cross-tests.

## Punctuation policy (Traditional Chinese)

Chinese prose uses full-width punctuation: `，。；：？！（）「」`. Half-width
`,` `;` `:` `?` `!` `(` `)` inside a Chinese sentence are treated as defects.

Three places must keep half-width punctuation, because there the characters are
syntax or data rather than prose:

- **Code syntax** — object keys written in Chinese (`{ 甲: '木' }`), regular
  expression groups (`([一-龥]{2,4})`), and character classes (`[(（]`). Any
  bulk conversion must re-run `node --check` on every `.js`/`.mjs` afterwards.
- **Chart fixtures** — `expected-chart-data.json`, `actual-chart-data.json`,
  `tests/golden/cases/*.json`, and `cross-test*.mjs` hold values produced by the
  calculation engines or copied from external reference sites. Rewriting their
  punctuation is the same as editing an expected value, which is forbidden above.
- **Engine output format** — `formatStar()` in `ziwei.js` emits `名(亮度)` with
  half-width brackets and the fixtures depend on it. Changing it is a breaking
  change to a protected contract, not a punctuation fix.

When matching text that may carry either width, write the character class both
ways (`[,，]`) instead of normalising the source.

## Golden baseline policy

When a result differs, first identify whether the cause is input normalization,
library version, convention, adapter code, or fixture error. Require a trusted
reference and maintainer approval before changing an expected value. Record the
decision in project memory.

