# Канонические major ranks FATE

Утверждённые пороги подключены как backend source of truth. Play, leaderboard и оба профиля показывают готовые медали. Provisional и qualification остаются отдельными от ранга. Glicko-2, числовой matchmaking, SQL sorting, initial rating, RatingHistory и Prisma schema не изменены.

## Определение и helpers

Единственная таблица порогов — `packages/server/src/rating/rankTiers.ts`, экспорт `RATING_TIERS`. Backend `RankTier` выводится из её `id`, то есть содержит ровно восемь major tiers.

| Tier | min | maxExclusive |
| --- | ---: | ---: |
| SHADOW | null | 350 |
| CRESCENT | 350 | 700 |
| HALF | 700 | 1100 |
| FULL | 1100 | 1600 |
| ECLIPSE | 1600 | 1750 |
| BLACK_MOON | 1750 | 1850 |
| NOVA | 1850 | 2000 |
| DESTINY | 2000 | null |

`getRatingTier(rating)` принимает точное floating-point значение. Не округляет его и не ограничивает rating. NaN/±Infinity вызывают `RatingError("RATING_INVALID_STATE")`; существующая валидация RatingService также отклоняет некорректное Glicko-состояние до выдачи DTO.

`getRankProgress(rating)` возвращает `currentMin`, `nextTier`, `nextRating`, `ratingToNext`, `progress`, `isMaxRank`. Для конечных интервалов progress равен `(rating - currentMin) / (nextRating - currentMin)`, ограниченному 0..1 только как presentation fraction.

Shadow: `currentMin: null`, next Crescent при 350, distance `max(0, 350 - rating)`, `progress: null`. Никакого фиктивного нижнего предела. Например, 100 даёт distance 250 без процентной шкалы.

Destiny: `currentMin: 2000`, `nextTier: null`, `nextRating: null`, `progress: null`, `ratingToNext: 0`, `isMaxRank: true`. Рейтинг 2150 остаётся 2150; 10000 также Destiny.

`getRankMetadata(rating)` объединяет tier и progress для DTO. `getRankTierIndex` и `compareRankTiers(before, after)` используют тот же порядок; результат сравнения 1 означает promotion, -1 — demotion, 0 — тот же tier. Анимация повышения/понижения не реализована.

## API

`RatingService.getPlayerRating` обогащает публичный rating read. Для существующего пользователя без Rating row сохраняются прежние defaults: 1500, RD 350, volatility .06, 0 игр; новый derived tier — **FULL**.

```json
{
  "rating": 1500,
  "ratingDeviation": 350,
  "volatility": 0.06,
  "ratedGames": 0,
  "rankTier": "FULL",
  "rankProgress": {
    "currentMin": 1100,
    "nextTier": "ECLIPSE",
    "nextRating": 1600,
    "ratingToNext": 100,
    "progress": 0.8,
    "isMaxRank": false
  }
}
```

`GET /api/users/:id/rating` по-прежнему public/no-store, с прежней UUID validation и sanitization ошибок. Ответ сохраняет существующий `userId`. Image paths не выдаются.

`LeaderboardService` добавляет `rankTier` через тот же `getRatingTier` к qualified и provisional rows. `ratingRank` по-прежнему числовое место, либо null у provisional. Eligibility, gamesUntilQualified, `LEADERBOARD_MIN_RATED_GAMES`, точность rating, sorting и pagination не менялись. Competitive config API сохраняет прежний contract.

Private/public Profile DTO не изменён: UI получает rating через уже существующий публичный endpoint. Frontend competitive client теперь использует plain public reads для rating и config, чтобы медаль публичного профиля была доступна без входа в аккаунт. Matchmaking endpoints и их authorization не менялись.

## Frontend

Существующие `RANK_ASSETS` и `RankEmblem` повторно используются. В registry по-прежнему только asset/display metadata; порогов в React нет. Wire decoders сохраняют точные rating и backend progress, проверяют типы, finite numbers, диапазон progress и null/max semantics. Неизвестный будущий tier сохраняется как semantic string для безопасного нейтрального fallback вместо неверной медали.

