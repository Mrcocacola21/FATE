# Подключение expansion VFX

Все 296 expansion PNG привязаны к игре. Исправлены пропуски Полководца у Гриффита и Грозного, защита превращённого Кайзера; существующий shift Андайн также подключён. Прежний вывод о четырёх блокерах исправлен. Полная визуальная QA всех игровых веток ещё не закрыта.

| Герой | Найдено | Зарегистрировано | Привязано | Проверено поведением | Просмотрено визуально | Остаток привязки / поведения |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| artemida | 10 | 10 | 10 | 10 | 10 | 0 |
| asgore | 14 | 14 | 14 | 14 | 14 | 0 |
| chikatilo | 9 | 9 | 9 | 9 | 9 | 0 |
| donKihote | 8 | 8 | 8 | 8 | 8 | 0 |
| duolingo | 10 | 10 | 10 | 10 | 10 | 0 |
| elCidCompeador | 8 | 8 | 8 | 8 | 8 | 0 |
| femto | 9 | 9 | 9 | 9 | 9 | 0 |
| frisk | 10 | 10 | 10 | 10 | 10 | 0 |
| genghisKhan | 8 | 8 | 8 | 8 | 8 | 0 |
| grand-kaiser | 15 | 15 | 15 | 15 | 15 | 0 |
| griffith | 7 | 7 | 7 | 7 | 7 | 0 |
| grozny | 12 | 12 | 12 | 12 | 12 | 0 |
| guts | 12 | 12 | 12 | 12 | 12 | 0 |
| hassan | 10 | 10 | 10 | 10 | 10 | 0 |
| jackRipper | 11 | 11 | 11 | 11 | 11 | 0 |
| jebe | 10 | 10 | 10 | 10 | 10 | 0 |
| kaladin | 10 | 10 | 10 | 10 | 10 | 0 |
| kaneki | 10 | 10 | 10 | 10 | 10 | 0 |
| lechy | 14 | 14 | 14 | 14 | 14 | 0 |
| loki | 12 | 12 | 12 | 12 | 12 | 0 |
| luche | 9 | 9 | 9 | 9 | 9 | 0 |
| mettaton | 12 | 12 | 12 | 12 | 12 | 0 |
| odin | 9 | 9 | 9 | 9 | 9 | 0 |
| papyrus | 12 | 12 | 12 | 12 | 12 | 0 |
| riverPerson | 8 | 8 | 8 | 8 | 8 | 0 |
| sans | 10 | 10 | 10 | 10 | 10 | 0 |
| undyne | 11 | 11 | 11 | 11 | 11 | 0 |
| vladTepes | 10 | 10 | 10 | 10 | 10 | 0 |
| zoro | 6 | 6 | 6 | 6 | 6 | 0 |
| **Всего** | **296** | **296** | **296** | **296** | **296** | **0** |

«Просмотрено визуально» — реальный просмотр средних кадров всех PNG на поле свежего production preview, включая направление снарядов и стально-красную палитру Кайзера. Это не отметка полного просмотра каждой анимации в живом матче. В JSON это разделено полями visual.reviewed и visual.fullRuntimeQa.

Expansion PNG: 296; expansion-определений реестра: 296; PNG с проверенными игровыми маршрутами: 296. Фазы, маршруты и состояния перечислены отдельно в integration-state.json; эти числа не означают столько же способностей или событий.

## Точные блокеры

Неподключённых expansion PNG нет. Статус поведенческой проверки и визуальной QA указан отдельно выше.

Следующая партия: Следующая партия полной анимационной QA — 11 уникальных PNG Loki/Duolingo/Frisk (nextBatchEffectIds): просмотр целиком от старта до исчезновения, восстановление/снятие статусов и разрешённые получатели. Прежние пропуски аур Griffith/Grozny, защиты превращённого Кайзера и shift Андайн закрыты в v19. Средние кадры просмотрены; полный ручной сетевой матч двух игроков не выполнен.

## Четыре новых сигнала

- Локи: lokiGreatJokeCommitted только после принятой ветки greatLokiJoke и списания 15; разрешённые sourceCell/radius зафиксированы в rules. Сигнал общего каста не обещает превращение всех целей.
- Дуолинго: duolingoBerserkerUnlocked на первом false→true при 12 Missed Lessons — оба действующих пути (промах и начало хода). Snapshot/reconnect не запускают unlock; прежний постоянный berserker сохранён.
- Фриск: attackResolved.defenseSignature=friskCleanSoulBreak только при реальном расходе щита и предотвращённой атаке; Cry/Substitution и обычный miss различаются. Исход, HP и RNG проверены.
- Речной человек: riverStormWard в фазе фактически предотвращённого стартового воздействия активного шторма вне леса; guard на номер хода исключает повтор. Без броска, урона или лечения.

## Проверки

