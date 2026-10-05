Both Sans fixes are implemented. Existing workspace edits were preserved.

Last Attack's root cause was a post-death implementation: lethal damage cleared the unit's alive flag and board position, and the passive listened to unitDied events and silently selected a deterministic fallback target. There was no mandatory owner decision. The new shared death hook holds Sans before removal, creates selectLastAttackTarget through the existing authoritative pending-choice system, and applies the selected enemy's curse before emitting Sans's death. Ordinary actions remain blocked. Suspended combat rolls and round transitions resume after the choice. No living enemies means death finishes without a prompt. The existing Unbeliever unlock requirement remains unchanged.

The authoritative curse uses sansLastAttackCurseSourceId. It ticks only after a valid start of that unit's own turn, before other start-of-turn effects. A turn-number guard prevents a second tick when a manual Storm save pauses and resumes activation. Each tick deals exactly one damage while HP exceeds one. The curse clears at one HP, including when another effect brings the target to one HP. It cannot kill its target.

Gaster Blaster's root cause was reuse of collectMettatonLineTargetIds and normal Archer-style line validation. Those intentionally stopped scanning at the first enemy; target collection also included allies, and the ability explicitly allowed friendly targets. Sans now uses full-ray geometry and a separate enemy-only collector that scans to the board edge, including multiple occupants of a cell. Normal Archer scanning was left unchanged. The existing Charge(2) spending and shared attacker roll with individual defender rolls remain authoritative and manual.

The web client shows the Last Attack instruction, highlights legal positioned targets, sends the target choice, and provides target buttons for enemies without a visible board position. It does not apply curses locally. Event logs show curse application, damage, and expiry using projected unit names. Gaster Blaster targeting and previews include the whole ray and exclude allies.

Added ten deterministic rules regressions in packages/rules/src/tests/heroes/sans.regression.test.ts:

- sans_last_attack_creates_target_choice_before_death
- sans_curse_deals_one_damage_at_target_own_turn_start
- sans_curse_stops_at_one_hp
- sans_last_attack_skips_if_no_enemy_exists
- gaster_blaster_pierces_multiple_enemies
- normal_archer_attack_still_stops_at_first_enemy
- gaster_blaster_does_not_attack_allies
- sans_last_attack_suspends_queued_roll_and_keeps_hidden_enemies_legal
- sans_curse_turn_start_continuation_and_active_death
- sans_last_attack_defers_round_advance

The first regression also verifies blocked actions, invalid selections, wrong-owner rejection, no immediate curse damage, event ordering, and resumption. Existing Sans tests were updated to explicitly select a target and assert that Gaster Blaster spares allies, retaining their other assertions. Three web regressions cover authoritative target clicks and both previews. Two server regressions cover authenticated owner selection, projected curse state, and snapshot persistence.

Verification completed successfully:

- npm run -w rules test — full suite passed.
- npm run build — rules/server compilation, web typecheck, and Vite production build passed.
- npm run -w web test:shared-cell-targeting — 8 passed.
- npm run -w web test:previews — 40 passed.
- npm run -w web test:action-ui — 55 passed.
- npm run -w web test:i18n — 5 passed.
- npx tsx --tsconfig tsconfig.tests.json --test packages/server/src/tests/sans.test.ts — 2 passed.
- npx tsx --tsconfig tsconfig.tests.json packages/server/src/tests/hardening.test.ts — passed.
- npx tsx --tsconfig tsconfig.tests.json packages/server/src/tests/matchSnapshot.test.ts — passed.
- git diff --check — passed.

The build reported existing Vite CJS deprecation, outdated Browserslist data, and large-chunk warnings.

Files changed for this task (including files that already contained unrelated edits, excluding unrelated-only changes):