Play передаёт `rating.rankTier` напрямую в `RankEmblem`. Вместо прежнего отдельного `rank` prop источник identity теперь — rating DTO. `RankProgress` из `RankProgressPanel.tsx` отображает серверную fraction и следующий threshold; Shadow показывает только distance, Destiny — Max Rank без next tier. Qualification progress отдельный и подписан как qualification; provisional не скрывает и не затемняет настоящее artwork.

Leaderboard показывает reusable 40px medal рядом с avatar/именем на desktop и mobile. Числовой rating остаётся главным сравнением, порядок rows не меняется. Accessible name эмблемы сообщает локализованное название ранга.

`ProfileRank` добавлен в existing identity header собственного и публичного профиля. Использует тот же 64px RankEmblem, локализованное имя, rating и независимый provisional/qualified status. Loading/error/retry локальны; existing resource hook не даёт показать данные прежнего игрока после смены identity. Statistics-компоненты, их charts и aggregation не менялись.

Округление: **Math.floor** для отображения numeric rating в Play, profile, leaderboard и queue rating. Например, backend 1999.7/NOVA отображается как **1999/Nova**, а не 2000. Для distance применяется **Math.ceil**, поэтому 0.3 до Destiny отображается как 1. Persisted rating, tier resolution и server progress не округляются. RD сохраняет прежнее вторичное округление.

Mobile hero — `clamp(110px, 28vw, 145px)`. Вторичные name/RD компактно расположены в одной строке; обе шкалы сохраняются. Даже provisional Full с двумя progress areas оставляет CTA в viewport 390×844. Тёмная presentation surface в light theme, `object-fit: contain`, прозрачность, restrained ambient accent и reduced-motion treatment сохранены. Оригиналы восьми PNG не изменялись.

## Файлы текущего этапа

Добавлены:

- `packages/server/src/rating/rankTiers.ts`
- `packages/server/src/tests/rankTiers.test.ts`
- `packages/web/src/ranks/rankProgress.ts`
- `packages/web/src/ranks/RankProgressPanel.tsx`
- `packages/web/src/ranks/progress.test.tsx`
- `packages/web/src/ranks/testFixtures.ts` — только test data из backend helper.
- `packages/web/src/profile/ProfileRank.tsx`
- `packages/web/src/profile/ProfileRank.test.tsx`
- `docs/canonical-rank-tiers.md`

Обновлены:

- Backend: `services/ratingService.ts`, `services/leaderboardService.ts`, server `package.json`.
- Backend tests: `tests/rating.test.ts`, `leaderboard.test.ts`, `lobby.test.ts`, `matchmaking.ws.test.ts`.
- Web DTO/decoders: `play/api.ts`, `api/leaderboardApi.ts`, `leaderboard/types.ts`.
- UI: `pages/PlayPage.tsx`, `ProfilePage.tsx`, `PublicProfilePage.tsx`, `leaderboard/LeaderboardStandings.tsx`, `matchmaking/MatchmakingPanel.tsx` (только display rounding), `play/play.css`, `ranks/ranks.css`.
- Tests: `ranks/RankEmblem.test.tsx`, `lobby/Play.test.tsx`, `profile/components.test.tsx`, `leaderboard/fixtures.ts`, `api.test.ts`, `components.test.tsx`.
- i18n: `i18n/locales/en.ts`, `uk.ts` — Max Rank, next-rank labels и singular rated game.
- Browser fixtures/scripts: `rank-emblems-smoke.mjs`, `leaderboard-smoke.mjs`, `statistics-smoke.mjs`, `app-shell-smoke.mjs`, `app-shell-server.ts`, `play-lobby-server.ts`, `play-lobby-smoke.mjs`, web `package.json`.
- Docs: `README.md` и historical marker в `docs/rank-emblem-integration.md`.