- node scripts/vfx-integration-inventory.mjs — PASS: 296 PNG / 29 профилей; SHA-256, размеры кадров, все манифесты и оба исторических отчёта согласованы; PNG не изменены.
- npm run test:effects --workspace packages/web — PASS, 318/318, включая отсутствие дублей следа/deploy и одно приземление в конце пути (staging-effects.log).
- npm run test:presentation:assets --workspace packages/web — PASS (staging-assets.log).
- npm run test:rules — PASS, 3 набора (final-rules.log); отдельный --expansion-signals проверяет принятие/отказ/повтор/RNG/owner/opponent/spectator и завершение Don Madness.
- npm run test:contract — PASS, 20 наборов; актуальные generated OpenAPI response schemas проверены (final-contract.log).
- npm run test:snapshots --workspace packages/server — PASS; serialization round-trip включает новые blindSourceId/immobilizedSourceId/movementDisabledSourceId (final-snapshots.log).
- npm run lint; npm run typecheck; npm run build — PASS (staging-lint.log, staging-typecheck.log, staging-build.log).
- npm run test:vfx:coverage:production --workspace packages/web — PASS на свежей production-сборке: 327 проверенных определений, включая все 296 expansion; обе ориентации, слои/кадры, разрешённые статусы, phone/reduced motion (final-browser-production.log).
- npm run test:vfx:expansion:game --workspace packages/web — PASS: 222 сценария на настоящем Board из 37 rules-produced fixtures × 3 получателя × 2 viewport/motion. Локальный click/deselect, active-phase opacity, duplicate, expiry, reconnect, бюджет памяти (final-browser-game.log).
- node packages/web/scripts/vfx-expansion-game-smoke.mjs --review-samples — PASS, ещё 30 целевых наблюдений; просмотрены скриншоты четырёх новых сигналов и обычного движения, включая обратную ориентацию и phone/reduced motion. Проверяется декодированная отрисовка в активной фазе, не только DOM очереди (final-browser-review-samples.log).
- Реально просмотрены 29 контактных листов / 296 PNG со средними кадрами свежего production preview. Это визуальная оценка арта, не автоматическая отметка полного игрового QA. Артефакты: packages/web/test-results/vfx-coverage/browser-production/contact-sheets/.
- Deploy/move v2: 318/318 test:effects, test:presentation:assets, root lint/typecheck/build PASS; source PNG hashes unchanged. See staging-*.log and DEPLOY_MOVE_REVIEW_RU.md for real Board review scope.
- Deploy/move v2: real Board staging matrix 402/402; commander aura alignment 72/72, owner/opponent/spectator, desktop/phone reduced motion. Nine actual Board contact sheets reviewed. Fresh production 327 definitions: staging-production.log.
- Deploy sync v3: 321/321 test:effects; presentation assets, root lint/typecheck/build PASS (deploy-sync-*.log). PNG hashes unchanged.
- Deploy sync v3: real Board matrix 402/402 + snapshot-before-event deployments 168/168; no extra frame polling; desktop/phone reduced motion, P1/P2/spectator. All 28 deployment midpoints reviewed; Genghis dark-board sequence reviewed at 16/80/180/360/560ms. Fresh production coverage: deploy-sync-production.log.
- Aura/entry v4: 325/325 effects tests, presentation asset audit, root lint/typecheck/build PASS; source PNG hashes unchanged (aura-entry-*.log).
- Aura/entry v4: 402/402 real Board cases, decoded portraits and stable DOM checked, six commander fields cover all radius-one neighbors, both board orientations/phone reduced motion, duplicate/reconnect/expiry. Two controlled cold/expired portrait cases and a 2-scene dark Genghis aura/entrance timeline passed. Fresh production coverage 327/327. Full manual network match remains open.
- Reveal/selection v5: effects 326/326, asset audit, root lint/typecheck/build PASS; all 296 source PNG hashes preserved (reveal-selection-*.log).
- Reveal/selection v5: 402/402 actual Board cases; portrait opacity 0/half/peak/after and shared light peak, no first-frame retry; selection contour all 29 profiles and 39 hero/form/Chicken scenes; both orientations, phone/reduced motion, P1/P2/spectator, duplicate/reconnect/cleanup. Fresh production coverage 327/327. Actual server Kaiser spawn and placeUnit recorded separately with real clocks; source events retained.
- Reveal/selection v5: 168/168 placements with ahead snapshot; two controlled cold/expired portrait counterexamples passed on current source. Selection opacity follows token reveal and its masked center leaves portraits clear; source PNGs unchanged.
- Commander art v6: effects 326/326, presentation asset audit, root lint/typecheck/build PASS; source inventory remains 296 PNG / 29 profiles with unchanged SHA-256 (aura-art-*.log).
- Commander art v6: actual Board 72/72 commander cases + 12/12 dark original-art timeline cases; fixed visual center, six styles, both orientations, P1/P2/spectator and phone/reduced motion. All six original rings viewed in three phases. Fresh production coverage 327/327. The three existing rules/art blockers and broader full-animation QA remain open.
- Commander badge v7: effects 329/329, i18n 5/5, presentation asset audit, root lint/typecheck/build PASS. Actual Board commander smoke 72/72; exactly two neighboring ally flag icons in Genghis placement, none on self; owner/opponent/spectator, orientations and phone/reduced motion. Fresh production coverage 327/327 (commander-badge-*.log). No rules, events, PNG or SFX changes.
- Long movement v8: effects 332/332, SFX 66/66, asset audit, root lint/typecheck/build PASS; generic trail tones and reduced-motion endpoint color survive production CSS scan. Source PNG hashes unchanged (long-move-*.log).
- Long movement v8: 84/84 actual Board cases: base Rider/Assassin and Genghis/Don/Hassan/Jack/Chikatilo, real short/long actions, both orientations, three recipients, desktop and phone/reduced motion, quarter/mid/three-quarter wake paint, token alignment, single reached arrival, duplicates, snapshot/reconnect and cleanup. Existing movement browser smoke passed including forced/teleport and stake/snare reached timing. Seven long routes visually reviewed in three phases; five thematic trail PNG, two common base effects. Fresh production coverage 327/327. Broader original QA/blockers preserved.
- Deposited wake v9: effects 334/334; asset audit, root lint/typecheck/build PASS (wake-*.log). 126 real Board long/short cases: desktop, animated phone, phone/reduced motion, P1/P2/spectator; stationary fragments, transparent future/expired deposits, visible passed positions, actual token positions, one unchanged arrival, duplicates, reconnect/snapshot, cleanup. All 67 profile/form owner desktop staging cases PASS. Fresh production coverage 327/327. Five thematic trail PNG visually reviewed in three phases on desktop and animated phone; broader original QA and blockers preserved.
- Attack swings v10: effects 336/336; SFX 66/66; full rules 3 suites and contract PASS; asset audit, root lint/typecheck/build and fresh production 327 definitions PASS (swing-*.log). Real Board 261 scenarios: 27 swing PNG + vertical/diagonal examples, P1/P2/spectator and desktop/animated phone/phone reduced motion; direction, source pivot, shared release/outcome, no early impact, no duplicate and cleanup/reconnect. All 27 source PNG visually reviewed on actual owner Board desktop/phone release midpoints. Full-animation/manual-network QA and earlier blockers preserved.
- Target cuts v11: effects 338/338; SFX 66/66; asset audit, root lint/typecheck/build and fresh production 327 definitions PASS (melee-*.log). 270 real Board swing scenarios plus 81 timeline cases: 27 PNG, three recipients, desktop/phone/reduced motion; target-centered trace, fixed X/Y reflection, attack facing, hit/miss, phase, duplicate, reconnect and cleanup. All 27 PNG sampled visually on desktop/phone; nine representative timelines inspected, Guts recorded normal/x4. Full manual network QA and original blockers preserved.
- Adjacent melee lunge v12: 341 effects tests, 270 real Board scenarios, asset audit, root lint/typecheck/build and fresh production 327 definitions PASS (lunge-*.log). Small directional token thrust peaks at unchanged contact, returns over 80ms; no tactical movement, additional timer, projectile thrust or reduced-motion travel. All 27 thematic releases sampled on desktop/phone; Guts recorded normal/x4. Rules, SFX routes, PNG and wider QA/blockers preserved.
- Readable melee v13: effects 345/345, SFX 66/66, asset audit, root lint/typecheck/build and fresh production 327 definitions PASS (readable-*.log). All 270 real Board cases pass at 420ms melee contact, 260ms trace and 220ms return/decay; ranged and reduced motion keep timing. All 27 PNG sampled on desktop/phone; new Guts normal/x4 capture. Rules, PNG, SFX routing and wider QA/blockers preserved; earlier 27-clip gallery is historical faster footage.
- Readable projectiles v14: effects 350/350, SFX 66/66, asset audit, root lint/typecheck/build and fresh production coverage 328 definitions PASS (projectile-*.log). 333 real Board scenarios across 37 accepted routes and 27 repeat contrast scenarios, all three recipients and desktop/phone/reduced motion. Seven unchanged expansion projectile PNG, base Archer and real Guts/Undyne ranged flights; hit/miss/duplicates/reconnect/cleanup. Original 296 SHA-256 unchanged; no rules/SFX edits. Midpoint contact sheets and Kaiser normal/x4 recorded; no manual network match or claim of complete per-hero QA.
- Attack outcome v15: effects 355/355, SFX 66/66, full rules 3 suites, network/OpenAPI contracts 20 suites, assets, root lint/typecheck/build and fresh production 330 definitions PASS (outcome-*.log). 765 actual Board cases: 405 result/defense/palette, 270 melee, 72 Kaiser flight and 18 native Zoro hit/miss. All 29 guard palettes and 27 melee PNG sampled visually; exact prevention/reduction/path semantics preserve results/RNG/resources. No PNG or SFX edits; 296 SHA-256 unchanged. Three previous blockers and full manual network/unique-animation QA remain open.
- Slash facing v16: effects 355/355, actual Board 81 cases (eight directions plus miss, three recipients, desktop/phone/reduced motion), assets, root lint/typecheck/build and fresh production 330 definitions PASS (facing-*.log). Shared orientation updated for 27 melee PNG; eight-direction Guts desktop/phone sheets inspected. No PNG/rules/SFX changes; prior blockers and full manual unique-animation/network QA stay open.
- Slash reference v17: effects 355/355, actual Board 162 cases (Genghis Khan and Guts, eight directions plus miss, three recipients, desktop/phone/reduced motion), assets, root lint/typecheck/build and fresh production 330 definitions PASS (facing-reference-*.log). Shared orientation updated for 27 melee PNG; eight-direction Genghis Khan and Guts desktop/phone sheets inspected. No PNG/rules/SFX changes; prior blockers and full manual unique-animation/network QA stay open.
- Melee normalization v18: effects 357/357 including actual PNG geometry; Board 387 cases covering all 27 melee strips plus 81 reveal/contact/decay timeline cases; assets, root lint/typecheck/build and fresh production 330 definitions PASS (melee-normalization-*.log). All 27 raw strips and normalized reference attacks visually sampled on desktop/phone. PNG/SFX/rules unchanged; prior blockers and full manual unique-animation/network QA remain open.
- Slash videos v18: all 27 current normalized melee variants recorded on the actual Board at 60fps, normal and x4 slow, with labels, posters, gallery and a 162s compilation. 81 individual MP4 files plus compilation verified with ffprobe; all master frames decoded; all 296 PNG SHA-256 unchanged. Game source/PNG/SFX unchanged during capture. User visual approval remains pending; old recordings preserved.
- Connection recheck 2026-10-21: 433 hero PNG; expansion 293/296 behavior verified, 3 known rule blockers; legacy 136/137 registered (Undyne shift missing mechanic); SHA unchanged; effects 357/357, BoardMarkers 16/16, assets PASS. [Подробный остаток и ограничения QA](CONNECTION_RECHECK_RU.md).
- Feature corrections v19: 296/296 expansion PNG bound/behavior verified; Undyne shift also live. Effects 359/359, rules 3 suites, contract 20 suites, lint/typecheck/build/assets PASS; Board 36 scenarios; fresh production 331 definitions PASS. [Исправления механик и прежнего аудита](FEATURE_CORRECTIONS_RU.md). Full visual QA remains open.

