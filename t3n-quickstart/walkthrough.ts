import { readFile } from "node:fs/promises";
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { connect } from "./session.js";
import { TenantControl } from "./tenant-control.js";

const WASM_PATH = "../z-tenant-flight/target/wasm32-wasip2/release/z_tenant_flight.wasm";
const CONTRACT_TAIL = "travel-contracts";
const CONTRACT_VERSION = process.env.CONTRACT_VERSION ?? "0.1.0";
const SECRETS_MAP = "secrets";
const DUFFEL_HOST = "api.duffel.com";

const apiKey = process.env.T3N_API_KEY;
if (!apiKey) throw new Error("T3N_API_KEY is not set");

const step = (n: string, msg: string) => console.log(`\n[${n}] ${msg}`);
const ok = (msg: string) => console.log(`   OK   ${msg}`);
const warn = (msg: string) => console.log(`   WARN ${msg}`);

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const r = await fn();
    ok(label);
    return r;
  } catch (e: any) {
    warn(`${label} -> ${e?.detail ?? e?.message}`);
    return undefined;
  }
}

step("1", "Connect and authenticate");
const session = await connect(apiKey);
ok(`tenantDid = ${session.tenantDid}`);

const ctrl = await TenantControl.create(session);
const me = await ctrl.me();
ok(`tenant status = ${me.status} (label: ${me.label}), control contract v${ctrl.ctrlVersion}`);

step("2", "Register the WASM component");
const wasm = await readFile(WASM_PATH);
ok(`read ${wasm.length} bytes from ${WASM_PATH}`);

const registered = await attempt("contract-register", () =>
  ctrl.registerContract({ tail: CONTRACT_TAIL, version: CONTRACT_VERSION, wasm }),
);

const scriptName = ctrl.name(CONTRACT_TAIL);
const contractId = registered?.contract_id;
if (contractId !== undefined) ok(`registered ${scriptName} as contract id ${contractId}`);

console.log("   contracts now visible:", JSON.stringify(await ctrl.listContracts()));

step("3", "Create the secrets KV map and seed the Duffel key");
if (contractId === undefined) {
  warn("skipping map ACLs — no contract id from registration");
} else {
  await attempt(`map-create ${ctrl.name(SECRETS_MAP)}`, () =>
    ctrl.createMap({
      tail: SECRETS_MAP,
      visibility: "private",
      writers: { only: [contractId] },
      readers: { only: [contractId] },
    }),
  );
  await attempt("map-update (ensure ACL includes this contract)", () =>
    ctrl.updateMap(SECRETS_MAP, {
      writers: { only: [contractId] },
      readers: { only: [contractId] },
    }),
  );
}

const duffelKey = process.env.DUFFEL_API_KEY;
if (duffelKey) {
  await attempt("map-entry-set duffel_api_key", () =>
    ctrl.setMapEntry(SECRETS_MAP, "duffel_api_key", duffelKey),
  );
} else {
  warn("DUFFEL_API_KEY not set — seeding a placeholder so the read path is exercised");
  await attempt("map-entry-set duffel_api_key (placeholder)", () =>
    ctrl.setMapEntry(SECRETS_MAP, "duffel_api_key", "duffel_test_placeholder"),
  );
}

step("4", "Authorize the contract's egress");
const scriptVersion = await attempt("resolve contract version", () =>
  getContractVersion(getNodeUrl(), scriptName),
);

if (scriptVersion) {
  ok(`${scriptName} @ ${scriptVersion}`);
  const userCtrlVersion = await getContractVersion(getNodeUrl(), "tee:user/contracts");
  await attempt("agent-auth-update (self-grant)", () =>
    session.t3n.execute({
      script_name: "tee:user/contracts",
      script_version: userCtrlVersion,
      function_name: "agent-auth-update",
      input: {
        agents: [
          {
            agentDid: session.tenantDid,
            scripts: [
              {
                scriptName,
                versionReq: scriptVersion,
                functions: ["search-offers", "book-offer"],
                allowedHosts: [DUFFEL_HOST],
              },
            ],
          },
        ],
      },
    } as never),
  );

  step("5", "Invoke search-offers");
  const search = await attempt("search-offers", () =>
    session.t3n.executeAndDecode({
      script_name: scriptName,
      script_version: scriptVersion,
      function_name: "search-offers",
      input: {
        origin: "LHR",
        destination: "JFK",
        departure_date: "2026-11-15",
        cabin_class: "economy",
        adult_count: 1,
      },
    } as never),
  );
  if (search) console.log("   response:", JSON.stringify(search).slice(0, 400));
}

console.log("\nDone.");