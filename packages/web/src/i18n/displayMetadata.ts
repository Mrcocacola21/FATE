import type { UnitState } from "rules";
import { HERO_CATALOG } from "../figures/catalog";
import { FALSE_TRAIL_TOKEN_ID } from "../rulesHints";
import type { Language, Translate } from ".";
import { en } from "./locales/en";
import { uk } from "./locales/uk";

type AbilityTranslation = { name: string; description: string };

const heroCatalogById = new Map(HERO_CATALOG.map((hero) => [hero.id, hero]));

const heroNamesUk: Record<string, string> = {
  "base-assassin": "Базовий убивця",
  "base-archer": "Базовий лучник",
  "base-berserker": "Базовий берсерк",
  "base-rider": "Базовий вершник",
  "base-spearman": "Базовий списник",
  "base-trickster": "Базовий трикстер",
  "base-knight": "Базовий лицар",
  chikatilo: "Андрій Чикатило",
  hassan: "Хасан ібн Саббах",
  frisk: "Фріск",
  "grand-kaiser": "Великий Кайзер",
  jebe: "Джебе",
  mettaton: "Меттатон",
  grozny: "Іван Грозний",
  guts: "Ґатс",
  undyne: "Андайн",
  odin: "Одін",
  riverPerson: "Річкова Людина",
  vladTepes: "Влад III Цепеш",
  kaladin: "Каладін Благословенний Бурею",
  papyrus: "Папірус",
  sans: "Санс",
  lechy: "Лісовик",
  loki: "Локі",
  elCidCompeador: "Ель Сід Кампеадор",
  griffith: "Ґріффіт",
  asgore: "Азґор Дрімурр",
  genghisKhan: "Чингісхан",
  femto: "Фемто",
  duolingo: "Дуелінго",
  luche: "Луче",
  kaneki: "Канекі Кен",
  zoro: "Зоро",
  donKihote: "Дон Кіхот",
  jackRipper: "Джек-Різник",
  artemida: "Артеміда",
};

