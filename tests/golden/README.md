# Golden Chart Framework

The repository already has approved-value mechanisms:

- `test.js` compares one combined case to `expected-chart-data.json`.
- `cross-test.mjs` compares a Zi Wei case with an external reference.
- `cross-test-bazi.mjs` compares a Bazi case with an external reference.
- `test-divination.mjs` protects divination calculations.
- `smoke.mjs` protects UI flows.

These files remain the active regression suite. The templates in `cases/` are a
staging area for future boundary coverage and are not approved expected values.

## Promotion checklist

Before turning a template into an executable Golden case:

1. use synthetic or documented public input;
2. fill all convention and dependency versions;
3. use a fixed `refDate`;
4. verify key facts against an independent source or hand calculation;
5. record verifier/date/source without personal data;
6. obtain maintainer approval; and
7. add the test to `npm test` or a documented cross-test command.

Priority cases: leap-month behavior, 子時 day boundary, solar-term boundary,
unknown-hour fallback, supported-range edges, and one cross-system input.

