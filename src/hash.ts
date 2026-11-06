import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'

/** The encoding depends on the Safe's version: see `VERSION()` on its contract. */
export type Version = 'current' | 'pre-1.3' | 'pre-1.0'

export type SafeTx = {
  chainId: bigint
  safe: string
  to: string
  value: bigint
  data: string
  operation: 0 | 1
  safeTxGas: bigint
  baseGas: bigint
  gasPrice: bigint
  gasToken: string
  refundReceiver: string
  nonce: bigint
}

export type Hashes = { domain: string; message: string; safeTx: string }

export const ZERO_ADDRESS = `0x${'0'.repeat(40)}`
const MAX_UINT = (1n << 256n) - 1n

const hex = (bytes: Uint8Array) => `0x${bytesToHex(bytes)}`
const bytes = (value: string) => hexToBytes(value.slice(2))
const keccak = (data: Uint8Array) => keccak_256(data)
const typeHash = (type: string) => keccak(utf8ToBytes(type))

const word = (value: bigint) => hexToBytes(value.toString(16).padStart(64, '0'))
const addressWord = (address: string) => word(BigInt(address))

const DOMAIN_CHAIN = typeHash('EIP712Domain(uint256 chainId,address verifyingContract)')
const DOMAIN_NO_CHAIN = typeHash('EIP712Domain(address verifyingContract)')

const fields = (gas: string) =>
  `SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 ${gas},uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)`
const SAFE_TX = typeHash(fields('baseGas'))
const SAFE_TX_DATA_GAS = typeHash(fields('dataGas'))

/** What a Safe compares signatures against, plus the two parts hardware wallets display. */
export function safeHashes(tx: SafeTx, version: Version): Hashes {
  const domain = keccak(
    version === 'current'
      ? concatBytes(DOMAIN_CHAIN, word(tx.chainId), addressWord(tx.safe))
      : concatBytes(DOMAIN_NO_CHAIN, addressWord(tx.safe)),
  )
  const message = keccak(
    concatBytes(
      version === 'pre-1.0' ? SAFE_TX_DATA_GAS : SAFE_TX,
      addressWord(tx.to),
      word(tx.value),
      keccak(bytes(tx.data)),
      word(BigInt(tx.operation)),
      word(tx.safeTxGas),
      word(tx.baseGas),
      word(tx.gasPrice),
      addressWord(tx.gasToken),
      addressWord(tx.refundReceiver),
      word(tx.nonce),
    ),
  )
  return { domain: hex(domain), message: hex(message), safeTx: hex(keccak(concatBytes(new Uint8Array([0x19, 0x01]), domain, message))) }
}

/** EIP-55: all-lowercase and all-uppercase addresses carry no checksum. */
function validChecksum(address: string): boolean {
  const body = address.slice(2)
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true
  const hash = bytesToHex(keccak(utf8ToBytes(body.toLowerCase())))
  return [...body].every((c, i) => (parseInt(hash[i], 16) > 7 ? c === c.toUpperCase() : c === c.toLowerCase()))
}

export function parseAddress(input: string): string {
  const value = input.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('Not an address')
  if (!validChecksum(value)) throw new Error('Bad checksum')
  return value
}

export function parseUint(input: string): bigint {
  const value = input.trim()
  if (!/^(\d+|0x[0-9a-fA-F]+)$/.test(value)) throw new Error('Not a number')
  const parsed = BigInt(value)
  if (parsed > MAX_UINT) throw new Error('Too large')
  return parsed
}

export function parseData(input: string): string {
  const value = input.replace(/\s/g, '') || '0x'
  if (!/^0x([0-9a-fA-F]{2})*$/.test(value)) throw new Error('Not hex bytes')
  return value.toLowerCase()
}

// what a call does when it isn't what the signer was told
const FUNCTIONS: Record<string, string> = {
  a9059cbb: 'transfer',
  '23b872dd': 'transferFrom',
  '095ea7b3': 'approve',
  '8d80ff0a': 'multiSend',
  e318b52b: 'swapOwner',
  '0d582f13': 'addOwnerWithThreshold',
  f8dc5dd9: 'removeOwner',
  '694e80c3': 'changeThreshold',
  '610b5925': 'enableModule',
  e009cfde: 'disableModule',
  e19a9dd9: 'setGuard',
  f08a0323: 'setFallbackHandler',
  '7de7edef': 'changeMasterCopy',
}

const SAFE_ADMIN = new Set(['swapOwner', 'addOwnerWithThreshold', 'removeOwner', 'changeThreshold', 'enableModule', 'disableModule', 'setGuard', 'setFallbackHandler', 'changeMasterCopy'])

export function functionName(data: string): string | undefined {
  if (data === '0x') return undefined
  const selector = data.slice(2, 10)
  return FUNCTIONS[selector] ?? `0x${selector}`
}

export type Warning = { level: 'danger' | 'caution'; text: string }

/** Things a signer should stop and understand, whatever the interface said the transaction does. */
export function warnings(tx: SafeTx): Warning[] {
  const list: Warning[] = []
  const name = functionName(tx.data)
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  if (tx.operation === 1) list.push({ level: 'danger', text: 'DELEGATECALL: the target’s code runs as this Safe and can rewrite it. Expected only for a MultiSend library you recognize.' })
  if (tx.gasPrice !== 0n || !same(tx.gasToken, ZERO_ADDRESS) || !same(tx.refundReceiver, ZERO_ADDRESS)) {
    list.push({ level: 'danger', text: 'Gas refund set: the Safe pays out on execution, which can drain it.' })
  }
  if (same(tx.to, tx.safe) && tx.operation === 0 && name && SAFE_ADMIN.has(name)) list.push({ level: 'caution', text: `Changes the Safe itself: ${name}.` })
  return list
}
