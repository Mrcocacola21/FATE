# Интеграция эмблем FATE

Исторический отчёт этапа подключения ассетов. Канонические tiers теперь реализованы;
актуальная политика описана в [README](../README.md#canonical-rank-tiers) и [отчёте следующего этапа](canonical-rank-tiers.md).

В Play подключён переиспользуемый `RankEmblem`, заменивший круг с буквой F. Восемь утверждённых изображений представлены в одном registry. Пороги рейтинга, backend и БД не изменены.

## Источник текущего ранга

Проверены Prisma-модель `Rating`, `ratingService`, rating route, frontend `CompetitiveRating`, leaderboard и qualification. Канонического tier Shadow–Destiny сейчас нет. Backend возвращает Glicko-2 rating, ratingDeviation, volatility и ratedGames. `ratingRank` в leaderboard — числовое место в таблице, не tier.

Поэтому production Play не назначает конкретную медаль. При недостаточном числе игр он показывает нейтральный орнамент и Provisional; после qualification — тот же орнамент и «Ранг не призначено» / “Rank unassigned”. Число qualification-игр берётся из существующего `/api/competitive/config`; progress означает только qualification в leaderboard.

`CompetitiveIdentity` принимает необязательный `rank`, предназначенный для будущего канонического значения. Когда оно явно передано, соответствующая медаль и локализованное название отображаются независимо от provisional/qualified. Сейчас API не имеет такого поля, поэтому `PlayPage` его не передаёт. Новый tier не добавлялся в API посредством выдуманного контракта.

## Registry и компонент

`src/ranks/rankAssets.ts` содержит `RankTier`, полный `RANK_ASSETS` и безопасный `getRankPresentation(unknown)`. У каждой записи есть `id`, нормализованный `slug`, типизированный `labelKey` и `asset`. URL разрешаются через существующий в репозитории подход `new URL(..., import.meta.url)`; Vite публикует отдельные файлы с hash. Только этот registry ссылается на изображения.

```tsx
<RankEmblem rank="BLACK_MOON" size="hero" />
<RankEmblem rank={null} size="medium" />
```

API: `rank?: string | null`, `size?: "small" | "medium" | "large" | "hero"` (по умолчанию medium), `decorative?: boolean`. Small = 40px, medium = 64px, large = 128px. Hero = `clamp(160px, 15vw, 210px)` на desktop/tablet; `clamp(110px, 30vw, 145px)` на mobile.

Неизвестные значения, включая имена inherited properties, возвращают нейтральный frame, а не другую медаль. В dev неизвестный tier вызывает `console.warn`, без вывода сырого API-значения. Изображение идентифицируется по tier, что позволяет позже добавить переход между двумя экземплярами компонента для Rank Up.

Для самостоятельной эмблемы используется локализованное accessible name на `role="img"`; внутренний bitmap имеет пустой `alt`. В Play эмблема декоративная, поскольку видимое название ранга уже сообщает ту же информацию. Filename не озвучивается.

## Presentation

Desktop и tablet сохраняют композицию identity слева и matchmaking справа. Название ранга стоит непосредственно под эмблемой; rating крупный, имя игрока и uncertainty вторичны. Qualification и количество игр сохранены. Mobile центрирует эмблему и rating, затем показывает matchmaking. Отступы уплотнены, чтобы кнопка поиска помещалась в 390×844, включая длинное украинское название.

Artwork использует `object-fit: contain`, квадратные размеры, без crop, фильтров и перекрашивания. Под эмблемой — тёмная радиальная подложка, очень слабый crimson accent и небольшая тень основания. В light theme вся competitive identity сохраняет тёмную presentation surface с читаемыми локальными theme tokens; matchmaking остаётся светлым. Нет дополнительных обводок-карточек или avatar circle.

Hero artwork появляется один раз за 400ms: opacity, translateY(6px) и scale(.98). Animation включена только при `prefers-reduced-motion: no-preference`. Постоянной анимации и hover-вращения нет.

Локали: все восемь названий, подпись эмблемы и unassigned переведены на поддерживаемые en/uk. Устаревшая строка “rank medals coming later” удалена.

## Файлы ассетов

Все файлы найдены в `packages/web/src/assets/ranks`; имена и оригиналы сохранены. Каждый PNG — 1254×1254, RGBA с прозрачностью.

| Файл | Размер, bytes | Tier |
| --- | ---: | --- |
| shadow.png | 1 777 142 | SHADOW |
| crescent.png | 1 254 389 | CRESCENT |
| half.png | 1 266 269 | HALF |
| full.png | 1 482 961 | FULL |
| eclipse.png | 1 706 343 | ECLIPSE |
| blackmoon.png | 1 511 681 | BLACK_MOON |
| nova.png | 1 861 170 | NOVA |
| destiny.png | 1 328 439 | DESTINY |

Сумма — 12 188 394 bytes. Для UI по 40–210px эти исходники велики. Оригиналы не перезаписывались; отдельного established rank-optimization workflow пока нет, поэтому web-копии не создавались. Registry хранит только URL: все восемь bitmap не preloaded и не скачиваются при простом импорте registry; изображение загружается, когда соответствующий `<img>` действительно отображается. Без назначенного tier ни одна rank PNG не запрашивается.

Проверены transparency и silhouettes: прямоугольного непрозрачного фона, растяжения и CSS-clipping нет. На 40px мелкие текстуры естественно упрощаются, основные формы читаются. Некоторые тонкие лучи исходников почти достигают края bitmap; дополнительный crop не применяется.

## Изменённые файлы

Добавлены:

- `packages/web/src/ranks/rankAssets.ts`
- `packages/web/src/ranks/RankEmblem.tsx`
- `packages/web/src/ranks/ranks.css`
- `packages/web/src/ranks/rankAssets.test.ts`
- `packages/web/src/ranks/RankEmblem.test.tsx`
- `packages/web/scripts/rank-emblems-smoke.mjs`
- `docs/rank-emblem-integration.md`

Обновлены:

- `package.json` — rank tests включены в общий `npm run test`.
- `packages/web/package.json` — `test:ranks` и `test:ranks:e2e`.
- `packages/web/src/pages/PlayPage.tsx` — новая identity presentation.
- `packages/web/src/play/play.css` — композиция, typography и mobile spacing.
- `packages/web/src/play/api.ts` — комментарий о текущем отсутствии canonical tier; контракт не изменён.
- `packages/web/src/main.tsx` — подключение shared rank CSS.
- `packages/web/src/i18n/locales/en.ts`, `uk.ts` — rank metadata translations.
- `packages/web/src/lobby/Play.test.tsx` — новый компонент и truthful unassigned assertions.
- `packages/web/scripts/play-lobby-smoke.mjs` — новый test id, отсутствие ложного artwork и CTA visibility.

Удалён `packages/web/src/play/RankMedal.tsx`.

## Проверка

Семь новых unit-тестов проверяют все реальные PNG, полный registry, локализацию, accessibility, неизвестные tiers, явно назначенный Eclipse и отсутствие rating-to-tier inference даже при высоком рейтинге. Play/Lobby tests дополнительно проверяют provisional, qualified и скрытие identity во время поиска.

Browser smoke использует production-компоненты в временном local fixture. Проверены все восемь ассетов при hero / 64px / 40px в dark/light. Проверены identity и украинское «Чорний місяць» при 1920×1080, 1366×768, 768×1024, 390×844; отсутствие overflow, сохранение aspect ratio, decoded image sizes, видимость CTA, unknown fallback и computed reduced-motion behavior. Скриншоты визуально просмотрены. Fixture удаляется в `finally`; public gallery и production overrides отсутствуют.

Существующий Play/Lobby browser scenario проверяет реальные queue/cancel/Match Found, именованные Rated lobbies, reconnect, ограничения rating gap, reserved/active rooms, запуск матчей и spectator. Общий test suite покрывает также leaderboard, profile и statistics.

Команды и финальные результаты:

| Команда | Результат |
| --- | --- |
| `npm run -w web typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, 0 errors / 0 warnings |
| `npm run build` | PASS, exit 0 |
| `npm run -w web build` | PASS, exit 0, повторная сборка после последней CSS-правки |
| `npm run test` | PASS, exit 0 |
| `npm run -w web test:ranks` | PASS, 7/7 |
| `npm run -w web test:i18n` | PASS, 5/5, exit 0 |
| `npm run -w web test:ranks:e2e` | PASS, exit 0 |
| `npm run -w web test:play-lobby:e2e` | PASS, exit 0 |

Build сообщает о большом основном JS chunk; tooling также сообщает о Vite CJS API deprecation и устаревших Browserslist data. Это не lint warnings и не ошибки сборки. Существующий app chunk не оптимизировался в рамках rank integration.

Первый одновременный запуск build/test столкнулся с общей очисткой `rules/dist` из server test script; build и зависимые browser checks затем запускались после завершения тестов. Финальные результаты выше относятся к успешным проверкам.

## Отложено

Продуктовые rating-to-tier thresholds и канонический backend tier; next-rank progress; Rank Up animation; возможные web-optimized производные PNG. Ни один из этих пунктов не реализован через догадки. Database migrations, schema changes и хранение image URL в БД отсутствуют.