Frontend paths в списке относятся к `packages/web/src`, browser scripts — к `packages/web/scripts`, backend paths — к `packages/server/src`. Изменения предыдущего этапа asset integration всё ещё находятся в общем working tree; выше перечислен именно текущий этап.

## Tests и verification

Backend rank suite: 7 tests. Покрыты -500, 0, все семь пар значений непосредственно перед границей / на границе, 1500, 1999.7, 2500, 10000, invalid NaN/±Infinity, нулевой/средний/почти полный progress всех finite tiers, Shadow, Destiny, comparison helpers и реальные injected rating API responses для нового/provisional игрока. API сохраняет 2150, не выдаёт image paths и sanitizes invalid state.

Frontend rank suite: 13 tests. Покрыты все asset mappings и локали, unknown fallback, actual tier у provisional Full, Black Moon при 1750, Shadow/Max Rank UI, backend fraction без frontend recalculation, floor на 1999.7, ceil distance, corrupted DTO и публичные reads без bearer token.

Leaderboard tests проверяют semantic tier на границах, qualified/provisional rows, сохранение numeric order и null provisional placement. UI tests обновлены под floor display и real emblem. Profile tests проверяют reuse, provisional status и смену игрока. Existing rating/Glicko и Play/Lobby tests проходят.

Browser: все восемь rank identities, provisional Full 1500/1 game, Nova 1999.7 и Destiny 2150 проверены при 1920×1080, 1366×768 и 390×844. Gallery проверяет все artwork при hero/64/40px в dark/light. Black Moon с украинской локалью дополнительно проверен на 768×1024 и в light theme. Проверяются CTA visibility, image decode/aspect ratio, overflow, unknown fallback и reduced motion. Временный fixture удаляется; production override/gallery отсутствуют. Репрезентативные screenshots просмотрены визуально.

Полные результаты команд приведены ниже. Prisma validate сначала обнаружил отсутствующий `DIRECT_URL`; повторная schema-only проверка использовала временный loopback placeholder для недостающей переменной (и DATABASE_URL при необходимости). `.env` не менялся, подключения к БД не было.

| Команда | Финальный результат |
| --- | --- |
| `npm run -w server prisma:generate` | PASS, exit 0 |
| `npm run -w server db:validate` | PASS, exit 0, с временным validation URL |
| `npm run -w web typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0; 0 errors / 0 warnings |
| `npm run build` | PASS, exit 0 |
| `npm run test` | PASS, exit 0 |
| `npm run -w server test:ranks` | PASS, 7/7 |
| `npm run -w server test:rating` | PASS, exit 0 |
| `npm run -w server test:leaderboard` | PASS, 6/6 |
| `npm run -w web test:ranks` | PASS, 13/13 в общем test suite |
| `npm run -w web test:profile` | PASS, 12/12 |
| `npm run -w web test:leaderboard` | PASS, 11/11 |
| `npm run -w web test:shell` | PASS, 18/18 |
| `npm run -w web test:i18n` | PASS, 5/5 |
| `npm run -w web test:ranks:e2e` | PASS, exit 0 |
| `npm run -w web test:play-lobby:e2e` | PASS, exit 0 |
| `npm run -w web test:leaderboard:e2e` | PASS, exit 0; 4 viewports, en/uk, tabs/sort/pagination/profile |
| `npm run -w web test:statistics:e2e` | PASS, exit 0; own/public profiles, 4 viewports, dark/light, en/uk |

Build сохраняет warning о большом JS chunk; tooling также сообщает Vite CJS API deprecation и устаревшие Browserslist data. В existing server tests есть Node MockTimers experimental warning. Это не lint warnings и не ошибки проверок.

Живой PostgreSQL integration suite и production deployment не запускались. Schema и migrations не изменены; новые API тесты используют Fastify injection с in-memory repository. Thresholds не зависят от БД и полностью покрыты pure tests.

Отложены divisions, полноценная Rank Up / Rank Down animation, seasonal ranks/rewards; optional medals в Match Found и manual lobby. Assets не оптимизировались повторно и не перерабатывались.