## Ограничения и особенности маршрутов

- Автоматический Board smoke использует результаты rules и проекции получателей. Ручной сетевой матч двух игроков не проводился; полный просмотр всех фаз каждой уникальной ветки остаётся открытым. Поведенческий verified не закрывает эту визуальную работу.
- У Loki/Duolingo/Lechy/Sans обычное движение в правилах — телепорт: обычный след не рисуется. Их move_trail/move_arrive доступны на подтверждённой обычной ходьбе в состоянии Chicken; это проверено реальным rules-действием, а не заменой семантики телепорта.
- У Кайзера enterStealth — Bunker. Его stealth_enter связан только с реальным разрешённым владельцу результатом Lunar Eclipse; Bunker не изображается невидимостью.
- Постоянные статусы восстанавливаются из разрешённого PlayerView с идентификатором источника и снимаются со статусом/источником/видимостью. Выбор — статичный слой локального Board.selectedUnitId, без сетевого события.
- Все 296 expansion PNG имеют игровые привязки. По уточнению пользователя исправлены пропуски Полководца у Griffith/Grozny и защиты превращённого Кайзера; полная визуальная QA остаётся отдельной работой.
- Undyne shift.png вне expansion подключён к уже существующему общему отталкиванию после успешной защиты. Принятый выбор имеет разрешённую подпись undyneSwitchDirection; отдельная новая механика не вводилась.
- Base-ассеты исключены пользователем. Исходные PNG, import-манифесты, исторические отчёты и SFX-интеграция сохранены. Новые фазы используют существующие presentation-часы и очередь; Carpet/Dora сохраняют impact/audio на общей границе.