- [packages/rules/src/death.ts](../packages/rules/src/death.ts)
- [packages/rules/src/abilities/specs/part3.ts](../packages/rules/src/abilities/specs/part3.ts)
- [packages/rules/src/actions/heroes/chikatilo/postAction.ts](../packages/rules/src/actions/heroes/chikatilo/postAction.ts)
- [packages/rules/src/actions/heroes/lechy/storm.ts](../packages/rules/src/actions/heroes/lechy/storm.ts)
- [packages/rules/src/actions/heroes/newBatch.ts](../packages/rules/src/actions/heroes/newBatch.ts)
- [packages/rules/src/actions/heroes/papyrus/state.ts](../packages/rules/src/actions/heroes/papyrus/state.ts)
- [packages/rules/src/actions/heroes/sans/curses.ts](../packages/rules/src/actions/heroes/sans/curses.ts)
- [packages/rules/src/actions/heroes/sans/effects.ts](../packages/rules/src/actions/heroes/sans/effects.ts)
- [packages/rules/src/actions/heroes/sans/offense.ts](../packages/rules/src/actions/heroes/sans/offense.ts)
- [packages/rules/src/actions/heroes/sans/state.ts](../packages/rules/src/actions/heroes/sans/state.ts)
- [packages/rules/src/actions/registry.ts](../packages/rules/src/actions/registry.ts)
- [packages/rules/src/actions/turnActions/startTurn.ts](../packages/rules/src/actions/turnActions/startTurn.ts)
- [packages/rules/src/combat/stateHit.ts](../packages/rules/src/combat/stateHit.ts)
- [packages/rules/src/core/combat/stakeUtils.ts](../packages/rules/src/core/combat/stakeUtils.ts)
- [packages/rules/src/core/rolls/pendingRollContext.ts](../packages/rules/src/core/rolls/pendingRollContext.ts)
- [packages/rules/src/gameOver.ts](../packages/rules/src/gameOver.ts)
- [packages/rules/src/jackSnares.ts](../packages/rules/src/jackSnares.ts)
- [packages/rules/src/model/actions.ts](../packages/rules/src/model/actions.ts)
- [packages/rules/src/model/roll.ts](../packages/rules/src/model/roll.ts)
- [packages/rules/src/model/unit.ts](../packages/rules/src/model/unit.ts)
- [packages/rules/src/pendingRoll/resolvePendingRoll/heroCases.ts](../packages/rules/src/pendingRoll/resolvePendingRoll/heroCases.ts)
- [packages/rules/src/ruleDeclarations/index.ts](../packages/rules/src/ruleDeclarations/index.ts)
- [packages/rules/src/sans.ts](../packages/rules/src/sans.ts)
- [packages/rules/src/stealth/collision.ts](../packages/rules/src/stealth/collision.ts)
- [packages/rules/src/tests/heroes/sans.test.ts](../packages/rules/src/tests/heroes/sans.test.ts)
- [packages/rules/src/tests/heroes/sans.regression.test.ts](../packages/rules/src/tests/heroes/sans.regression.test.ts)
- [packages/rules/src/tests/index.ts](../packages/rules/src/tests/index.ts)
- [packages/rules/src/view/pending.ts](../packages/rules/src/view/pending.ts)
- [packages/server/src/schemas.ts](../packages/server/src/schemas.ts)
- [packages/server/src/persistence/snapshotStateV1.ts](../packages/server/src/persistence/snapshotStateV1.ts)
- [packages/server/src/tests/sans.test.ts](../packages/server/src/tests/sans.test.ts)
- [packages/server/src/openapi/generated/responses.json](../packages/server/src/openapi/generated/responses.json)
- [packages/web/src/components/EventLog.tsx](../packages/web/src/components/EventLog.tsx)
- [packages/web/src/game/gameshell-content/buildHighlightedCells.ts](../packages/web/src/game/gameshell-content/buildHighlightedCells.ts)
- [packages/web/src/game/gameshell-content/cellHandlers.ts](../packages/web/src/game/gameshell-content/cellHandlers.ts)
- [packages/web/src/game/gameshell-content/cellHandlers.test.tsx](../packages/web/src/game/gameshell-content/cellHandlers.test.tsx)
- [packages/web/src/game/gameshell-content/components/CurrentTaskPanel.tsx](../packages/web/src/game/gameshell-content/components/CurrentTaskPanel.tsx)
- [packages/web/src/game/gameshell-content/components/PendingBoardNotice.tsx](../packages/web/src/game/gameshell-content/components/PendingBoardNotice.tsx)
- [packages/web/src/game/gameshell-content/components/SidePanelTabs.tsx](../packages/web/src/game/gameshell-content/components/SidePanelTabs.tsx)
- [packages/web/src/game/gameshell-content/helpers.ts](../packages/web/src/game/gameshell-content/helpers.ts)
- [packages/web/src/game/gameshell-content/hooks/useGameShellAbilityModeTargets.ts](../packages/web/src/game/gameshell-content/hooks/useGameShellAbilityModeTargets.ts)
- [packages/web/src/game/gameshell-content/hooks/useGameShellPendingStatus.ts](../packages/web/src/game/gameshell-content/hooks/useGameShellPendingStatus.ts)
- [packages/web/src/game/targeting/buildActionPreview.ts](../packages/web/src/game/targeting/buildActionPreview.ts)
- [packages/web/src/game/targeting/buildAbilityPreview.ts](../packages/web/src/game/targeting/buildAbilityPreview.ts)
- [packages/web/src/game/targeting/buildPendingPreview.ts](../packages/web/src/game/targeting/buildPendingPreview.ts)
- [packages/web/src/game/targeting/boardPreview.test.ts](../packages/web/src/game/targeting/boardPreview.test.ts)
- [packages/web/src/i18n/eventMessages.ts](../packages/web/src/i18n/eventMessages.ts)
- [packages/web/src/i18n/displayMetadata.ts](../packages/web/src/i18n/displayMetadata.ts)
- [packages/web/src/i18n/locales/en.ts](../packages/web/src/i18n/locales/en.ts)
- [packages/web/src/i18n/locales/uk.ts](../packages/web/src/i18n/locales/uk.ts)
- [docs/sans-fix-report.md](sans-fix-report.md) — this report.

