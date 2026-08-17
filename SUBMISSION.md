# Terminal 3 ADK — testnet walkthrough + bug report + bonus use case

> Paste the content of this file (top to bottom) into your public Google Doc.
> Set sharing to **Anyone with the link → Viewer**, and insert screenshots where marked `[SCREENSHOT: …]`.
> Source of truth: this repo + `BUGS.md`.

---

## Submission summary

| | |
|---|---|
| **GitHub repo** | https://github.com/Elydeboss/Travel-planning |
| **Tenant DID** | `did:t3n:6e5663db0316b7636b0a40366a81082fcbb22c99` |
| **Date** | 2026-08-17 |
| **Environment** | Linux · Node v24.10.0 · Rust 1.97.1 · `@terminal3/t3n-sdk@4.39.1` · testnet cluster (control contract v1.26.0) |
| **Attestation** | ON — trust anchor from `fetchTrustedManifest("testnet")`, never the `unsafe_trust_server` opt-out |
| **Bugs reported** | 10 (3 blockers, 1 critical, 2 major, 4 docs/gaps) |

---

## 1. What was completed

**Claim & API key** — signed in via SSO at the community claim flow; developer key saved
(shown once), T3N ID and test credits issued automatically.
`[SCREENSHOT: claim page with key redacted]`

**Quickstart (first authenticated call)** — `npx tsx quickstart.ts`:

```
Connected as: did:t3n:6e5663db0316b7636b0a40366a81082fcbb22c99
```
`[SCREENSHOT: Connected as: did:t3n:… console output]`

Note: the verbatim docs Quickstart sample **does not work** on the installed SDK — it requires
a `trustAnchor` (B-01). The working connection is in `t3n-quickstart/session.ts`.

**Set up dev environment** — `TenantControl.me()` (workaround for the broken `TenantClient`, B-02):

```
tenant status = active (label: testnet-dev), control contract v1.26.0
```

**Walkthrough 1–2: write & build** — cloned `Terminal-3/z-tenant-flight` as a sibling folder;
built `z_tenant_flight.wasm` (197,904 bytes); verified the component interface with
`wasm-tools component wit` (imports `tenant-context`, `logging`, `kv-store`, `http`,
`http-with-placeholders`; exports `contracts`).
`[SCREENSHOT: cargo build --release finishing]`

**Walkthrough 3: register** — registered `z:<tid>:travel-contracts` @ 0.1.0 → **contract id 704**;
created the private `secrets` KV map with explicit `readers`/`writers` ACLs scoped to the
contract id; seeded the `duffel_api_key` entry (placeholder — no Duffel account involved).

**Walkthrough 4: invoke** — resolved egress via `agent-auth-update` (documented direct
self-grant path, since second identities cannot be funded — B-07), then invoked `search-offers`
inside the enclave. Result: the contract loaded, read the sealed key from `kv-store`, resolved
the egress grant, dialed `api.duffel.com` over TLS, and surfaced the upstream response:

```
search-offers -> contract error: Duffel offer-request failed: HTTP 401 —
  {"errors":[{"title":"Access token not found", … "code":"access_token_not_found"}], …}
```

That HTTP 401 is the **proof the platform works end-to-end**: every T3N-side step succeeded;
only the third-party credential was a placeholder.

**Walkthrough 5: test** — `cargo test --target x86_64-unknown-linux-gnu` (native target, because
the repo pins the wasm target — B-05): **7 passed + 1 doc-test**. All tests also pass with
`wasm-tools` verification of the component.

**Bonus use case — `z-trip-planner`** (original second contract): see section 3.

Full transcripts for every step: `t3n-quickstart/docs/captures/` in the repo.

---

## 2. Bugs found (10)

Severity: [Blocker] — documented path dead-ends without a workaround · [Critical] — core
feature unusable · [Major] — documented flow fails · [Docs] — wrong or stale information.
Full repro + fixes: `BUGS.md` and `t3n-quickstart/repro.ts`.

### B-01 [Blocker] Quickstart crashes: SDK requires `trustAnchor` the docs omit
The verbatim Quickstart sample throws `T3nConfigError: trustAnchor is required…` on SDK 4.39.1.
Fix: `const trustAnchor = await fetchTrustedManifest("testnet")` before constructing the client.
*(Reproduced in `repro.ts`.)*

### B-02 [Critical] `TenantClient` control plane broken — `contract_id` vs `script_name`
Every `TenantClient` helper (`me`, `maps.create`, `contracts.register`, `executeControl`) sends
`{ contract_id, contract_version, … }` where the testnet node requires
`{ script_name, script_version, … }` — all fail with `Invalid action request: missing field 'script_name'`.
Registration, KV maps, and secret seeding are impossible through the documented API.
**Workaround:** raw `T3nClient.execute`/`executeWithBlob` dispatch to `tee:tenant/contracts`
(`t3n-quickstart/tenant-control.ts`). *(Reproduced + worked around in `repro.ts`.)*

