import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const VECTOR_ROOT = fileURLToPath(new URL("../vectors/merkle/", import.meta.url));

const hash = z
  .string()
  .transform((encoded) => Uint8Array.from(Buffer.from(encoded, "base64")));
const hashOrNull = z.union([hash, z.null()]).transform((h) => h ?? new Uint8Array());
const proof = z
  .union([z.array(hash), z.null()])
  .transform((hashes) => hashes ?? []);
const size = z.number().int().nonnegative().transform(BigInt);
const expectation = { desc: z.string(), wantErr: z.boolean() };

const InclusionProbe = z.object({
  leafIdx: size,
  treeSize: size,
  root: hashOrNull,
  leafHash: hashOrNull,
  proof,
  ...expectation,
});

const ConsistencyProbe = z.object({
  size1: size,
  size2: size,
  root1: hashOrNull,
  root2: hashOrNull,
  proof,
  ...expectation,
});

const loadProbes = <T>(directory: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>) =>
  readdirSync(`${VECTOR_ROOT}${directory}`, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({
      file,
      probe: schema.parse(
        JSON.parse(readFileSync(`${VECTOR_ROOT}${directory}/${file}`, "utf8")),
      ),
    }));

export const inclusionProbes = loadProbes("inclusion", InclusionProbe);
export const consistencyProbes = loadProbes("consistency", ConsistencyProbe);
