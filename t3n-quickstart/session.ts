import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  fetchTrustedManifest,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
} from "@terminal3/t3n-sdk";

export interface Session {
  t3n: T3nClient;
  tenantDid: string;
  tid: string;
}

export async function connect(apiKey: string): Promise<Session> {
  setEnvironment("testnet");
  const wasmComponent = await loadWasmComponent();
  const trustAnchor = await fetchTrustedManifest("testnet");
  const address = eth_get_address(apiKey);

  const t3n = new T3nClient({
    wasmComponent,
    trustAnchor,
    handlers: { EthSign: metamask_sign(address, undefined, apiKey) },
  });

  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  const tid = tenantDid.slice("did:t3n:".length);

  return { t3n, tenantDid, tid };
}