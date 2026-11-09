import { createMemoryDriver } from "@tessellog/appender";
import { describeLogDriver } from "@tessellog/driver-conformance";

describeLogDriver("my driver", async () => {
  const driver = createMemoryDriver();
  return { driver, cleanup: async () => undefined };
});
