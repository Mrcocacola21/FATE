# Repository-wide ESLint cleanup

Verification date: 2026-10-02.

`npm run lint` now exits with code **0**, with **0 errors and 0 warnings**.
The final JSON measurement covers **797 TypeScript/TSX files**, including tests,
across all three packages. There is no baseline allowance or warning allowance.

## Original measurement

Before editing source or configuration, the complete root lint output and an
ESLint JSON result were captured. The original command exited with code 1:

```text
3086 errors, 14 warnings
```

The JSON result produced this exact breakdown:

| Rule                                                   |    rules | server |      web |   Errors | Warnings |
| ------------------------------------------------------ | -------: | -----: | -------: | -------: | -------: |
| react/react-in-jsx-scope                               |        0 |      0 |     1734 |     1734 |        0 |
| @typescript-eslint/no-explicit-any                     |      825 |     76 |       65 |      966 |        0 |
| prefer-const                                           |      290 |      0 |        0 |      290 |        0 |
| @typescript-eslint/no-unused-vars                      |       47 |      7 |       10 |       64 |        0 |
| react/prop-types                                       |        0 |      0 |       27 |       27 |        0 |
| react-hooks/exhaustive-deps                            |        0 |      0 |       14 |        0 |       14 |
| no-extra-boolean-cast                                  |        1 |      0 |        0 |        1 |        0 |
| @typescript-eslint/no-non-null-asserted-optional-chain |        1 |      0 |        0 |        1 |        0 |
| no-case-declarations                                   |        0 |      0 |        1 |        1 |        0 |
| no-empty                                               |        0 |      0 |        1 |        1 |        0 |
| no-useless-escape                                      |        0 |      0 |        1 |        1 |        0 |
| **Total**                                              | **1164** | **83** | **1853** | **3086** |   **14** |

Package totals were rules: 1164 errors; server: 83 errors; web: 1839 errors
and 14 warnings. The two obsolete/redundant React requirements accounted for
1761 errors. Correcting them left 1325 genuine code violations and the
14 hook dependency warnings to address.

## Configuration decisions

The root `.eslintrc.cjs` remains the single configuration. Its base still extends
`eslint:recommended` and `plugin:@typescript-eslint/recommended`.

- React recommended and React Hooks rules now apply to web TypeScript/TSX.
  Rules/server use the Node environment; web uses the browser environment;
  web tests and Vite configuration also have the Node environment.
- `plugin:react/jsx-runtime` matches the existing web `jsx: "react-jsx"`
  TypeScript setting and automatic React runtime. Its disabling of
  `react/react-in-jsx-scope` and `react/jsx-uses-react` removes an obsolete
  requirement to import React merely to write JSX.
- `react/prop-types` is disabled only for typed web source: TypeScript already
  checks component props. No redundant PropTypes declarations were introduced.
- `@typescript-eslint/no-unused-vars` remains an error. Intentionally unused
  callback/interface arguments and caught errors may start with `_`.
  `ignoreRestSiblings` accommodates existing view projections that deliberately
  omit private fields through object rest destructuring. Ordinary unused
  variables have no blanket name-based exception.
- `react-hooks/exhaustive-deps` is now an error. `rules-of-hooks` stays enabled.
  All dependency warnings were resolved in code.
- Only dependency/build/coverage output is ignored: `node_modules`, `dist`,
  and `coverage`. All three source packages and their tests remain in scope.
- The root script still targets `packages/**/*.{ts,tsx}` and now includes
  `--max-warnings 0`, so future warnings fail the command too.

No additional correctness rule was disabled, no type-aware lint architecture
was added, and no dependency was installed.

## Code cleanup

- Removed unnecessary `any` assertions where the existing domain types already
  supplied the answer. Added precise types for event arrays, event filters,
  pending-roll choices/contexts, Fastify logging, WebSocket test messages, Pong
  inputs/broadcasts, React view models and hook arguments.
- Introduced a typed, recursively partial game-shell fixture helper for isolated
  UI tests. It checks supplied field types and confines its completeness
  assertion to test code. Negative rules tests retain narrow, documented casts
  for deliberately invalid inputs; their rejection assertions remain intact.
- Used safe `prefer-const`/boolean-cast autofixes and split mixed mutable and
  immutable destructuring bindings. Removed unused imports/locals and retained
  required unused interface arguments with `_` names.
