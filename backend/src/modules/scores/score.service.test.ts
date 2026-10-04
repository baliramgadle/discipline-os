import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreStreaks } from './score.service.js';

test('current streak includes activity today and prior consecutive days', () => {
  assert.deepEqual(
    scoreStreaks(['2026-10-04', '2026-10-03', '2026-10-02'], '2026-10-04'),
    { currentStreakDays: 3, bestStreakDays: 3 },
  );
});

test('current streak remains active through yesterday but not across a gap', () => {
  assert.deepEqual(
    scoreStreaks(['2026-10-03', '2026-10-02', '2026-09-29'], '2026-10-04'),
    { currentStreakDays: 2, bestStreakDays: 2 },
  );
});

test('no activity yields no streak and empty input is safe', () => {
  assert.deepEqual(
    scoreStreaks([], '2026-10-04'),
    { currentStreakDays: 0, bestStreakDays: 0 },
  );
});
