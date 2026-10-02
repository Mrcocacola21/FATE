# FATE visual revamp

Implemented in the existing React/Tailwind interface. No dependencies or custom raster assets were added.

## 1. Original visual weaknesses

The audit found competing gold, violet, blue, and cyan treatments across the lobby, HUD, prompts, and ability cards. Bright borders and glows flattened the hierarchy. The board lacked a clear frame and contact depth; turn identity depended on several small badges. Supporting pages looked disconnected from the game. Existing responsive layouts, reusable components, artwork, and action VFX provided a strong foundation and were retained.

Baseline screenshots were captured before implementation. Review artifacts are local, ignored files under `packages/web/test-results/visual-revamp/`.

## 2. Design direction

Charcoal surfaces, ivory text, selective deep crimson for commitment and selection, and muted bronze for identity and current-turn cues. Static ambient lighting and subtle inset highlights establish depth. Serif headings and small tracked labels distinguish game identity from functional metadata. Light mode uses the same hierarchy with warm parchment surfaces.

## 3. Files changed

All application changes are inside `packages/web`; this document is the only additional documentation file.

| Area                 | Files (relative to `packages/web/`)                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation           | `src/visual-theme.css` (new), `src/styles.css`                                                                                                                                                                                                            |
| Shared interaction   | `src/ui/useDialogFocus.ts` (new), `src/ui/TacticalIcon.tsx` (new), `src/ui/BottomNav.tsx`                                                                                                                                                                 |
| Lobby and rules      | `src/components/Lobby.tsx`, `src/components/RulesModal.tsx`                                                                                                                                                                                               |
| Board and chronicle  | `src/components/Board.tsx`, `src/components/BoardMarkers.test.tsx`, `src/components/EventLog.tsx`                                                                                                                                                         |
| HUD and controls     | `src/game/components/GameTopBar.tsx`, `src/game/components/RightPanel/sections/BattleActionButtons.tsx`, `src/game/components/RightPanel/sections/BattleTurnButtons.tsx`                                                                                  |
| Match presentation   | `src/game/gameshell-content/components/GameShellBoardColumn.tsx`, `PlayersRosterSection.tsx`, `BattleEndScreen.tsx`, `PendingRollModal.tsx`, `GlobalPendingTaskLayer.tsx`, `RuleDeclarationChoicePanel.tsx` (the last five share the preceding directory) |
| Mobile               | `src/game/layout/MobileMatchLayout.tsx`                                                                                                                                                                                                                   |
| Setup and abilities  | `src/modes/DraftHeroPreview.tsx`, `src/modes/GameModeSelector.tsx`, `src/components/abilities/abilityDisplayTone.ts`                                                                                                                                      |
| Supporting pages     | `src/auth/AuthLayout.tsx`, `src/matches/MatchHistoryList.tsx`, `src/pages/MatchDetailsPage.tsx`                                                                                                                                                           |
| Browser verification | `scripts/visual-smoke.mjs` (new)                                                                                                                                                                                                                          |

The board test update replaces an assertion about a removed rounding utility with the existing semantic token-state attribute. Its terrain/token/badge layering assertions remain.

## 4. Design tokens

`visual-theme.css` centralizes RGB channel tokens so borders and overlays can share colors at different opacities:

- Surfaces: `--fate-bg`, `--fate-surface`, `--fate-raised`, `--fate-inset`.
- Hierarchy: `--fate-border`, `--fate-text`, `--fate-muted`.
- Accents: `--fate-crimson`, `--fate-crimson-hover`, `--fate-warm`, `--fate-success`, `--fate-danger`.
- Game identity: `--fate-p1`, `--fate-p2`, `--fate-tile-light`, `--fate-tile-dark`.
- Depth: `--fate-shadow`, `--fate-shadow-overlay`; glow stays at low opacity around selection.
- Geometry: 16px panel radius, 8px control radius, 4px spacing reference.
- Motion: `--fate-micro: 150ms`, `--fate-panel: 240ms`, and a shared ease-out curve.

