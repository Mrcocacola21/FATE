import { SeededRNG, rollD6 } from './rng';
for (let s = 1; s <= 200; s++) {
  const rng = new SeededRNG(s);
  const v = rollD6(rng);
  if (v >= 5) {
    console.log('seed', s, '->', v);
    break;
  }
}
// debug print first 10 seeds
for (let s=1;s<=10;s++){
  const r=new SeededRNG(s);
  console.log('s',s,'v',rollD6(r));
}
const tests = [100,1000,12345,123456,1234567,987654321,2147483647];
for (const s of tests) {
  const r = new SeededRNG(s);
  console.log('s', s, 'v', rollD6(r));
}
const bigTests = [4294967295, 4000000000, 3500000000, 3000000000, 2500000000];
for (const s of bigTests) {
  const r = new SeededRNG(s);
  console.log('BIG s', s, 'v', rollD6(r));
}
