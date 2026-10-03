# Play / Lobby — отчёт об реализации

Работа выполнена в локальном workspace `C:\codes\FATE`. Play и Lobby разделены, ручной Rated старт защищён серверной проверкой актуальной разницы рейтингов. Изменения не опубликованы в production.

**1. Добавленные и изменённые файлы**

Добавлено:

```text
packages/server/src/lobby/metadata.ts
packages/server/src/tests/lobby.test.ts
packages/web/scripts/play-lobby-server.ts
packages/web/scripts/play-lobby-smoke.mjs
packages/web/src/lobby/Play.test.tsx
packages/web/src/lobby/RatedCompatibilityPanel.tsx
packages/web/src/pages/PlayPage.tsx
packages/web/src/play/RankMedal.tsx
packages/web/src/play/api.ts
packages/web/src/play/play.css
docs/play-lobby-implementation-report.md
```

Изменено:

```text
README.md
packages/server/package.json
packages/server/src/matchmaking/runtime.ts
packages/server/src/persistence/matchLifecycle.ts
packages/server/src/replay/initialState.ts
packages/server/src/repositories/ratingRepository.ts
packages/server/src/routes.ts
packages/server/src/schemas.ts
packages/server/src/services/ratingService.ts
packages/server/src/store.ts
packages/server/src/tests/matchTypes.integration.test.ts
packages/server/src/ws.ts
packages/web/package.json
packages/web/scripts/app-shell-server.ts
packages/web/scripts/app-shell-smoke.mjs
packages/web/scripts/auth-smoke.mjs
packages/web/scripts/match-types-smoke.mjs
packages/web/src/App.tsx
packages/web/src/api.ts
packages/web/src/components/Lobby.tsx
packages/web/src/game/components/GameTopBar.tsx
packages/web/src/game/gameshell-content/components/GameLoadingState.tsx
packages/web/src/game/gameshell-content/components/GameShellSideColumn.tsx
packages/web/src/game/gameshell-content/hooks/useGameShellPendingStatus.ts
packages/web/src/i18n/displayMetadata.ts
packages/web/src/i18n/locales/en.ts
packages/web/src/i18n/locales/uk.ts
packages/web/src/layout/AppShell.test.tsx
packages/web/src/layout/Sidebar.tsx
packages/web/src/lobby/Lobby.test.tsx
packages/web/src/lobby/RoomBrowser.tsx
packages/web/src/lobby/RoomConnectionDialog.tsx
packages/web/src/main.tsx
packages/web/src/matchmaking/MatchmakingPanel.tsx
packages/web/src/matchmaking/MatchmakingSync.tsx
packages/web/src/store.ts
packages/web/src/ws.ts
```

Зависимости не добавлялись. После `npm install` Git отмечает `package-lock.json` в status, но содержимого diff нет: его Git blob совпадает с HEAD. Prisma-схема и миграции не изменялись.

**2. Найденная исходная архитектура**

Маршрут `/` открывал общий `GameRuntime`. Без активной комнаты он рендерил `components/Lobby.tsx`, который объединял `MatchmakingPanel`, создание/подключение и браузер комнат. Отдельного пункта Lobby в Sidebar не было. Карточки и игровой заголовок показывали room UUID; предстартовые места преимущественно описывались через Occupied/Open.

Сервер уже имел доверенные seat identities, безопасные имена участников, канонический `RatingService`, типизированный `MatchmakingConfig` и резервирование мест для matchmaking. Модель рейтинга в Prisma называется `Rating`. Ручной Rated старт проверял пользователей, но не максимальную разницу рейтингов.

**3. Маршруты и навигация**

`/` остаётся Play, `/lobby` открывает ручные лобби. Sidebar содержит два отдельных пункта с независимым active state. Старый bookmark `/` сохранён. Оба маршрута используют существующий игровой runtime и механизм восстановления клиентской сессии. Figure Set, Match History, Leaderboard, Profile и capability-gated developer navigation сохраняются.

