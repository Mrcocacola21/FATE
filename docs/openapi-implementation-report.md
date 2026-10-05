# Отчёт об OpenAPI для FATE

Реализована спецификация **OpenAPI 3.0.3 для 43 REST-операций**. Swagger UI доступен
через `/docs`, канонический JSON — через `/openapi.json`. Схемы запросов берутся из
реальной Zod-валидации, схемы ответов автоматически выводятся из действующих DTO
и типов результатов сервисов. Самостоятельной модели API с вручную повторёнными
полями ответов нет.

## Найденная инфраструктура и выбранная интеграция

В исходном проекте используются Fastify 4, TypeScript в режиме strict / CommonJS,
Zod 3, модульные Fastify-регистрации и ручной `parseInput`. Общий hook проверяет
query-параметры, JSON parser и `AppError` формируют единый error envelope.
Существовавших Swagger/OpenAPI-пакетов, type provider и схем сериализации ответов
не обнаружено. DTO формируются безопасными функциями и сервисами, отдельно от
полных моделей Prisma.

Добавлены `@fastify/swagger` 8.15.0, `@fastify/swagger-ui` 2.1.0 и
`zod-to-json-schema` 3.25.2. Это версии Swagger-плагинов для текущего Fastify 4,
без перехода на Fastify 5 и замены runtime-валидации.
Совместимость указана в официальной документации
[@fastify/swagger](https://github.com/fastify/fastify-swagger#compatibility) и
[@fastify/swagger-ui](https://github.com/fastify/fastify-swagger-ui#compatibility).
Разрешённые установленными зависимостями версии Fastify/Zod: 4.29.1 / 3.25.76.

Выбрана OpenAPI 3.0.3: адаптер Zod использует свой явный `openApi3` target, а
nullable-схемы переводятся в совместимое представление 3.0. Переход на 3.1 для
этого этапа не навязывается. Swagger Parser и AJV используются для проверок;
генератор ответов использует уже имеющийся TypeScript compiler API.

## Источники контрактов

- `documented()` хранит ссылки на действующие Zod body/params/query-схемы непосредственно
  в конфигурации маршрута. Query-hook использует тот же объект схемы.
- Swagger преобразует metadata для документации. Конвертированные схемы не передаются
  Fastify для повторной валидации или изменения сериализации.
- `responseTypes.ts` связывает ответы с `ReturnType` / `Awaited<ReturnType>` реальных
  auth/profile DTO-функций, match/history/statistics/rating/leaderboard/replay сервисов,
  безопасных admin DTO и audit reader. Короткие `{ user }` / `{ profile }` оболочки
  соответствуют существующим transport envelopes.
- DTO builders для выдачи access/session credentials, создания комнаты/игры и health
  выделены из существующих handlers без изменения структуры этих ответов.
- Генератор читает через TypeScript свойства, обязательность, literal enums, unions,
  массивы и словарные index types. Никакие request/response поля в генераторе не
  перечислены вручную. `any`, Date, callable и неподдерживаемые tuple-типы вызывают
  ошибку генерации. Намеренные `unknown` JSON payload сохраняют свою расширяемость.
- Генерируемый `src/openapi/generated/responses.json` хранится как производный артефакт.
  `openapi:check` обнаруживает устаревший файл; prebuild обновляет его автоматически.
  В production компилятор не загружается и DB introspection не выполняется.
- Общие `ApiError` и `ValidationError` выводятся из канонических Zod error schemas.
  Возвращаемый тип `AppError` и тип normalized validation fields связаны с ними.
  Zod-ошибки содержат `details.fields` с `path` и `message`; parser failures могут
  не содержать details. Error codes остаются расширяемой строкой.
- Integer query pipelines получают min/max и defaults из действующего Zod pipeline.
  Date-range refinements и запрет control characters в lobbyName описаны отдельно;
  runtime Zod продолжает выполнять эти ограничения.

Проверки реальных JSON-ответов выполняются и для исходной DTO-схемы, и для её
OpenAPI-представления. Они покрывают auth, public/private profile, public match,
match history, statistics, rating/all-mode ratings, leaderboard, replay metadata/state,
admin user DTO, audit, room creation и readiness. Проверены пропущенные private поля,
nullable averages и rank progress для Shadow/Destiny.

## Покрытие маршрутов

| Область / tag | Реальные операции и особенности |
| --- | --- |
| Auth | `/api/auth/register`, `/login`, `/refresh`, `/logout`, `/me`; login/register требуют user в ответе, refresh возвращает только access credentials; logout — 204 без JSON body. |
| Users / Profiles | Public lookup `/api/users/{username}`; GET/PATCH `/api/profile`. Public DTO не содержит email, private DTO содержит email и preferences. |
| Matches | Public `/api/matches/{id}`, authenticated GET `/actions`, public `/api/users/{id}/matches`. Исторические participants, результат и nullable поля соответствуют DTO. |
| Statistics | `/api/users/{id}/statistics`; реальные averages/sample sizes/streaks/byGameMode, без запланированных hero statistics. |
| Ratings | `/api/users/{id}/rating`, `/ratings`, `/rating/history`; независимые Standard/Draft/Classic, Glicko-2 rating/RD/volatility/ratedGames и backend rank progress. |
| Rank DTO | RankTier выводится из доменного типа, связанного с `RATING_TIERS`: SHADOW, CRESCENT, HALF, FULL, ECLIPSE, BLACK_MOON, NOVA, DESTINY. Пороги не дублируются в prose. |
| Leaderboard | `/api/leaderboard` и `/api/competitive/config`; реальные mode/status/page/limit/sort/order, per-mode qualification. Config возвращает minRatedGames, а не rank thresholds. |
| Replay | Authenticated GET `/api/matches/{id}/replay` и `/replay/state?revision=…`; safe ReplayView, реальные revision bounds, timeline, MATCH_NOT_REPLAYABLE / INVALID_REPLAY_REVISION и integrity conflicts. |
| Lobbies | GET/POST `/rooms`, GET `/rooms/{id}`, POST `/api/games`; optional Bearer для Casual, обязательная учётная запись для Rated, реальные creation и initial-view DTO. |
| Matchmaking | GET/POST/DELETE `/api/matchmaking/queue`; per-mode rated queue, реальные discriminated queue states, rate limit и connection/state conflicts. |
| Admin | Summary, users/details/block/unblock/role, matches/details/actions. Роль указана явно; email только для ADMIN, snapshots содержат только metadata. |
| Audit | Только GET `/api/admin/audit`, ADMIN-only; реальные filters/pagination/events/metadata. Отсутствуют POST/PATCH/DELETE endpoints. |
| Operations | `/`, `/api/capabilities`, `/health`, `/api/health`, `/ready`. Readiness 503 возвращает `{ ok: false }`, без принудительной замены на ApiError. |
| Heroes | `/api/heroes` и `/api/heroes/{id}`; действующий публичный каталог figure metadata. |

Исторические gameMode/finishReason строки остаются настолько широкими, насколько
это допускают реальные DTO; текущий выбор режима использует canonical enum.
Casual/Rated классификация отделена от gameMode. ISO timestamps помечаются как
date-time; numeric room timestamps сохраняются числовыми. UUID-ограничения params
берутся из Zod, response strings не объявляются UUID без соответствующего типа.

## Auth, безопасность и публикация

`BearerAuth` — HTTP Bearer JWT. `RefreshCookie` — apiKey in cookie с реальным именем
`fate_refresh`. Cookie остаётся HttpOnly с path `/api/auth`, Secure в production;
SameSite соответствует существующей конфигурации. В JSON refresh token отсутствует.
Logout допускает отсутствие cookie и остаётся идемпотентным.

Browser auth mutations требуют trusted Origin. Нативные/CLI клиенты могут не
отправлять Origin. Swagger не читает HttpOnly cookie и не обходит эту политику.
Admin требует MODERATOR или ADMIN; audit и изменение роли требуют ADMIN. Реальные
persisted role/status checks сохранены, 403 ACCOUNT_BLOCKED документирован и проверен.

Документация доступна в production по умолчанию. `SWAGGER_UI_ENABLED=false` отключает
UI; `OPENAPI_ENABLED=false` отключает оба публичных URL. Переключатели добавлены в
`.env.example`. Servers используют относительный `/`, без локальных IP, staging URL
или значений секретного окружения. Version читается из server package.json.

Скрыты `/ws`, диагностические GET `/api/games/{id}`, GET `/api/games/{id}/log` и
POST `/api/games/{id}/actions`. Production docs не содержат test-only операций.
Shared creation schemas сохраняют реальные gated diagnostic fields — с пояснением,
без примеров токенов. Figure Set selection, seated lobby join/start и live actions
остаются WebSocket-функциями; REST endpoints для них не придуманы.

Примеры: synthetic register/login input, normalized validation error, server error
и отдельные status-specific auth/domain errors, сформированные из текущих canonical
error mappings. Реальные пароли, токены и данные игроков в spec не используются.

## Проверки и результаты

| Выполненная команда / проверка | Результат |
| --- | --- |
| `npm run -w server prisma:generate` | Exit 0, Prisma Client 6.19.0 generated. |
| `npm run -w server db:validate` | Exit 0 с временными synthetic loopback DATABASE_URL/DIRECT_URL. Первый запуск без DIRECT_URL вернул P1012; конфигурация production не изменялась, соединение с DB для schema validation не требуется. |
| `npm run -w server typecheck` | Exit 0. |
| `npm run -w web typecheck` | Exit 0; также выполнен внутри полной сборки. |
| `npm run lint` | Exit 0, 0 errors / 0 warnings (`--max-warnings 0`). |
| `npm run build` | Exit 0 для rules/server/web. Существующие Vite CJS/Browserslist/chunk-size notices остаются. |
| `npm run test` | Exit 0, все предусмотренные root script suites прошли, включая новые OpenAPI-проверки. |
| `npm run -w server test:openapi` | 5 passed, 0 failed; включён в server/root test workflow. |
| `npm run -w server openapi:schemas` | Exit 0; генерируемые response schemas обновлены. |
| `npm run -w server openapi:check` | Exit 0: schemas match current DTO types. |
| `npm run -w server openapi:validate` | Exit 0, valid OpenAPI 3.0.3, 43 operations. |
| `npm run -w server openapi:generate` | Exit 0; создан ignored `docs/generated/openapi.json`, без timestamps/DB introspection. |
| GET `/openapi.json` | 200, корректный JSON с info/paths/components. |
| Chrome + Playwright smoke | UI загружен: 14 tags, 43 operations, schemas и fake login example отображаются, Bearer/cookie dialog работает; 0 page/console errors. |
| `git diff --check` | Exit 0. |

Swagger Parser проверяет структуру spec и references. Inventory test сравнивает
зарегистрированные production routes со spec, проверяет explicit exclusions и уникальные
operationIds. Поиск secret field names, auth/cookie/RBAC/status assertions и AJV response
drift tests проходят. Persistent audit/action history остаются read-only.

Отдельные `*:db` integration scripts не запускались: isolated test database не настроена.
Root test workflow прошёл целиком; никакие миграции и записи в production DB не выполнялись.

## Файлы и небольшие исправления контрактов

Добавлены:

- `docs/openapi.md` и этот отчёт.
- `packages/server/src/openapi/{contract,register,schemas,responseTypes}.ts`.
- `packages/server/src/openapi/generated/responses.json` — автоматически выводимый DTO artifact.
- `packages/server/scripts/generateResponseSchemas.cjs`.
- `packages/server/src/scripts/generateOpenApi.ts`.
- `packages/server/src/errors/schemas.ts`.
- `packages/server/src/tests/{openapi.test,assertDocumentedResponse}.ts`.

Изменены server package/lock/tsconfig, `.env.example`, `.gitignore`, server bootstrap,
root REST routes и route modules, error/validation helpers, admin DTO, avatar schema
description, WS hide metadata. В существующие rating/statistics/history/leaderboard/
replay/admin rating tests добавлены assertions соответствия documented schemas.

Ответ `/api/games` выявил действующее расхождение: `makePlayerView` отдавал внутренние
`stakeCounter` / `jackTrapCounter`, хотя `PlayerView` явно исключал эти поля. Исправлено
только публичное projection spread в `packages/rules/src/view/player.ts`.
Авторитетное состояние, правила и счётчики внутри движка сохранены.

Admin match DTO теперь использует существующий `matchTypeFromRated`, а origin/identityType
сохраняют фактические literal types. Значения JSON не изменились; исчезло неоправданное
расширение canonical enum до произвольной строки. `lib: ES2022` отражает уже используемый
в проекте `Array.at`; target ES2020 не изменён. `resolveJsonModule` нужен для DTO artifact.

Ни один поддерживаемый production REST route не остался без документации.
Не добавлены Prisma migrations, новые бизнес-операции или изменения matchmaking,
rating, restart recovery, RBAC и audit поведения.

WebSocket/AsyncAPI documentation, generated client SDK, дальнейшее CI enforcement
и public developer portal намеренно оставлены отдельным будущим этапам.