const abilitiesUk: Record<string, AbilityTranslation> = {
  berserkAutoDefense: {
    name: "Автозахист берсерка",
    description: "За повного заряду автоматично ухиляється від атаки й витрачає всі заряди.",
  },
  tricksterAoE: {
    name: "Область трикстера",
    description: "Атака області 5×5. Вражає союзників, але не самого героя.",
  },
  kaiserBunker: {
    name: "Бункер",
    description:
      "Замість скритності може увійти в бункер на 4–6. Позицію видно, а влучання завдають 1 шкоди.",
  },
  kaiserDora: {
    name: "Дора",
    description:
      "З бункера оберіть область 3×3 із центром на лінії атаки та атакуйте всі фігури в ній.",
  },
  kaiserCarpetStrike: {
    name: "Килимовий удар",
    description:
      "Визначає центр області 5×5 і атакує всіх у ній. Завжди завдає 1 шкоди; Кайзер у бункері не страждає.",
  },
  kaiserEngineeringMiracle: {
    name: "Інженерне диво",
    description:
      "Надає класи вершника й берсерка та безкоштовну «Дору», але вимикає скритність і бункер.",
  },
  vladPolkovodets: {
    name: "Полководець",
    description:
      "Союзники в сусідніх клітинках отримують +1 до шкоди. Ефект не діє на власника й не складається.",
  },
  vladIntimidate: {
    name: "Залякувальний погляд",
    description: "Після успішного захисту можна відштовхнути нападника на одну вільну клітинку.",
  },
  vladStakes: {
    name: "Поле кілків",
    description: "Розміщує 3 приховані кілки на початку бою та починаючи з другого власного ходу.",
  },
  vladForest: {
    name: "Ліс мертвих",
    description:
      "Автоматичний фантазм-імпульс: на початку ходу Влада, коли він має 9 кілків, витрачає 9 найстаріших кілків і пропонує обрати область 3×3.",
  },
  genghisKhanLegendOfTheSteppes: {
    name: "Легенда степів",
    description: "+1 до шкоди проти цілей, яких герой атакував у попередньому ході.",
  },
  genghisKhanKhansDecree: {
    name: "Указ хана",
    description: "Дозволяє цього ходу рухатися по діагоналі та одразу виконати переміщення.",
  },
  genghisKhanMongolCharge: {
    name: "Монгольська навала",
    description: "Рух по прямій; союзники в пройденому коридорі можуть по одному разу атакувати.",
  },
  groznyInvadeTime: {
    name: "Час вторгнення",
    description: "Перемістіть героя на будь-яку вільну клітинку поля.",
  },
  groznyTyrant: {
    name: "Тиран",
    description:
      "Може добити ослабленого союзника, відновити здоров’я, посилити шкоду й отримати додаткові переміщення.",
  },
  chikatiloTough: { name: "Живучий", description: "+1 до максимального здоров’я." },
  chikatiloFalseTrail: {
    name: "Хибний слід",
    description:
      "На початку бою замінюється жетоном і приховано розміщується будь-де. Розкриття автоматично підриває жетон.",
  },
  chikatiloAssassinMark: {
    name: "Мітка вбивці",
    description:
      "Не виходячи зі скритності, позначте ціль у радіусі 2. Атака Чикатіла зі скритності по ній отримує +1 шкоди.",
  },
  chikatiloDecoy: {
    name: "Приманка: скритність",
    description:
      "Витратьте 3 Очки приманки та спробу скритності, щоб сховатися без кидка, або витратьте 3 Очки перед захистом, щоб отримати рівно 1 шкоду.",
  },
  falseTrailTrap: {
    name: "Пастка хибного сліду",
    description:
      "Коли жетон гине, він атакує істоту, яка його вбила; невдалий захист завдає 3 шкоди.",
  },
  falseTrailExplosion: {
    name: "Вибух",
    description: "Жетон атакує всі фігури в сусідніх клітинках; невдалий захист завдає 1 шкоди.",
  },
  elCidCompeadorTisona: {
    name: "Тісона",
    description: "Атакує всіх на обраній прямій горизонтальній або вертикальній лінії.",
  },
  elCidCompeadorKolada: {
    name: "Колада",
    description: "На початку ходу виконує одну атаку проти кожної фігури в сусідніх клітинках.",
  },
  elCidCompeadorDemonDuelist: {
    name: "Демон-дуелянт",
    description:
      "Послідовно атакує обрану ціль, доки атаки успішні. Після промаху можна сплатити 1 здоров’я й продовжити.",
  },
  lechyGiant: { name: "Велетень", description: "+3 до максимального здоров’я." },
  lechyNaturalStealth: { name: "Природна скритність", description: "Скритність успішна на 5–6." },
  lechyGuideTraveler: {
    name: "Провідник мандрівника",
    description:
      "Оберіть союзника в радіусі трикстера, перемістіть Лісовика й перенесіть союзника до його нової позиції.",
  },
  lechyConfuseTerrain: {
    name: "Заплутана місцевість",
    description: "Створює лісову мітку. Для виходу або проходу крізь ауру потрібен кидок 5–6.",
  },
  lechyStorm: {
    name: "Буря",
    description:
      "Замінює арену бурею: фігури поза лісом ризикують отримати шкоду та втрачають дальні атаки.",
  },
  griffithWretchedMan: {
    name: "Жалюгідна людина",
    description: "Усі атаки Ґріффіта завдають на 1 менше шкоди, але не нижче нуля.",
  },
  griffithFemtoRebirth: {
    name: "Відродження Фемто",
    description: "Після смерті Ґріффіт одразу відроджується як Фемто в тій самій клітинці.",
  },
  femtoGodHp: {
    name: "Бог",
    description: "Фемто отримує +5 здоров’я понад базове здоров’я берсерка.",
  },
  femtoMultiBerserkSpear: {
    name: "Мультиклас: берсерк і списник",
    description:
      "Поєднує основу берсерка, дальність і захист списника та автоматичне влучання лицаря на дублях.",
  },
  femtoDivineMove: {
    name: "Божественне переміщення",
    description: "Киньте 1d6: на 1–3 телепорт у радіусі 2, на 4–6 — на будь-яку вільну клітинку.",
  },
  gutsArbalet: {
    name: "Ручний арбалет",
    description: "Дальня атака за правилами лучника, яка завжди завдає рівно 1 шкоди.",
  },
  gutsCannon: {
    name: "Ручна гармата",
    description: "Дальня атака за правилами лучника зі звичайною шкодою.",
  },
  gutsBerserkMode: {
    name: "Режим берсерка",
    description:
      "Витрачає 3 заряди: посилює ближній бій і змінює правила шкоди, але завдає шкоди наприкінці ходу.",
  },
  gutsExitBerserk: {
    name: "Вийти з режиму берсерка",
    description: "Раз за гру завершує режим берсерка й витрачає дію.",
  },
  odinGungnir: {
    name: "Ґунґнір",
    description: "Дублі на кидку атаки стають автоматичними влучаннями.",
  },
  odinHuginn: {
    name: "Ворон Гуґінн",
    description: "Дозволяє бачити й атакувати прихованих ворогів у сусідніх клітинках.",
  },
  odinMuninn: {
    name: "Ворон Мунінн",
    description:
      "Після кидка захисту можна витратити 6 зарядів і перетворити його на автоматичний успіх.",
  },
  odinSleipnir: {
    name: "Слейпнір",
    description:
      "За 3 заряди телепортує на будь-яку вільну клітинку без витрати переміщення чи дії.",
  },
  lokiIllusoryDouble: {
    name: "Ілюзорний двійник",
    description: "Кожен дубль у будь-якому ігровому кидку додає Локі 1 Сміх, максимум 15.",
  },
  lokiLaught: {
    name: "Сміх Локі",
    description: "Витрачайте Сміх на хитрощі Локі. Використання не розкриває його скритність.",
  },
  jebeDurable: { name: "Витривалий", description: "+1 до максимального здоров’я." },
  jebeHailOfArrows: {
    name: "Град стріл",
    description:
      "Оберіть область 3×3 із центром на лінії атаки лучника та атакуйте всі фігури в ній.",
  },
  jebeKhansShooter: {
    name: "Стрілець хана",
    description:
      "Витрачає 6 зарядів, визначає кількість рикошетів і послідовно атакує обрані легальні цілі.",
  },
  hassanOneWithSand: { name: "Єдиний із піском", description: "Скритність успішна на 4–6." },
  hassanTrueEnemy: {
    name: "Справжній ворог",
    description: "Оберіть ворога в радіусі 2: він виконує одну звичайну атаку по доступній цілі.",
  },
  hassanAssasinOrder: {
    name: "Орден убивць",
    description: "На початку бою двоє союзних героїв отримують поріг скритності 5–6 до кінця гри.",
  },
  kaladinFirst: { name: "Перша клятва — Перший ідеал", description: "Відновлює собі 2 здоров’я." },
  kaladinSecond: {
    name: "Друга клятва — Клятва захисту",
    description: "Надає рух і атаку області трикстера на додачу до набору списника.",
  },
  kaladinThird: {
    name: "Третя клятва — Клятва прийняття",
    description: "+1 шкоди для атак ближнього бою в режимі списника.",
  },
  kaladinFourth: {
    name: "Четверта клятва — Клятва обмеження",
    description: "Надає набір властивостей берсерка.",
  },
  kaladinFifth: {
    name: "П’ята клятва — Клятва звільнення",
    description: "Атака області 5×5 завдає 2 шкоди й знерухомлює цілі до наступного ходу Каладіна.",
  },
  friskPacifism: {
    name: "Пацифізм",
    description: "Витрачайте очки Пацифізму на мирні ефекти, що не розкривають скритність Фріск.",
  },
  friskGenocide: {
    name: "Геноцид",
    description: "Витрачайте очки Геноциду на агресивні дії та реакції Фріск.",
  },
  friskCleanSoul: {
    name: "Чиста душа",
    description:
      "Якщо Фріск виходить зі скритності без атаки, наступна ворожа атака автоматично промахується.",
  },
  friskOnePath: {
    name: "Один шлях",
    description: "Після вбивства перетворює весь Пацифізм на Геноцид і назавжди вимикає Пацифізм.",
  },
  sansLongLiver: { name: "Довгожитель", description: "Санс отримує +2 до максимального здоров’я." },
  sansGasterBlaster: {
    name: "Ґастер-бластер",
    description: "За 2 заряди атакує всі фігури на обраній лінії пострілу.",
  },
  sansBadassJoke: {
    name: "Крутий жарт",
    description:
      "За 3 заряди атакує ворогів у зоні трикстера; невдалий захист блокує їхнє наступне переміщення.",
  },
  sansSpearmanFeature: {
    name: "Властивість списника",
    description: "Дубль у захисті дає автоматичне ухилення.",
  },
  sansUnbeliever: {
    name: "Санс-невіруючий",
    description: "Після смерті союзного героя відкриває «Поле кісток», «Сон» і «Останню атаку».",
  },
  sansBoneField: {
    name: "Поле кісток",
    description: "Після перетворення замінює арену Полем кісток на 1d6+1 ходів.",
  },
  sansSleep: {
    name: "Сон",
    description: "Після перетворення витрачає 3 заряди й відновлює Сансу 2 здоров’я.",
  },
  sansLastAttack: {
    name: "Остання атака",
    description:
      "Після смерті Санса проклинає ворога: той втрачає 1 здоров’я на початку ходу, доки не лишиться 1.",
  },
  undyneTough: { name: "Живуча", description: "Андайн отримує +1 до максимального здоров’я." },
  undyneSpearmanMulticlass: {
    name: "Мультиклас списника",
    description: "Андайн отримує захисні властивості списника.",
  },
  undyneSpearThrow: {
    name: "Кидок списа",
    description: "Дальня атака по одній цілі, що при влучанні завжди завдає 1 шкоди.",
  },
  undyneEnergySpear: {
    name: "Енергетичний спис",
    description: "За 2 заряди атакує всі фігури в обраному рядку або стовпці на 1 шкоду.",
  },
  undyneSwitchDirection: {
    name: "Зміна напрямку",
    description: "Після успішного захисту може пересунути нападника на сусідню вільну клітинку.",
  },
  undyneUndying: {
    name: "Безсмертна Андайн",
    description:
      "Раз за гру воскресає з 3 здоров’я, обмежує вхідну шкоду до 1 й отримує бойові бонуси.",
  },
  asgoreFireball: {
    name: "Вогняна куля",
    description: "Дальня атака по одній цілі за правилами лучника.",
  },
  asgoreFireParade: {
    name: "Вогняний парад",
    description: "Одним спільним кидком атакує всі фігури в області атаки трикстера.",
  },
  asgoreSoulParade: {
    name: "Парад душ",
    description: "За повного заряду на початку ходу кидає 1d6 і застосовує один ефект душі.",
  },
  papyrusBlueBone: {
    name: "Синя кістка",
    description:
      "Влучання накладає Синю кістку: витрата переміщення цього ходу одразу завдає 1 шкоди.",
  },
  papyrusSpaghetti: {
    name: "Смачні спагеті",
    description: "За 3 заряди відновлює Папірусу 2 здоров’я.",
  },
  papyrusCoolGuy: {
    name: "Крутий хлопець",
    description: "Атакує всі фігури на обраній прямій. Коштує 5 зарядів або 3 після перетворення.",
  },
  papyrusUnbeliever: {
    name: "Папірус-невіруючий",
    description:
      "Після смерті союзника назавжди відкриває Помаранчеву й Довгу кістки та Скам’яніння.",
  },
  papyrusOrangeBone: {
    name: "Помаранчева кістка",
    description:
      "Після перетворення для кожної влученої цілі окремо обирається Синя або Помаранчева кістка.",
  },
  papyrusLongBone: {
    name: "Довга кістка",
    description:
      "Після перетворення дозволяє зробити базову атаку лінійною та зберігає вибрану вісь.",
  },
  papyrusOssified: {
    name: "Скам’яніння",
    description: "Після перетворення Папірус отримує автозахист берсерка.",
  },
  mettatonLongLiver: {
    name: "Довгожитель",
    description: "Меттатон отримує +2 до максимального здоров’я.",
  },
  mettatonRating: {
    name: "Рейтинг",
    description: "+2 рейтингу за успішне влучання та +1 за успішний захист.",
  },
  mettatonPoppins: {
    name: "Меттатон Поппінс",
    description: "За 3 рейтинги атакує всі фігури в області 3×3 із центром на лінії атаки.",
  },
  mettatonWorkOnCamera: {
    name: "Робота на камеру",
    description: "Не може входити в скритність, але отримує схему руху вершника.",
  },
  mettatonEx: {
    name: "Меттатон EX",
    description: "За 5 рейтингу відкриває «Сценічний феномен» і «Лазер».",
  },
  mettatonStagePhenomenon: {
    name: "Сценічний феномен",
    description: "Після EX кожна дія атаки додає 1 рейтинг.",
  },
  mettatonLaser: {
    name: "Лазер",
    description: "Після EX за 3 рейтинги атакує всі фігури на обраній лінії атаки.",
  },
  mettatonNeo: {
    name: "Меттатон NEO",
    description: "За 10 рейтингу відкриває властивості вершника, берсерка та «Грацію».",
  },
  mettatonRiderFeature: {
    name: "Властивість вершника",
    description: "Після NEO переміщення в режимі вершника запускає атаки на шляху.",
  },
  mettatonBerserkerMulticlass: {
    name: "Мультиклас берсерка",
    description: "Після NEO надає набір властивостей берсерка.",
  },
  mettatonGrace: { name: "Грація", description: "Після NEO кожна спроба захисту додає 1 рейтинг." },
  mettatonFinalChord: {
    name: "Фінальний акорд",
    description:
      "За 12 рейтингу атакує всіх ворогів на всіх доступних лініях і завдає 3 шкоди при влучанні.",
  },
  riverBoat: {
    name: "Човен",
    description:
      "Витрачає дію переміщення, щоб обрати сусіднього союзника, перемістити Лодочника й висадити пасажира біля місця призначення.",
  },
  riverBoatman: {
    name: "Човняр",
    description: "Витрачає основну дію, щоб отримати одну додаткову дію переміщення цього ходу.",
  },
  riverGuideOfSouls: {
    name: "Провідник душ",
    description: "Не зазнає ефектів бурі та її обмежень атак.",
  },
  riverTraLaLa: {
    name: "Тра-ля-ля",
    description:
      "За 4 заряди обирає сусіднього ворога, рухається по прямій, змушує дотичних союзників атакувати й висаджує ціль біля місця призначення.",
  },
  duolingoLongLived: { name: "Довгожитель", description: "Дуелінго має +2 до максимального та початкового здоров’я." },
  duolingoStrick: { name: "Щоденна серія", description: "Атаки завдають +1 шкоди цілям, яких Дуелінго успішно вразив у попередній свій хід." },
  duolingoPushNotification: { name: "Push-сповіщення", description: "Власний лічильник отримує +1 на початку ходу Дуелінго. Витратьте 3 заряди цього лічильника або 3 Пропущені уроки; обидва варіанти витрачають дію руху. Перемістіться на вільну клітинку в радіусі 2 від обраної живої істоти." },
  duolingoSkipClasses: { name: "Пропущені уроки", description: "Коли атака Дуелінго нікого не вражає, лічильник збільшується на 1 без обмеження." },
  duolingoBerserker: { name: "Я ж нагадував!!!", description: "За 12 Пропущених уроків Дуелінго назавжди отримує рух берсерка. Очки не витрачаються." },
  lucheLongLived: { name: "Довгожитель", description: "Луче має +2 до максимального та початкового здоров’я." },
  lucheSunGlory: { name: "Слава Сонця", description: "Кожне успішне ухилення від ворожої атаки дає 1 Сонце без обмеження." },
  lucheShine: { name: "Сяйво", description: "На початку ходу Луче розкриває прихованих ворогів у радіусі 1." },
  lucheDivineRay: { name: "Промінь світла", description: "Власний лічильник отримує +1 на початку ходу Луче. На 2 спрацьовує безкоштовний імпульс. Під час ходу можна натомість витратити 2 Сонця й основну дію. Атакує всіх ворогів на обраній прямій; невдалий захист накладає Осліплення." },
  lucheBurningSun: { name: "Падіння Сонця", description: "Витратьте 5 Сонць і основну дію. Влучання у зоні атаки завдає 2 шкоди та Осліплює." },
  kanekiGhoul: { name: "Гуль", description: "Канекі має +2 до максимального та початкового здоров’я." },
  kanekiRcCells: { name: "RC-клітини", description: "Отримайте 1 RC за влучання та додаткові 3 RC за вбивство. Лічильник не обмежений." },
  kanekiRinkakuKagune: { name: "Рінкаку Кагуне", description: "Канекі також використовує рух убивці." },
  kanekiRegeneration: { name: "Регенерація", description: "Оберіть і підтвердьте X: витратьте основну дію та рівно X RC-клітин, щоб відновити X здоров’я, не перевищуючи максимум." },
  kanekiScolopendra: { name: "Сороконіжка", description: "За понад 5 RC Канекі отримує властивості вершника й може витрачати основну дію на додатковий рух." },
  zoroCheatedDeath: { name: "Обдурив смерть", description: "Зоро має +2 до максимального та початкового здоров’я." },
  zoroDetermination: { name: "Рішучість", description: "Кожна успішна атака дає 1 Рішучість без обмеження." },
  zoroOniGiri: { name: "Оні Ґірі", description: "Власний лічильник отримує +1 на початку ходу Зоро. Витратьте 2 заряди цього лічильника або 2 Рішучості; обидва варіанти витрачають основну дію та рух. Перемістіться перед або за ворога на прямій і атакуйте лише його." },
  zoro3SwordStyle: { name: "Санторю", description: "Одна базова атака Зоро може одночасно обрати до двох різних законних цілей." },
  zoroAsura: { name: "Асура: дев’ять мечів", description: "Витратьте 6 Рішучості й основну дію. Атакуйте всіх ворогів у зоні трикстера з +1 шкоди." },
  donKihoteHardy: { name: "Витривалий", description: "Дон Кіхот має +1 до максимального та початкового здоров’я." },
  donKihoteSorrowfulCountenance: { name: "Лицар сумного образу", description: "Після шкоди від ворожої атаки можна безкоштовно переміститися на сусідню вільну клітинку. Звичайний рух не витрачається." },
  donKihoteWindmills: { name: "Атака на вітряки", description: "Витратьте 3 заряди й рух та оголосіть одного ворожого героя Велетнем. Зачеплений на шляху ворог отримує 1 шкоду й переміщується власником; Дон Кіхот атакує лише Велетня." },
  donKihoteMadness: { name: "Безумство лицаря", description: "Після смерті оберіть напрямок і востаннє атакуйте всіх ворогів на цій лінії з +1 шкоди." },
  jackRipperResilient: { name: "Живучий", description: "Джек має +1 до максимального та початкового здоров’я." },
  jackRipperLegendKiller: { name: "Легендарний убивця", description: "Атаки Джека з прихованості завдають +1 шкоди." },
  jackRipperSurgery: { name: "Хірург", description: "Після шкоди власник Джека приватно бачить поточне здоров’я цілі." },
  jackRipperSnares: { name: "Пастки маніяка", description: "На початку ходу Джека поставте приховану від суперника пастку. Істота, що входить у неї, зупиняється й не рухається до початку свого наступного ходу; тоді пастка зникає." },
  jackRipperDismemberment: { name: "Свята Матір різанини", description: "Раз за гру чотири рази атакуйте ціль на вашій пастці; кожне влучання завдає 3 шкоди." },
  artemidaGod: { name: "Богиня", description: "Артеміда має +5 до максимального та початкового здоров’я." },
  artemidaAccurateArrow: { name: "Точна стріла", description: "Дубль під час атаки автоматично влучає." },
  artemidaNatureMovement: { name: "Природний рух", description: "Артеміда також використовує рух трикстера." },
  artemidaMoonlightShot: { name: "Місячне прозріння", description: "Імпульс на початку ходу за 3 власні заряди. Оберіть центр області 3×3 лише на лінії атаки Артеміди; вороги в області виходять із прихованості." },
  artemidaSilverCrescent: { name: "Срібний місячний серп", description: "Витратьте 5 зарядів і дію. Оберіть кінцеву клітинку на лінії атаки; атакуйте фігури на лінії лише до цієї клітинки та на сусідніх клітинках. Влучання завдає 2 шкоди." },
  artemidaStealth: { name: "Прихованість", description: "Артеміда може увійти в прихованість на результаті 6." },
};

