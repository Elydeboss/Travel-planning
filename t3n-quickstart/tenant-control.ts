import { getContractVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import type { Session } from "./session.js";

export const TENANT_CTRL = "tee:tenant/contracts";

export type ActorSet = "all" | { only: number[] };

export interface RegisterResult {
  name: string;
  contract_id: number;
}

export class TenantControl {
  private constructor(
    private readonly session: Session,
    public readonly ctrlVersion: string,
  ) {}

  static async create(session: Session): Promise<TenantControl> {
    const version = await getContractVersion(getNodeUrl(), TENANT_CTRL);
    return new TenantControl(session, version);
  }

  name(tail: string): string {
    return `z:${this.session.tid}:${tail}`;
  }

  private async call<T = unknown>(functionName: string, input: unknown): Promise<T> {
    const raw = await this.session.t3n.execute({
      script_name: TENANT_CTRL,
      script_version: this.ctrlVersion,
      function_name: functionName,
      input,
    } as never);
    return parse<T>(raw);
  }

  me() {
    return this.call<{ tenant: string; label: string; status: string }>("tenant-me", {});
  }

  listContracts() {
    return this.call<{ contracts: string[] }>("contract-list", {});
  }

  async registerContract(opts: {
    tail: string;
    version: string;
    wasm: Uint8Array;
  }): Promise<RegisterResult> {
    const raw = await this.session.t3n.executeWithBlob(
      {
        script_name: TENANT_CTRL,
        script_version: this.ctrlVersion,
        function_name: "contract-register",
        input: { name: this.name(opts.tail), version: opts.version },
      },
      new Blob([opts.wasm as unknown as BlobPart]),
    );
    return parse<RegisterResult>(raw);
  }

  createMap(opts: {
    tail: string;
    visibility?: string;
    writers: ActorSet;
    readers: ActorSet;
  }) {
    return this.call("map-create", {
      map_name: this.name(opts.tail),
      visibility: opts.visibility ?? "private",
      writers: opts.writers,
      readers: opts.readers,
      key_validator: null,
    });
  }

  updateMap(tail: string, patch: { writers?: ActorSet; readers?: ActorSet }) {
    return this.call("map-update", { map_name: this.name(tail), ...patch });
  }

  setMapEntry(tail: string, key: string, value: string) {
    return this.call("map-entry-set", { map_name: this.name(tail), key, value });
  }

  getMapEntry(tail: string, key: string) {
    return this.call<{ value: string | null }>("map-entry-get", { map_name: this.name(tail), key });
  }
}

function parse<T>(raw: unknown): T {
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}