## Исправление четырёх прежних пропусков — v19

Гриффит до Rebirth и Грозный дают Полководца: +1 урона соседним союзникам, живая аура радиуса 1 и значок поддержки. Фемто не наследует ауру. Превращённый Кайзер при 6 зарядах может выбрать автоматическую защиту берсерка и получает тематический эффект. Undyne shift.png подключён к уже существующему принятому отталкиванию с разрешённой подписью undyneSwitchDirection; новая отдельная механика не вводилась.

Все 296 expansion PNG привязаны и проверены поведением; зарегистрированы все 137 прежних геройских PNG. Проверки: 359 effects-тестов, rules (3 набора), contract (20 наборов), lint/typecheck/build/assets; 36 браузерных сценариев для четырёх исправленных маршрутов и свежий production preview (331 определение). Просмотрены средние кадры на desktop/phone, обе ориентации и reduced motion; полный ручной просмотр всех анимаций и сетевой матч остаются открытыми.

Подробности и несоответствие рисунка undyne/shift.png манифесту: [FEATURE_CORRECTIONS_RU.md](FEATURE_CORRECTIONS_RU.md). Предыдущий CONNECTION_RECHECK_RU.md сохранён как история с пометкой об исправлении. PNG и SFX не менялись. Следующие разделы описывают предыдущие проходы v1–v18; их старые числа и блокеры не заменяют текущую таблицу и этот раздел.

## Доработка deploy и движения

Deploy и движение переработаны для всех профилей и шести форм: тематический эффект окружает портрет, след проходит позади у основания, приземление происходит один раз в конце пути. Размеры и плотность различаются между героями. Общие дубли линии/пульса убраны только там, где есть тематический эффект.

Актуализировано записей PNG: 92. Подробности проверки: [DEPLOY_MOVE_REVIEW_RU.md](DEPLOY_MOVE_REVIEW_RU.md). Это не закрывает перечисленную выше QA остальных уникальных способностей и три rules-блокера.

## Живая аура — версия v4

Командирская аура восстановлена как область 3×3, радиус 1 по Чебышёву: восемь соседних клеток вместе с диагоналями, с обрезкой у границы поля. Мягкая подсветка дышит, свет проходит по краю, волна расходится от источника. Поддержаны шесть действующих командиров; механика и два прежних блокера аур Griffith/Grozny не менялись. Компактный маркер v3 отменён.

