import { z } from "zod";

export const Blob = z.array(z.number().int().min(0).max(255)).transform((bytes) => Uint8Array.from(bytes));

export const Count = z.string().regex(/^\d+$/).transform(BigInt);