const serverTextKeys: Record<string, string> = {
  "Pending roll must be resolved": "errors.resolvePending",
  "Not in battle": "errors.gameNotStarted",
  "Not your turn": "game.notYourTurn",
  "Not active unit": "game.notActiveUnit",
  "Movement is blocked": "game.movementBlocked",
  "Chicken: this unit can only move": "game.chickenMoveOnly",
  "Requires Mettaton EX": "game.requiresMettatonEx",
  "Requires Unbeliever Sans": "game.requiresUnbelieverSans",
  "Already transformed": "game.alreadyTransformed",
  "Action slot already used": "game.actionSlotUsed",
  "Move slot already used": "game.moveSlotUsed",
  "Attack slot already used": "game.attackSlotUsed",
  "Stealth slot already used": "game.stealthSlotUsed",
  "Not Enough charges": "game.notEnoughCharges",
  "Not enough Laugh": "game.notEnoughLaugh",
  "No legal targets": "pending.noValidTargets",
  "WebSocket not connected.": "errors.socketDisconnected",
  "Not joined yet. Please join a room first.": "errors.notJoined",
  "Resolve the pending roll before acting.": "errors.resolvePending",
  "Game has not started yet.": "errors.gameNotStarted",
  "Spectators cannot act.": "errors.spectatorCannotAct",
  "Ready-up is only available in the lobby.": "errors.readyLobbyOnly",
  "Game can only be started from the lobby.": "errors.startLobbyOnly",
  "Socket not initialized": "errors.socketNotInitialized",
  Disconnected: "connection.disconnected",
};

