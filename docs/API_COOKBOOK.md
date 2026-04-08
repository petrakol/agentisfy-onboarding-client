# Public API Cookbook

This cookbook provides canonical examples for the public gateway surface.

## GET /v1/agent/manifest/{invoiceId}
```bash
curl "$GATEWAY/v1/agent/manifest/inv_10231"
```

## POST /v1/agent/simulate
```bash
curl -X POST "$GATEWAY/v1/agent/simulate" \
  -H 'content-type: application/json' \
  -d '{"manifest":{"manifestId":"manifest_inv_10231","schemaVersion":"1.0","manifestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","origin":"api","invoiceRef":"inv_10231","merchantRef":"merchant_demo_public","payer":{"accountRef":"acct_payer_demo"},"payee":{"accountRef":"acct_payee_demo"},"asset":{"symbol":"USDT0","tokenAddress":"0x0000000000000000000000000000000000000000","chainId":988},"amount":{"atomic":"2500000","decimals":6},"target":"0x000000000000000000000000000000000000f333","selector":"0xa9059cbb","calldataHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","idempotencyKey":"public_client_execute_inv_10231_1700000000000","expiresAt":"2027-01-01T00:00:00.000Z","fallbackPolicy":{"mode":"fallback","maxAttempts":2},"proofRequirement":{"requireProof":true},"metadata":{}},"grant":{"grantId":"grant_demo_public_1","grantVersion":"1.0","principalType":"merchant","principalId":"merchant_demo_public","delegateType":"agent","delegateId":"agent_demo_public","environment":"sandbox","merchantScope":["merchant_demo_public"],"payeeScope":["payee_demo_public"],"targetScope":["0x000000000000000000000000000000000000f333"],"selectorScope":["0xa9059cbb"],"asset":{"symbol":"USDT0","tokenAddress":"0x0000000000000000000000000000000000000000","chainId":988},"maxAmount":{"atomic":"100000000"},"notBefore":"2026-01-01T00:00:00.000Z","notAfter":"2027-01-01T00:00:00.000Z","approvalState":"published","revocationState":"active","riskTier":"low"}}'
```

## POST /v1/agent/execute
```bash
curl -X POST "$GATEWAY/v1/agent/execute" \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: public_client_execute_inv_10231_1700000000000' \
  -d '{"manifest":{"manifestId":"manifest_inv_10231","schemaVersion":"1.0","manifestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","origin":"api","invoiceRef":"inv_10231","merchantRef":"merchant_demo_public","payer":{"accountRef":"acct_payer_demo"},"payee":{"accountRef":"acct_payee_demo"},"asset":{"symbol":"USDT0","tokenAddress":"0x0000000000000000000000000000000000000000","chainId":988},"amount":{"atomic":"2500000","decimals":6},"target":"0x000000000000000000000000000000000000f333","selector":"0xa9059cbb","calldataHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","idempotencyKey":"public_client_execute_inv_10231_1700000000000","expiresAt":"2027-01-01T00:00:00.000Z","fallbackPolicy":{"mode":"fallback","maxAttempts":2},"proofRequirement":{"requireProof":true},"metadata":{}},"grant":{"grantId":"grant_demo_public_1","grantVersion":"1.0","principalType":"merchant","principalId":"merchant_demo_public","delegateType":"agent","delegateId":"agent_demo_public","environment":"sandbox","merchantScope":["merchant_demo_public"],"payeeScope":["payee_demo_public"],"targetScope":["0x000000000000000000000000000000000000f333"],"selectorScope":["0xa9059cbb"],"asset":{"symbol":"USDT0","tokenAddress":"0x0000000000000000000000000000000000000000","chainId":988},"maxAmount":{"atomic":"100000000"},"notBefore":"2026-01-01T00:00:00.000Z","notAfter":"2027-01-01T00:00:00.000Z","approvalState":"published","revocationState":"active","riskTier":"low"},"idempotencyKey":"public_client_execute_inv_10231_1700000000000","preflightToken":"pf_private_gateway_issued_12345"}'
```

## GET /v1/agent/events
```bash
curl -N "$GATEWAY/v1/agent/events?attemptId=att_123&cursor=10"
```

## GET /v1/agent/proof/{invoiceId}
```bash
curl "$GATEWAY/v1/agent/proof/inv_10231"
```

## GET /v1/agent/discrepancies
```bash
curl "$GATEWAY/v1/agent/discrepancies"
```

## POST /v1/agent/attempts/{attemptId}/replay
```bash
curl -X POST "$GATEWAY/v1/agent/attempts/att_123/replay" \
  -H 'Idempotency-Key: public_client_replay_att_123_1700000000000'
```
