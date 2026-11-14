# Client benchmark

`pnpm bench` builds 5,000- and 50,000-entry logs with the memory driver, then times verified streaming with `entries()` and individual `proveInclusion()` calls. Each figure is a median of several runs. Ranges start at entry 1,234.

Recorded on 2026-11-14 with Node 24 on an 8-core Apple Silicon Mac, when `entries()` moved from one inclusion proof per entry to whole-bundle checks:

| Log | Read | Before | After | Speed-up |
|---|---|---:|---:|---:|
| 5,000 | 100 entries | 76.3 ms | 1.9 ms | 40× |
| 5,000 | 1,000 entries | 749.3 ms | 5.2 ms | 144× |
| 5,000 | every entry | 3,746.7 ms | 20.4 ms | 184× |
| 50,000 | 100 entries | 103.5 ms | 2.3 ms | 45× |
| 50,000 | 1,000 entries | 1,054.8 ms | 5.8 ms | 182× |
| 50,000 | every entry | 55,484.1 ms | 237.3 ms | 234× |
| 50,000 | 100 inclusion proofs | 112.3 ms | 85.9 ms | 1.3× |

A single inclusion proof still costs about 0.6–0.9 ms. Most of that is SHA-256: tiles store only every eighth level of the tree, so a proof rebuilds about 250 nodes inside its tiles.
