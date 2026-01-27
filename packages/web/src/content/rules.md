# FATE Rulebook

## Game Rules (2d6 System)
FATE uses a shared 2d6 resolution system for most contested outcomes.
- When an attack is declared, both attacker and defender roll 2d6.
- The higher total hits. If totals are tied, both roll a 1d6 tie-break and add it to their totals.
- Some class passives trigger on doubles (see Class Mechanics).
- Many abilities also use 1d6 or 2d6 rolls, noted on the ability card.

## Army Composition (7 base classes)
Each army fields 7 units drawn from the seven base classes:
- Spearman
- Rider
- Knight
- Archer
- Trickster
- Assassin
- Berserker
Hero selections are variants of these base classes. They keep the class movement and attack rules but may change stats or add abilities.

## Board (9x9, coordinates A-I / 0-8)
- The board is a 9x9 grid.
- Columns A-I map to col 0-8. Rows 0-8 run top to bottom.
- Use coordinates like A0, E4, or I8.

## Battle Start & Placement
- Roll initiative (2d6 each) until there is a winner.
- The initiative winner places first; players alternate placements.
- Units are placed on the back row only (P1 row 0, P2 row 8), in columns B-H (1-7), on empty cells.
- After both players place 7 units, battle starts. Turn order follows placement order and the first placed unit acts first.

## Turn Structure
The game proceeds in a unit-by-unit turn queue.
- Start of turn: stealth timers tick and ability charges refresh.
- Spend turn slots as available: Move, Attack, Action, Stealth.
- A unit can usually move once, attack once, and use one action per turn.
- Using an ability may consume an Action, Move, Attack, or Stealth slot as listed.
- End Turn passes to the next unit in the queue.

## Attack System (2d6 vs 2d6 + tie-break 1d6)
- Declare a legal target in range and line of sight (if required).
- Attacker and defender roll 2d6. Higher total hits.
- If tied, both roll a 1d6 tie-break and add it to their totals.
- Damage equals the attacker damage stat unless modified by abilities or passives.
- Stealthed units cannot be directly targeted (see Stealth System).

## Stealth System (duration, reveal, AoE, search mechanics)
Only Archer and Assassin can enter stealth.
- Stealth attempt: spend the Stealth slot and roll 1d6.
  - Archer succeeds on 6.
  - Assassin succeeds on 5-6.
- Only one stealth attempt per unit per turn.
- A successful stealth lasts for 3 of the unit's own turns; it is revealed at the start of the 4th.
- Stealthed units cannot be directly attacked and are hidden from opponents until revealed.
- Reveal triggers include search, AoE hits, stepping onto a hidden unit, certain abilities, and stealth timer expiry.
- Search: spend Move or Action to search radius 1 (Chebyshev). Each hidden enemy in radius is revealed on 1d6 = 5-6.
- AoE effects reveal stealthed units in their area.

## Class Mechanics (Spearman, Rider, Knight, Archer, Trickster, Assassin, Berserker)
### Spearman
- Move: 1 square in any direction.
- Attack: reach 2 squares in straight or diagonal lines.
- Passive: if the defender roll is a double, the attack misses (auto dodge).

### Rider
- Move: any distance orthogonally (rook-style). The Rider may pass through units but cannot end on an occupied cell. Also gains a 1-square diagonal step.
- Attack: melee (adjacent).
- Path attack: when moving orthogonally through enemies, the Rider attacks each enemy passed on the path, even if stealthed.

### Knight
- Move: 1 square in any direction.
- Attack: melee (adjacent).
- Passive: if the attacker roll is a double, the attack hits automatically.

### Archer
- Move: 1 square in any direction.
- Attack: line of sight along row, column, or diagonal. The first enemy in line is the only legal target. Allies do not block line of sight.
- Stealth: can attempt to enter stealth on 1d6 = 6.

### Trickster
- Move: roll 1d6.
  - 1-4: move to any empty cell within radius 2 (Chebyshev).
  - 5-6: move to any empty cell on the board.
- Attack: target within radius 2 (Chebyshev).
- Many Trickster abilities are AoE and can reveal hidden units.

### Assassin
- Move: 1 or 2 squares in any straight or diagonal direction.
- Attack: melee (adjacent).
- Stealth: can attempt to enter stealth on 1d6 = 5-6.
- From stealth, a successful attack deals 2 damage and reveals the Assassin.

### Berserker
- Move: roll 1d6 to determine the allowed arc.
  - 1: forward arc (N, NE, NW).
  - 2: backward arc (S, SE, SW).
  - 3: left arc (W, NW, SW).
  - 4: right arc (E, NE, SE).
  - 5: any adjacent square.
  - 6: any adjacent square or 2 squares orthogonally.
- Attack: melee (adjacent).
- Passive: Auto Defense. When fully charged (6), the Berserker can auto dodge an incoming attack and spends all charges.

## Charges & Abilities (Passive / Active / Impulse / Phantasm)
Abilities are categorized by type:
- Passive: always on or auto-triggered, no player input.
- Active: used on your turn, consumes listed turn slots.
- Impulse: triggered by specific events, often reactive.
- Phantasm: high impact abilities with larger charge costs.

Charge rules:
- Charges normally increase by 1 at the start of the unit's turn (unless marked special).
- Some abilities start fully charged, some require a full charge meter, and some are unlimited.
- Using an ability spends its required charges and may reset the counter.

Always check the ability card for its slot cost and charge requirement.
