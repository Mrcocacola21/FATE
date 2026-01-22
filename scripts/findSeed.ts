import { SeededRNG, rollD6 } from '../packages/rules/src/rng';
for (let s = 1; s <= 1000; s++) {
  const rng = new SeededRNG(s);
  const v = rollD6(rng);
  if (v >= 5) {
    console.log('seed', s, '->', v);
    break;
  }
}
