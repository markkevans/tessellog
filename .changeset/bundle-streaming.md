---
"@tessellog/client": minor
"@tessellog/core": minor
---

`entries()` verifies whole entry bundles at once instead of one proof per entry: about 100× faster on 1,000-entry ranges and 190× on a full 50,000-entry scan. It now also refuses a bundle with missing or extra entries (previously a bundle missing its last entries ended the stream early without an error), and tampering anywhere in a bundle the range touches, even outside the range. `core` adds `rootFromTilesAndLeaves`, and inclusion proofs from tiles copy less.
