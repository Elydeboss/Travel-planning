# Terminal 3 ADK — testnet walkthrough + bug report + bonus use case

A complete, reproducible run of the Terminal 3 Agent Developer Kit (ADK) on **testnet**:
Quickstart, the full 5-part TEE-contract Walkthrough, and a **bonus use case** — an original
second contract. Everything done with attestation verification **on** (`fetchTrustedManifest`,
not the unsafe opt-out).

**Submitted for the Terminal 3 ADK community testing program.**

## Result

End-to-end pipeline working against testnet:

| Step | Status |
|---|---|
| Claim + API key | ✅ sign-in, key saved, test credits issued |
| Quickstart (authenticated call) | ✅ `Connected as: did:t3n:6e5663…c99` |
| Dev env (`TenantClient` check) | ⚠️ blocked by SDK bug — see B-02, worked around |
| Walkthrough 1–2: write & build | ✅ `z_tenant_flight.wasm` built, interface verified |
| Walkthrough 3: register | ✅ `z:<tid>:travel-contracts` → contract id **704**, `secrets` map + seeded key |
| Walkthrough 4: invoke | ✅ `search-offers` invoked inside the enclave; egress grant resolved; Duffel reached (401 = placeholder test token; full path proven) |
| Walkthrough 5: test | ✅ `cargo test --target <native>` → 7 + 1 doc-test pass |
| Bonus use case | ✅ `z-trip-planner` (contract id **705**): `save-itinerary` / `get-itinerary` / `list-itineraries` against a private KV map |

## Bugs found

**10 findings** in `BUGS.md`, including:

- **B-01 [Blocker]** Quickstart crashes on SDK v4.39.1 — `trustAnchor` required but undocumented.
- **B-02 [Critical]** `TenantClient` sends `contract_id`/`contract_version`; testnet node requires
  `script_name`/`script_version` — registration, maps, and seeding all fail through the documented
  API. Worked around with a raw-dispatch control shim (`t3n-quickstart/tenant-control.ts`).
- **B-03 [Blocker]** Docs call `tenant.me()` — no such method in v4.39.1.
- **B-04 [Blocker]** Docs import `getScriptVersion` — the SDK exports `getContractVersion`.
- **B-05 [Major]** `z-tenant-flight/.cargo/config.toml` pins the wasm target, breaking `cargo test`.
- **B-06 [Major]** Reference README describes inline PII + a manifest that v0.4.1 source doesn't have.
- **B-07 [Docs gap]** `AGENT_KEY`/`USER_KEY` never explained; agent identities can't be funded
  (admin-only transfers) → walkthrough used the documented direct self-grant path.
- **B-08 [Minor]** Bounty claim URL 302s to a marketing page.
- **B-09 [Minor]** Invoke sample hardcodes a past `departure_date`.
- **B-10 [Docs gap]** `book-offer` placeholder prerequisites (OTP-verified email, Level-1 profile) undocumented.

## Layout

```
t3n-quickstart/            Node/TypeScript project (this is the submission's app)
  quickstart.ts            Quickstart connection (B-01 fixed)
  session.ts               connect + authenticate, shared by later steps
  tenant-control.ts        raw-dispatch control shim (B-02 workaround)
  walkthrough.ts           register → maps → seed → grant → invoke
  use-case.ts              bonus contract run
  debug-control.ts         minimal B-02 reproduction
  AGENTS.md                official docs skill file
  docs/captures/           captured terminal output of each step
z-trip-planner/            original bonus contract (Rust → WASM, kv-store write/read/scan)
BUGS.md                    the bug report (10 findings)
USE-CASE.md                the bonus use case writeup
```

The upstream reference contract (`Terminal-3/z-tenant-flight`) is cloned as a **sibling** directory,
not vendored, per the docs.

## Reproduce

Prereqs: Node 20+, Rust with the `wasm32-wasip2` target, and an API key from
https://go.terminal3.io/adk-community (the docs' claim page is
https://www.terminal3.io/claim-page).

```bash
git clone <this repo> && cd t3n-quickstart
npm install
cp .env.example .env        # put T3N_API_KEY in it (gitignored)

# the reference contract, as a sibling of t3n-quickstart
git clone https://github.com/Terminal-3/z-tenant-flight.git
cd z-tenant-flight && cargo build --target wasm32-wasip2 --release && cd ..

npm run quickstart          # B-01 fixed: authenticated connection
npm run walkthrough         # register → maps → secret → grant → invoke (shim)
npm run usecase             # bonus contract run
npm run repro               # minimal B-02 reproduction
```

Optionally set `DUFFEL_API_KEY` (a real Duffel test token) for a live flight-offer response
instead of the placeholder-token 401. Everything runs against testnet; `setEnvironment("testnet")`
is set explicitly.