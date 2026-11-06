import { type Hashes, functionName, parseAddress, parseData, parseUint, type SafeTx, safeHashes, type Version, warnings, ZERO_ADDRESS } from './hash.ts'
import './style.css'

type Field = { key: string; label: string; rows?: number; placeholder?: string; value?: string; advanced?: boolean }

const FIELDS: Field[] = [
  { key: 'safe', label: 'Safe', placeholder: '0x…' },
  { key: 'to', label: 'To', placeholder: '0x…' },
  { key: 'value', label: 'Value (wei)', value: '0' },
  { key: 'data', label: 'Data', rows: 3, placeholder: '0x' },
  { key: 'nonce', label: 'Nonce', placeholder: '0' },
  { key: 'safeTxGas', label: 'safeTxGas', value: '0', advanced: true },
  { key: 'baseGas', label: 'baseGas', value: '0', advanced: true },
  { key: 'gasPrice', label: 'gasPrice', value: '0', advanced: true },
  { key: 'gasToken', label: 'gasToken', value: ZERO_ADDRESS, advanced: true },
  { key: 'refundReceiver', label: 'refundReceiver', value: ZERO_ADDRESS, advanced: true },
]

const PARSERS: Record<string, (input: string) => unknown> = {
  safe: parseAddress,
  to: parseAddress,
  gasToken: parseAddress,
  refundReceiver: parseAddress,
  data: parseData,
  chainId: parseUint,
  value: parseUint,
  nonce: parseUint,
  safeTxGas: parseUint,
  baseGas: parseUint,
  gasPrice: parseUint,
}

/** The transaction that drained Bybit's cold wallet (0x46deef0f…7882), with the Safe version it ran. */
const BYBIT: Record<string, string> = {
  chainId: '1',
  version: 'pre-1.3',
  safe: '0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4',
  to: '0x96221423681A6d52E184D440a8eFCEbB105C7242',
  value: '0',
  data: '0xa9059cbb000000000000000000000000bdd077f651ebe7f7b3ce16fe5f2b025be29695160000000000000000000000000000000000000000000000000000000000000000',
  operation: '1',
  nonce: '71',
  safeTxGas: '45746',
  baseGas: '0',
  gasPrice: '0',
  gasToken: ZERO_ADDRESS,
  refundReceiver: ZERO_ADDRESS,
}

const form = document.getElementById('form') as HTMLFormElement
const result = document.getElementById('result')!

const field = (f: Field) => {
  const input = f.rows ? `<textarea name="${f.key}" rows="${f.rows}"></textarea>` : `<input name="${f.key}" />`
  return `<label><span>${f.label}</span>${input}</label>`
}

form.innerHTML = `
  <section class="card">
    <div class="row">
      <label><span>Chain ID</span><input name="chainId" /></label>
      <label><span>Safe version <i class="info" title="Older Safes hash differently. Read VERSION() on the Safe’s contract.">i</i></span>
        <select name="version">
          <option value="current">1.3.0 or newer</option>
          <option value="pre-1.3">1.0.0 to 1.2.x</option>
          <option value="pre-1.0">Before 1.0.0</option>
        </select>
      </label>
    </div>
    <label><span>Operation</span>
      <select name="operation"><option value="0">Call</option><option value="1">Delegatecall</option></select>
    </label>
    ${FIELDS.filter((f) => !f.advanced).map(field).join('')}
    <details><summary>Gas and refund</summary>${FIELDS.filter((f) => f.advanced).map(field).join('')}</details>
  </section>
  <section class="card">
    <label><span>Compare <i class="info" title="Paste or type a hash from your hardware wallet or the signing interface. It is matched against all three below.">i</i></span><input name="compare" placeholder="0x…" /></label>
  </section>`

const control = (name: string) => form.elements.namedItem(name) as HTMLInputElement

function set(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) control(name).value = value
}

set({ chainId: '1', ...Object.fromEntries(FIELDS.filter((f) => f.value).map((f) => [f.key, f.value!])) })
for (const f of FIELDS) if (f.placeholder) control(f.key).placeholder = f.placeholder

/** Parses every field, marking the bad ones. undefined until the form is complete and valid. */
function readTx(): SafeTx | undefined {
  const parsed: Record<string, unknown> = {}
  let ok = true
  for (const [name, parse] of Object.entries(PARSERS)) {
    const input = control(name)
    const label = input.closest('label')!
    label.querySelector('em')?.remove()
    try {
      parsed[name] = parse(input.value)
    } catch (err) {
      ok = false
      // an empty required field is unfinished, not wrong
      if (input.value.trim()) label.querySelector('span')!.insertAdjacentHTML('beforeend', `<em>${(err as Error).message}</em>`)
    }
  }
  return ok ? ({ ...parsed, operation: Number(control('operation').value) as 0 | 1 } as SafeTx) : undefined
}

const row = (label: string, value: string, hit: boolean) => `<dt>${label}</dt><dd class="hash ${hit ? 'hit' : ''}">${value}</dd>`

function compareNote(hashes: Hashes, compare: string): string {
  if (!compare) return ''
  const hit = Object.values(hashes).includes(compare)
  return hit ? '<p class="match">✓ Matches</p>' : '<p class="mismatch">✗ No match. Do not sign.</p>'
}

function update() {
  const tx = readTx()
  if (!tx) {
    result.innerHTML = '<p class="muted">Fill in the transaction to compute its hash.</p>'
    return
  }
  const hashes = safeHashes(tx, control('version').value as Version)
  const compare = control('compare').value.trim().toLowerCase()
  const name = functionName(tx.data)
  result.innerHTML = `
    ${warnings(tx).map((w) => `<p class="${w.level}">${w.text}</p>`).join('')}
    <dl>
      <dt>Calls</dt><dd>${name ?? 'Nothing (plain transfer)'}</dd>
      ${row('Domain hash', hashes.domain, compare === hashes.domain)}
      ${row('Message hash', hashes.message, compare === hashes.message)}
      ${row('Safe tx hash', hashes.safeTx, compare === hashes.safeTx)}
    </dl>
    ${compareNote(hashes, compare)}`
}

form.addEventListener('input', update)
form.addEventListener('submit', (e) => e.preventDefault())
document.getElementById('example')!.addEventListener('click', () => {
  set({ ...BYBIT, compare: '' })
  update()
})
update()
