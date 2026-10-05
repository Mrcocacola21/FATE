import test from 'node:test';
import { testStatisticsCalculations } from '../unitCases/statistics';

test('statistics zero games, win/loss/draw, missing samples, streaks, modes and invalid observations', () => { testStatisticsCalculations(); });
