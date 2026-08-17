# Bug Report — Terminal 3 ADK, testnet

All findings verified against **`@terminal3/t3n-sdk@4.39.1`** on the **testnet** cluster
(`setEnvironment("testnet")`, node contract `tee:tenant/contracts` v1.26.0) during a complete
run of the Quickstart + 5-part TEE-contract Walkthrough, August 2026.

Severity legend: **[Blocker]** — documented path dead-ends without a workaround ·
**[Critical]** — core feature unusable · **[Major]** — documented flow fails ·
**[Minor/Docs]** — wrong/stale information.

---

## B-01 — [Blocker] Quickstart code crashes: SDK v4.39.1 requires `trustAnchor` that the docs omit

- **Docs:** `/developers/adk/get-started/quickstart` (also the official skill file on
  `/developers/adk/support/ai-coding-assistants`, which ships the same sample).
- **Expected:** the verbatim Quickstart sample prints `Connected as: did:t3n:...`.
- **Actual:** with the SDK version installed by `npm install @terminal3/t3n-sdk` (4.39.1), the
  constructor throws:
  ```
  T3nConfigError: T3nClient: `trustAnchor` is required and must be either a TrustAnchor
  ({ expected_peer_ids, rtmr3_allowlist }) that pins the node's DKG attestation, or the
  explicit opt-out { unsafe_trust_server: true }.
  ```
- **Impact:** first-time users following the docs verbatim cannot authenticate at all.
- **Workaround:** fetch and verify the operator-signed trust manifest before building the client:
  ```ts
  const trustAnchor = await fetchTrustedManifest("testnet");
  const t3n = new T3nClient({ wasmComponent, trustAnchor, handlers: { ... } });
  ```
- **Repro:** `t3n-quickstart/quickstart.ts` in this repo reproduces both the failure and the fix.

## B-02 — [Critical] `TenantClient` control plane is broken on testnet — sends `contract_id`/`contract_version` where the node requires `script_name`/`script_version`

- **Docs:** `/developers/adk/get-started/prerequisites/set-up-dev-env`,
  `/developers/adk/get-started/walkthrough/register-contract`, `/developers/adk/tips/create-kv-maps`,
  `/developers/adk/tips/seed-api-key` — the entire walkthrough is built on `TenantClient`.
- **Expected:** `tenant.tenant.me()`, `tenant.maps.create(...)`, `tenant.contracts.register(...)`,
  `tenant.executeControl(...)` all succeed.
- **Actual:** every `TenantClient`-namespace call fails identically:
  ```
  RpcError: Invalid action request: missing field `script_name` at line 1 column …
  ```
  `getContractVersion()` works; only the helper payloads are malformed. The SDK builds control
  actions as `{ contract_id, contract_version, function_name, input }` but the testnet node's
  `action.execute` requires `{ script_name, script_version, function_name, input }`.
- **Impact:** registration, KV-map creation, secret seeding — i.e. walkthrough steps 3 and 4 —
  are impossible through the documented API.
- **Workaround:** dispatch the same control functions (`tenant-me`, `contract-register`,
  `map-create`, `map-update`, `map-entry-set`, `map-entry-get`, `contract-list`) against
  `tee:tenant/contracts` at its resolved version through the low-level `T3nClient.execute()` /
  `executeWithBlob()`. This repo ships that as `t3n-quickstart/tenant-control.ts`. With it the
  whole walkthrough runs: registration, maps, seed, self-grant, invocation.
- **Repro:** `t3n-quickstart/debug-control.ts`.

## B-03 — [Blocker] Docs call `tenant.me()`; SDK v4.39.1 has no such method

- **Docs:** `/developers/adk/get-started/prerequisites/set-up-dev-env` step 3
  (`await tenant.me(); // throws if something's wrong`).
- **Actual:** `TypeError: tenant.me is not a function`. In v4.39.1 the method lives on the nested
  `tenant.tenant` namespace (`TenantClient.tenant` is the `TenantNamespace`). And even
  `tenant.tenant.me()` fails per B-02.
- **Impact:** the documented "confirm the client works" step is a dead end.
- **Fix:** docs should call `tenant.tenant.me()` (and the whole control plane needs B-02 fixed).