**4. Состав Play**

Личная competitive identity: имя, нейтральная эмблема, крупный числовой рейтинг, uncertainty, число Rated игр и статус квалификации. Основное действие — Rated matchmaking с выбором настоящего game mode. На desktop identity и matchmaking стоят в двух колонках; на мобильном — последовательно. Во время QUEUED/MATCHING/MATCH_FOUND identity скрывается, остаётся информация поиска. Есть загрузка рейтинга, сообщение об ошибке и повторная загрузка.

**5. Рейтинг и слот медали**

`RankMedal({ assetUrl?, label?, size? })` поддерживает будущий bitmap/SVG asset URL, accessible label и два размера. Сейчас используется нейтральный CSS-медальон с символом F. Постоянные ранги и медали не присваиваются. Рейтинг и RD получаются через существующий `/api/users/:id/rating`; отображаемые значения округлены, серверные сравнения используют исходные числа.

**6. Реальные данные прогресса**

Реальны rating, ratingDeviation и ratedGames из RatingService. Qualification progress использует `LEADERBOARD_MIN_RATED_GAMES` из backend-конфига, доступного через новый `GET /api/competitive/config`. До квалификации показаны игры/порог и оставшиеся игры. После — квалифицированный статус и количество игр. Прогресс до следующей медали, tier thresholds и сезонные показатели не выдуманы.

**7. Состав Lobby**

Create Lobby, Join by Code, браузер с фильтрами All/Waiting/In Progress и All/Casual/Rated. Создание включает необязательное имя, Casual/Rated и gameMode. Карточки показывают название, тип, режим, host, инициалы-аватары, имена P1/P2, доступные рейтинги, статус и число зрителей. Есть пустое состояние и Join/Spectate. Автообновление раз в 10 секунд, ручной Refresh и защита от перекрывающихся запросов. Новые тексты переведены на EN/UK.

**8. Сохранение имени лобби**

Имя хранится на серверном `GameRoom` и для normal matches в существующем `Match.initialConfig` JSON. Строгая replay-схема принимает новое optional поле, старые записи продолжают читаться. Перезагрузка браузера, reconnect и обновление списка сохраняют имя. Валидация: trim, 1–60 символов, запрет управляющих символов, поддержка кириллицы/Unicode. HTML отображается текстом. Имена не уникальны. WS default — имя host + `'s Lobby`, безопасно ограниченное длиной; generic fallback — `FATE Lobby`. Новый механизм восстановления live rooms после рестарта сервера не добавлен.

**9. Внутренние ID и отображение**

roomId/matchId/userId остаются идентификаторами маршрутизации, ownership и persistence. Имя — только presentation metadata. UUID убран из заголовков, обычных карточек и loading-блока. Join by Code и Copy Join Code используют существующий roomId исключительно как код приглашения. Приватные auth/resume/seat tokens через эту кнопку не копируются. Debug-информация сохранена в developer-инструментах.

**10. Гости**

Доверенные authenticated имена предпочитают displayName, затем username. Анонимный участник sandbox имеет безопасное заданное имя либо Guest; пустое место — Waiting for player. Реальный браузер проверил `Guest Scout` в capability-gated sandbox. Существующая политика normal Casual/Rated требует авторизации игроков; гостям доступны публичное наблюдение и разрешённый sandbox. Это ограничение не ослаблялось.

**11. Waiting / In Progress**

Waiting manual lobby с доступным местом предлагает Join. Полная, активная или matchmaking-комната предлагает Spectate. In Progress фильтр исключает waiting и ended; завершённые комнаты, пока существуют в runtime, обозначаются Finished в All. Метаданные сохраняют участника активной игры после disconnect, поэтому он не выглядит свободным местом. Waiting Rated с недопустимым gap имеет короткое предупреждение.

**12. Зрители**

