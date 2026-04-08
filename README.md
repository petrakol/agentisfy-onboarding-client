# Agentisfy Public Onboarding Client

**The fastest way to understand and integrate Agentisfy.**

This repository is the public onboarding surface for Agentisfy. It is built for engineers, product teams, solution architects, and technical evaluators who want to understand how Agentisfy is consumed from the outside.

If you want to see the Agentisfy flow end to end, start here:

**Manifest → Simulate → Execute → Verify**

---

## What this repo is

This repo is a minimal public client that demonstrates how an integrator or end user interacts with Agentisfy through the public gateway.

It is intentionally small.

It shows:
- how to fetch a canonical payment manifest
- how to simulate a governed payment
- how to execute with a published grant and a preflight token
- how to stream execution events
- how to load a settlement proof
- how to inspect discrepancies when a run does not close cleanly

It does **not** expose internal control-plane logic.

---

## Who this repo is for

Use this repo if you are:

- evaluating Agentisfy for your product or platform
- integrating Agentisfy into an app, workflow, or agent stack
- onboarding an engineer to the Agentisfy model
- validating schemas and public gateway behavior
- learning how public consequences map to the Agentisfy operating model

---

## What you can do in this repo

With this client, you can:

1. enter an invoice ID
2. fetch the canonical `AgentPaymentManifest`
3. review or paste a published `PolicyGrant`
4. simulate the execution path and expected budget shape
5. execute using a preflight token from the private gateway
6. watch execution events stream in real time
7. load the resulting `SettlementProof`
8. inspect `DiscrepancyRecord` output when applicable
9. replay a prior attempt safely

This is the public learning loop for Agentisfy.

---

## What you will learn

This repo teaches the core Agentisfy lifecycle:

- **Intent** is expressed as an `AgentPaymentManifest`
- **Authority** is expressed as a `PolicyGrant`
- **Execution** is tracked as an `ExecutionRun`
- **Events** are exposed through public envelopes and event streams
- **Verification** is expressed as `SettlementProof`
- **Exceptions** are surfaced as `DiscrepancyRecord`

If you understand this repo, you understand how Agentisfy is consumed publicly.

---

## What stays private

This repository is **not** the private control plane.

The following remain private by design:

- grant issuance, approval, and revocation workflows
- policy authoring and policy evaluation logic
- risk scoring and decision heuristics
- routing logic and waiver/fallback arbitration
- reservation, capture, and release logic
- discrepancy closure workflows
- reconciliation truth and finance closeout logic
- internal merchant, operator, and ops dashboards

### Principle

**Public repo = consequences**  
**Private repo = decisions**

That boundary is intentional.

---

## Quick start

### 1. Copy environment variables

```bash
cp .env.example .env
