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

## Golden baseline policy

When a result differs, first identify whether the cause is input normalization,
library version, convention, adapter code, or fixture error. Require a trusted
reference and maintainer approval before changing an expected value. Record the
decision in project memory.