Используется существующая spectator projection и правила видимости. Из активной карточки диалог выбирает spectator и блокирует конкурентные роли. Гость может наблюдать без входа. Проверены ручные активные Casual/ Rated и matchmaking Rated, включая мобильный экран. Доступность просмотра не даёт управления игрой.

**13. Matchmaking-комнаты в браузере**

Происхождение MANUAL/MATCHMAKING выводится из существующего `reservedUserIds`. Matchmade lobby называется Rated Match; до подключения обоих участников отображается Starting · Reserved, в списке доступны только spectator-действия. Имена зарезервированных игроков видны заранее. Резервирование мест остаётся серверным. Найденная архитектура действительно требует Ready/host Start даже после Match Found, поэтому эти существующие controls сохранены.

**14. Правило ручного Rated**

При двух разных авторизованных участниках старт допустим только если `abs(P1.rating - P2.rating) <= maxRange`. Граница включительная: при max=400 пары 1800/1500 и 1800/1400 разрешены; 1800/1350 блокируется. Rated не превращается автоматически в Casual. Ручной старт не использует текущий динамический диапазон очереди.

**15. Точный источник максимума**

`packages/server/src/matchmaking/config.ts` → `readMatchmakingConfig()` → `MATCHMAKING_MAX_RATING_RANGE` → `MatchmakingConfig.maxRange` (default 400). `createMatchmakingService()` передаёт именно `matchmaking.config` в `lifecycle.configureRatedLobbies()`. Отдельного manual maximum нет. Новый тест реального start gate также проверяет конфиг 300: разница 301 отклоняется, 300 принимается.

**16. Проверка при старте**

WS-команда сериализуется через существующую room queue; сохраняются проверки host, lobby phase, pending roll, двух занятых/готовых мест. Затем `validateStart()` проверяет distinct authenticated identities и актуальный Rated gap перед draft transition/rebuild. В общем `MatchLifecycle.applyAction(startGame)` сначала синхронизируются persistent participants, затем повторно загружаются канонические рейтинги и проверяется лимит. Только после успешной проверки применяется игровой action, журналируется принятый старт и запускается существующая persistence lifecycle. REST/direct lifecycle используют тот же общий gate. Discovery-response или client eligibility не участвуют в решении. Результат конкретного rating lookup сохраняется локально, чтобы параллельный refresh не подменил start decision.

**17. Отсутствующий Rating**

Новый `RatingService.getPlayerRatings()` использует канонический `INITIAL_RATING.rating` = 1500 для trusted user без Rating row. Discovery читает ratings batch-запросом, без запроса на каждую карточку. Отсутствующая строка отличается от ошибки хранилища: ошибка даёт unavailable и блокирует Rated старт. Проверен старт 1800 против отсутствующей строки P2 → 1500. Новая таблица или альтернативный initial rating не создавались.

**18. Frontend при несовместимых рейтингах**

Показаны рейтинг каждого игрока, difference/max, eligible или причина блокировки и предложение создать Casual lobby. Start disabled при отсутствующей/невалидной совместимости. Сообщение связано с controls через accessibility metadata. Для difference используется ceil, чтобы дробный gap больше лимита не выглядел разрешённым при округлении. После отказа WS рассылает актуальные room metadata; ручной выбор Casual остаётся явным.

**19. Защита от обхода**

Авторитетный gate находится на сервере. Direct WS start, поддельные rating/eligible в payload, общий action channel, debug REST и draft path покрыты проверками. Стабильные коды: `RATED_RATING_DIFFERENCE_TOO_LARGE`, `RATED_RATING_UNAVAILABLE`, `RATED_MATCH_INVALID_PARTICIPANTS`. Невалидное имя возвращает `INVALID_LOBBY_NAME`. Блокированный старт сохраняет phase/revision, WAITING Match и Rated classification, не создаёт принятый start action, rating update/history или match result. Проверен сценарий cached gap 390 → актуальный 410. Политики active-match, reconnect и same-user сохраняются.