const complexAbilitySummaryKeys: Record<string, string> = {
  friskPacifism: "abilityDetails.frisk.pacifism.summary",
  friskGenocide: "abilityDetails.frisk.genocide.summary",
  friskOnePath: "abilityDetails.frisk.onePath.summary",
  lokiLaught: "abilityDetails.loki.laughter.summary",
  asgoreSoulParade: "abilityDetails.asgore.soulParade.summary",
  papyrusUnbeliever: "abilityDetails.papyrus.unbeliever.summary",
  kaiserEngineeringMiracle: "abilityDetails.kaiser.engineeringMiracle.summary",
  gutsBerserkMode: "abilityDetails.guts.berserk.summary",
  griffithFemtoRebirth: "abilityDetails.griffith.rebirth.summary",
  femtoDivineMove: "abilityDetails.griffith.divineMovement.summary",
  groznyTyrant: "abilityDetails.grozny.tyrant.summary",
  chikatiloFalseTrail: "abilityDetails.chikatilo.falseTrail.summary",
  vladStakes: "abilityDetails.vlad.stakes.summary",
  vladForest: "abilityDetails.vlad.forest.summary",
  riverBoat: "abilityDetails.river.boat.summary",
  riverTraLaLa: "abilityDetails.river.tralala.summary",
  mettatonRating: "abilityDetails.mettaton.rating.summary",
  sansUnbeliever: "abilityDetails.sans.unbeliever.summary",
  undyneUndying: "abilityDetails.undyne.undying.summary",
};

