# FATE: сортировка VFX, 19 октября 2026

**Дополнение:** позднее импортированы ещё 12 PNG из пяти архивов. Общий запас expansion теперь 296 PNG; отсутствующих геройских PNG в заказе нет, остались 56 исключённых базовых. Этот документ и его JSON сохраняют данные первой партии на 284 PNG. Актуальное дополнение: [импорт пяти паков](VFX_HERO_TOPUP_IMPORT_2026-10-19.md).

**284 PNG из 29 архивов разложены в production-папки фигур:** `packages/web/src/assets/vfx/heroes/<heroId>/expansion/`. Получен весь основной P1 — **210 PNG**, а также **74 PNG P2**. Ни один PNG не перерисовывался, не перекодировался и не заменял прежние эффекты. SHA-256 назначения совпадают с байтами файлов внутри исходных ZIP.

В каждой expansion-папке добавлен `manifest.json` с кадрами, FPS, фазой, авторской геометрией и происхождением. **Ассеты импортированы, подключение к игровым событиям ещё не выполнено.** Manifest описывает изображения, но не является записью в VFX registry или разрешением показывать скрытые события.

Исходники остались в `Ready to sort/VFX/Fate_VFX/`. Архивы и старые VFX/SFX сохранены. В production не переносились contact sheets, GIF-превью, отдельные кадры, build-скрипты, pyc и вложенный дублирующий ZIP Чингисхана.

## Проверки

| Проверка | Результат |
| --- | --- |
| Внешние ZIP | 29 архивов прочитаны, записи проверены по CRC |
| Сверка с заказом | Все 284 PNG имеют точный заказанный путь и ID; неизвестных runtime PNG нет |
| Структура | 240 анимированных горизонтальных strips и 44 статичных PNG; всего 3556 кадров |
| Формат | PNG RGBA 8 bit, frame 128×128, правильное число кадров 1/12/16/24 |
| Размеры | 128×128 static; 1536×128, 2048×128 или 3072×128 для анимаций |
| Тайминг | Анимации 24 FPS; длительность соответствует числу кадров, loop=false |
| Прозрачность | Реальный alpha; нет полностью непрозрачного фона или пустых изображений |
| Завершение | Последний кадр каждого одноразового strip полностью прозрачен |
| Границы | Содержимое не касается края кадра; соблюдён прозрачный запас минимум 8 px |
| Анимации | В каждом анимированном strip есть разные кадры; полностью одинаковых PNG по пикселям между заказами нет |
| Копирование | 284/284 SHA-256 совпадают, производственные пути имеют точное написание |
| Существующие файлы | 197 прежних VFX-файлов и 480 SFX-файлов сохранены по SHA-256 |

Структурная проверка выполнена для всех PNG. Дополнительно визуально просмотрены исходные contact sheets Кайзера, Артемиды и Папируса. Это не полный художественный аудит всех 284 эффектов и не проверка рендеринга внутри игры.

После импорта прошли **88/88 VFX-тестов**, `npm run lint`, web typecheck и аудит зарегистрированных presentation-ассетов. Старый inventory-тест, ожидавший только 137 прежних PNG, обновлён: прежнее покрытие по реестру осталось строгим, каждый новый expansion PNG отдельно сверяется с явным manifest, SHA-256, форматом и раскладкой кадров. Это не помечает новые ассеты подключёнными.

## По фигурам