Dark background/surface/raised levels are approximately `#0b0c0f`, `#18191d`, and `#202126`. Competing obsolete foundation definitions and unused gold variables were removed. Gameplay field and VFX styling remains in the original stylesheet.

## 5. Board improvements

The battlefield has a bronze frame, subtle bevel, quiet material lighting, inset shadow, and a grounded outer shadow. Neutral alternating cells leave pieces and legal actions prominent. Existing terrain images, grid size, coordinates, zoom/fit, orientation, pointer handlers, and hitboxes remain intact.

## 6. Pieces, selection, and action states

Pieces receive contact shadows and consistent owner rings. Idle hover lifts a token by 2px without interfering with existing action transforms. Crimson selection includes a small diamond; the active piece has a warm inset edge. Legal moves use dashed treatment and markers, attacks use danger tint and diamonds, ability areas use warm outlines, and invalid previews use dashed/hatch treatment. Existing preview kinds map to explicit complete CSS classes. Textual accessible cell descriptions remain available.

Existing movement, impact, ability, and death playback remains responsible for action acknowledgement; its timing was not changed.

## 7. HUD and player panels

A balanced P1/P2 identity strip uses the actual room player names, seat labels, a current-turn edge, and a small indicator. Inactive players retain their information. The roster follows the same active-state treatment. Match metadata is quieter, action controls have consistent hierarchy, and End Turn uses the shared primary action style.

## 8. Lobby

The command lobby has a stronger typographic introduction, quiet sigil treatment, and a clear room-browser/hosting hierarchy. Room cards derive available/full/playing presentation from existing state; occupied-seat markers supplement readable labels. Creation controls retain pending/disabled behavior and expose busy state. Empty and error states share the visual language.

## 9. Modals and supporting pages

Rules, seat selection, pending actions, and battle results share backdrop, surface, border, shadow, and entrance treatments. Rules content scrolls within the viewport. Rule declaration cards use the common selection language. The result screen has a ceremonial title and clearly ordered winner, reason, survivors, and next actions.

Login, registration, profile, public profile, history, and details inherit the shared information-page surface and typography. History metadata is quieter and match details distinguish the winner with a warm edge. Existing content, filters, pagination, form validation, loading, retry, and routing remain in place.

## 10. Motion

Controls use short hover/press transitions; cards subtly elevate; dialog and information surfaces enter with a 5px/opacity transition. The only new continuous animation is a small current-turn dot. There are no ambient particle systems, JavaScript animation loops, animation gates, or additional action delays. Existing gameplay VFX is retained.

## 11. Responsive behavior

Existing desktop columns, tablet stacking, mobile board fit, bottom sheets, and touch interactions remain. Compact player-strip spacing, wrapped information controls, two-column mobile history metadata, safe-area padding, and viewport-bounded dialogs improve small screens. Mobile navigation now uses consistent inline SVG strokes instead of unrelated Unicode symbols.

## 12. Accessibility and reduced motion

Shared focus-visible outlines, disabled treatment, and semantic selected/pressed/busy attributes supplement visual states. New dialog focus handling keeps Tab navigation inside, handles Escape where an existing close/collapse action exists, and restores the opener. Native radio groups retain their expected tab stop. Current turn, owner, selected state, and legal actions include labels, borders, or marker shapes as well as color.

Reduced motion disables the new entrance/dot animations, hover lifts, and transitions and preserves the existing VFX opt-out. A browser check caught and corrected stylesheet ordering that initially overrode this preference. Rules focus containment, Escape, and restoration were checked in the browser. This was a focused accessibility review, not a complete assistive-technology audit.

## 13. Dependencies

None added. System serif fonts, existing game assets, CSS, small inline SVGs, React, and the already installed `playwright-core` are sufficient. No font or image downloads were introduced.

## 14. Visual review

