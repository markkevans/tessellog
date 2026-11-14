# @tessellog/http

## 0.2.0

### Patch Changes

- Updated dependencies [1e70018]
  - @tessellog/core@0.2.0
  - @tessellog/appender@0.2.0

## 0.1.2

### Patch Changes

- 891d113: Depend on zod 4.6.7, which fixes GHSA-mrhx-c7xc-m3w5 (high: memory exhaustion while validating oversized constrained collections). Zod 3 has no fixed release. Appender options and their defaults are unchanged.
- Updated dependencies [891d113]
  - @tessellog/appender@0.1.2
  - @tessellog/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [d664216]
  - @tessellog/appender@0.1.1
  - @tessellog/core@0.1.1

## 0.1.0

### Minor Changes

- 3d9ecf7: First release of tessellog, a TypeScript port of Tessera: tile-based transparency logs (C2SP tlog-tiles, tlog-checkpoint, signed-note), with witnessing, antispam, migration, static CT, and POSIX, AWS and Cloudflare drivers.

### Patch Changes

- Updated dependencies [3d9ecf7]
  - @tessellog/core@0.1.0
  - @tessellog/appender@0.1.0