Портреты заранее прогреваются только из разрешённого состава/PlayerView. Deploy применяет одну непрерывную анимацию появления ко всей композиции с токеном, свечением и тематическим strip. Сам токен сохраняется при старте и очистке. Пока портрет не декодирован, круг/аура не играют отдельно; поздняя загрузка не перезапускает прошедшую фазу. Reduced motion оставляет спокойное проявление и неподвижное поле.

Проверки: 325 effects-тестов; 402 сценария реального Board для всех 28 deploy/движений и шести аур, оба разворота, phone/reduced motion, три получателя. Два браузерных сценария с намеренно задержанным HTTP портрета; последовательности появления и пульсации Чингисхана просмотрены отдельно. Логи: aura-entry-*.log. Свежая production-проверка — 327 определений. Полный ручной сетевой матч и QA остальных уникальных веток остаются открытыми.

## Проявление токена и размер колец — версия v5

Токен начинает подтверждённый deploy с opacity 0 и плавно достигает 100% к самому яркому кадру конкретного strip. Мягкая вспышка достигает пика одновременно. Далее токен остаётся видимым, пока эффект затухает. Длительность увеличена примерно на 20% (720–860 мс), размер эффекта — примерно на 9%; размер самой фигуры сохранён. Reduced motion ограничивает проявление 120 мс. Начальный кадр очереди публикуется до отрисовки, поэтому короткое размещение не теряет эффект; правила не ждут анимацию.

Для всех 29 select_ring убраны прозрачные поля исходного холста: видимый контур занимает 98% клетки. Он поднят над подложкой, центр оставляет портрет открытым, HP и тактический UI остаются поверх; общая рамка смягчена только у выбранных героев с тематическим кольцом. Кольцо следует отрисованной позиции и движению фигуры, при deploy проявляется вместе с токеном; не появляется заранее из опережающего snapshot или до декодирования портрета. Смена выбора, смерть, потеря видимости и смена сессии снимают его.

Проверки: 326 effects-тестов; 402 браузерных сценария реального Board, все 28 deploy, оба разворота и phone/reduced motion, три получателя; opacity проверяется в начале, середине, пике и после. Просмотрены 39 сцен выбора (29 профилей, шесть форм, четыре Chicken). Свежая production-проверка — 327 определений. Логи: reveal-selection-*.log. Подробности: [DEPLOY_MOVE_REVIEW_RU.md](DEPLOY_MOVE_REVIEW_RU.md).

## Командирская аура из исходного ассета — актуальная версия v6

У всех шести действующих командиров исходный PNG теперь образует само кольцо радиуса 1 вокруг фигуры. Прозрачные поля и сплюснутая авторская проекция нормализованы по альфа-контуру: кольцо центрировано в области 3×3, следует отрисованной фигуре и обрезается у границы поля. Сам PNG медленно вращается за 40 секунд и мягко дышит за 6 секунд. У reduced motion остаётся неподвижным.

Отдельные бегущая прямоугольная рамка и расходящаяся волна убраны. Подсветка клеток снижена с 0.018 до 0.005, радиальная заливка — до 0.002–0.018. Основной контур PNG имеет opacity 0.27–0.38 и остаётся под фигурами, HP и тактическим UI. PNG и правила не менялись; Griffith/Grozny не получают отсутствующую у них механику.

Проверено: 326 effects-тестов; 72 сценария реального Board для шести командиров и 12 сценариев покадровой проверки движения оригинального ассета. Просмотрены все шесть PNG в трёх фазах. Asset audit, root lint/typecheck/build и свежая production-проверка 327 определений пройдены. Логи: aura-art-*.log; детали: [COMMANDER_AURA_REVIEW_RU.md](COMMANDER_AURA_REVIEW_RU.md).

## Значок союзной командирской поддержки — v7

У разрешённых союзников в радиусе 1 появляется маленький зелёный флажок в существующем ряду статусов. Подпись и сводка выбранной фигуры объясняют бонус: +1 к урону. Источник должен быть союзным живым командиром на поле; сам себе бонус не даёт, False Trail не получает его, пересечение аур не создаёт несколько значков. При выходе из радиуса, смерти/удалении источника или потере видимости значок снимается. Скрытый источник не выводится по косвенным данным.

Проверено: 329 effects-тестов, 5 i18n-тестов, 72 сценария реального Board; условия сопоставлены с getPolkovodetsSource для всех шести командиров, включая диагонали и проекции получателей. Просмотрены два значка на соседних союзниках Чингисхана. Новых событий, таймеров, звуков и PNG нет. Логи: commander-badge-*.log.

## Длинные перемещения райдеров и ассасинов — v8

Исправлены две причины: обычный длинный ход сжимался до тех же 160 мс, что один шаг; динамически составленные CSS-классы оставляли общий след базовых фигур прозрачным. Теперь normal/Rider используют 160 мс на клетку при общем бюджете ходьбы 720 мс на пакет: две клетки — 320 мс, восемь — 720 мс. Подтверждённые сегменты и повороты сохранены; промежуточные скрытые клетки не вычисляются. Reduced motion остаётся 50 мс на сегмент.