### B-03 [Blocker] Docs call `tenant.me()` — no such method
v4.39.1 has no `TenantClient.me()`; it's `tenant.tenant.me()` (and even that fails per B-02).

### B-04 [Blocker] Docs import `getScriptVersion` — no such export
Installed SDK exports `getContractVersion(rpcUrl, scriptName)`, not `getScriptVersion`.

### B-05 [Major] `z-tenant-flight/.cargo/config.toml` pins the wasm target, breaking `cargo test`
`cargo test` compiles for wasm and can't execute on the host. Run `cargo test --target <native>`.

### B-06 [Major] Reference README contradicts the shipped contract source
README (v0.3.0) documents inline passenger PII + a `host_capabilities` manifest; the actual
source (v0.4.1) uses `http-with-placeholders` and has no manifest.

### B-07 [Docs gap] `AGENT_KEY`/`USER_KEY` never explained; agent identities can't be funded
Claim page issues one key; agent DIDs start at 0 credits with admin-only transfers → the
three-identity model can't be assembled from docs alone. Used the documented self-grant path.

### B-08 [Docs] Bounty claim URL resolves to a marketing page
`go.terminal3.io/adk-community` → 302 → `terminal3.io/products/agent-developer-kit`; the docs'
`terminal3.io/claim-page` lands correctly. Claim page wording ("work email") also differs from
the live GitHub/Google/email options.

### B-09 [Docs] Invoke sample hardcodes a past `departure_date`
`"2026-07-15"` is in the past relative to the run window; a real Duffel request would reject it.

### B-10 [Docs gap] `book-offer` placeholder prerequisites undocumented
`{{profile.*}}` resolution requires an OTP-verified email + Level-1 profile on the calling user
DID — undocumented; a docs-following user cannot reach the booking step.

---

## 3. Bonus: initial use case — TEE-backed itinerary vault (`z-trip-planner`)

Going beyond the first contract. The reference contract only **reads** a KV map (`secrets`);
`z-trip-planner` uses the stateful half of `host:interfaces/kv-store` (`put`/`get`/`scan`) for a
travel-concierge agent's persistent trip-plan memory:

| | |
|---|---|
| **Functions** | `save-itinerary` (put) · `get-itinerary` (get) · `list-itineraries` (scan) |
| **KV map** | `z:<tid>:itineraries` (private, ACL = contract id 705) |
| **Build** | `cargo build --target wasm32-wasip2 --release` → `z_trip_planner.wasm` (154,506 B) |
| **Tests** | 6 passed + 1 doc-test |

Live testnet run:

```
[2] Register the trip-planner contract
   OK   registered z:<tid>:trip-planner as contract id 705
[3] Provision the itineraries map
   OK   map-create z:<tid>:itineraries
[4] Invoke (self-call path)
   OK   save-itinerary
   OK   save-itinerary (second)
   OK   get-itinerary trip-001
   response: {"ref":"trip-001","plan":{"cabin_class":"economy","dates":"2026-11-15..2026-11-22","route":"LHR-JFK","travelers":1}}
   OK   list-itineraries
   response: {"refs":["trip-001","trip-002"]}
```

Why it matters: stateful agents (saved itineraries, watchlists, drafts) need exactly this —
persistent, enclave-sealed state — while passenger PII stays out of WASM (the booking leg would
use `http-with-placeholders` like the reference). Two independent contracts now coexist under one
tenant and one egress grant: the shape of a real multi-contract agent service.
`[SCREENSHOT: use-case output]`

---

## 4. How to reproduce

```bash
git clone https://github.com/Elydeboss/Travel-planning.git && cd t3n-quickstart
npm install
cp .env.example .env          # put T3N_API_KEY in it (gitignored)

git clone https://github.com/Terminal-3/z-tenant-flight.git   # sibling folder
cd z-tenant-flight && cargo build --target wasm32-wasip2 --release && cd ..

npm run quickstart            # B-01 fixed: authenticated connection
npm run walkthrough           # register → maps → seed → grant → invoke (shim)
npm run usecase               # bonus contract run
npm run repro                 # minimal reproductions of B-01…B-04
```

Set `DUFFEL_API_KEY` to a real Duffel test token for live flight offers instead of the
placeholder-token 401. Everything runs on **testnet** (`setEnvironment("testnet")`).

---

*Terminal 3 ADK community testing submission — all findings independently reproduced on
`@terminal3/t3n-sdk@4.39.1` against the testnet cluster, August 2026.*
