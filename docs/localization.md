# FATE localization

FATE uses a small synchronous React external store, `useI18n`, rather than
i18next. `Intl.PluralRules` selects plural forms. Translation resources are
bundled with the frontend; changing language never calls a translation service.

The canonical frontend registry is
`packages/web/src/i18n/registry.ts`. It defines the resource, native name and
direction for each language, in this stable order:

| Locale | Native name        | Direction |
| ------ | ------------------ | --------- |
| uk     | Українська         | LTR       |
| en     | English            | LTR       |
| pl     | Polski             | LTR       |
| de     | Deutsch            | LTR       |
| fr     | Français           | LTR       |
| es     | Español            | LTR       |
| pt-BR  | Português (Brasil) | LTR       |
| tr     | Türkçe             | LTR       |
| ja     | 日本語             | LTR       |
| ko     | 한국어             | LTR       |
| zh-CN  | 简体中文           | LTR       |
| he     | עברית              | RTL       |

English and Ukrainian remain the semantic sources. Existing screen text stays
in their original modules. `presentation.ts` contains formerly inline bilingual
game prompts, pending-roll labels and event messages. `metadata.ts` contains
hero names and ability descriptions formerly localized by EN/UK branches.
`rulebook.ts` preserves the original English and Ukrainian Markdown.

## Preference and fallback

The existing `FATE_LANGUAGE` localStorage preference persists guest selection.
The authenticated profile is authoritative after login. Settings and the profile
form use the same registry and existing `changePreference`/profile update path.
Storage failures do not prevent switching language.

`normalizeLanguage` accepts regional browser tags, underscores and the legacy
Hebrew `iw` tag. Portuguese defaults to Brazilian Portuguese. Bare `zh`, `zh-CN`,
`zh-SG` and `zh-Hans` select Simplified Chinese. Traditional Chinese tags
(`zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant`) remain unsupported and use English.
The public profile API accepts only the canonical tags from the table.

Missing translations fall back to English. A missing plural form uses English
plural rules when falling back, rather than using a category absent in English.
Missing English keys render their key so defects remain observable. Missing or
empty translations are test failures; fallback is for resilience.

The existing PostgreSQL `ProfileLanguage` enum requires the additive migration
`20261022090000_expand_profile_languages`. No preference table or competing
persistence mechanism is introduced. Prisma's `pt_BR` and `zh_CN` identifiers
map to stored/public `pt-BR` and `zh-CN`; DTO and repository conversion keep
those implementation identifiers off the wire. Deploy the migration and server
before deploying a frontend that saves the new preferences.

All 12 locale preferences, SQL enum labels and existing `en`/`uk` users were
verified on disposable PostgreSQL through the canonical integration runner;
see [DB verification and commands](localization-db-verification.md).

## Adding text and languages

1. Add semantic keys to English and Ukrainian, preserving existing wording.
2. Add each key to every resource in the registry. Use complete sentences with
   `{{name}}` interpolation; keep placeholder names unchanged.
   Keep single-line source entries as single translation units and let CSS wrap
   them. Do not paste batch identifiers or neighbouring labels into a value.
3. For counts, provide each category returned by
   `new Intl.PluralRules(locale).resolvedOptions().pluralCategories`.
   Polish/Ukrainian require `one`, `few`, `many`, `other`; Hebrew also needs
   `two`. CJK uses `other`. Call `t("group.label", { count })` without a suffix.
4. For a new language, register its native name, direction and resource once.
   Update the server preference list, enum, mappings and migration as needed.
5. Run `npm run -w web i18n:check` and the browser smoke below.

`translateForLanguage(locale, key, values)` supports formatters that receive an
explicit locale, including projected events. Avoid checking a language inside a
component to choose a visible string. Never translate usernames, lobby names,
room codes, revisions, database identifiers, or backend enum values.

## Formatting and domain presentation

Use the active locale with `Intl.DateTimeFormat`, `Intl.NumberFormat`,
`Intl.RelativeTimeFormat` and `Intl.ListFormat`. Existing history, profile,
statistics and leaderboard formatters already take the active language. Admin
timestamps and board zoom percentages now do as well. Search uses locale-aware
case folding; avoid forced uppercase or wide tracking for Turkish and CJK.

Backend API errors retain stable codes. Existing auth, profile, admin, match,
leaderboard and matchmaking error helpers map those codes to resource keys.
Form validation uses localized client labels/messages rather than displaying
raw schema diagnostics. The legacy realtime `localizeServerText` adapter still
accepts old server messages; it is a compatibility boundary, not a pattern for
new errors. New errors must carry a code. Backend logs, metrics and game rules
remain language independent.

Mode labels use `modes.*`, match types use `matchTypes.*`, statuses retain their
existing presentation maps, and rank badges use `ranks.*`. Keep FATE and
Glicko-2 unchanged. FATE is a multiplayer turn-based tactical game: use gaming
terminology, distinguish a ranked match from an evaluated item, and keep the
eight fantasy rank names concise and consistent. Proper hero names may retain
their established spelling; descriptions must explain the same rules.

## Typography and Hebrew

The original stack used Inter/system sans and Georgia display text, without
bundled CJK fonts. Script-aware fallbacks now include Yu Gothic/Meiryo/Hiragino,
Malgun Gothic/Apple SD Gothic Neo, Microsoft YaHei/PingFang SC, Noto CJK and
Hebrew system fonts. No font files, licenses or network font dependencies are
added. Actual glyph coverage depends on the operating system's installed fonts.

`updateDocumentLanguage` synchronizes both HTML `lang` and `dir` on startup and
every preference update. Hebrew mirrors the shell using logical positioning.
The board explicitly uses LTR so cells, coordinates and effects stay aligned;
language must never change game geometry. Technical inputs remain isolated LTR.
Translated buttons can wrap. CJK/Hebrew headings use script fallbacks and normal
tracking; locale-specific text is not forced through Turkish-unsafe uppercase.

## Verification

- `npm run -w web i18n:check`: frontend typecheck, complete key sets, nonempty
  strings, matching interpolation variables, plural coverage, persistence,
  locale normalization, Hebrew direction changes, profile decoding and rendering.
  Damaged encoding, import markers and accidentally merged label lines also fail.
- `npm run -w web test:i18n:e2e`: existing real browser shell/gameplay smoke plus
  the registry-driven desktop/tablet/mobile page matrix and representative
  German/CJK/Hebrew gameplay. Screenshots go under
  `packages/web/test-results/app-shell`.
  For a focused matrix, run `node node_modules/tsx/dist/cli.mjs
packages/web/scripts/app-shell-smoke.mjs --i18n --locales=he` from the repository
  root. The default matrix uses the entire registry.
- `npm run -w server test:profile`: accepted preference tags, Prisma/public tag
  round trips, repository writes and existing profile security checks.
- `npm run lint`, `npm test`, `npm run build`: normal repository checks.

Localization tests run in the normal frontend regression layer. Source-resource
completeness checks are structural; they do not certify translation quality.
The new resources include machine-assisted translation drafts with targeted UI,
rank and plural terminology corrections. A native-speaker review of long rule
and ability descriptions remains necessary before claiming editorial approval.
