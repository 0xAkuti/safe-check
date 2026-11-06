import assert from 'node:assert/strict'
import { test } from 'node:test'

import { functionName, parseAddress, parseData, parseUint, type SafeTx, safeHashes, type Version, warnings, ZERO_ADDRESS } from '../src/hash.ts'
import vectors from './vectors.json' with { type: 'json' }

const base: SafeTx = {
  chainId: 1n,
  safe: '0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4',
  to: '0x96221423681A6d52E184D440a8eFCEbB105C7242',
  value: 0n,
  data: '0xa9059cbb000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be29695160000000000000000000000000000000000000000000000000000000000000000',
  operation: 1,
  safeTxGas: 45746n,
  baseGas: 0n,
  gasPrice: 0n,
  gasToken: ZERO_ADDRESS,
  refundReceiver: ZERO_ADDRESS,
  nonce: 71n,
}

// expected values come from getTransactionHash and domainSeparator on real Safe singletons behind a
// real proxy: one per version and variant, sampled from a fuzz run of 3,300 transactions
for (const v of vectors) {
  test(`matches Safe ${v.safeVersion}`, () => {
    const tx: SafeTx = {
      ...v,
      chainId: BigInt(v.chainId),
      value: BigInt(v.value),
      operation: Number(v.operation) as 0 | 1,
      safeTxGas: BigInt(v.safeTxGas),
      baseGas: BigInt(v.baseGas),
      gasPrice: BigInt(v.gasPrice),
      nonce: BigInt(v.nonce),
    }
    assert.deepEqual(safeHashes(tx, v.version as Version), v.expected)
  })
}

// 0x46deef0f…7882 carries three signatures over this hash; each recovers to an owner of the Safe
test('matches what Bybit’s signers signed', () => {
  assert.deepEqual(safeHashes(base, 'pre-1.3'), {
    domain: '0xb3ded2bdbff5db1a87f6d551fa256e9f2bd6517a3bb84f4c2ea863fb3a559622',
    message: '0xea68fc75e93bf7286b1257680ca8e2033bfadd8e1cb8a23f3ca18f1031ecf1e0',
    safeTx: '0xb3476d061aeb8fc1d605a873c483a2402d88a68a9cdd1a8b47655dd55ba004f8',
  })
})

test('the chain only counts from 1.3.0', () => {
  const other = { ...base, chainId: 10n }
  assert.notEqual(safeHashes(base, 'current').safeTx, safeHashes(other, 'current').safeTx)
  assert.equal(safeHashes(base, 'pre-1.3').safeTx, safeHashes(other, 'pre-1.3').safeTx)
})

test('flags a delegatecall, however harmless the function looks', () => {
  assert.equal(functionName(base.data), 'transfer')
  assert.equal(warnings(base)[0].level, 'danger')
  assert.match(warnings(base)[0].text, /DELEGATECALL/)
})

test('flags gas refunds, each field on its own', () => {
  const call = { ...base, operation: 0 as const }
  assert.deepEqual(warnings(call), [])
  for (const change of [{ gasPrice: 1n }, { gasToken: base.to }, { refundReceiver: base.to }]) {
    assert.match(warnings({ ...call, ...change })[0].text, /refund/i)
  }
})

test('flags changes to the Safe itself, any address case', () => {
  const tx = { ...base, operation: 0 as const, to: base.safe.toLowerCase(), data: '0x694e80c3' }
  assert.match(warnings(tx)[0].text, /changeThreshold/)
  assert.deepEqual(warnings({ ...tx, to: base.to }), [])
})

test('names functions it knows, and shows the selector of those it doesn’t', () => {
  assert.equal(functionName('0x'), undefined)
  assert.equal(functionName('0xe318b52b00'), 'swapOwner')
  assert.equal(functionName('0xdeadbeef'), '0xdeadbeef')
})

test('rejects malformed input', () => {
  assert.equal(parseAddress(` ${base.safe} `), base.safe)
  assert.equal(parseAddress(base.safe.toLowerCase()), base.safe.toLowerCase())
  assert.throws(() => parseAddress('0x123'), /Not an address/)
  assert.throws(() => parseAddress(base.safe.replace('1Db', '1dB')), /Bad checksum/)
  assert.equal(parseUint('0x10'), 16n)
  assert.throws(() => parseUint('-1'))
  assert.throws(() => parseUint('1.5'))
  assert.throws(() => parseUint(''))
  assert.throws(() => parseUint((1n << 256n).toString()), /Too large/)
  assert.equal(parseData(''), '0x')
  assert.equal(parseData('0xAB\n cd'), '0xabcd')
  assert.throws(() => parseData('0xabc'))
  assert.throws(() => parseData('abcd'))
})
