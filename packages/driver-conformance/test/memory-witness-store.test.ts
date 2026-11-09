import { createMemoryWitnessStore } from "@tessellog/witness";
import { describeWitnessStore } from "../src/index.js";

describeWitnessStore("the memory witness store", async () => ({
  store: createMemoryWitnessStore(),
  cleanup: async () => undefined,
}));
