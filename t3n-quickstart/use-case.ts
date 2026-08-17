import { readFile } from "node:fs/promises";
import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { connect } from "./session.js";
import { TenantControl } from "./tenant-control.js";

const WASM_PATH = "../z-trip-planner/target/wasm32-wasip2/release/z_trip_planner.wasm";
const CONTRACT_TAIL = "trip-planner";
const CONTRACT_VERSION = process.env.CONTRACT_VERSION ?? "0.1.0";
const ITINERARIES_MAP = "itineraries";

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

step("2", "Register the trip-planner contract");
const wasm = await readFile(WASM_PATH);
ok(`read ${wasm.length} bytes from ${WASM_PATH}`);

const registered = await attempt("contract-register", () =>
  ctrl.registerContract({ tail: CONTRACT_TAIL, version: CONTRACT_VERSION, wasm }),
);

const scriptName = ctrl.name(CONTRACT_TAIL);
const contractId = registered?.contract_id;
if (contractId !== undefined) ok(`registered ${scriptName} as contract id ${contractId}`);
console.log("   contracts now visible:", JSON.stringify(await ctrl.listContracts()));

step("3", "Provision the itineraries map for the contract");
if (contractId === undefined) {
  warn("skipping map ACLs — no contract id from registration");
} else {
  await attempt(`map-create ${ctrl.name(ITINERARIES_MAP)}`, () =>
    ctrl.createMap({
      tail: ITINERARIES_MAP,
      visibility: "private",
      writers: { only: [contractId] },
      readers: { only: [contractId] },
    }),
  );
}

step("4", "Invoke the contract (self-call path)");
const scriptVersion = await attempt("resolve contract version", () =>
  getContractVersion(getNodeUrl(), scriptName),
);

if (!scriptVersion) {
  warn("cannot invoke — no contract version");
} else {
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
                functions: ["save-itinerary", "get-itinerary", "list-itineraries"],
                allowedHosts: [],
              },
            ],
          },
        ],
      },
    } as never),
  );

  const exec = (functionName: string, input: unknown) =>
    session.t3n.executeAndDecode({
      script_name: scriptName,
      script_version: scriptVersion,
      function_name: functionName,
      input,
    } as never);

  await attempt("save-itinerary", () =>
    exec("save-itinerary", {
      ref: "trip-001",
      plan: {
        route: "LHR-JFK",
        dates: "2026-11-15..2026-11-22",
        cabin_class: "economy",
        travelers: 1,
      },
    }),
  );
  await attempt("save-itinerary (second)", () =>
    exec("save-itinerary", {
      ref: "trip-002",
      plan: {
        route: "JFK-SFO",
        dates: "2027-02-01..2027-02-07",
        cabin_class: "business",
        travelers: 2,
      },
    }),
  );

  const saved = await attempt("get-itinerary trip-001", () => exec("get-itinerary", { ref: "trip-001" }));
  if (saved) console.log("   response:", JSON.stringify(saved).slice(0, 300));

  const listed = await attempt("list-itineraries", () => exec("list-itineraries", {}));
  if (listed) console.log("   response:", JSON.stringify(listed).slice(0, 300));
}

console.log("\nDone.");