**20. Casual**

Casual игнорирует разницу рейтингов; готовность, host и авторизация normal competitor seats остаются обязательными. Новый тест запускает Casual с большим gap. Завершённые Casual игры не вызывают рейтинговые записи. Создание, подключение, reconnect и игровая сессия Casual проверены браузером и PostgreSQL интеграцией.

**21. Matchmaking-регрессии**

Алгоритм очереди не изменялся: initial ±100, +50 каждые 15 секунд, до configured maximum, взаимное покрытие диапазонов. Сохранены mode partitioning, cancellation, atomic pairing, reservations, recovery/reconnect и запрет конфликтующих матчей. Полные server matchmaking/WS tests и PostgreSQL suite прошли. Новый browser smoke выполняет настоящий поиск, отмену, Match Found и вход назначенного пользователя, затем spectator-вход в найденный матч.

**22. Rating / Leaderboard / History / Replay**

Успешные ручные и автоматические игры используют существующий exactly-once Glicko pipeline. Блокированная Rated игра проверена в реальной БД: ноль rating effects/history и принятых игровых actions. Existing complete-match fixture сохраняет 6 легально завершённых Casual/Rated игр, повторную доставку результата, журнал/snapshots, deterministic replay, историю, statistics и rated-only leaderboard. В fixture задано одинаковое 1500/RD80, чтобы серия тестовых игр оставалась в новом легитимном gap limit; проверка результатов не отключалась.

**23. Добавленные тесты**

Server `lobby.test.ts`: имена/trim/Unicode/control/length, inclusive boundary, custom config, batch/default rating, stale rating, DB unavailable, guests, same user, Casual, trusted display DTO, настоящие WS/action/draft обходы и REST/WS name errors. PostgreSQL `matchTypes.integration.test.ts`: сохранённое имя и blocked zero-rating-effects. Web `Play.test.tsx`: реальные данные/qualification config, отсутствие выдуманных tiers, скрытие identity в очереди, безопасный текст, privacy, empty/guest slots, filters, spectator/reserved behavior и invalid gap. Sidebar/Lobby тесты адаптированы к отдельным маршрутам. Добавлен `test:play-lobby:e2e`, расширены shell и match-types browser fixtures.

**24. Визуальная проверка**

Автоматизация использовала локальный headless Chromium/Edge через Playwright. Доступный browser skill был прочитан; его Node REPL runtime отсутствует в сессии, поэтому использован локальный fallback.

Снимки созданы для 1920×1080, 1366×768, 768×1024 и 390×844: Play provisional/qualified/queued; empty Lobby; waiting/invalid Rated; active Rated browser; reserved/active matchmaking browser. Match Found отдельно снят на 1366. Casual prematch/active/reconnect покрыт match-types smoke; активный Casual browser снят на 1366/390 и проверен guest spectator-вход. Guest sandbox снят на 1366 и 390; длинное имя — на 390.

Вручную просмотрены PNG: provisional desktop/mobile; qualified 1920; queued 768; empty 390; waiting Rated desktop; invalid Rated 390; active Rated browser 1366; Match Found 1366; active Casual 1366 и его browser/spectator 390; matchmade active browser 390; guest participant 390; long-name browser 390. Найденный слабый контраст имён Match Found исправлен и переснят. Новые smoke-проверки завершились без горизонтального overflow и page errors.

Локальные артефакты: `packages/web/test-results/play-lobby/`, `packages/web/test-results/match-types/`, `packages/web/test-results/app-shell/` (Git-ignored; они сохраняются в workspace). Каждый снимок не проходил отдельную ручную проверку; перечислены реально просмотренные состояния.

**25. Выполненные команды**

