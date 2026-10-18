# Интеграция 23 звуков фигур

Все 23 файла существуют и подключены к действующим игровым событиям через существующие `SOUND_REGISTRY`, `SfxPlayer`, `AudioManager` и общий план представления боя. Ассеты не переименованы и не изменены. Правила урона, стоимости, победы, превращений и ручных бросков сохранены.

## Таблица подключений

Путь каждого файла начинается с `packages/web/src/assets/sfx/heroes/<фигура>/`. Статус всех строк — **подключён и проверен**. Варианты одного ключа выбираются по одному, без одновременного запуска всей группы.

| Фигура | Файл | Ключ реестра | Авторитетный триггер / фаза | Группа вариантов |
|---|---|---|---|---|
| asgore | `basic/attack.wav` | `hero.asgore.basic.attack` | `attackResolved.isBasicAttack=true`, начало подтверждённой атаки | — |
| asgore | `basic/died.wav` | `hero.asgore.basic.death` | Финальный `unitDied`, фаза смерти | — |
| elCidCompeador | `basic/attack.wav` | `hero.elCidCompeador.basic.attack` | `attackResolved.isBasicAttack=true`, начало атаки | — |
| frisk | `basic/died.wav` | `hero.frisk.basic.death` | Финальный `unitDied` | — |
| frisk | `abilities/PowerOfFriendship.mp3` | `hero.frisk.abilities.powerOfFriendship` | `friskFriendshipWon`, фактическая победа | — |
| frisk | `phantasms/friskGenocidePrecisionStrike.wav` | `hero.frisk.phantasms.friskGenocide.precisionStrike` | `attackResolved.attackSignature=friskPrecisionStrike`, после ручных бросков, начало атаки | — |
| frisk | `phantasms/friskOnePathUnlock.wav` | `hero.frisk.phantasms.friskOnePath.unlock` | `friskOnePathUnlocked`, первый переход пути | — |
| grand-kaiser | `basic/attack.mp3` | `hero.grand-kaiser.basic.attack` | `attackResolved.isBasicAttack=true`, начало атаки | — |
| guts | `phantasms/gutsBerserkModeSweep.wav` | `hero.guts.phantasms.gutsBerserkMode.sweep` | `aoeResolved.abilityId=gutsBerserkMode`, время первой связанной атаки | Один звук на взмах |
| jebe | `phantasms/jebeKhansShooterFire02.wav` | `hero.jebe.phantasms.jebeKhansShooter` | Существующий подтверждённый `abilityUsed` для `jebeKhansShooter` | 2: Fire01 / Fire02 |
| kaneki | `basic/deployed.mp3` | `hero.kaneki.basic.deployed` | Подтверждённый `unitPlaced` Канеки | — |
| kaneki | `transformations/Scolopendra.mp3` | `hero.kaneki.transformations.kanekiScolopendra` | `kanekiFormEntered.form=scolopendra` | — |
| lechy | `phantasms/StormSound2.mp3` | `hero.lechy.phantasms.lechyStorm` | Существующий `lechyStormStarted` | 2: StormSound1 / StormSound2 |
| loki | `phantasms/lokiLaughtSpin.wav` | `hero.loki.phantasms.lokiLaught.spin` | `lokiSpinCommitted`, после принятого расхода Смеха | — |
| luche | `basic/attack.mp3` | `hero.luche.basic.attack` | `attackResolved.isBasicAttack=true`, начало атаки | — |
| mettaton | `basic/died.wav` | `hero.mettaton.basic.death` | Финальный `unitDied` | — |
| sans | `basic/died.wav` | `hero.sans.basic.death` | Финальный `unitDied` после Last Attack | — |
| undyne | `basic/attack.wav` | `hero.undyne.basic.attack` | `attackResolved.isBasicAttack=true`, начало атаки | — |
| undyne | `basic/died.wav` | `hero.undyne.basic.death` | Финальный `unitDied`, без запуска по HP/возрождению | — |
| vladTepes | `basic/attack.mp3` | `hero.vladTepes.basic.attack` | `attackResolved.isBasicAttack=true`, начало атаки | — |
| vladTepes | `abilities/vladStakesTrigger01.wav` | `hero.vladTepes.abilities.vladStakes.trigger` | Спроецированный `stakeTriggered`, достигнутая клетка | 3: Trigger01 / Trigger02 / Trigger03 |
| vladTepes | `abilities/vladStakesTrigger02.wav` | `hero.vladTepes.abilities.vladStakes.trigger` | Тот же `stakeTriggered` | Та же группа из 3 |
| vladTepes | `abilities/vladStakesTrigger03.wav` | `hero.vladTepes.abilities.vladStakes.trigger` | Тот же `stakeTriggered` | Та же группа из 3 |

Добавлено **19 семантических ключей**: все уникальные ключи таблицы, кроме уже существовавших `hero.jebe.phantasms.jebeKhansShooter` и `hero.lechy.phantasms.lechyStorm`. В эти две группы добавлены вторые варианты.

## Канеки

Размещение использует существующий `unitPlaced` после успешного `placeUnit`. Выбор клетки, панель размещения, предпросмотр и отклонённая команда звука не создают.