## B-04 — [Blocker] Docs import `getScriptVersion` — no such export in the installed SDK

- **Docs:** `/developers/adk/get-started/walkthrough/invoke-contract` and the
  `/developers/adk/reference` table both show `getScriptVersion(nodeUrl, scriptName)`.
- **Actual:** `SyntaxError: The requested module '@terminal3/t3n-sdk' does not provide an export
  named 'getScriptVersion'`. The installed SDK exports `getContractVersion(rpcUrl, scriptName)`.
- **Impact:** the invoke step's code dead-ends on the import line.
- **Fix:** rename `getScriptVersion` → `getContractVersion` in docs and reference.

## B-05 — [Major] `z-tenant-flight/.cargo/config.toml` pins the wasm target, so `cargo test` fails

- **Docs:** `/developers/adk/get-started/walkthrough/test` says run `cargo test`.
- **Actual:** the reference repo ships `.cargo/config.toml` with `[build] target = "wasm32-wasip2"`.
  `cargo test` therefore compiles the test binary for wasm and cannot execute it on the host
  (`os error 193` on Windows, `Exec format error` on Linux). All tests actually pass when run on
  the native target: `cargo test --target x86_64-unknown-linux-gnu` → 7 passed + 1 doc-test.
- **Fix:** either drop the pinned target, or document `cargo test --target <native-triple>`.

## B-06 — [Major] `z-tenant-flight` README contradicts the shipped contract source

- **Repo:** https://github.com/Terminal-3/z-tenant-flight (README vs `src/` + `Cargo.toml`).
- README claims v0.3.0, describes `book-offer` taking full passenger **PII inline**
  (`passengers: [{ given_name, family_name, date_of_birth, passport_number, ... }]`), and a
  `host_capabilities` JSON manifest.
- The actual source is **v0.4.1** with `http-with-placeholders`: PII is resolved host-side from
  `{{profile.*}}` markers, never passed as an argument, and there is no manifest (capabilities
  come from `world.wit` imports).
- **Impact:** anyone who trusts the README builds the wrong mental model of the contract and of
  the privacy guarantee.

## B-07 — [Docs gap] Invoke step needs `AGENT_KEY` and `USER_KEY` but never says where they come from

- **Docs:** `/developers/adk/get-started/walkthrough/invoke-contract` (and the reference) assume
  `process.env.AGENT_KEY` / `process.env.USER_KEY`. The claim page issues exactly **one** key.
  `/developers/adk/tips/common-errors` states agent identities start at **0 credits** with
  token transfers being **admin-only** — i.e. there is no documented self-serve way to fund a
  second identity.
- **Impact:** the documented three-identity model (tenant / agent / user) cannot be assembled from
  the docs alone; teams fall back to the direct self-grant path (which this submission uses and
  documents in `USE-CASE.md`).
- **Fix:** document how to obtain/fund agent and user credentials, or mark the self-grant path as
  the supported route for the walkthrough.

## B-08 — [Minor/Docs] Claim-page URL in the bounty resolves to a marketing page

- Bounty resource link `https://go.terminal3.io/adk-community` returns `302 → terminal3.io/products/agent-developer-kit`
  for an HTTP client. The docs' `https://www.terminal3.io/claim-page` correctly lands on the claim
  flow. Also, the docs' claim page says "sign in with your **work email**" while the live page offers
  GitHub / Google / work-email sign-in — a smaller wording/behaviour mismatch.

## B-09 — [Minor/Docs] Invoke sample hardcodes a past `departure_date`

- `/developers/adk/get-started/walkthrough/invoke-contract` uses `"2026-07-15"` — already in the
  past relative to the intended run window. A past date is rejected by the upstream Duffel API in a
  fully working setup. Should be generated relative to `now`.

## B-10 — [Docs gap] `book-offer` placeholder prerequisites undocumented

- `/developers/adk/get-started/walkthrough/invoke-contract` shows `book-offer` with
  `{{profile.*}}` markers, but never states that resolution requires the **calling user DID** to
  have an OTP-verified email and a Level-1 profile (`no user context bound for placeholder
  resolution`). A docs-following user cannot reach the booking step without extra, undocumented
  profile setup.