import { createMemoryDriver } from "@tessellog/appender";
import { describeLogDriver } from "../src/index.js";

describeLogDriver("the memory driver", async () => ({
  driver: createMemoryDriver(),
  cleanup: async () => undefined,
}));
