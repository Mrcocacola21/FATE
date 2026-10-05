import test from 'node:test';
import { testGlicko2Calculations } from '../unitCases/glicko2';

test('Glicko-2 reference, win/loss/draw, RD, volatility, purity, invalid input and bounded convergence', () => { testGlicko2Calculations(); });
