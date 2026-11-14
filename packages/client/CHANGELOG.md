# @tessellog/client

## 0.2.0

### Minor Changes

- 1e70018: `entries()` verifies whole entry bundles at once instead of one proof per entry: about 100× faster on 1,000-entry ranges and 190× on a full 50,000-entry scan. It now also refuses a bundle with missing or extra entries (previously a bundle missing its last entries ended the stream early without an error), and tampering anywhere in a bundle the range touches, even outside the range. `core` adds `rootFromTilesAndLeaves`, and inclusion proofs from tiles copy less.

### Patch Changes

- Updated dependencies [1e70018]
  - @tessellog/core@0.2.0

## 0.1.2

### Patch Changes

- @tessellog/core@0.1.2

## 0.1.1

### Patch Changes

- @tessellog/core@0.1.1

## 0.1.0

### Minor Changes

- 3d9ecf7: First release of tessellog, a TypeScript port of Tessera: tile-based transparency logs (C2SP tlog-tiles, tlog-checkpoint, signed-note), with witnessing, antispam, migration, static CT, and POSIX, AWS and Cloudflare drivers.

### Patch Changes

- Updated dependencies [3d9ecf7]
  - @tessellog/core@0.1.0
