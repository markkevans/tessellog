---
"@tessellog/appender": patch
"@tessellog/http": patch
"@tessellog/driver-aws": patch
"@tessellog/driver-cloudflare": patch
---

Depend on zod 4.6.7, which fixes GHSA-mrhx-c7xc-m3w5 (high: memory exhaustion while validating oversized constrained collections). Zod 3 has no fixed release. Appender options and their defaults are unchanged.
