# @tessellog/appender

## 0.2.0

### Patch Changes

- Updated dependencies [1e70018]
  - @tessellog/core@0.2.0
  - @tessellog/witness@0.2.0

## 0.1.2

### Patch Changes

- 891d113: Depend on zod 4.6.7, which fixes GHSA-mrhx-c7xc-m3w5 (high: memory exhaustion while validating oversized constrained collections). Zod 3 has no fixed release. Appender options and their defaults are unchanged.
- @tessellog/core@0.1.2
  - @tessellog/witness@0.1.2

## 0.1.1

### Patch Changes

- d664216: Export types that appear in public signatures, so they can be named: `BundleReader` from `@tessellog/appender`, `EntriesPath` from `@tessellog/driver-object-store` and `CtEntryCommon` from `@tessellog/static-ct`.
- @tessellog/core@0.1.1
  - @tessellog/witness@0.1.1

## 0.1.0

### Minor Changes

- 3d9ecf7: First release of tessellog, a TypeScript port of Tessera: tile-based transparency logs (C2SP tlog-tiles, tlog-checkpoint, signed-note), with witnessing, antispam, migration, static CT, and POSIX, AWS and Cloudflare drivers.

### Patch Changes

- Updated dependencies [3d9ecf7]
  - @tessellog/core@0.1.0
  - @tessellog/witness@0.1.0
