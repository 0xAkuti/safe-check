# Safe tx check

Compute a Safe transaction's hash yourself before you sign it, from a page nobody can change. Deployed to Ethereum with [Navik](https://github.com/0xAkuti/navik). Independent, not affiliated with Safe.

In the 2025 Bybit hack, a tampered web frontend showed signers one transaction while they signed another. A checker on a normal host can be tampered with the same way, so this one isn't on a host:

- **Immutable:** a release such as `2.safe-check.navik.eth` can never change, even by its owner. Bookmark the numbered release, not `safe-check.navik.eth`, which follows promotions.
- **Verifiable:** `navik verify safe-check.navik.eth --against dist` proves the bytes on chain match this source. The build is reproducible.
- **Offline by construction:** no RPC and no wallet. The page's Content-Security-Policy blocks every connection, so nothing you paste can leave it. It is stored uncompressed, so the policy is in the bytes on chain and applies before any script runs.

## Use

Enter the transaction **from what your signers agreed on, not from the interface asking you to sign**. A compromised interface would hand you the same false details it signs with. Then compare the result with your hardware wallet: most show the domain and message hashes, and interfaces show the Safe tx hash. Paste any of the three into Compare.

A match means you are signing what you entered, not that it is safe. It also warns on `DELEGATECALL`, gas refunds that pay out of the Safe, and calls that change the Safe itself.

The **Bybit example** loads the real attack transaction. It reads as a harmless `transfer`, but it is a delegatecall that replaced the Safe's implementation.

## Develop

```sh
pnpm install
pnpm dev
pnpm test
```

Hashing is in `src/hash.ts`, and keccak comes from the audited `@noble/hashes`. The expected values in `test/` come from real Safe contracts, one for each of 0.1.0, 1.0.0, 1.1.0, 1.1.1, 1.2.0, 1.3.0, 1.4.1 and 1.5.0, plus L2 variants. The Bybit test pins the hash that the signatures on the attack transaction recover to.

## Deploy

With the Navik CLI (`node <navik>/cli/src/cli.ts`, or `navik` once published) and a key that owns the project:

```sh
navik claim safe-check         # once
navik build --smoke            # no chain: build, pack, test in a sandboxed browser
navik deploy --smoke --promote
```

The result is 17 KB in one chunk, about 4M gas.

## Limits

- It computes hashes and flags known risks. It doesn't simulate the transaction or decode arguments, so a `DELEGATECALL` warning still needs you to recognize the target.
- The Safe version is yours to pick: read `VERSION()` on the Safe. The wrong one gives a wrong hash, which shows as no match.
- eth.limo is a trusted gateway that doesn't check content. For a real signing decision, open it where the bytes are checked: Navik's viewer, or an ERC-8244 browser.
