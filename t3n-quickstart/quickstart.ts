import { connect } from "./session.js";

const apiKey = process.env.T3N_API_KEY;
if (!apiKey) throw new Error("T3N_API_KEY is not set");

const session = await connect(apiKey);
console.log("Connected as:", session.tenantDid);