| heroId | Всего PNG | P1 | P2 | Папка |
| --- | --- | --- | --- | --- |
| artemida | 10 | 7 | 3 | [expansion](../../packages/web/src/assets/vfx/heroes/artemida/expansion/) |
| asgore | 14 | 13 | 1 | [expansion](../../packages/web/src/assets/vfx/heroes/asgore/expansion/) |
| chikatilo | 9 | 7 | 2 | [expansion](../../packages/web/src/assets/vfx/heroes/chikatilo/expansion/) |
| donKihote | 8 | 7 | 1 | [expansion](../../packages/web/src/assets/vfx/heroes/donKihote/expansion/) |
| duolingo | 9 | 8 | 1 | [expansion](../../packages/web/src/assets/vfx/heroes/duolingo/expansion/) |
| elCidCompeador | 8 | 7 | 1 | [expansion](../../packages/web/src/assets/vfx/heroes/elCidCompeador/expansion/) |
| femto | 9 | 6 | 3 | [expansion](../../packages/web/src/assets/vfx/heroes/femto/expansion/) |
| frisk | 9 | 7 | 2 | [expansion](../../packages/web/src/assets/vfx/heroes/frisk/expansion/) |
| genghisKhan | 8 | 7 | 1 | [expansion](../../packages/web/src/assets/vfx/heroes/genghisKhan/expansion/) |
| grand-kaiser | 7 | 7 | 0 | [expansion](../../packages/web/src/assets/vfx/heroes/grand-kaiser/expansion/) |
| griffith | 7 | 6 | 1 | [expansion](../../packages/web/src/assets/vfx/heroes/griffith/expansion/) |
| grozny | 12 | 7 | 5 | [expansion](../../packages/web/src/assets/vfx/heroes/grozny/expansion/) |
| guts | 12 | 7 | 5 | [expansion](../../packages/web/src/assets/vfx/heroes/guts/expansion/) |
| hassan | 10 | 7 | 3 | [expansion](../../packages/web/src/assets/vfx/heroes/hassan/expansion/) |
| jackRipper | 11 | 7 | 4 | [expansion](../../packages/web/src/assets/vfx/heroes/jackRipper/expansion/) |
| jebe | 10 | 7 | 3 | [expansion](../../packages/web/src/assets/vfx/heroes/jebe/expansion/) |
| kaladin | 10 | 8 | 2 | [expansion](../../packages/web/src/assets/vfx/heroes/kaladin/expansion/) |
| kaneki | 10 | 7 | 3 | [expansion](../../packages/web/src/assets/vfx/heroes/kaneki/expansion/) |
| lechy | 14 | 8 | 6 | [expansion](../../packages/web/src/assets/vfx/heroes/lechy/expansion/) |
| loki | 11 | 8 | 3 | [expansion](../../packages/web/src/assets/vfx/heroes/loki/expansion/) |
| luche | 9 | 7 | 2 | [expansion](../../packages/web/src/assets/vfx/heroes/luche/expansion/) |
| mettaton | 12 | 7 | 5 | [expansion](../../packages/web/src/assets/vfx/heroes/mettaton/expansion/) |
| odin | 9 | 7 | 2 | [expansion](../../packages/web/src/assets/vfx/heroes/odin/expansion/) |
| papyrus | 12 | 7 | 5 | [expansion](../../packages/web/src/assets/vfx/heroes/papyrus/expansion/) |
| riverPerson | 7 | 7 | 0 | [expansion](../../packages/web/src/assets/vfx/heroes/riverPerson/expansion/) |
| sans | 10 | 8 | 2 | [expansion](../../packages/web/src/assets/vfx/heroes/sans/expansion/) |
| undyne | 11 | 7 | 4 | [expansion](../../packages/web/src/assets/vfx/heroes/undyne/expansion/) |
| vladTepes | 10 | 7 | 3 | [expansion](../../packages/web/src/assets/vfx/heroes/vladTepes/expansion/) |
| zoro | 6 | 5 | 1 | [expansion](../../packages/web/src/assets/vfx/heroes/zoro/expansion/) |

## Метаданные для будущего подключения

В 17 записях авторский abilityId отличается от общего обозначения в заказе: например, `defense` против `berserkAutoDefense` или `stealth` против `artemidaStealth`. Изображение от этого не повреждено. В metadata сохранены обе записи, но исходная подпись не перенесена в игровой роутинг. В частности, подпись Berserker в паке Luche не означает, что персонажу добавлена эта черта: для подключения защиты нужно следовать актуальным правилам копейщика. `blind_status` Luche применим к трём источникам Blind из заказа, а не только к авторской подписи `lucheShine`.

Источник Кайзера — отдельный архив `FATE_Grand_Kaiser_P1_Approved_Gunmetal_Red_VFX.zip`; его стальная/красная палитра сохранена как поставлена.

## Остаток полного заказа

Основной P1 закрыт целиком. Из полного плана 352 PNG осталось 68 путей, не включённых в эти архивы: 2 P1 NEEDS_EVENT, 12 P2 EXTEND, 2 P2 NEEDS_EVENT, 52 P2 NEW. Это отсутствующие последующие/отложенные ассеты, они не подменены превью или чужими изображениями.

Подробности по каждому файлу, метаданные авторов, результаты alpha/кадров, хеши архивов и недостающие пути: [манифест импорта](vfx_expansion_import_2026-10-19.json). Исходное ТЗ: [VFX brief](LIVING_GAME_VFX_PACK_BRIEF_RU.md).