Токен, тематический след, конечный акцент и ловушки используют общий playback-clock. Постоянное опутывание появляется на достигнутом кадре, а snapshot восстанавливает его сразу. Полные имена классов сохраняют цвета обычного следа и спокойных конечных маркеров в production. Правила, RNG, расходы, SFX-маршруты и исходные PNG не менялись; forced/teleport/Boat/Tralala сохраняют свои виды движения.

Проверки: 332 effects-тестов, 66 SFX-тестов, 84 браузерных сценария настоящего Board для базовых Rider/Assassin и пяти героев, короткие/длинные реальные rules-действия, три получателя, desktop и phone/reduced motion. Проверяются цвет/размер/opacity следа на 25/50/75% пути, позиция токена, одна конечная фаза, повторы, reconnect/snapshot и cleanup. Семь длинных маршрутов просмотрены в трёх фазах. Затронут общий контракт 64 movement PNG; это не отметка просмотра длинной ходьбы всех профилей. Детали: [LONG_MOVE_FIX_RU.md](LONG_MOVE_FIX_RU.md), логи long-move-*.log.

## Запись настоящего теструма — наблюдение разобрано

Отдельное раннее кольцо оказалось локальным select_ring: оно использовало новую позицию из PlayerView раньше, чем появилась отрисованная фигура. Теперь оно ждёт фигуру и следует её визуальной позиции. Обычный placeUnit записан отдельно: подтверждённый unitPlaced запускает новое плавное проявление. У debugSpawnUnit сервер по-прежнему присылает events=[], поэтому этот путь не объявляется deploy и не получает выдуманное событие.

Новые видео с настоящими часами, сервером и WebSocket: `packages/web/test-results/kaiser-reveal-selection/`. Исходная запись до исправления сохранена отдельно в `kaiser-deploy-capture/`. Общая ручная QA всех уникальных способностей остаётся открытой.

## След, остающийся на доске — v9

Вместо одного PNG под движущимся токеном теперь остаётся цепочка небольших фрагментов в уже пройденных точках. Каждый неподвижен и плавно затухает за 240 мс. Плотность зависит от длины пути, максимум 32 фрагмента на один cue; отдельные таймеры не создаются. Движение и момент прибытия сохранены, остаток следа догорает после остановки. Reduced motion скрывает след, разрешения и cleanup действуют на весь cue.

Проверено: 334 effects-тестов; 126 сценариев настоящего Board для коротких/длинных ходов, трёх получателей, desktop, анимированного phone и phone/reduced motion; 67 сценариев deploy/move всех профилей и форм. Проверяются неподвижность фрагментов, отсутствие следа впереди токена, затухание, неизменное прибытие, повторы и очистка. Общий путь затрагивает 35 trail/form PNG; визуально просмотрены пять тематических следов в трёх фазах на desktop и phone. Asset audit, root lint/typecheck/build и свежая production-проверка 327 определений пройдены. Детали: [MOVEMENT_WAKE_RU.md](MOVEMENT_WAKE_RU.md), логи wake-*.log. Прежние блокеры и широкая ручная QA сохранены.

## Разрез через токен цели — v11

Все 27 обычных и форменных взмахов теперь рисуют быстрый рассекающий штрих непосредственно через портрет цели. Арт, блик и прорисовка отражены по горизонтали и вертикали вокруг центра цели; угол следует разрешённому направлению атаки и повороту доски. Фигура не размахивает цельной дугой как оружием. Разрез проявляется в последние 90 мс перед общим contact и затухает за 80 мс; reduced motion сохраняет статичный непустой кадр. При промахе штрих проходит рядом и не создаёт impact. PNG, исходы правил и звуковые фазы сохранены.

Проверки: 338 effects-тестов, 66 SFX-тестов; asset audit, lint/typecheck/build и свежая production-проверка 327 определений PASS. 270 браузерных сценариев настоящего Board и 81 сценарий прорисовки/затухания; три получателя, desktop, phone и reduced motion. Все 27 PNG просмотрены на desktop/phone в фазе разреза; девять характерных последовательностей — отдельно. Запись Guts normal/x4: packages/web/test-results/target-cut-recording/. Полная ручная сетевая QA и исходные блокеры остаются открытыми. Подробности: [TARGET_CUT_RU.md](TARGET_CUT_RU.md), логи melee-*.log.

## Выпад токена при соседней мили-атаке — v12

Токен слегка отводится назад и подаётся на 0,24 клетки к противнику, вытягиваясь на 7,5% в направлении удара. Максимум совпадает с прежним contact, затем за 80 мс токен возвращается. Весь жест вычисляется существующим combat RAF; клетка, аура, тактические маркеры и разрез на цели не переезжают. Только принятые мили-атаки на соседнюю клетку, включая диагональ; дальние атаки, снаряды и reduced motion исключены. Исходные PNG, механика и SFX сохранены.

Проверки: 341 effects-тест, 270 сценариев настоящего Board, asset audit, root lint/typecheck/build и свежая production-проверка 327 определений PASS. Все 27 тематических взмахов просмотрены на desktop/phone, Guts записан normal/x4: packages/web/test-results/melee-lunge-recording/. Базовый общий путь проверен unit-тестами. Логи lunge-*.log; полная ручная сетевая QA и прежние блокеры остаются открытыми.

## Архив записей всех мили-слешей до замедления

