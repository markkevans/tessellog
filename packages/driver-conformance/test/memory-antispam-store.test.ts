import { createMemoryAntispamStore } from "@tessellog/appender";
import { describeAntispamStore } from "../src/index.js";

describeAntispamStore("the memory antispam store", async () => ({
  store: createMemoryAntispamStore(),
  cleanup: async () => undefined,
}));
