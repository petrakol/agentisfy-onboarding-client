# Public Boundary Guardrails

## Public repo must include
- Onboarding UX for public consequence flow.
- Public API client behavior and validation.
- Public schema and OpenAPI conformance checks.

## Public repo must not include
- Policy authoring or evaluation engines.
- Routing heuristics or waiver/fallback decision logic.
- Risk scoring internals.
- Reconciliation/accounting source-of-truth logic.
- Merchant/operator private system adapters.

## Contributor checklist
- [ ] Did I change only observable/verifyable consequences?
- [ ] Did I avoid private decision logic?
- [ ] Did I run `npm run check`?
- [ ] If schema/OpenAPI changed, did I update `docs/public-release-artifacts.json`?