Записаны 27 вариантов: 24 обычных и три формы. Каждый фрагмент содержит подписанное имя фигуры, обычную скорость и повтор ×4. Общий ролик: packages/web/test-results/all-slashes-review/all-slashes.mp4. Отдельные видео собраны в index.html; README_RU.md содержит ссылки и таймкоды. Сняты настоящий Board и принятые правилами атаки с разрешённой P1-проекцией, общий clock продвинут с шагом 60 fps. Без звука; это не ручной сетевой матч. Пользовательская визуальная проверка ожидается; наличие записи не отмечает её пройденной. Игровой код и PNG при записи не менялись.

## Более читаемый темп мили-удара — v13 (текущий)

У мили-атаки теперь 420 мс до контакта вместо 210. Сам разрез прорисовывается за 260 мс вместо 90, затухание и возврат токена занимают 220 мс вместо 80. Весь жест длится 640 мс вместо 290, сохраняя прежние направление, инверсию и небольшой выпад. Разрез, результат, HP и SFX следуют одному combat-clock; прежнее перекрытие с финальным показом кубиков сохранено. Сервер и правила анимацию не ждут. Снаряды и reduced motion сохраняют свои тайминги.

Проверено: 345 effects-тестов, 66 SFX-тестов, 270 сценариев Board для всех 27 PNG, трёх получателей, desktop/phone/reduced motion; asset audit, lint/typecheck/build и свежая production-проверка 327 определений PASS. Новая запись: packages/web/test-results/readable-melee-recording/ (normal/x4). Прежняя галерея 27 видео сохранена как архив более быстрого варианта; её темп уже не соответствует игре. Ранние разделы v11/v12 описывают историю правок. PNG, правила и SFX-маршруты не менялись. Прежние блокеры и широкая ручная QA остаются открытыми.

## Читаемый полёт снарядов — v14

Обычные выстрелы Кайзера, Артемиды, Джебе и Меттатона, Инженерное чудо, EX/NEO и базовый лучник выпускают один снаряд после финального показа кубиков. Полёт зависит от подтверждённого расстояния: 360–780 мс вместо прежних 210 мс; reduced motion сохраняет 70 мс. Обычная форма Кайзера проверена отдельно по горизонтали, вертикали и диагонали. Промах тоже выпускает снаряд, но без вспышки урона; попадание и HP следуют общему combat-clock.

Добавлен полёт арбалета/пушки Гатса и копья Андайн, включая три броска Бессмертной. Старые KEEP-акценты попадания сохранены. Проверены существующие отдельные маршруты огненного шара Асгора, прицельного удара Фриск, Стрелка хана и Гунгнира Одина. Базовый лучник и пушка используют уже имеющийся общий ресурс с кодовым наконечником; бледные старые кадры арбалета и огненного шара дополнены читаемым ядром только в фазе полёта. PNG, правила и SFX-маршруты не менялись.

Проверки: 350 effects-тестов, 66 SFX-тестов; 333 сценария реального Board плюс 27 повторных сценариев после исправления контраста. Включены P1/P2/spectator, обе ориентации, desktop/phone/reduced motion, близкая/дальняя цель, промах, дубликат, reconnect и очистка. Asset audit, lint/typecheck/build и свежая production-проверка 328 определений PASS. Визуальный просмотр: packages/web/test-results/vfx-expansion-game/projectile-contact-sheets/. Запись обычной формы Кайзера: packages/web/test-results/kaiser-projectile-recording/kaiser-projectile-repeat.mp4. Это автоматизированный Board с настоящими проекциями rules, ручной сетевой матч не проводился. Старые блокеры и полная ручная QA остаются открытыми.

## Удар, результат и защита — v15

При добивании подтверждённые слеш и hit доигрываются на клетке события, даже если итоговый snapshot уже пометил цель погибшей. Это не сохраняет эффекты живой скрывшейся фигуры и постоянные статусы после смерти.

Слеш/снаряд сохраняется при попадании, обычном промахе и защите способностью. Обычный промах показывает существующий синий hex-shield, перекрашенный при отрисовке в палитру защищающегося героя (29 профилей, отдельный NEO-оттенок). Base-фигуры сохраняют общий цвет. Удар по цели остаётся центрированным и на промахе; щит возникает в момент контакта. Родной Santoryu Зоро сохранён без второго общего слеша.

Подтверждённая авто-защита берсерка, уклонение копейщика, Muninn, Bravery и реакции Фриск заменяют обычный щит своим существующим защитным эффектом. У Bravery нет отдельного PNG в паке: используется существующий общий защитный щит с золотым оттенком. При реально уменьшенном уроне Бункером, Берсерком Гатса или Бессмертной Андайн видны основной attack_impact и отдельная защита. Само наличие формы/иммунитета/нулевого урона не создаёт защиту. Подтверждение дубля Артемиды дополняет основной hit.

Атаки по пути наездника помечены авторитетной подписью riderPath и получают отдельный слеш с собственным hit/guard на каждой действительно принятой правилами цели. Проверены базовый наездник, Чингисхан, Дон Кихот, Один и формы NEO/Инженерное чудо/Сколопендра. Речной человек по правилам не атакует по пути, поэтому слеш ему не придуман. Очерёдность движения и атак сохранена.

