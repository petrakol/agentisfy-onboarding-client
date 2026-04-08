# Public Contract Change Protocol

Use this protocol whenever public schemas/OpenAPI/examples change.

1. Update the contract artifact (`schemas/*.json` and/or `docs/public-openapi.yaml`).
2. Update public examples in `docs/API_COOKBOOK.md` and `examples/contract-examples.json`.
3. Recompute and update `docs/public-release-artifacts.json` hashes.
4. Run `npm run check` and ensure all contract gates pass.
5. Add a release note using `docs/RELEASE_NOTE_TEMPLATE.md` with:
   - changed files,
   - hash deltas,
   - migration notes.
6. Confirm no private decision logic was introduced.
