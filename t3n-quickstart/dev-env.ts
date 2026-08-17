import { connect } from "./session.js";
import { TenantControl } from "./tenant-control.js";

const apiKey = process.env.T3N_API_KEY;
if (!apiKey) throw new Error("T3N_API_KEY is not set");

const session = await connect(apiKey);
const ctrl = await TenantControl.create(session);
const me = await ctrl.me();
console.log("tenant status =", me.status, "(label:", me.label + "), control contract v" + ctrl.ctrlVersion);