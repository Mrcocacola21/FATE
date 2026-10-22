# Проверка localization migration в PostgreSQL

Дата: 2026-10-22. Рабочая копия: `C:\codes\FATE`.

## Найденный workflow

Использован существующий рецепт из `docs/testing.md`: disposable PostgreSQL
через `docker run --detach --rm`, затем `npm run test:db:prepare` и
`npm run test:integration`. Отдельных `test:db:start` / `test:integration:docker`
или test Compose profile в репозитории нет. Новая инфраструктура не добавлена.

Проверены `docker-compose.db.yml`, production `compose.yml`, `.env.test.example`,
корневой/server `package.json`, `.github/workflows/ci.yml`,
`scripts/testDatabase.cjs`, `scripts/runTests.mjs`, `scripts/testLayers.mjs`,
Prisma schema/migrations и существующие integration fixtures/cleanup.

`docker-compose.db.yml` предназначен для локальной dev-БД `fate` с постоянным
volume и портом 5432. Production Compose запускает `migrate deploy` перед server.
CI использует disposable service `postgres:16`, БД `fate_test` и тот же canonical
`test:db:prepare` / `test:integration`.

Runner проверяет URL до миграций, создаёт уникальную
`fate_integration_test_<uuid>` schema, выполняет `prisma migrate deploy`,
последовательно запускает suites, затем удаляет только принадлежащую ему schema
и освобождает lock. `db push`, `migrate dev` и reset не использовались.

## Disposable PostgreSQL и безопасность

- Контейнер: `fate-localization-test-postgres`, с `--rm`.
- Image: `postgres:16-alpine`; фактический PostgreSQL **16.15**, x86_64/Alpine.
- Image digest: `sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36`.
- Порт опубликован только на `127.0.0.1:5433`.
- Database: `fate_localization_test`; user: `fate_test`.
- Test URL: `postgresql://fate_test:local_test_password@127.0.0.1:5433/fate_localization_test`.
- Пароль в отчёте относится только к удалённой после проверки disposable БД.
- `TEST_DATABASE_URL`, `DATABASE_URL`, `DIRECT_URL` явно указывали на эту БД
  в окружениях тестовых процессов. Файлы application env не изменялись.
- Guard отклоняет production-режим, hosted/Neon URL, неправильный протокол,
  отсутствие URL и обычные dev-имена без отдельного сегмента `test`.
  Проверки guard запускаются без соединения с отклоняемыми адресами.
- Production Neon не использовался, соединения с ним не открывались,
  production infrastructure не изменялась.

## Migration и реальные round-trips

На изначально пустой БД `prisma migrate deploy` успешно применил все **12**
миграций, включая `20261022090000_expand_profile_languages`. SQL-проверка
`_prisma_migrations` подтвердила `complete = true`, `applied_steps_count = 1`
для каждой. `db:migrate:status`: `Database schema is up to date!`.
Повторный deploy: `No pending migrations to apply.`

`profile.integration.test.ts` теперь для каждого locale делает авторизованный
PATCH, проверяет Prisma read и SQL `preferredLanguage::text`, затем GET профиля
с тем же публичным кодом. Все PATCH/GET вернули 200.

| Public PATCH/GET | Prisma value | PostgreSQL enum label |
| ---------------- | ------------ | --------------------- |
| uk               | uk           | uk                    |
| en               | en           | en                    |
| pl               | pl           | pl                    |
| de               | de           | de                    |
| fr               | fr           | fr                    |
| es               | es           | es                    |
| pt-BR            | pt_BR        | pt-BR                 |
| tr               | tr           | tr                    |
| ja               | ja           | ja                    |
| ko               | ko           | ko                    |
| zh-CN            | zh_CN        | zh-CN                 |
| he               | he           | he                    |

Отрицательные PATCH для `ru`, `pt`, `pt_BR`, `zh`, `zh_CN`, `zh-TW`, `iw`,
`ar`, пустой строки и `HE`: **10 × HTTP 400 / VALIDATION_ERROR**.
Ответы не содержат raw Prisma/SQL ошибок; GET и Prisma read подтверждают,
что сохранённый язык не изменился.

Новый `profileLanguageMigration.integration.test.ts` автоматически подхватывается
существующим integration runner. В собственной временной schema он:

1. Через `prisma migrate deploy` применяет 11 исторических миграций.
2. Проверяет, что старый enum содержит только `en` и `uk`.
3. Через настоящие register/PATCH routes создаёт двух пользователей с `en`/`uk`.
4. Применяет новую migration тем же `migrate deploy`.
5. Проверяет полное равенство User/Profile records до/после migration,
   все 12 SQL enum labels и успешные authenticated GET/PATCH старых пользователей.
6. Повторяет deploy и проверяет отсутствие повторного применения migration.
7. Закрывает server/clients и удаляет только свою schema и временные файлы.

Тест использует копии исходных миграций и canonical Prisma CLI; это migration
regression fixture по существующему образцу `perModeMigration.integration.test.ts`,
без дополнительной Docker-инфраструктуры или изменения product migrations.

## Команды

Ниже приведены команды запуска и проверок; вывод сохранялся в
`.tmp-i18n-db-*.log`. `npm.cmd` использован для точной передачи `--force` через
Windows PowerShell; он выполняет те же npm scripts.

```powershell
docker version
docker compose version
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
docker run --detach --rm --name fate-localization-test-postgres --publish 127.0.0.1:5433:5432 --env POSTGRES_DB=fate_localization_test --env POSTGRES_USER=fate_test --env POSTGRES_PASSWORD=local_test_password postgres:16-alpine
docker exec fate-localization-test-postgres pg_isready -U fate_test -d fate_localization_test
docker exec fate-localization-test-postgres psql -U fate_test -d fate_localization_test -Atc "SELECT version(), current_database();"
docker inspect fate-localization-test-postgres --format '{{.Config.Image}} {{.HostConfig.AutoRemove}} {{json .HostConfig.PortBindings}} {{json .Mounts}}'
docker image inspect postgres:16-alpine --format '{{json .RepoDigests}}'

$env:NODE_ENV='test'
$env:TEST_DATABASE_URL='postgresql://fate_test:local_test_password@127.0.0.1:5433/fate_localization_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
$env:DIRECT_URL=$env:TEST_DATABASE_URL
$env:CHECKPOINT_DISABLE='1'
$env:PRISMA_HIDE_UPDATE_MESSAGE='1'

node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.tests.json --test packages/server/src/tests/unit/policies.test.ts
$env:DEBUG='prisma:*'
node node_modules/prisma/build/index.js migrate deploy --schema packages/server/prisma/schema.prisma
# DEBUG был задан только в отдельном диагностическом процессе.
npm run test:db:prepare
npm run -w server prisma:generate -- --force
npm.cmd run -w server prisma:generate -- --force
npm run -w server db:validate
npm run -w server db:migrate:status
npm.cmd run -w server test:profile:db
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.tests.json packages/server/src/tests/profileLanguageMigration.integration.test.ts
npm.cmd run -w server typecheck
npm.cmd run test:integration
docker stop fate-localization-test-postgres
docker ps --all --filter 'name=^/fate-localization-test-postgres$' --format '{{.Names}}'
docker volume ls --filter 'name=55fa1af77fcd769b0e78826981eeae75fdf0297dae6df58a6bcfd2f320b178db' --format '{{.Name}}'

# После остановки disposable DB, последовательно:
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
$env:NODE_ENV='production'
npm.cmd run build
git diff --check
```

Первый `test:db:prepare` превысил штатные 180 секунд ещё до загрузки Prisma schema;
таблицы тогда не создавались. После отключения служебной проверки обновлений
Prisma (`CHECKPOINT_DISABLE=1`) прямой диагностический `migrate deploy` успешно
мигрировал чистую БД; canonical setup затем прошёл за 2.30 секунды.
Первый PowerShell `npm ... -- --force` был перехвачен npm как собственный флаг;
через `npm.cmd` Prisma Client **6.19.0** действительно заново сгенерирован.
Первый integration preflight выявил TS7022 в новом тесте; явные типы HTTP
ответов и аккаунтов исправлены, server typecheck после исправления прошёл.
Миграции и прямые DB-тесты в этих попытках не падали.

## Итоговые результаты

SQL-проверки выполнялись внутри того же disposable контейнера:

```powershell
@'
SELECT current_database(), current_user, version();
SELECT migration_name, finished_at IS NOT NULL AND rolled_back_at IS NULL AS complete, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at;
SELECT unnest(enum_range(NULL::"ProfileLanguage"))::text AS stored_enum_label;
SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'fate_%_test_%' OR schema_name LIKE 'profile_migration_test_%';
'@ | docker exec -i fate-localization-test-postgres psql -v ON_ERROR_STOP=1 -U fate_test -d fate_localization_test

@'
SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema';
SELECT count(*) AS test_schemas_remaining FROM information_schema.schemata WHERE schema_name LIKE 'fate_%_test_%' OR schema_name LIKE 'profile_migration_test_%' OR schema_name LIKE 'modes_migration_test_%';
'@ | docker exec -i fate-localization-test-postgres psql -v ON_ERROR_STOP=1 -U fate_test -d fate_localization_test
```

`npm.cmd run test:integration`: **exit 0; 43 suite executions passed; 0 failed
suites; 855.66 seconds** по `test-results/testing/integration.json`.
В suites с TAP-выводом зарегистрирован **51 passing test**; остальные suites
используют существующие runners с `assert` и собственным выводом, поэтому
51 не является общим количеством assertions. Assertions не удалялись,
таймауты и discovery integration runner не изменялись.

Profile DB suite: exit 0 (6.29 s в полном прогоне); migration compatibility suite:
exit 0 (116.06 s). Оба также прошли отдельным запуском.

Перед остановкой Docker SQL показал только application schema `public` и
**0** временных integration/profile/per-mode migration schemas. `docker stop`
завершился с exit 0. `--rm` удалил контейнер и его anonymous volume
`55fa1af77fcd769b0e78826981eeae75fdf0297dae6df58a6bcfd2f320b178db`;
отдельные `docker ps --all` и `docker volume ls` подтвердили отсутствие обоих.
Другие контейнеры, volumes и production infrastructure не изменялись.

Все обычные проверки повторно выполнены **после** DB-тестов и удаления контейнера:

| Command                 | Exit code | Result                                                                                   | Wall time, s |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------- | -----------: |
| `npm.cmd run typecheck` | 0         | rules, server, benchmark, web, smoke harness                                             |        59.87 |
| `npm.cmd run lint`      | 0         | 0 errors / 0 warnings                                                                    |        59.24 |
| `npm.cmd run test`      | 0         | 42 suite executions; 983/983 TAP tests, включая 897 frontend; 0 failed/skipped/cancelled |       404.74 |
| `npm.cmd run build`     | 0         | rules, server, web typecheck, production Vite build                                      |       409.10 |

Регрессионный runner записал 404.12 s суммарного времени suites в
`test-results/testing/regression.json`; frontend suite — 138.61 s.
Разница с wall time команды включает orchestration overhead. Помимо TAP-тестов
выполнены существующие legacy assert-runners. Vite build завершился успешно;
имеющиеся advisory warnings не являются ошибками ESLint или сборки.

Дополнительные проверки: policy/guard tests **4/4 passed**, 0 failed/skipped;
Prisma Client **6.19.0** сгенерирован заново; `db:validate`, `db:migrate:status`,
отдельный `test:profile:db`, отдельный migration compatibility test и
`git diff --check` завершились с exit 0.

PowerShell 5.1 отклонил `-AsArray` во вспомогательном экспорте timings;
это не изменило отдельно сохранённые exit codes четырёх npm-команд.
Timing summary записан повторно совместимым `ConvertTo-Json -InputObject` в
`.tmp-i18n-db-quality-results.json`.

Основные исходные логи:

- `.tmp-i18n-db-deploy-debug.log`, `.tmp-i18n-db-prepare-retry.log`
- `.tmp-i18n-db-generate-force.log`, `.tmp-i18n-db-validate.log`, `.tmp-i18n-db-status.log`
- `.tmp-i18n-db-guards.log`, `.tmp-i18n-db-profile.log`, `.tmp-i18n-db-profile-migration.log`
- `.tmp-i18n-db-integration-retry.log`, `.tmp-i18n-db-sql.log`
- `.tmp-i18n-db-cleanup-schemas.log`, `.tmp-i18n-db-cleanup.log`
- `.tmp-i18n-db-quality-{typecheck,lint,test,build}.log`

Machine-readable suite reports:
`test-results/testing/database-prepare.json`, `integration.json`, `regression.json`.
Production Neon **не использовался и не изменялся**.