function getLocaleText(language: Language, key: string): string | undefined {
  let value: unknown = language === "uk" ? uk : en;
  for (const part of key.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "string" ? value : undefined;
}

export function getHeroDisplayName(
  id: string | null | undefined,
  fallback: string,
  language: Language,
) {
  return language === "uk" && id ? (heroNamesUk[id] ?? fallback) : fallback;
}

export interface UnitDisplayNameOptions {
  language: Language;
  t: Translate;
}

/**
 * Resolve a projected unit to a player-facing figure name.
 *
 * Callers should pass only the UnitState from the recipient's PlayerView. Unknown
 * figure metadata deliberately falls back to the unit's public base class instead
 * of exposing the service unit id.
 */
export function getUnitFigureDisplayName(
  unit: UnitState,
  { language, t }: UnitDisplayNameOptions,
): string {
  const projectedFigureIds = [unit.figureId, unit.heroId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  if (projectedFigureIds.includes(FALSE_TRAIL_TOKEN_ID)) {
    return t("game.falseTrailToken");
  }

  const catalogFigure = projectedFigureIds
    .map((id) => heroCatalogById.get(id))
    .find((figure) => figure !== undefined);
  if (catalogFigure) {
    return getHeroDisplayName(catalogFigure.id, catalogFigure.name, language);
  }

  // Femto is a visible transformed form rather than a selectable catalog figure.
  if (projectedFigureIds.includes("femto")) {
    return getHeroDisplayName("femto", "Femto", language);
  }

  const baseFigureId = `base-${unit.class}`;
  const baseFigure = heroCatalogById.get(baseFigureId);
  const fallback = baseFigure?.name ?? getClassLabel(unit.class, t);
  return getHeroDisplayName(baseFigureId, fallback, language);
}

export function getUnitClassDisplayName(
  unit: Pick<UnitState, "class">,
  { t }: Pick<UnitDisplayNameOptions, "t">,
): string {
  return getClassLabel(unit.class, t);
}

export function getPlacementUnitLabel(
  unit: UnitState,
  options: UnitDisplayNameOptions,
): string {
  return `${getUnitFigureDisplayName(unit, options)} (${getUnitClassDisplayName(unit, options)})`;
}

export function getAbilityDisplay(
  id: string,
  fallbackName: string,
  fallbackDescription: string,
  language: Language,
): AbilityTranslation {
  const localized =
    language === "uk"
      ? (abilitiesUk[id] ?? { name: fallbackName, description: fallbackDescription })
      : { name: fallbackName, description: fallbackDescription };
  const summaryKey = complexAbilitySummaryKeys[id];
  return {
    ...localized,
    description: summaryKey
      ? (getLocaleText(language, summaryKey) ?? localized.description)
      : localized.description,
  };
}

export function localizeServerText(value: string | null | undefined, t: Translate): string {
  if (!value) return "";
  const key = serverTextKeys[value];
  if (key) return t(key);
  if (/^invalid_game_mode$/i.test(value)) return t("errors.invalidGameMode");
  if (/^not_host$/i.test(value)) return t("errors.notHost");
  if (/^(mode_locked|game_already_started)$/i.test(value)) return t("errors.modeLocked");
  if (
    /^(banned|picked|base_unit_not_allowed|hero_not_draftable|class_slot_already_filled|ban_would_break_class_pool|max_bans_per_class_reached|not_current_player|draft_phase_mismatch|invalid_draft_hero)$/i.test(
      value
    )
  ) {
    return t(`draft.lockReasons.${value}`);
  }
  const rating = /^Need Rating (\d+)$/.exec(value);
  if (rating) return t("game.needRating", { rating: rating[1] });
  if (/^Failed to load rooms/.test(value)) return t("errors.loadRooms");
  if (/^Failed to create room/.test(value)) return t("errors.createRoom");
  if (/^Failed to join room/.test(value)) return t("errors.joinRoom");
  if (/^Failed to load heroes/.test(value)) return t("errors.loadHeroes");
  if (/^Failed to refresh rooms/.test(value)) return t("errors.refreshRooms");
  if (/role.+taken|role_taken/i.test(value)) return t("errors.roleTaken");
  if (/room.+not found|room_not_found/i.test(value)) return t("errors.roomNotFound");
  if (/room.+exists|room_exists/i.test(value)) return t("errors.roomExists");
  if (/rate.?limit|too many requests/i.test(value)) return t("errors.rateLimited");
  if (/invalid payload|payload.+invalid/i.test(value)) return t("errors.invalidPayload");
  if (/action rejected|rejected by rules/i.test(value)) return t("errors.actionRejected");
  return value;
}

export function getClassLabel(value: string, t: Translate): string {
  return t(`classes.${value}`);
}

export function getAbilityTypeLabel(value: string, t: Translate): string {
  return t(`abilityTypes.${value}`);
}

export function getSlotLabel(value: string, t: Translate): string {
  return t(`slots.${value}`);
}

export function getPhaseLabel(value: string, t: Translate): string {
  return t(`phases.${value}`);
}

export function getConnectionLabel(value: string, t: Translate): string {
  return t(`connection.${value}`);
}

export function getArenaLabel(value: string | null | undefined, t: Translate): string {
  return t(`arenas.${value ?? "default"}`);
}

export function getStatLabel(value: string, t: Translate): string {
  return t(`stats.${value.replace("-", "")}`);
}

export function localizeFigureSetError(value: string, t: Translate): string {
  if (value === "Invalid JSON file.") return t("errors.invalidJson");
  if (value === "Invalid selection payload.") return t("errors.invalidSelection");
  const missing = /^Missing hero for slot: (.+)$/.exec(value);
  if (missing) return t("errors.missingHero", { slot: getClassLabel(missing[1], t) });
  const unknown = /^Unknown hero id: (.+)$/.exec(value);
  if (unknown) return t("errors.unknownHero", { hero: unknown[1] });
  const mismatch = /^Hero (.+) does not match slot (.+)$/.exec(value);
  if (mismatch) {
    return t("errors.heroSlotMismatch", {
      hero: mismatch[1],
      slot: getClassLabel(mismatch[2], t),
    });
  }
  return value;
}