Добавлены только подписи уже существующих результатов: riderPath; preventedBy для трёх принятых автоматических защит; положительные damageReductions для двух форм. Скрытая геометрия, причина защиты и сведения о форме удаляются из проекции без соответствующего разрешения. Расходы, успешность, баланс и RNG сохранены; SFX-интеграция не менялась. Все 296 SHA-256 прежние, два общих определения переиспользуют существующие ресурсы; новые PNG не создавались.

Проверки: 355 effects, 66 SFX; полный test:rules (3 набора), test:contract (20 наборов), assets, lint/typecheck/build и свежий production (330 определений) PASS. Board: 405 сценариев исходов, 270 слешей, 72 выстрелов Кайзера и 18 атак Зоро — всего 765. Три получателя, обе ориентации, desktop/phone/reduced motion, дубликат, reconnect и очистка. Визуальные листы: packages/web/test-results/vfx-expansion-game/outcome-contact-sheets/. Ручной сетевой матч и полная индивидуальная анимационная QA не проводились; прежние три блокера не сняты.

## Направление порезов — v16

Эталон — прежний удар вправо. При ударе влево и вверх весь порез отражается горизонтально, при ударе вниз — только вертикально (уточнение пользователя). Диагонали получают промежуточный наклон 45°. Направление выбирается относительно экрана после разворота доски; спрайт, проявление и блик отражаются вместе. Центр цели, выпад токена, тайминг контакта и hit/guard сохранены.

Общий путь используется 27 PNG. Проверки: 355 effects-тестов, 81 сценарий реального Board (восемь направлений и промах; P1/P2/spectator, desktop/phone/reduced motion), assets, lint/typecheck/build и свежий production (330 определений) PASS. Визуально просмотрены восемь направлений Гатса на desktop/phone: packages/web/test-results/vfx-expansion-game/facing-contact-sheets/. Это проверка общей геометрии; полная индивидуальная QA всех анимаций и сетевой матч остаются открытыми. PNG, rules и SFX не менялись.

## Общий эталон удара вправо — v17 (история)

По уточнению пользователя порез Чингисхана из (4,4) в (5,4) перевёрнут по обеим осям относительно v16. Теперь это исходный эталон всех 27 melee PNG. По последнему уточнению к нему применяются отражения: влево — одно горизонтальное, вверх — одно вертикальное, вниз — два вертикальных (возвращают ориентацию эталона), диагонали — промежуточные наклоны 45°. Изменена вся композиция пореза, включая проявление и блик; направление определяется после разворота доски. Предыдущий раздел v16 описывает историю правки.

Проверки: 355 effects-тестов; 162 сценария Board для Чингисхана и Гатса во всех направлениях, включая точный случай (4,4) → (5,4), промах, P1/P2/spectator, desktop/phone/reduced motion и очистку. Assets, lint/typecheck/build и свежий production (330 определений) PASS. Снимки: packages/web/test-results/vfx-expansion-game/facing-reference-contact-sheets/. Полная индивидуальная анимационная QA и ручной сетевой матч остаются открытыми. PNG, rules и SFX не менялись.

## Индивидуальная ориентация ассетов — v18 (актуальная)

Общий переворот заменён индивидуальной нормализацией всех 27 melee PNG. Эталон исходного пореза — диагональ между нижним левым и верхним правым углами, с проявлением из одного конца в противоположный. У каждого файла свои rotationDeg/revealFrom в meleeArtwork.ts: Гатс и его Берсерк развёрнуты на 180° и проявляются сверху справа; Чингисхан сохраняет 0° и начало снизу слева; почти горизонтальные полосы отдельно повёрнуты к диагонали. Маска проявления и блик согласованы с нормализованным рисунком. Затем применяются прежние направления относительно экрана: влево H, вверх V, вниз два V, диагонали 45°.

Проверки: 357 effects-тестов, включая геометрию реальных PNG; 387 сценариев Board для всех 27 полос и направлений Гатса/Чингисхана; 81 сценарий проявления/контакта/затухания. Assets, lint/typecheck/build и свежий production (330 определений) PASS. Просмотрены кадры всех 27 исходных полос и их нормализованные атаки на desktop/phone: packages/web/test-results/melee-art-audit/ и packages/web/test-results/vfx-expansion-game/normalized-swing-contact-sheets/. Направления и таймлайны — normalized-facing-contact-sheets/ и normalized-target-cut-timelines/. Полная индивидуальная анимационная QA и ручной сетевой матч остаются открытыми. PNG, rules и SFX не менялись.

## Новые записи всех слешей после нормализации v18

Записаны все 27 варианта (24 обычных и три формы), каждый в обычном темпе и с повтором ×4. Общий ролик: packages/web/test-results/all-slashes-review-v18/all-slashes.mp4; галерея: packages/web/test-results/all-slashes-review-v18/index.html; список и таймкоды: packages/web/test-results/all-slashes-review-v18/README_RU.md. Сняты текущий Board, разрешённые P1-события и общий presentation clock с шагом 60 fps. Длительность общего ролика — 162 секунд; без звука. Проверены состав всех 27 PNG, их SHA-256 и параметры видео, видимый разрез/выпад в момент контакта и возврат токена. Старые записи сохранены отдельно. Наличие видео не означает визуальное одобрение пользователем: userReviewPending=true. Игровой код, PNG и SFX при записи не менялись.
