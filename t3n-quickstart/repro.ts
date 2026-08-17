import { connect } from "./session.js";
import { TenantControl } from "./tenant-control.js";

const apiKey = process.env.T3N_API_KEY;
if (!apiKey) throw new Error("T3N_API_KEY is not set");

const t = (label: string, fn: () => Promise<unknown> | unknown) =>
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${label}`))
    .catch((e: any) => console.log(`FAIL  ${label} -> ${e?.detail ?? e?.message ?? e}`));

console.log("BUG reproductions against @terminal3/t3n-sdk (testnet)\n");

await t("B-01 quickstart WITHOUT trustAnchor throws T3nConfigError", async () => {
  const { loadWasmComponent, T3nClient, setEnvironment, eth_get_address, metamask_sign, createEthAuthInput } = await import("@terminal3/t3n-sdk");
  setEnvironment("testnet");
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(apiKey);
  new T3nClient({
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, apiKey) },
  } as never);
});

const session = await connect(apiKey);
console.log(`\nconnected: ${session.tenantDid}\n`);

await t("B-03 tenant.me() does not exist", async () => {
  const { TenantClient, getNodeUrl } = await import("@terminal3/t3n-sdk");
  const tenant = new TenantClient({ t3n: session.t3n, baseUrl: getNodeUrl(), tenantDid: session.tenantDid });
  await (tenant as unknown as { me(): Promise<unknown> }).me();
});

await t("B-02 TenantClient.maps.create fails (missing script_name)", async () => {
  const { TenantClient, getNodeUrl } = await import("@terminal3/t3n-sdk");
  const tenant = new TenantClient({ t3n: session.t3n, baseUrl: getNodeUrl(), tenantDid: session.tenantDid });
  await tenant.maps.create({ tail: "repro", visibility: "private", writers: { only: [1] }, readers: { only: [1] } });
});

await t("B-02 workaround: TenantControl.createMap succeeds", async () => {
  const ctrl = await TenantControl.create(session);
  await ctrl.createMap({ tail: "repro", writers: { only: [1] }, readers: { only: [1] } });
});

await t("B-04 getScriptVersion export missing", async () => {
  const mod = await import("@terminal3/t3n-sdk");
  if (!("getScriptVersion" in mod)) throw new Error("getScriptVersion is not exported (only getContractVersion)");
});

await t("B-04 fix: getContractVersion resolves", async () => {
  const { getContractVersion, getNodeUrl } = await import("@terminal3/t3n-sdk");
  const v = await getContractVersion(getNodeUrl(), "tee:tenant/contracts");
  if (!v) throw new Error("no version");
});

console.log("\nDone.");