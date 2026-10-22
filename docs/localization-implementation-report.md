# Internationalization expansion — implementation report

Date: 2026-10-22.

The locale implementation includes Hebrew in addition to every requested
language. Resource completeness and technical checks pass. The new translations
are machine-assisted drafts with targeted terminology corrections, rather than
native-speaker editorial approval; long rules and ability descriptions still
need that review.

## Architecture found and retained

The frontend had a custom synchronous `useSyncExternalStore` localization store,
not i18next. English and Ukrainian were nested TypeScript resources, including
an imported admin dictionary. Selection used `FATE_LANGUAGE` localStorage and,
after authentication, the existing server-side profile preference. The
PostgreSQL profile language field was already an enum limited to `en/uk`.

Several gameplay areas bypassed the dictionaries with inline EN/UK branches:
event messages, pending-roll labels, target-selection prompts, hero names,
ability descriptions and the Markdown rulebook. Those presentation strings now
use the same resource lookup path as ordinary screens.

The frontend registry is `packages/web/src/i18n/registry.ts`. It supplies locale
code, native name, direction and resource to both selectors and tests.

| Locale | Native name        | Resource coverage                                        |
| ------ | ------------------ | -------------------------------------------------------- |
| uk     | Українська         | Existing resource retained; damaged Sans text repaired   |
| en     | English            | Existing wording retained                                |
| pl     | Polski             | Complete; Polish plural forms reviewed                   |
| de     | Deutsch            | Complete; rank, rating and compact UI terms reviewed     |
| fr     | Français           | Complete; core UI and plural terms reviewed              |
| es     | Español            | Complete; neutral UI and plural terms reviewed           |
| pt-BR  | Português (Brasil) | Complete; Brazilian UI and plural terms reviewed         |
| tr     | Türkçe             | Complete; locale-aware casing and count labels           |
| ja     | 日本語             | Complete; gaming/rating terminology corrected            |
| ko     | 한국어             | Complete; core UI, counts and gameplay prompts corrected |
| zh-CN  | 简体中文           | Complete; Simplified Chinese conversion and terminology  |
| he     | עברית              | Complete; RTL, core UI, ranks, counts and gameplay terms |

New JSON resources have 2,511 string entries each. Canonical base keys match
English; extra plural variants, including Hebrew `two`, are permitted.
Completeness does not establish linguistic accuracy.

## Behavior and presentation

- The old two-button switcher is a compact native select with all 12 self-names.
  The profile form uses the same registry. Native keyboard operation and current
  selection are retained without an expanding row of language buttons.
- Guest preferences still use the existing localStorage key. Authenticated
  preferences still use the existing profile PATCH/save path and take precedence
  after login. Disabled browser storage no longer prevents switching.
- Supported regional browser tags normalize centrally. `iw` resolves to `he`;
  `pt` defaults to `pt-BR`. Traditional Chinese tags are not silently mapped to
  Simplified Chinese.
- Missing values fall back to English. English plural rules are used for an
  English fallback. Tests prohibit missing/empty resources in normal shipping.
- Existing locale-aware history/profile/statistics/leaderboard formatting stays
  in place. Admin dates now use the active locale, board zoom uses localized
  percentages, and event lists use `Intl.ListFormat`.
- The existing `Intl.PluralRules` architecture remains. Polish forms, Hebrew
  singular/dual/plural forms and CJK count labels have dedicated resources.
- Existing API error helpers keep mapping stable machine codes to presentation
  keys. Raw form-schema messages are not newly exposed.
- Canonical game modes are actually `standard/draft/classic`; those values,
  match classifications, statuses, role values and rank tiers are unchanged.
  Mode/type/status/rank labels remain frontend presentation.
- The eight rank names have concise localized labels. FATE and Glicko-2 retain
  their spelling. Usernames, lobby names, IDs and revisions stay user/domain data.

## Hebrew, fonts and layout

Startup and language changes synchronize HTML `lang` and `dir`. Hebrew mirrors
the shell through logical positioning; the board explicitly stays LTR to
preserve coordinates, field placement and effects. Numeric fractions and
mixed-script account names use bidirectional isolation.