В текущих правилах сколопендра — постоянный переход `kanekiCentipedeUnlocked=false -> true` при количестве `kanekiRcCells > 5`, без смены `heroId`. Новый `kanekiFormEntered` создаётся именно в этих существующих местах: после попадания (+1 RC), после убийства (+3 RC) и при существующей проверке порога в начале хода. RC-клетки не стали автоматически накапливаться за ход. Повторная проверка уже открытой формы события не создаёт. Звук включён в прогрев реального ростера Канеки. Снимок состояния и повторное подключение форму восстанавливают без звука.

## Влад и варианты

Три `vladStakesTrigger*.wav` зарегистрированы в одном `sources`. Существующий `soundVariantIndex` хеширует идентификатор cue и ключ, выбирая ровно один источник. Выбор стабилен при повторной доставке и ререндере; разные легитимные события дают разнообразие. Генератор случайных чисел правил не вызывается.

Один `stakeTriggered` создаёт один семантический звук, независимо от количества раскрытых кольев. Отдельные инциденты сохраняют отдельные event ID. Скрытое размещение и состояние будущих ловушек не используются; маппер получает только разрешённое получателю событие. Время звука берётся из существующего плана движения/опасностей, после достижения клетки.

## Обычные атаки и точный удар

Признак `isBasicAttack` устанавливается в контексте принятой обычной команды `attack` и переносится в итоговый `attackResolved`. Маппер требует явный признак, разрешённые `attackerId` и `sourceCell`, отсутствие `abilityId`/`abilityUseId` и отсутствие повторно использованного броска. Отсутствие идентификатора способности само по себе обычную атаку не доказывает. Fireball, Dora, Forest, управляемые атаки и другие специальные операции своих звуков не теряют.

Точный удар Фриск помечается отдельным `attackSignature=friskPrecisionStrike` в принятом контексте атаки. Звук запускается по финальному `attackResolved`, после ручных бросков. Открытие выбора, подтверждение цели с ещё ожидающими бросками, отмена и другие опции Геноцида этот звук не запускают. Поле подписи удаляется при отсутствии разрешения на источник.

Новый `attackAtMs` в существующем боевом cue передаёт начало анимации атаки; `atMs` результата остаётся моментом попадания/промаха. Звук атаки и generic hit/miss таким образом принадлежат разным фазам. Второй generic swing не добавляется.

## Смерть

Геройский звук заменяет общий звук смерти через один выбор ключа с generic fallback. Он привязан к финальному `unitDied`, включая обычный и планируемый пути маппера. HP=0 и исчезновение фигуры события смерти не заменяют. Боевой cue смерти дополнительно проверяется на исходный `unitDied`.

Санс сохраняет прежний порядок: смертельное попадание → ожидающий выбор Last Attack → наложение проклятия → финальный `unitDied` → один `hero.sans.basic.death`. Раннее состояние с HP=0 молчит. Для Фриск и Андайн используется тот же окончательный конвейер правил, без отдельного вывода о смерти по состоянию или превращению.

## Остальные способности

Сила дружбы — условие победы Фриск: живой размещённый Фриск, Пацифизм не отключён, Геноцид равен нулю, на поле остаётся ровно один настоящий враг. `friskFriendshipWon` добавляется непосредственно в существующий успешный путь `endGameWithWinner`; условие победы не изменено.

«Один путь» происходит после первого убийства Фриск и конвертации Пацифизма в Геноцид. Новое событие передаётся только владельцу, в том числе когда оба счётчика до перехода равны нулю. Постоянно отключённый Пацифизм звука не повторяет.

Взмах Гатса относится к подтверждённой AoE-атаке в Berserk Mode. Итоговый `aoeResolved` разрешает один звук; по `abilityUseId`/цепочке он получает время первой атаки из общего плана. Вход в режим сохраняет прежний отдельный звук. Индивидуальные результаты целей сохраняют свои hit/miss/HP/death.

Fire02 Джебе — альтернативный звук существующего «Стрелка хана». StormSound2 Лешего — альтернативная запись существующего запуска бури. Новых фаз, тиков и постоянных фоновых циклов не создано. Существующий предел длительности бури 1500 мс применяется к обоим вариантам.

Spin Локи — принятие `spinTheDrum` после успешного расхода 12 единиц Смеха, перед существующим выбором союзника/копируемой способности. `lokiSpinCommitted` получает только владелец. Открытие меню и отклонённая опция молчат. Копируемая способность сохраняет собственные отдельные события и звуки.

## Повторы, приватность и восстановление

Используются прежние `PresentationSession`, `SfxPlaybackSession`, токен сессии и стабильные event/cue ID. Повторная доставка не создаёт второй голос и новый выбор варианта. Базовый снимок после подключения не воспроизводит историю. Смена комнаты, роли или потока отменяет отложенные звуки. Скрытая вкладка и поздние cue следуют существующей политике; завершение загрузки холодного ассета заполняет кэш для будущих событий без позднего воспроизведения прошлого.