- Wrapped the lexical declaration in the `gameEnded` switch case; removed a
  redundant regex escape; made the optional-chain assertion use an explicit
  narrowing; documented why a malformed Pong message is ignored.
- Stabilized the blind-target filter and tab-selection callback, completed
  actual memo/effect dependencies, removed unused dependencies, and moved the
  Pong keyboard sender into its owning effect. Effects retain their existing
  connection/listener ownership and result-revision triggers.
- Used the repository's existing Prettier settings on modified files. Existing
  tests were generally formatted over changed ranges; untouched files were
  not reformatted.

## Removed dead code

Repository reference searches confirmed that these private definitions had no
callers before deletion:

- `rayCells` in rules `actions/heroes/newBatch.ts`.
- `getOwnerOfStartingUnit` in rules `actions/placementActions.ts`.
- `STUB_HERO_AVAILABILITY` in rules `heroes.ts`.
- The private coordinate helper `C` in `manualTurnOrderTest.ts`.
- `paddleYOffset` in server `pong/state.ts`.
- `waitForErrorCount` in server `tests/modes.test.ts`.

Unused imports and local fixture values were also removed. No test case or
assertion was deleted to obtain a passing result.

## Actual defects exposed

These are the small corrections beyond type/cleanup-only edits:

- `useGameShellCoreState` read the existing `replayLastEffects` handler but did
  not return it, although `TestRoomPanel` expected it. The handler is now exposed
  through the existing view model.
- The view-model memo used `newHeroAbilityTargetId` without listing it as a
  dependency, allowing stale selected ability targets. The dependency is now
  present.
- The Mongol Charge notice had an untranslated heading. It now uses the same
  English/Ukrainian selection helper as its neighboring notices.
- Broader web verification exposed three existing failures in the selection
  test harness, reproduced against the original file: two expected action
  objects omitted an existing `useSource: undefined` field, and a hook was called
  outside a mounted React component. Expectations now describe the actual
  object shape and the hook runs in a mounted probe with `act`/unmount. Assertions
  were preserved. UI fixtures use translated labels; the localization scan's
  existing fixed board-code allowlist now includes `BL`, whose accessible
  title/label was already localized.

Game rules, RNG, combat, pending-roll semantics, authentication, persistence,
room/reconnect lifecycle and protocol payload behavior were not redesigned.
No product feature, runtime dependency, database model change or migration was
introduced.

## Suppressions and final verification

**Local `eslint-disable` comments added: 0.**
**Intentionally retained ESLint warnings: 0.**

Final root lint output:

```text
> lint
> eslint "packages/**/*.{ts,tsx}" --max-warnings 0
```

The command exited with code 0 without diagnostics. An independent JSON run of
the same file glob confirmed:

```text
Files=797 Errors=0 Warnings=0 Exit=0
```

| Command                                                                                        | Final result                                                                                   |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                 | Exit 0; 0 errors; 0 warnings                                                                   |
| `npm run -w web typecheck`                                                                     | Exit 0; no TypeScript diagnostics                                                              |
| `npm run build`                                                                                | Exit 0; rules/server TypeScript, Prisma client generation, web typecheck and Vite build passed |
| `npm run test`                                                                                 | Exit 0; rules, boundaries, server, web auth and web profile suites passed                      |
| `npx tsx --test --test-concurrency=4 "src/**/*.test.ts" "src/**/*.test.tsx"` in `packages/web` | Exit 0; 321 passed, 0 failed, 0 skipped                                                        |
| `npx tsx src/tests/pong.test.ts` in `packages/server`                                          | Exit 0; both standalone Pong tests passed                                                      |
| `git diff --check`                                                                             | Exit 0                                                                                         |

The root server suite includes database-foundation, auth, profile, view/marker
projection, persistent Match lifecycle, WebSocket smoke, hardening, test-room
and mode tests. Separate live-database integration scripts and browser E2E
tests were not run; they are not part of the root test command.

Vite still prints its bundle-size advisory for the existing large main chunk.
That advisory is separate from ESLint and does not fail the build; bundling
changes are outside this cleanup. Prisma schema/migration sources were untouched.

No CI workflow or baseline-comparison script was added. A future lint job can
run the root command directly and enforce zero errors and zero warnings.
