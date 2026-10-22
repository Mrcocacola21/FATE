export const metadataEn = {
  heroes: {
    "base-assassin": "Base Assassin",
    chikatilo: "Andrei Chikatilo",
    hassan: "Hassan-i Sabbah",
    frisk: "Frisk",
    jackRipper: "Jack the Ripper",
    "base-archer": "Base Archer",
    "grand-kaiser": "Grand Kaiser",
    jebe: "Jebe",
    mettaton: "Mettaton",
    artemida: "Artemis",
    "base-berserker": "Base Berserker",
    grozny: "Ivan Grozny",
    guts: "Guts",
    undyne: "Undyne",
    kaneki: "Kaneki Ken",
    "base-rider": "Base Rider",
    odin: "Odin",
    riverPerson: "River Person",
    donKihote: "Don Quixote",
    "base-spearman": "Base Spearman",
    vladTepes: "Vlad III Tepes",
    kaladin: "Kaladin Stormblessed",
    papyrus: "Papyrus",
    luche: "Luche",
    "base-trickster": "Base Trickster",
    sans: "Sans",
    lechy: "Lechy",
    loki: "Loki",
    duolingo: "Duolingo",
    "base-knight": "Base Knight",
    elCidCompeador: "El Cid Compeador",
    griffith: "Griffith",
    asgore: "Asgore Dreemurr",
    zoro: "Zoro",
    genghisKhan: "Genghis Khan",
    femto: "Femto",
  },
  abilities: {
    berserkAutoDefense: {
      name: "Berserker Auto Defense",
      description: "Auto-dodge when fully charged. Resets after use.",
    },
    lechyStorm: {
      name: "Storm",
      description:
        "Set the arena to Storm for 1d6 rounds. Units outside the forest aura take 1 damage on failed start-turn rolls and lose ranged attacks.",
    },
    lechyConfuseTerrain: {
      name: "Confuse Terrain",
      description:
        "Place a forest marker on your cell. Units leaving or crossing the aura must roll 5-6 or stop inside the aura.",
    },
    lechyGuideTraveler: {
      name: "Guide Traveler",
      description:
        "Choose an ally within trickster range, move Leshy, then relocate that ally to any empty cell within range of Leshy's final position.",
    },
    lechyGiant: {
      name: "Giant",
      description: "+3 HP.",
    },
    lechyNaturalStealth: {
      name: "Natural Stealth",
      description: "Stealth succeeds on 5-6.",
    },
    elCidCompeadorDemonDuelist: {
      name: "Demon Duelist",
      description:
        "You select an enemy hero within your attack range and challenge him to a duel, you can attack as long as your attacks are successful, if the attack fails, you can pay 1 hp and continue the duel.",
    },
    elCidCompeadorKolada: {
      name: "Kolada",
      description:
        "At the start of your turn, your Barbarian Sword charges into battle, making one attack against everyone within 1 square of you.",
    },
    elCidCompeadorTisona: {
      name: "Tisona",
      description: "You can attack everyone in any straight line except diagonals.",
    },
    chikatiloTough: {
      name: "Tough",
      description: "+1 HP.",
    },
    chikatiloFalseTrail: {
      name: "False Trail",
      description:
        "At the start of combat, place the False Trail Token in his place. Chikatilo can be placed on any legal non-deployment cell in stealth. While the token lives and another figure remains, this stealth ignores the normal three-turn limit. Revealing Chikatilo automatically detonates the token; killing the token reveals Chikatilo.",
    },
    chikatiloAssassinMark: {
      name: "Killer's Mark",
      description:
        "Without revealing stealth, Chikatilo marks a creature within 2 cells. At the start of his turn, his owner learns the exact locations of marked hidden targets. A marked target takes +1 damage when Chikatilo attacks it from stealth.",
    },
    chikatiloDecoy: {
      name: "Decoy Stealth",
      description:
        "Spend 3 Decoy Points and a Stealth attempt to enter stealth without rolling. Before defense dice, spend 3 Decoy Points to substitute and take exactly 1 damage.",
    },
    falseTrailTrap: {
      name: "False Trail Trap",
      description:
        "When the False Trail Token dies, it attacks the creature that killed it with 2d6 against 2d6 defense. A failed defense takes 3 damage.",
    },
    falseTrailExplosion: {
      name: "Explosion",
      description:
        "The False Trail Token detonates, attacking all units within 1 square. Each unit that fails takes 1 damage.",
    },
    groznyInvadeTime: {
      name: "Invade Time",
      description: "Move to any free cell of the field.",
    },
    groznyTyrant: {
      name: "Tyrant",
      description:
        "If Ivan the Terrible has a weak ally within two squares of him that he can finish off with his BASE DAMAGE, he moves to one such ally (as if he rolled a 6, but without spending any movement) and attempts to finish them off. This Tyrant resolution ends after that one ally. If he succeeds in finishing them off, he gains +1 damage and regains HP equal to the damage dealt. Starting with the second ally finished across separate Tyrant resolutions, he gains the movement of all allies he has finished through Tyrant.",
    },
    genghisKhanMongolCharge: {
      name: "Mongol Charge",
      description:
        "Move in a straight line (orthogonal or diagonal). Allies in the swept corridor may each make one attack. Commander applies to those attacks.",
    },
    genghisKhanLegendOfTheSteppes: {
      name: "Legend of the Steppes",
      description: "+1 damage against targets this unit attacked on the previous turn.",
    },
    genghisKhanKhansDecree: {
      name: "Khan's Decree",
      description: "This turn you can move diagonally. Move this unit.",
    },
    griffithWretchedMan: {
      name: "Wretched Man",
      description: "Griffith deals -1 damage with all attacks (minimum 0).",
    },
    griffithFemtoRebirth: {
      name: "Femto Rebirth",
      description: "When Griffith dies, he immediately resurrects as Femto in the same cell.",
    },
    femtoGodHp: {
      name: "God",
      description: "Femto gains +5 HP over Berserker base HP.",
    },
    femtoMultiBerserkSpear: {
      name: "Multiclass Berserker + Spearman",
      description:
        "Uses Berserker base stats and auto-defense, Spearman reach and defense trait, and Warrior double auto-hit.",
    },
    femtoDivineMove: {
      name: "Divine Movement",
      description:
        "Roll 1d6. On 1-3 teleport within 2 cells, on 4-6 teleport to any empty board cell.",
    },
    gutsArbalet: {
      name: "Hand Crossbow",
      description: "Archer-like ranged attack that always deals exactly 1 damage.",
    },
    gutsCannon: {
      name: "Hand Cannon",
      description: "Archer-like ranged attack using normal damage.",
    },
    gutsBerserkMode: {
      name: "Berserk Mode",
      description:
        "Spend 3 charges to enter Berserk Mode without consuming your action. While active: end-turn self-damage, melee-focused bonuses, and altered combat behavior.",
    },
    gutsExitBerserk: {
      name: "Exit Berserk",
      description:
        "Exit Berserk Mode. Can only be used once per game and does not consume your action.",
    },
    odinGungnir: {
      name: "Gungnir",
      description: "Attack doubles become automatic hits across standard attack-roll combat flows.",
    },
    odinHuginn: {
      name: "Raven Huginn",
      description: "Can detect and target stealthed enemies within 1 cell (Chebyshev distance).",
    },
    odinMuninn: {
      name: "Raven Muninn",
      description:
        "At full 6 charges, after seeing a defense roll, can spend all charges to convert defense into auto-success.",
    },
    odinSleipnir: {
      name: "Sleipnir",
      description:
        "At 3 charges, automatically choose any empty board cell and teleport there without consuming move/action slots.",
    },
    lokiIllusoryDouble: {
      name: "Illusory Double",
      description: "Whenever any game roll is a double, Loki gains +1 Laughter.",
    },
    lokiNaturalStealth: {
      name: "Natural Stealth",
      description: "Stealth succeeds on 5-6.",
    },
    lokiLaught: {
      name: "Loki's Laugh",
      description:
        "Spend Laugh on one of Loki's tricks. Again Some Bullshit and Chicken do not reveal Loki; other attack-like effects follow normal stealth rules.",
    },
    jebeDurable: {
      name: "Durable",
      description: "+1 HP.",
    },
    jebeHailOfArrows: {
      name: "Hail of Arrows",
      description:
        "Select a 3x3 area with center on your archer attack line. Attack all units in that area.",
    },
    jebeKhansShooter: {
      name: "Khan's Shooter",
      description:
        "Spend all 6 charges. Roll 1d6 ricochets, then chain normal attacks to selected legal targets.",
    },
    hassanOneWithSand: {
      name: "One With Sand",
      description: "Stealth succeeds on 4-6.",
    },
    hassanTrueEnemy: {
      name: "True Enemy",
      description:
        "Choose an enemy within 2 cells. That enemy makes one normal attack against a legal target.",
    },
    hassanAssasinOrder: {
      name: "Assassin Order",
      description:
        "At battle start, choose 2 allied heroes (excluding Hassan). They gain stealth threshold 5-6 for this game.",
    },
    kaladinFirst: {
      name: "First Oath - The First Ideal",
      description: "Heal self for 2 HP (up to max HP).",
    },
    kaladinSecond: {
      name: "Second Oath - Oath of Protection",
      description:
        "Gain Trickster multiclass: Trickster movement and Trickster AoE attack trait in addition to Spearman kit.",
    },
    kaladinThird: {
      name: "Third Oath - Oath of Acceptance",
      description: "+1 damage on Spearman-mode melee attacks.",
    },
    kaladinFourth: {
      name: "Fourth Oath - Oath of Restriction",
      description: "Gain Berserker trait bundle.",
    },
    kaladinFifth: {
      name: "Fifth Oath - Oath of Liberation",
      description:
        "Choose a 5x5 area. Shared-roll AoE hits all units for 2 damage on failed defense and immobilizes them until Kaladin's next turn.",
    },
    friskPacifism: {
      name: "Pacifism",
      description:
        "Spend Pacifism points on Frisk's pacifist options. These effects do not reveal Frisk stealth.",
    },
    friskGenocide: {
      name: "Genocide",
      description: "Spend Genocide points on Frisk's aggressive options and reactions.",
    },
    friskCleanSoul: {
      name: "Clean Soul",
      description:
        "If Frisk exits stealth without attacking, the next incoming attack against Frisk automatically misses.",
    },
    friskOnePath: {
      name: "One Path",
      description:
        "After Frisk kills, convert all Pacifism into Genocide and permanently lose Pacifism.",
    },
    sansLongLiver: {
      name: "Long-liver",
      description: "Sans gains +2 max HP.",
    },
    sansGasterBlaster: {
      name: "Gaster Blaster",
      description:
        "Spend 2 charges. Choose an Archer ray and attack every unit on it, including allies, piercing through units.",
    },
    sansBadassJoke: {
      name: "Badass Joke",
      description:
        "Spend 3 charges. Attack enemies in Trickster area; targets that fail defense cannot use movement action on their next turn.",
    },
    sansSpearmanFeature: {
      name: "Spearman Feature",
      description: "Defense doubles grant auto-dodge (Spearman trait).",
    },
    sansUnbeliever: {
      name: "Unbeliever Sans",
      description: "After an allied hero dies, Sans unlocks Bone Field, Sleep, and Last Attack.",
    },
    sansBoneField: {
      name: "Bone Field",
      description:
        "After Unbeliever, roll 1d6+1 and replace arena with Bone Field for that many rounds.",
    },
    sansSleep: {
      name: "Sleep",
      description: "After Unbeliever, spend 3 charges to heal Sans for 2 HP.",
    },
    sansLastAttack: {
      name: "Last Attack",
      description:
        "After Unbeliever, before Sans dies his owner chooses any living enemy to curse: it takes 1 damage at the start of its own turns until it reaches 1 HP.",
    },
    undyneTough: {
      name: "Tough",
      description: "Undyne gains +1 max HP.",
    },
    undyneSpearmanMulticlass: {
      name: "Spearman Multiclass",
      description: "Undyne gains Spearman defensive features.",
    },
    undyneSpearThrow: {
      name: "Throw Spear",
      description: "Shooter-like single-target attack that always deals 1 damage on hit.",
    },
    undyneEnergySpear: {
      name: "Energy Spear",
      description:
        "Spend 2 charges. Choose a row or column and attack all units on that line for 1 damage.",
    },
    undyneSwitchDirection: {
      name: "Direction Shift",
      description:
        "On successful defense, Undyne can force the attacker to move 1 cell to an empty adjacent cell.",
    },
    undyneUndying: {
      name: "Immortal Undyne",
      description:
        "Once per game on death, revive with 3 HP, cap incoming damage to 1, gain close-range bonus and free Energy Spear, then lose 1 HP at end of own turns.",
    },
    asgoreFireball: {
      name: "Fireball",
      description: "Archer-like single-target attack with normal attack resolution.",
    },
    asgoreFireParade: {
      name: "Fire Parade",
      description:
        "Attack all units in Trickster attack area around Asgore using shared attacker roll.",
    },
    asgoreSoulParade: {
      name: "Soul Parade",
      description:
        "When fully charged, triggers at start of turn: roll 1d6 and apply one soul effect.",
    },
    papyrusBlueBone: {
      name: "Blue Bone",
      description:
        "On hit, applies Blue Bone until Papyrus next turn start. If target spends move slot this turn, it immediately takes 1 damage.",
    },
    papyrusSpaghetti: {
      name: "Tasty Spaghetti",
      description: "Spend 3 charges to heal Papyrus for 2 HP.",
    },
    papyrusCoolGuy: {
      name: "Cool Guy",
      description:
        "Choose a straight line and attack all units on that line. Costs 5 charges (3 in Unbeliever mode).",
    },
    papyrusUnbeliever: {
      name: "Unbeliever Papyrus",
      description:
        "After an allied hero dies, Papyrus permanently transforms and unlocks Orange Bone, Long Bone and Ossified.",
    },
    papyrusOrangeBone: {
      name: "Orange Bone",
      description:
        "After transforming, choose Blue Bone or Orange Bone separately for every target Papyrus successfully hits.",
    },
    papyrusLongBone: {
      name: "Long Bone",
      description:
        "Unbeliever toggle: basic attack can become a line attack. Also stores selected line axis for line skills.",
    },
    papyrusOssified: {
      name: "Ossified",
      description: "Unbeliever passive: Papyrus gains Berserker auto-defense feature.",
    },
    mettatonLongLiver: {
      name: "Long-liver",
      description: "Mettaton gains +2 max HP.",
    },
    mettatonRating: {
      name: "Rating",
      description: "Gain +2 Rating per successful hit and +1 Rating per successful defense.",
    },
    mettatonPoppins: {
      name: "Mettaton Poppins",
      description:
        "Spend 3 Rating. Choose a 3x3 center on your attack line and attack all units in that area.",
    },
    mettatonWorkOnCamera: {
      name: "Work on Camera",
      description: "Cannot enter stealth. Gains Rider movement pattern.",
    },
    mettatonEx: {
      name: "Mettaton EX",
      description:
        "At the start of Mettaton's turn, unlock Stage Phenomenon and Laser when Rating is at least 5. Rating is not spent.",
    },
    mettatonStagePhenomenon: {
      name: "Stage Phenomenon",
      description: "After EX: each attack action grants +1 Rating.",
    },
    mettatonLaser: {
      name: "Laser",
      description: "After EX, spend 3 Rating. Choose an attack line and attack all units on it.",
    },
    mettatonNeo: {
      name: "Mettaton NEO",
      description:
        "At the start of Mettaton's turn, unlock Rider Feature, Berserker Multiclass, and Grace when Rating is at least 10. Rating is not spent.",
    },
    mettatonRiderFeature: {
      name: "Rider Feature",
      description: "After NEO: path attacks trigger while moving in Rider mode.",
    },
    mettatonBerserkerMulticlass: {
      name: "Berserker Multiclass",
      description: "After NEO: gain Berserker feature bundle.",
    },
    mettatonGrace: {
      name: "Grace",
      description: "After NEO: each defense roll attempt grants +1 Rating.",
    },
    mettatonFinalChord: {
      name: "Final Chord",
      description:
        "Spend 12 Rating. Attack all enemies on all available attack lines for 3 damage on hit.",
    },
    riverBoat: {
      name: "Boat",
      description:
        "Spend one movement action to move River Person, optionally carrying one adjacent ally and dropping that ally adjacent to the final cell.",
    },
    riverBoatman: {
      name: "Boatman",
      description: "Spend action to gain one additional movement action this turn.",
    },
    riverGuideOfSouls: {
      name: "Guide of Souls",
      description: "Immune to arena storm effects and storm attack restrictions.",
    },
    riverTraLaLa: {
      name: "Tra-la-la",
      description:
        "At full 4 charges: choose adjacent enemy and move in a straight line. Each eligible touched ally independently chooses Attack or Pass as the enemy reaches it. Reaction attacks use normal dice and spend no turn slots. Drop the enemy adjacent when movement ends.",
    },
    tricksterAoE: {
      name: "Trickster AoE",
      description: "5x5 AoE (radius 2). Hits allies (not self).",
    },
    testMultiSlot: {
      name: "Test Multi Slot",
      description: "Consumes move and attack slots.",
    },
    kaiserBunker: {
      name: "Bunker",
      description:
        "Instead of stealth, you have the ability to enter a bunker (4-6), your location is visible, but any hit on you will only deal 1 damage.",
    },
    kaiserDora: {
      name: "Dora",
      description:
        "Without leaving the bunker, you can attack, select a 3x3 area, the center of this area should be on the line of your possible attack, attack everyone in this area.",
    },
    kaiserCarpetStrike: {
      name: "Carpet Strike",
      description:
        "It's time to kill all enemies of the Reich. Roll 2d9 - the result is the center of a 5x5 area. Attack everyone in that area. Carpet Bombing doesn't hit Kaiser if he's in the Bunker. The ability always deals 1 damage.",
    },
    kaiserEngineeringMiracle: {
      name: "Engineering Miracle",
      description:
        "You're showing by example what Nazi cyborgs are like. You gain the multi-class of rider and berserker, and the Dora bitch doesn't require more charges. However, you lose the ability to enter stealth and bunkers, and carpet bombings won't affect you in this state.",
    },
    vladPolkovodets: {
      name: "Commander",
      description:
        "Allies within one cell of this figure receive +1 damage (does not work on the figure itself, does not stack, for riders, to receive the damage buff you must either start moving or end in the commander's aura).",
    },
    vladIntimidate: {
      name: "Intimidating Stare",
      description:
        "If you defend successfully, you can force the attacker to move one unoccupied square.",
    },
    vladStakes: {
      name: "Field of Stakes",
      description: "Place 3 hidden stakes at battle start and from 2nd turn.",
    },
    vladForest: {
      name: "Forest of the Dead",
      description:
        "Automatic phantasm: at the start of Vlad's turn, when he owns 9 stakes, consume the 9 oldest stakes and choose a 3x3 area (2 damage and root).",
    },
    duolingoLongLived: {
      name: "Long-lived",
      description: "Duolingo gains +2 max HP.",
    },
    duolingoStrick: {
      name: "Daily Streak",
      description: "Deal +1 damage to creatures Duolingo successfully hit on his previous turn.",
    },
    duolingoSkipClasses: {
      name: "Missed Lessons",
      description: "Gain 1 Missed Lesson whenever an attack misses. This counter is unbounded.",
    },
    duolingoPushNotification: {
      name: "Push Notification",
      description:
        "Its own counter gains +1 at the start of Duolingo's turn. Spend either 3 of that counter or 3 Missed Lessons; both paths consume Movement. Choose a living creature, then teleport to a legal empty cell within 2 cells of it. Exit stealth.",
    },
    duolingoBerserker: {
      name: "I Reminded You!!!",
      description:
        "At 12 or more Missed Lessons, permanently gain Berserker multiclass. The counter is not spent.",
    },
    lucheLongLived: {
      name: "Long-lived",
      description: "Luche gains +2 max HP.",
    },
    lucheSunGlory: {
      name: "Glory of the Sun",
      description:
        "Gain 1 Sun whenever Luche successfully dodges an enemy attack. Sun is unbounded.",
    },
    lucheShine: {
      name: "Radiance",
      description:
        "Radiance — Passive. When a figure successfully hits Luche, that figure becomes Blinded until the end of its next turn.",
    },
    lucheDivineRay: {
      name: "Light Ray",
      description:
        "Its own counter gains +1 at the start of Luche's turn. At 2, it activates as a start-turn impulse without spending Sun or Action. During Luche's turn it may instead spend 2 Sun and Action. Choose a straight line or the area around Luche; failed defenses apply Blind until the end of that enemy's next turn.",
    },
    lucheBurningSun: {
      name: "Falling Sun",
      description:
        "Spend 5 Sun and Action. Attack every enemy in Luche's attack area for 2 damage on failed defense and apply Blind.",
    },
    kanekiGhoul: {
      name: "Ghoul",
      description: "Kaneki gains +2 max HP.",
    },
    kanekiRcCells: {
      name: "RC Cells",
      description:
        "Gain 1 RC Cell on a hit and an additional 3 RC Cells on a kill. RC Cells are unbounded.",
    },
    kanekiRinkakuKagune: {
      name: "Rinkaku Kagune",
      description: "Kaneki also has Assassin movement.",
    },
    kanekiRegeneration: {
      name: "Regeneration",
      description:
        "Spend a chosen number of RC Cells to heal the same amount, up to max HP. Uses Action.",
    },
    kanekiScolopendra: {
      name: "Centipede",
      description:
        "While RC Cells are greater than 5, permanently gain Rider movement and path features and may spend Action for an extra movement.",
    },
    zoroCheatedDeath: {
      name: "Cheated Death",
      description: "Zoro gains +2 max HP.",
    },
    zoroDetermination: {
      name: "Determination",
      description:
        "Gain 1 Determination after every successful attack. Determination is unbounded.",
    },
    zoroOniGiri: {
      name: "Oni Giri",
      description:
        "Its own counter gains +1 at the start of Zoro's turn. Spend either 2 of that counter or 2 Determination; both paths consume Action and Movement. Choose an enemy on a straight line, move directly before or behind it, then attack it.",
    },
    zoro3SwordStyle: {
      name: "Santoryu",
      description:
        "A basic attack may target one or two different legal creatures and consumes Action once.",
    },
    zoroAsura: {
      name: "Asura: Nine-Sword Style",
      description:
        "Spend 6 Determination and Action. Attack all enemies in Trickster area with +1 damage.",
    },
    donKihoteHardy: {
      name: "Hardy",
      description: "Don Quixote gains +1 max HP.",
    },
    donKihoteSorrowfulCountenance: {
      name: "Knight of the Sorrowful Image",
      description:
        "After an enemy attack damages Don Quixote, optionally make a free legal 1-cell reaction move without spending Movement.",
    },
    donKihoteWindmills: {
      name: "Attack on Windmills",
      description:
        "Spend 3 charges and Movement. Declare one enemy hero the Giant and dash toward it on a straight line. One crossed enemy takes 1 damage and is repositioned by its owner; only the Giant is attacked.",
    },
    donKihoteMadness: {
      name: "Madness of the Knight",
      description:
        "On death, choose a straight direction and make a final +1 damage attack against every enemy on that line.",
    },
    jackRipperResilient: {
      name: "Resilient",
      description: "Jack gains +1 max HP.",
    },
    jackRipperCoveringTracks: {
      name: "Covering Tracks",
      description:
        "If Jack would place a 6th snare while 5 snares are already on the board, choose one existing snare to explode. Creatures within radius 1 roll 1d6; on 1-4 they take 1 damage, on 5-6 they avoid it.",
    },
    jackRipperSurgery: {
      name: "Surgeon",
      description: "After Jack deals damage, his owner privately knows the target's remaining HP.",
    },
    jackRipperSnares: {
      name: "Maniac Traps",
      description:
        "At the start of Jack's turn, place a hidden trap on any cell. Its owner can see it. A creature entering it stops and cannot move until its next turn starts; then the trap disappears.",
    },
    jackRipperDismemberment: {
      name: "Holy Mother of Slaughter",
      description:
        "Once per game, spend Action to attack a target standing on Jack's trap four times; each failed defense deals 3 damage.",
    },
    artemidaGod: {
      name: "God",
      description: "Artemis gains +5 max HP and starts at her full modified HP.",
    },
    artemidaAccurateArrow: {
      name: "Precise Arrow",
      description: "Attack doubles automatically hit.",
    },
    artemidaNatureMovement: {
      name: "Natural Movement",
      description: "Artemis also has Trickster movement.",
    },
    artemidaMoonlightShot: {
      name: "Moon Insight",
      description:
        "At the start of Artemis's turn, spend 3 charges as an impulse. Choose a 3x3 area centered on her legal Archer attack line; enemies there exit stealth.",
    },
    artemidaSilverCrescent: {
      name: "Silver Moon Sickle",
      description:
        "Spend 5 charges and Action. Choose an endpoint on a legal attack line and attack every unit on the line up to that endpoint and adjacent cells for 2 damage on failed defense.",
    },
    artemidaStealth: {
      name: "Stealth",
      description: "Artemis can enter stealth on a roll of 6.",
    },
  },
};
export const metadataUk = {
  heroes: {
    "base-assassin": "Базовий убивця",
    chikatilo: "Андрій Чикатило",
    hassan: "Хасан ібн Саббах",
    frisk: "Фріск",
    jackRipper: "Джек-Різник",
    "base-archer": "Базовий лучник",
    "grand-kaiser": "Великий Кайзер",
    jebe: "Джебе",
    mettaton: "Меттатон",
    artemida: "Артеміда",
    "base-berserker": "Базовий берсерк",
    grozny: "Іван Грозний",
    guts: "Ґатс",
    undyne: "Андайн",
    kaneki: "Канекі Кен",
    "base-rider": "Базовий вершник",
    odin: "Одін",
    riverPerson: "Річкова Людина",
    donKihote: "Дон Кіхот",
    "base-spearman": "Базовий списник",
    vladTepes: "Влад III Цепеш",
    kaladin: "Каладін Благословенний Бурею",
    papyrus: "Папірус",
    luche: "Луче",
    "base-trickster": "Базовий трикстер",
    sans: "Санс",
    lechy: "Лісовик",
    loki: "Локі",
    duolingo: "Дуелінго",
    "base-knight": "Базовий лицар",
    elCidCompeador: "Ель Сід Кампеадор",
    griffith: "Ґріффіт",
    asgore: "Азґор Дрімурр",
    zoro: "Зоро",
    genghisKhan: "Чингісхан",
    femto: "Фемто",
  },
  abilities: {
    berserkAutoDefense: {
      name: "Автозахист берсерка",
      description: "За повного заряду автоматично ухиляється від атаки й витрачає всі заряди.",
    },
    lechyStorm: {
      name: "Буря",
      description:
        "Замінює арену бурею на 1к6 раундів: фігури поза лісом ризикують отримати шкоду та втрачають дальні атаки.",
    },
    lechyConfuseTerrain: {
      name: "Заплутана місцевість",
      description: "Створює лісову мітку. Для виходу або проходу крізь ауру потрібен кидок 5–6.",
    },
    lechyGuideTraveler: {
      name: "Провідник мандрівника",
      description:
        "Оберіть союзника в радіусі трикстера, перемістіть Лісовика й перенесіть союзника до його нової позиції.",
    },
    lechyGiant: {
      name: "Велетень",
      description: "+3 до максимального здоров’я.",
    },
    lechyNaturalStealth: {
      name: "Природна скритність",
      description: "Скритність успішна на 5–6.",
    },
    elCidCompeadorDemonDuelist: {
      name: "Демон-дуелянт",
      description:
        "Послідовно атакує обрану ціль, доки атаки успішні. Після промаху можна сплатити 1 здоров’я й продовжити.",
    },
    elCidCompeadorKolada: {
      name: "Колада",
      description: "На початку ходу виконує одну атаку проти кожної фігури в сусідніх клітинках.",
    },
    elCidCompeadorTisona: {
      name: "Тісона",
      description: "Атакує всіх на обраній прямій горизонтальній або вертикальній лінії.",
    },
    chikatiloTough: {
      name: "Живучий",
      description: "+1 до максимального здоров’я.",
    },
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
    groznyInvadeTime: {
      name: "Час вторгнення",
      description: "Перемістіть героя на будь-яку вільну клітинку поля.",
    },
    groznyTyrant: {
      name: "Тиран",
      description:
        "Може добити ослабленого союзника, відновити здоров’я, посилити шкоду й отримати додаткові переміщення.",
    },
    genghisKhanMongolCharge: {
      name: "Монгольська навала",
      description: "Рух по прямій; союзники в пройденому коридорі можуть по одному разу атакувати.",
    },
    genghisKhanLegendOfTheSteppes: {
      name: "Легенда степів",
      description: "+1 до шкоди проти цілей, яких герой атакував у попередньому ході.",
    },
    genghisKhanKhansDecree: {
      name: "Указ хана",
      description: "Дозволяє цього ходу рухатися по діагоналі та одразу виконати переміщення.",
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
    lokiNaturalStealth: {
      name: "Природна скритність",
      description: "Локі входить у скритність на результаті 5-6.",
    },
    lokiLaught: {
      name: "Сміх Локі",
      description: "Витрачайте Сміх на хитрощі Локі. Використання не розкриває його скритність.",
    },
    jebeDurable: {
      name: "Витривалий",
      description: "+1 до максимального здоров’я.",
    },
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
    hassanOneWithSand: {
      name: "Єдиний із піском",
      description: "Скритність успішна на 4–6.",
    },
    hassanTrueEnemy: {
      name: "Справжній ворог",
      description: "Оберіть ворога в радіусі 2: він виконує одну звичайну атаку по доступній цілі.",
    },
    hassanAssasinOrder: {
      name: "Орден убивць",
      description:
        "На початку бою двоє союзних героїв отримують поріг скритності 5–6 до кінця гри.",
    },
    kaladinFirst: {
      name: "Перша клятва — Перший ідеал",
      description: "Відновлює собі 2 здоров’я.",
    },
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
      description:
        "Атака області 5×5 завдає 2 шкоди й знерухомлює цілі до наступного ходу Каладіна.",
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
      description:
        "Після вбивства перетворює весь Пацифізм на Геноцид і назавжди вимикає Пацифізм.",
    },
    sansLongLiver: {
      name: "Довгожитель",
      description: "Санс отримує +2 до максимального здоров’я.",
    },
    sansGasterBlaster: {
      name: "Ґастер-бластер",
      description:
        "За 2 заряди обирає промінь лучника й атакує всіх на ньому, включно із союзниками. Промінь проходить крізь фігури.",
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
      description: "Після перетворення замінює арену Полем кісток на 1d6+1 раундів.",
    },
    sansSleep: {
      name: "Сон",
      description: "Після перетворення витрачає 3 заряди й відновлює Сансу 2 здоров’я.",
    },
    sansLastAttack: {
      name: "Остання атака",
      description:
        "Перед смертю Санса його власник обирає будь-якого живого ворога для прокляття; той втрачає 1 здоров’я на початку власного ходу, доки не матиме 1 здоров’я.",
    },
    undyneTough: {
      name: "Живуча",
      description: "Андайн отримує +1 до максимального здоров’я.",
    },
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
      description:
        "Атакує всі фігури на обраній прямій. Коштує 5 зарядів або 3 після перетворення.",
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
    mettatonGrace: {
      name: "Грація",
      description: "Після NEO кожна спроба захисту додає 1 рейтинг.",
    },
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
        "За 4 заряди обирає сусіднього ворога й рухається по прямій. Кожен дотичний союзник окремо обирає атаку або пропуск без витрати звичайних дій. Після руху ціль висаджується на сусідню клітинку.",
    },
    tricksterAoE: {
      name: "Область трикстера",
      description: "Атака області 5×5. Вражає союзників, але не самого героя.",
    },
    testMultiSlot: {
      name: "Test Multi Slot",
      description: "Consumes move and attack slots.",
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
      description:
        "Розміщує 3 приховані кілки на початку бою та починаючи з другого власного ходу.",
    },
    vladForest: {
      name: "Ліс мертвих",
      description:
        "Автоматичний фантазм-імпульс: на початку ходу Влада, коли він має 9 кілків, витрачає 9 найстаріших кілків і пропонує обрати область 3×3.",
    },
    duolingoLongLived: {
      name: "Довгожитель",
      description: "Дуелінго має +2 до максимального та початкового здоров’я.",
    },
    duolingoStrick: {
      name: "Щоденна серія",
      description:
        "Атаки завдають +1 шкоди цілям, яких Дуелінго успішно вразив у попередній свій хід.",
    },
    duolingoSkipClasses: {
      name: "Пропущені уроки",
      description:
        "Коли атака Дуелінго нікого не вражає, лічильник збільшується на 1 без обмеження.",
    },
    duolingoPushNotification: {
      name: "Push-сповіщення",
      description:
        "Власний лічильник отримує +1 на початку ходу Дуелінго. Витратьте 3 заряди цього лічильника або 3 Пропущені уроки; обидва варіанти витрачають дію руху. Перемістіться на вільну клітинку в радіусі 2 від обраної живої істоти.",
    },
    duolingoBerserker: {
      name: "Я ж нагадував!!!",
      description:
        "За 12 Пропущених уроків Дуелінго назавжди отримує рух берсерка. Очки не витрачаються.",
    },
    lucheLongLived: {
      name: "Довгожитель",
      description: "Луче має +2 до максимального та початкового здоров’я.",
    },
    lucheSunGlory: {
      name: "Слава Сонця",
      description: "Кожне успішне ухилення від ворожої атаки дає 1 Сонце без обмеження.",
    },
    lucheShine: {
      name: "Сяйво",
      description:
        "Сяйво — пасивна. Коли фігура успішно влучає по Луче, ця фігура стає Осліпленою до кінця свого наступного ходу.",
    },
    lucheDivineRay: {
      name: "Промінь світла",
      description:
        "Власний лічильник отримує +1 на початку ходу Луче. На 2 спрацьовує безкоштовний імпульс. Під час ходу можна натомість витратити 2 Сонця й основну дію. Оберіть пряму лінію або область навколо Луче; невдалий захист накладає Осліплення до кінця наступного ходу цілі.",
    },
    lucheBurningSun: {
      name: "Падіння Сонця",
      description:
        "Витратьте 5 Сонць і основну дію. Влучання у зоні атаки завдає 2 шкоди та Осліплює.",
    },
    kanekiGhoul: {
      name: "Гуль",
      description: "Канекі має +2 до максимального та початкового здоров’я.",
    },
    kanekiRcCells: {
      name: "RC-клітини",
      description:
        "Отримайте 1 RC за влучання та додаткові 3 RC за вбивство. Лічильник не обмежений.",
    },
    kanekiRinkakuKagune: {
      name: "Рінкаку Кагуне",
      description: "Канекі також використовує рух убивці.",
    },
    kanekiRegeneration: {
      name: "Регенерація",
      description:
        "Оберіть і підтвердьте X: витратьте основну дію та рівно X RC-клітин, щоб відновити X здоров’я, не перевищуючи максимум.",
    },
    kanekiScolopendra: {
      name: "Сороконіжка",
      description:
        "За понад 5 RC Канекі отримує властивості вершника й може витрачати основну дію на додатковий рух.",
    },
    zoroCheatedDeath: {
      name: "Обдурив смерть",
      description: "Зоро має +2 до максимального та початкового здоров’я.",
    },
    zoroDetermination: {
      name: "Рішучість",
      description: "Кожна успішна атака дає 1 Рішучість без обмеження.",
    },
    zoroOniGiri: {
      name: "Оні Ґірі",
      description:
        "Власний лічильник отримує +1 на початку ходу Зоро. Витратьте 2 заряди цього лічильника або 2 Рішучості; обидва варіанти витрачають основну дію та рух. Перемістіться перед або за ворога на прямій і атакуйте лише його.",
    },
    zoro3SwordStyle: {
      name: "Санторю",
      description: "Одна базова атака Зоро може одночасно обрати до двох різних законних цілей.",
    },
    zoroAsura: {
      name: "Асура: дев’ять мечів",
      description:
        "Витратьте 6 Рішучості й основну дію. Атакуйте всіх ворогів у зоні трикстера з +1 шкоди.",
    },
    donKihoteHardy: {
      name: "Витривалий",
      description: "Дон Кіхот має +1 до максимального та початкового здоров’я.",
    },
    donKihoteSorrowfulCountenance: {
      name: "Лицар сумного образу",
      description:
        "Після шкоди від ворожої атаки можна безкоштовно переміститися на сусідню вільну клітинку. Звичайний рух не витрачається.",
    },
    donKihoteWindmills: {
      name: "Атака на вітряки",
      description:
        "Витратьте 3 заряди й рух та оголосіть одного ворожого героя Велетнем. Зачеплений на шляху ворог отримує 1 шкоду й переміщується власником; Дон Кіхот атакує лише Велетня.",
    },
    donKihoteMadness: {
      name: "Безумство лицаря",
      description:
        "Після смерті оберіть напрямок і востаннє атакуйте всіх ворогів на цій лінії з +1 шкоди.",
    },
    jackRipperResilient: {
      name: "Живучий",
      description: "Джек має +1 до максимального та початкового здоров’я.",
    },
    jackRipperCoveringTracks: {
      name: "Заметання слідів",
      description:
        "Пасивна. Якщо Джек має поставити шостий силок, коли на полі вже є 5 силків, оберіть один наявний силок і підірвіть його. Істоти в радіусі 1 кидають 1d6; на 1–4 отримують 1 шкоди, на 5–6 уникають її.",
    },
    jackRipperSurgery: {
      name: "Хірург",
      description: "Після шкоди власник Джека приватно бачить поточне здоров’я цілі.",
    },
    jackRipperSnares: {
      name: "Пастки маніяка",
      description:
        "На початку ходу Джека поставте приховану від суперника пастку. Істота, що входить у неї, зупиняється й не рухається до початку свого наступного ходу; тоді пастка зникає.",
    },
    jackRipperDismemberment: {
      name: "Свята Матір різанини",
      description:
        "Раз за гру чотири рази атакуйте ціль на вашій пастці; кожне влучання завдає 3 шкоди.",
    },
    artemidaGod: {
      name: "Богиня",
      description: "Артеміда має +5 до максимального та початкового здоров’я.",
    },
    artemidaAccurateArrow: {
      name: "Точна стріла",
      description: "Дубль під час атаки автоматично влучає.",
    },
    artemidaNatureMovement: {
      name: "Природний рух",
      description: "Артеміда також використовує рух трикстера.",
    },
    artemidaMoonlightShot: {
      name: "Місячне прозріння",
      description:
        "Імпульс на початку ходу за 3 власні заряди. Оберіть центр області 3×3 лише на лінії атаки Артеміди; вороги в області виходять із прихованості.",
    },
    artemidaSilverCrescent: {
      name: "Срібний місячний серп",
      description:
        "Витратьте 5 зарядів і дію. Оберіть кінцеву клітинку на лінії атаки; атакуйте фігури на лінії лише до цієї клітинки та на сусідніх клітинках. Влучання завдає 2 шкоди.",
    },
    artemidaStealth: {
      name: "Прихованість",
      description: "Артеміда може увійти в прихованість на результаті 6.",
    },
  },
};