Новые события проходят явное копирование разрешённых полей и recipient projection в rules. Приватные One Path и Spin доступны владельцу; скрытый источник не восстанавливается из текущей позиции или кэша. Все новые записи категории `gameplay` проходят прежние master volume/mute, category gain, ограничения голосов и кэш. Новых `AudioContext`, `Audio()` или таймеров в компонентах нет.

## Изменённые файлы

Полные пути относительно корня проекта:

```text
docs/assets/HERO_AUDIO_COVERAGE_23.md
packages/rules/src/abilities/turn.ts
packages/rules/src/actions/combatActions/attackAction.ts
packages/rules/src/actions/heroes/frisk/friendship.ts
packages/rules/src/actions/heroes/frisk/postAction.ts
packages/rules/src/actions/heroes/newBatchPost.ts
packages/rules/src/core/combat/combatCtx.ts
packages/rules/src/model/events/core.ts
packages/rules/src/model/events/heroes.ts
packages/rules/src/pendingRoll/resolvers/core/resolveAttackRoll/shared.ts
packages/rules/src/pendingRoll/resolvers/heroes/resolveFriskRoll/genocide.ts
packages/rules/src/pendingRoll/resolvers/heroes/resolveLokiRoll/menu.ts
packages/rules/src/pendingRoll/types.ts
packages/rules/src/tests/core/snapshots.test.ts
packages/rules/src/tests/heroes/frisk.test.ts
packages/rules/src/tests/heroes/loki.test.ts
packages/rules/src/view/eventPayload.ts
packages/rules/src/view/events.ts
packages/server/src/openapi/generated/responses.json
packages/web/src/assets/sfx/registry.ts
packages/web/src/features/sfx/audioPreload.ts
packages/web/src/features/sfx/heroAudioCoverage.test.ts
packages/web/src/features/sfx/sfxEventMapper.ts
packages/web/src/game/effects/asgorePresentation.test.ts
packages/web/src/game/effects/combatPlayback.ts
packages/web/src/game/effects/combatPresentation.test.ts
packages/web/src/game/effects/heroAbilityCoverage.ts
packages/web/src/game/effects/movementPresentation.test.ts
packages/web/src/game/effects/sansPresentation.test.ts
```

Серверный JSON регенерирован штатным генератором из публичных типов событий. Изменений серверной логики нет.

## Проверки

Новый `heroAudioCoverage.test.ts` проверяет физические пути всех 23 файлов; настоящие обычные атаки всех шести фигур через ручные броски; отсутствие сигнатур для специальных/отклонённых атак; пять override смерти; размещение и все три пути порога Канеки; фактическую победу и первый путь Фриск; время точного удара/взмаха; группы вариантов; приватность; повторы; mute, базовый снимок и сброс сессии.

Существующие rules-тесты Фриск и Локи дополнены проверками авторитетных событий. Снимок обычной атаки дополнен явным признаком происхождения. Тесты эффектов проверяют отсутствие ранней смерти Санса, новый override вместо generic и время звука кольев. Проверки предзагрузки учитывают новые базовые звуки.

| Проверка | Результат |
|---|---|
| `npm run -w web test:sfx` | PASS, 66 тестов |
| `npm run -w web test:effects` | PASS, 219 тестов; также входят в полный финальный web-прогон |
| `npm run test:web` | PASS, 714 тестов |
| `npm run test:rules` | PASS, 3 запуска наборов, включая проверки границ модулей |
| `npm run test:server` | PASS, 11 запусков наборов |
| `npm run test:contract` | PASS, 20 запусков наборов, включая согласованность сгенерированной схемы |
| `npm run typecheck` | PASS, rules, server, benchmark, web и smoke TypeScript |
| `npm run build` | PASS, rules + server + web typecheck + production bundle |
| `npm run -w web test:presentation:assets` | PASS, пути с точным регистром, размеры ассетов, отсутствие дубликатов emitted-файлов |
| `npm run -w web test:presentation:production` | PASS, браузер загрузил и декодировал 137 звуков и 104 изображения; ошибок страницы нет |
| `git diff --check` | PASS |

Для запуска браузерной проверки production bundle собран с локальными тестовыми `VITE_API_URL=http://127.0.0.1:3196` и `VITE_WS_URL=ws://127.0.0.1:3196`. Это обязательные существующие параметры сборки; файлы окружения проекта не менялись. Проверка относится к локальному production preview, без публикации сайта и без измерения CDN-кэширования.

Форматы и длительности всех 23 файлов дополнительно проверены через `ffprobe`. Новые короткие боевые сигнатуры имеют длительности примерно 0.35–1.32 с; размещение Канеки — 2.96 с, форма — 8.89 с. StormSound2 — 13.39 с в исходном файле, но проигрывается с прежним ограничением бури 1500 мс. Master-ассеты сохранены без перекодирования. Gain обычных атак и новых способностей — 0.4, смерти и срабатывания кольев — 0.5; категория — `gameplay`.

## Неподключаемые файлы

Нет. Все 23 файла физически доступны, поддерживаются браузером и имеют достижимый семантический триггер либо входят в достижимую группу вариантов.
