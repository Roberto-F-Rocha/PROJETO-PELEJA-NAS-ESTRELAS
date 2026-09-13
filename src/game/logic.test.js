import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, levelConfig, rectsOverlap, safeStoredNumber, scoreForHit } from './logic.js';

test('clamp keeps values inside the requested range', () => {
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(14, 0, 10), 10);
  assert.equal(clamp(6, 0, 10), 6);
});

test('collision detects overlap and respects separated rectangles', () => {
  const a = { x: 0, y: 0, width: 20, height: 20 };
  assert.equal(rectsOverlap(a, { x: 15, y: 10, width: 20, height: 20 }), true);
  assert.equal(rectsOverlap(a, { x: 21, y: 0, width: 20, height: 20 }), false);
});

test('level configuration is bounded and gets progressively harder', () => {
  assert.equal(levelConfig(0).level, 1);
  assert.equal(levelConfig(99).level, 5);
  assert.ok(levelConfig(4).enemySpeed > levelConfig(1).enemySpeed);
  assert.ok(levelConfig(4).spawnEvery < levelConfig(1).spawnEvery);
});

test('score combo has a safe cap', () => {
  assert.equal(scoreForHit('rock', 1), 100);
  assert.equal(scoreForHit('fast', 9), 1100);
});

test('stored numeric values cannot corrupt state', () => {
  assert.equal(safeStoredNumber('4200'), 4200);
  assert.equal(safeStoredNumber('invalid', 7), 7);
  assert.equal(safeStoredNumber('-10', 7), 7);
});
