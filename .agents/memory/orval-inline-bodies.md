---
name: Orval inline request bodies
description: Why request bodies in openapi.yaml must be named component schemas, not inline
---

When adding an endpoint to `lib/api-spec/openapi.yaml`, define its request body as a
named schema under `components/schemas` and reference it with `$ref`, e.g.
`AdminUpdateMediaInput`. Do NOT write the body inline under `requestBody.content`.

**Why:** orval auto-derives an inline body name from the operationId (e.g.
`adminUpdateMedia` → `AdminUpdateMediaBody`) and emits it in BOTH the zod output
(`lib/api-zod/src/generated/api.ts` as a value) and the types output
(`generated/types/*`). The api-zod `index.ts` does `export * from` both, so the
duplicate name breaks the libs typecheck with TS2308 "already exported a member".
Named component schemas get the schema's own name for the type, avoiding the clash.

**How to apply:** any new POST/PATCH/PUT body → add a component schema + `$ref`, then
`pnpm --filter @workspace/api-spec run codegen` (which runs `typecheck:libs`).