The original Inter/system sans and Georgia stacks had no bundled CJK font
coverage. Added system fallbacks cover Japanese, Korean, Simplified Chinese and
Hebrew without adding font files or license obligations. Script-specific
tracking/casing and line height avoid applying Latin display treatment to CJK
or Hebrew. Turkish search and visible initials use locale-aware casing.
Buttons and essential labels can wrap.

Desktop/tablet/mobile screenshots were inspected for German, Japanese, Korean,
Chinese and Hebrew. Representative glyphs render without tofu on this Windows
browser. Hebrew navigation mirrors and board orientation remains stable.

## Profile storage and deployment

The additive migration is:

`packages/server/prisma/migrations/20261022090000_expand_profile_languages/migration.sql`

It extends the existing preference enum, without adding a table, column or
competing preference source. Prisma identifiers `pt_BR/zh_CN` map to stored and
public `pt-BR/zh-CN`; DTO/repository converters preserve the public contract.
The frontend profile decoder now accepts every canonical locale.

Deploy this migration and server before saving new preferences from the new
frontend. The migration was subsequently verified on disposable PostgreSQL 16.15
using the existing guarded integration workflow. No application database was
migrated; see [DB verification](localization-db-verification.md) for commands,
real locale round-trips and historical `en`/`uk` upgrade coverage.

## Verification

| Command                                        | Result                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                            | Pass: rules, server, benchmark, frontend and smoke types                                               |
| `npm run -w web i18n:check`                    | Pass: typecheck and 22 localization tests                                                              |
| `npm run lint`                                 | Pass: 0 errors, 0 warnings                                                                             |
| `npm test`                                     | Pass: 42 suite executions; 897 frontend tests; 983 TAP tests across reported suites plus legacy checks |
| `npm run -w server prisma:generate`            | Pass                                                                                                   |
| `npm run -w server openapi:schemas`            | Pass; public response schemas regenerated and checked by regression                                    |
| `npm run -w server typecheck`                  | Pass                                                                                                   |
| `npm run -w server test:profile`               | Pass: locale validation, public/Prisma round trips, writes and existing profile security               |
| `npm run -w web test:shell`                    | Pass: 20 tests                                                                                         |
| `npm run -w web test:replay`                   | Pass: 22 tests, including navigation in every locale                                                   |
| `npm run -w web test:admin`                    | Pass: 40 tests, including authorized audit rendering in every locale                                   |
| `npm run -w web test:profile`                  | Pass: 13 tests                                                                                         |
| `npm run -w web test:mobile`                   | Pass: 71 tests                                                                                         |
| `npm run -w web test:i18n:e2e`                 | Pass: full 12-locale matrix and base shell/game smoke                                                  |
| `npm run -w web test:i18n:e2e -- --locales=he` | Pass: this PowerShell invocation repeated all 12 locales, including final Hebrew copy                  |
| `npm run build`                                | Pass: complete workspace build                                                                         |
| `npm run -w web build`                         | Pass after final copy refinements                                                                      |
| `npm run test:integration`                     | Pass on disposable PostgreSQL 16.15: 43 suite executions, 0 failures, 855.66 seconds; all 12 locale DB round-trips and historical en/uk migration compatibility verified |
| `git diff --check`                             | Pass                                                                                                   |

The full locale browser matrix covers Login, Play, Lobby, Figure Set, Match
History/Details, Leaderboard and Profile at desktop/tablet/mobile widths.
Representative German/Japanese/Korean/Chinese/Hebrew real test rooms additionally
verify HUD layout and fixed board direction. Replay and authorized audit
coverage also run through all locales in component tests.

The repeated regression report records 404.12 seconds across suite executions:
`test-results/testing/regression.json`. The frontend layer runs four isolated
test-file processes with a ten-minute bound; earlier serial runs exceeded the
old budget while still making progress. The successful frontend execution took
138.61 seconds. No assertions or suites were skipped to obtain that result.

Screenshots: `packages/web/test-results/app-shell`.
Final production JS entry: approximately 2,622.95 kB, 871.79 kB gzip, including
the existing game application. Resources remain statically bundled to preserve
the synchronous store; further locale splitting is a possible later optimization.

## Limits and remaining editorial work

