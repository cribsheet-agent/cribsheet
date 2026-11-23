import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorrect, normalise } from '../exam/grade.ts';

test('addresses: case and wrapping do not matter', () => {
  assert.equal(normalise('address', ' "0xAbCdEf0000000000000000000000000000000001". '), '0xabcdef0000000000000000000000000000000001');
  assert.equal(normalise('address', '0x123'), null);
});

test('integers: decimal, hex and separators', () => {
  assert.equal(normalise('integer', '1,204'), '1204');
  assert.equal(normalise('integer', '0x10'), '16');
  assert.equal(normalise('integer', 'about 12'), null);
});

test('yes/no', () => {
  assert.equal(normalise('yesno', 'Yes'), 'yes');
  assert.equal(normalise('yesno', 'false'), 'no');
  assert.equal(normalise('yesno', 'maybe'), null);
});

test('a block off by one is wrong', () => {
  assert.equal(isCorrect({ format: 'integer', key: '120974887' }, '120974888'), false);
  assert.equal(isCorrect({ format: 'integer', key: '120974887' }, '120974887'), true);
  assert.equal(isCorrect({ format: 'integer', key: '1' }, null), false);
});
