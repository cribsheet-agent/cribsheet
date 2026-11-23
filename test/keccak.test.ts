import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccakText, selector } from '../lib/keccak.ts';

test('keccak256 known vectors', () => {
  assert.equal(keccakText(''), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(keccakText('abc'), '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  assert.equal(keccakText('Transfer(address,address,uint256)'), '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
  assert.equal(keccakText('x'.repeat(200)).length, 66); // crosses a 136-byte block
});

test('selectors', () => {
  assert.equal(selector('transfer(address,uint256)'), '0xa9059cbb');
  assert.equal(selector('balanceOf(address)'), '0x70a08231');
});

test('Pons event topics match the ones seen in the factory logs', () => {
  assert.equal(keccakText('TokenLaunched(address,address,address,address,uint256,uint256)'), '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607');
  assert.equal(keccakText('PoolGraduated(address,uint256,uint256,uint256)'), '0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259');
});
