# Bonus use case — TEE-backed itinerary vault (`z-trip-planner`)

> Going beyond the first contract: a second, original T3N contract plus a working demo.

## The idea

The reference `z-tenant-flight` contract only ever **reads** a tenant KV map (`secrets`). The
full `kv-store` host interface also supports `put`, `delete`, and `scan` — the stateful half
that any real agent needs. `z-trip-planner` is a travel-concierge use case that leans on it:

A concierge agent keeps a traveler's trip plans inside the TEE — saved, read back, and listed —
without the passenger PII ever entering WASM. Itinerary records hold only opaque trip metadata
(route, dates, cabin, traveler count); a real booking step would resolve `{{profile.*}}` markers
host-side exactly like `book-offer` in the reference contract.

This is the kind of persistent agent memory (trip drafts, watchlists, saved searches) a booking
agent has to maintain across sessions — and it demonstrates the stateful `kv-store` surface the
walkthrough contract never touches.

## The contract

| | |
|---|---|
| **Repo location** | `z-trip-planner/` (this repo, original code) |
| **Functions** | `save-itinerary` (put) · `get-itinerary` (get) · `list-itineraries` (scan) |
| **KV map** | `z:<tid>:itineraries`, private, ACL scoped to the contract id |
| **WIT imports** | `host:tenant/tenant-context`, `host:interfaces/logging`, `host:interfaces/kv-store` |
| **Build** | `cargo build --target wasm32-wasip2 --release` → `z_trip_planner.wasm` (151 KB) |

Unit tests cover input validation on the native target; `cargo test` passes.

## Live run (testnet)

Registered as contract id **705**, invoked via the documented direct self-call path:

```
[2] Register the trip-planner contract
   OK   registered z:<tid>:trip-planner as contract id 705
   OK   contracts now visible: ["z:<tid>:travel-contracts", "z:<tid>:trip-planner"]

[3] Provision the itineraries map for the contract
   OK   map-create z:<tid>:itineraries

[4] Invoke the contract (self-call path)
   OK   save-itinerary
   OK   save-itinerary (second)
   OK   get-itinerary trip-001
   response: {"ref":"trip-001","plan":{"cabin_class":"economy","dates":"2026-11-15..2026-11-22","route":"LHR-JFK","travelers":1}}
   OK   list-itineraries
   response: {"refs":["trip-001","trip-002"]}
```

Full transcript: `t3n-quickstart/docs/captures/04-use-case.txt` (reproduce with
`npm run usecase`).

## Why it matters

1. **Stateful agents**: proves contracts can persist and re-read state inside the enclave — a
   building block for saved-itinerary watchlists, draft trip plans, and cross-session memory.
2. **Privacy stays intact**: no PII crosses the WIT boundary; the sensitive booking leg would use
   `http-with-placeholders` exactly like the reference contract.
3. **Composition**: two independent contracts (flight + itinerary) live side by side under one
   tenant and one egress grant — the shape of a real multi-contract agent service.