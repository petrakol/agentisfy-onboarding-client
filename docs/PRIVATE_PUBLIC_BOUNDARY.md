# Private / public split

## Private repo
Use the internal monorepo for:
- services
- dashboards
- ops workflows
- routing decisions
- finance closeout
- all sensitive policy and reconciliation logic

## Public repo
Use this repo for:
- onboarding engineers
- demonstrating end-user flows
- validating schemas
- exercising the public gateway surface

## Principle
Public repo = consequences
Private repo = decisions
