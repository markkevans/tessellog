# @tessellog/driver-conformance

The Vitest suites that every tessellog driver and store passes. Run them against your own.

```sh
npm install --save-dev @tessellog/driver-conformance vitest
```

<!-- snippet: drivers/conformance.ts -->
```ts
import { createMemoryDriver } from "@tessellog/appender";
import { describeLogDriver } from "@tessellog/driver-conformance";

describeLogDriver("my driver", async () => {
  const driver = createMemoryDriver();
  return { driver, cleanup: async () => undefined };
});
```

## Suites

| Suite | For |
|---|---|
| `describeLogDriver(name, setup)` | a whole `LogDriver` |
| `describeObjectStore(name, setup)` | an `ObjectStore` for `@tessellog/driver-object-store` |
| `describeCoordinator(name, setup)` | a `Coordinator` |
| `describeAntispamStore(name, setup)` | an `AntispamStore` |
| `describeWitnessStore(name, setup)` | a `WitnessStore` |

Each `setup` returns a fresh, empty subject and a `cleanup` function. `vitest` is a peer dependency.

Guide: [choosing a storage driver](https://github.com/markkevans/tessellog/blob/main/docs/guides/drivers.md#testing-a-driver).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