1. Long rule/ability copy in the ten new locales remains a translation draft.
   Structural tests, glossary corrections and screenshots cannot certify every
   sentence's grammar or rule terminology. Native-speaker review is outstanding.
2. The legacy realtime `localizeServerText` compatibility adapter still handles
   older English server messages. New HTTP/domain errors retain code-based
   handling; the backend protocol was not rewritten as part of localization.
3. User-generated content, technical identifiers and established proper names
   intentionally retain their original spelling. Unknown legacy errors may use
   the existing safe backend-message fallback.
4. Font fallbacks were verified on the available Windows browser; other systems
   depend on their installed script fonts.

## Files added or changed

The list below excludes pre-existing untracked sound assets and work documents.

```text
docs/localization-implementation-report.md
docs/localization.md
packages/server/prisma/migrations/20261022090000_expand_profile_languages/migration.sql
packages/server/prisma/schema.prisma
packages/server/src/openapi/generated/responses.json
packages/server/src/profile/dto.ts
packages/server/src/profile/languages.ts
packages/server/src/profile/schemas.ts
packages/server/src/repositories/profileRepository.ts
packages/server/src/tests/profile.test.ts
packages/web/package.json
packages/web/scripts/app-shell-smoke.mjs
packages/web/scripts/auth-smoke.mjs
packages/web/src/admin/components.test.tsx
packages/web/src/admin/components.tsx
packages/web/src/api/profileApi.ts
packages/web/src/components/Board.tsx
packages/web/src/components/LanguageSwitcher.tsx
packages/web/src/components/RulesModal.tsx
packages/web/src/figures/HeroDetails.tsx
packages/web/src/game/abilityDisplayDetails.test.tsx
packages/web/src/game/components/GameTopBar.tsx
packages/web/src/game/components/RightPanel/rightPanelHelpers.ts
packages/web/src/game/components/RightPanel/sections/BattleBottomHints.tsx
packages/web/src/game/gameshell-content/components/BoardControls.tsx
packages/web/src/game/gameshell-content/components/CurrentTaskPanel.tsx
packages/web/src/game/gameshell-content/components/GameShellSideColumn.tsx
packages/web/src/game/gameshell-content/components/PendingBoardNotice.tsx
packages/web/src/game/gameshell-content/components/PendingRollDetails.tsx
packages/web/src/game/gameshell-content/components/PendingRollModal.tsx
packages/web/src/game/gameshell-content/helpers.ts
packages/web/src/game/pendingRollPresentation.ts
packages/web/src/i18n/displayMetadata.ts
packages/web/src/i18n/eventMessages.ts
packages/web/src/i18n/i18n.test.ts
packages/web/src/i18n/index.ts
packages/web/src/i18n/locales/de.json
packages/web/src/i18n/locales/en.ts
packages/web/src/i18n/locales/es.json
packages/web/src/i18n/locales/fr.json
packages/web/src/i18n/locales/he.json
packages/web/src/i18n/locales/ja.json
packages/web/src/i18n/locales/ko.json
packages/web/src/i18n/locales/metadata.ts
packages/web/src/i18n/locales/pl.json
packages/web/src/i18n/locales/presentation.ts
packages/web/src/i18n/locales/pt-BR.json
packages/web/src/i18n/locales/rulebook.ts
packages/web/src/i18n/locales/tr.json
packages/web/src/i18n/locales/uk.ts
packages/web/src/i18n/locales/zh-CN.json
packages/web/src/i18n/localization.css
packages/web/src/i18n/registry.ts
packages/web/src/i18n/render.test.tsx
packages/web/src/layout/AccountMenu.tsx
packages/web/src/layout/AppShell.test.tsx
packages/web/src/layout/app-shell.css
packages/web/src/lobby/RoomBrowser.tsx
packages/web/src/main.tsx
packages/web/src/pages/FigureSetPage.tsx
packages/web/src/pages/ProfilePage.tsx
packages/web/src/profile/Avatar.tsx
packages/web/src/profile/ProfileForm.tsx
packages/web/src/profile/ProfileRank.test.tsx
packages/web/src/profile/ProfileRank.tsx
packages/web/src/replay/replay.test.tsx
packages/web/src/styles.css
packages/web/tsconfig.json
scripts/runTests.mjs
```
