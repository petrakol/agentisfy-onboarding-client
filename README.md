# Agentisfy public onboarding client

This is the **public repo** that should be exposed.

It is intentionally minimal. It teaches engineers how Agentisfy is consumed **as an end user / integrator** while keeping the private decision engine out of the open.

## What this repo includes
- a small React/Vite onboarding client
- the public schema bundle copied from the internal monorepo
- a tiny API wrapper for public gateway endpoints
- boundary docs that explain what stays private

## What this repo does
1. Fetch a canonical `AgentPaymentManifest`
2. Run `simulate`
3. Execute with a published grant + preflight token from the private gateway
4. Stream execution events
5. Fetch `SettlementProof`
6. Read `DiscrepancyRecord` consequences

## What must stay private
- grant issuance / approval / revocation workflows
- policy evaluation rules and risk scoring
- route heuristics and waiver/fallback arbitration
- reservation / capture / release logic
- discrepancy closure and reconciliation truth
- merchant and ops internal consoles

## Why this is the right public repo
The engineer only needs the public consequences:
- schemas
- public gateway calls
- sample app
- event / proof / discrepancy inspection

The engineer does **not** need the private control plane internals.

## Local run
```bash
cp .env.example .env
npm install
npm run dev
```


## Automatic fallback behavior
- If the configured gateway is unreachable, the client automatically switches to demo fallback mode by default.
- This keeps onboarding unblocked while still showing the full manifest → simulate → execute → proof loop.
- To disable fallback and fail fast, set `VITE_AGENTISFY_AUTO_DEMO_FALLBACK=false` in `.env`.

## Expected gateway endpoints
- `GET /v1/agent/manifest/:invoiceId`
- `POST /v1/agent/simulate`
- `POST /v1/agent/execute`
- `POST /v1/agent/attempts/:attemptId/replay`
- `GET /v1/agent/proof/:invoiceId`
- `GET /v1/agent/events`
- `GET /v1/agent/discrepancies`

## Catch-up strategy
This public repo should never become the source of truth.
The private repo should publish release artifacts for:
- JSON schemas
- public OpenAPI subset
- SDK types / fixtures

Then CI in this public repo should fail if those artifacts drift.
