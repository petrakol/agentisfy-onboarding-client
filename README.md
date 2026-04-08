# Agentisfy — Public Client
www.agentisfy.com

> Governed money execution for agents on Stable  
> **Manifest → Simulate → Execute → Verify**

---

## Why this exists

As agents begin to handle real spend (invoices, renewals, ops), the problem shifts from *sending a payment* to **executing it safely**.

Stable provides the right rail:
- **USDT0 as both gas and value**
- **Gas Waiver** for approved flows (gasless UX)
- **Deterministic fees** (no priority-tip noise)

Agentisfy turns that rail into an operating system for money:
- policy-bound authority
- deterministic execution paths
- proof-backed outcomes
- finance-ready closeout

This repo is the **public, minimal client** that shows how to use it.

---

## What you can do (in 5 minutes)

1. **Load a Manifest**  
   Fetch a canonical `AgentPaymentManifest` from an invoice

2. **Simulate**  
   See the execution path and budget before anything moves

3. **Execute**  
   Submit a governed run using a preflight token

4. **Watch Events**  
   Stream execution in real time

5. **Verify**  
   Load `SettlementProof` for the final outcome

6. **Handle Exceptions**  
   Inspect `DiscrepancyRecord` when a run can’t close cleanly

---

## Quickstart

```bash
npm install
cp .env.example .env
npm run dev
```

Open: http://localhost:5173

### .env
```env
VITE_AGENTISFY_GATEWAY_BASE_URL=http://localhost:4010
VITE_AGENTISFY_DEMO_INVOICE_ID=inv_10231
```

---

## The model

Everything you see maps to a small set of public artifacts:

- **AgentPaymentManifest**  
  What should be paid

- **PolicyGrant**  
  What is allowed

- **ExecutionRun**  
  What happens during execution

- **ExecutionEventEnvelope**  
  What is observable

- **SettlementProof**  
  What is verifiable

- **DiscrepancyRecord**  
  What happens when it doesn’t close

> If you understand these, you understand Agentisfy.

---

## API (public gateway)

```
GET  /v1/agent/manifest/:invoiceId
POST /v1/agent/simulate
POST /v1/agent/execute
GET  /v1/agent/events
GET  /v1/agent/proof/:invoiceId
GET  /v1/agent/discrepancies
POST /v1/agent/attempts/:attemptId/replay
```

OpenAPI: `docs/public-openapi.yaml`

---

## Schemas

```
schemas/
  agent-payment-manifest
  policy-grant
  execution-run
  execution-event-envelope
  payment-event-envelope
  settlement-proof
  discrepancy-record
  decision-trace
```

---

## Architecture boundary

This repo shows **public consequences** only.

**Private (not here):**
- policy authoring & evaluation
- routing & waiver/fallback decisions
- risk scoring & approvals
- reconciliation & accounting truth
- merchant/operator systems

**Rule:**
- Public = outcomes you can observe and verify  
- Private = decisions that produce those outcomes

---

## Repo structure

```
src/
  App.tsx        # end-to-end demo flow
  lib/api.ts     # gateway client
  lib/demo.ts    # demo data & helpers
schemas/         # public contracts
docs/            # OpenAPI + boundary docs
```

---

## When things go wrong

- **Execution fails** → invalid/expired preflight token  
- **No events** → check gateway URL / stream endpoint  
- **No proof** → outcome not finalized yet  
- **Need to change policy** → belongs in private repo

---

## Design goals

- Minimal surface area
- Zero hidden behavior
- Deterministic outcomes
- Verifiable state
- No drift from private source of truth

---

## What “good” looks like

After one session, you should be able to answer:

- How do I represent a payment?  
- What constrains agent authority?  
- What path will execution take?  
- How do I verify the outcome?  
- What happens on failure?

If yes → this repo did its job.

---

## Summary

Stable is the rail.  
Agentisfy is the execution layer.

This repo shows how to use it:

**Manifest → Simulate → Execute → Verify**