Browser captures cover 1920×1080, 1366×768, 820×1180, and 390×844. Reviewed lobby, active match, selected piece, move and attack previews, player roster, Rules dialog, result screen, login, registration, profile, populated match history, and match details. Dark account-page captures reuse the existing isolated browser-test fixtures; they do not add demo data to the product. Light lobby and existing light account/history/details renders were also reviewed.

The visual smoke asserts no horizontal page overflow and no browser runtime errors. Screenshots were inspected for clipping, hierarchy, and readable states. No quantitative frame-time benchmark was performed; the implementation adds no per-frame JavaScript work or large assets.

## 15. Commands executed

Required verification:

```powershell
npm run -w web typecheck
npm run lint
npm run build
npm run test
```

Additional checks:

```powershell
npm run -w web test:assets
npm run -w web test:auth:e2e
npm run -w web test:matches:e2e
npm run -w web test:multiplayer:e2e
node packages/web/scripts/visual-smoke.mjs
git -c core.safecrlf=false diff --check
```

The broader existing presentation suite was run from `packages/web` to use its JSX configuration:

```powershell
node ../../node_modules/tsx/dist/cli.mjs --test src/store.selection.test.ts src/game/gameshell-content/cellHandlers.test.tsx src/game/gameshell-content/components/*.test.tsx src/game/layout/*.test.tsx src/layout/*.test.tsx src/game/hooks/useBoardFit.test.ts src/modes/*.test.ts* src/assets/*.test.ts* src/components/BoardMarkers.test.tsx src/game/components/RightPanel/*.test.tsx src/game/components/RightPanel/sections/PlacementSection.test.tsx src/game/targeting/*.test.ts src/game/abilityDisplayDetails.test.tsx src/game/effects/*.test.ts src/features/vfx/*.test.ts*
```

Local review also used `npm run dev`, an owned temporary PostgreSQL container, `npm run -w server db:migrate:deploy` against that isolated database, and `npm run -w server start`. Temporary copies of the existing auth/history smoke scripts captured additional dark account pages at all four sizes. Test services and the container were stopped after review.

## 16. Verification results

- Web typecheck: passed, exit 0.
- ESLint: passed, exit 0, **0 errors and 0 warnings**.
- Production build: passed, exit 0. Vite built in 6.55s; CSS gzip 23.90 kB and JavaScript gzip 306.80 kB. Existing Vite CJS deprecation, stale Browserslist data, and the >500 kB chunk advisory remain.
- Root test command: passed, exit 0; rules, boundary, server, and web auth/profile/matches suites completed. The web portion passed 57 tests with 0 failures and 0 skips.
- Targeted existing web suite: **262 passed, 0 failed, 0 skipped**.
- Asset suite: **29 passed, 0 failed**.
- Auth/profile browser suite: passed registration, refresh/cookie/session restore, profile editing and privacy, localization, logout, and room-preserving auth flows.
- Match-history browser suite: passed persisted results, filtering, pagination, reload, details, and public/logout flows.
- Multiplayer browser suite: passed authenticated seats, spectator entry, startup, refresh/resume, and logout flows.
- Visual smoke: passed all four viewport sizes, overflow/runtime-error assertions, Rules keyboard handling, and reduced-motion check.
- Diff whitespace check: passed.

One intermediate build encountered a Windows Prisma DLL lock while the review server was running. The server was stopped before the final rerun. The initial root-directory invocation of the additional JSX tests used the wrong configuration; the corrected web-directory run is the 262-test result above.

## 17. Deliberately retained

Gameplay rules and timing, state/store logic, server authority, WebSocket messages, reconnect/resume contracts, authentication, cookies, persistence/schema/migrations, routing, localization content, existing figures and board assets, VFX/SFX behavior, interaction model, and information architecture. No new product feature or production data was introduced. Existing bundle splitting and build-tool advisories were outside this visual pass.

## 18. Optional future custom assets

A bespoke board material texture, consistent high-resolution hero portrait crops, and an original FATE crest could strengthen the identity further. These would need an art pass and approval of the actual assets; the current result does not depend on them.