```powershell
npm.cmd install
npm.cmd run -w server prisma:generate
npm.cmd run -w server db:validate
npm.cmd run -w web typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test
npm.cmd run -w server test:lobby
npm.cmd run -w web test:shell
npm.cmd run -w web test:i18n
npm.cmd run -w web test:mobile
npm.cmd run -w web test:play-lobby:e2e
npm.cmd run -w web test:match-types:e2e
npm.cmd run -w web test:shell:e2e
npm.cmd run -w server db:migrate:deploy
```

Для БД создан task-owned `postgres:16-alpine` на `127.0.0.1:15439`, применены 8 существующих миграций. После этого последовательно выполнялись `node node_modules/tsx/dist/cli.mjs packages/server/src/tests/<file>` для `matchTypes.integration.test.ts`, `match.integration.test.ts`, `rating.integration.test.ts`, `matchmaking.integration.test.ts`, `leaderboard.integration.test.ts`, `replay.integration.test.ts`, `playerStatistics.integration.test.ts`, `matchHistory.integration.test.ts`. DATABASE_URL/DIRECT_URL/TEST_DATABASE_URL указывали на изолированную loopback test database. Production Neon не использовался. Оба созданных для задачи Docker-контейнера удалены после проверок. Также выполнен `git diff --check`.

**26. Точные результаты**

| Проверка | Итог |
| --- | --- |
| npm install / prisma:generate / db:validate | Exit 0 |
| web typecheck | Exit 0; также входит в финальный build |
| lint | Exit 0, **0 errors / 0 warnings** |
| build | Exit 0: rules, server TypeScript, web typecheck, Vite |
| root npm test | Exit 0; все включённые root suites прошли |
| server test:lobby после последнего дополнения | Exit 0 |
| web test:shell | 18/18 passed, 0 failed/skipped |
| web test:i18n после последней правки | 5/5 passed, 0 failed/skipped |
| web test:mobile | 64/64 passed, 0 failed/skipped |
| local PostgreSQL integration | 8/8 suites passed |
| Play/Lobby browser smoke | Exit 0 |
| Casual/Rated browser smoke | Exit 0 |
| AppShell browser smoke с guest sandbox | Exit 0 |
| git diff --check | Exit 0 |

Root test содержит и TAP, и обычные assertion scripts: 140 TAP tests прошли, плюс rules/server assertion suites; число 140 не является общим числом всех проверок репозитория. Финальный build имеет нефатальные Vite notices о CJS API, Browserslist data и размере chunks; lint warnings отсутствуют. Промежуточные ошибки во время реализации исправлены: неправильный workspace alias, гонка очистки rules/dist при параллельном build/test и конфликтующие игроки тестовых active-match fixtures. Проверки после исправлений зелёные.

Основные логи в workspace: `.codex-build.log`, `.codex-lint.log`, `.codex-test.log`, `.codex-lobby-final.log`, `.codex-integration.log`, `.codex-shell-final.log`, `.codex-i18n-final.log`, `.codex-mobile.log`, `.codex-play-lobby-final.log`, `.codex-match-types-browser.log`, `.codex-shell-browser-final.log`.

**27. Пределы проверки**

Production deploy и production data проверка не выполнялись. Отдельный auth browser smoke с реальной auth database не запускался; auth unit/HTTP tests и shell guest/login redirect tests прошли. Не запускалась каждая необязательная npm test-команда репозитория отдельно: выполнены root suites и перечисленные дополнительные проверки. Восстановление live room после рестарта процесса отсутствовало до задачи и не добавлено. Проверки браузера использовали test identities и изолированную fixture persistence; реальные SQL-эффекты отдельно проверены PostgreSQL suites. Не заявляется ручной просмотр каждой комбинации состояния и viewport.

**28. Сознательно отложено**

Финальные rank medal assets, утверждённые rank tier thresholds, progression до следующей медали, seasons/rewards и более богатые social lobby features. Также не добавлены новый короткий lobby code, full-text search, avatar upload, чат, друзья, distributed room recovery или другая рейтинговая система. Для будущих медалей готов reusable presentation slot; действующая квалификация и Glicko-данные уже отображаются.
