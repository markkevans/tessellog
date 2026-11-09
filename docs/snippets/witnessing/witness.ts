import { parseCosignerKey, parseVerifierKey } from "@tessellog/core";
import { openPosixWitnessStore } from "@tessellog/driver-posix";
import { serveNode } from "@tessellog/http/node";
import { createWitness } from "@tessellog/witness";

const cosigner = parseCosignerKey(process.env["WITNESS_PRIVATE_KEY"] ?? "");
const log = parseVerifierKey("example.com/my-log+afda4ace+AcOem5yfbPSq9fNpNGwfDJ+fU8XvGDaJweXRm65tp4RB");
if (!cosigner.ok || !log.ok) throw new Error("bad witness configuration");

const witness = createWitness({
  cosigners: [cosigner.value],
  logs: [{ origin: log.value.name, verifiers: [log.value] }],
  store: await openPosixWitnessStore({ root: "./witness-state" }),
});

await serveNode({ handler: witness.handle, port: 2025, host: "0.0.0.0", onError: console.error });
