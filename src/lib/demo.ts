export const demoGrant = {
  grantId: "grant_demo_public_1",
  grantVersion: "1.0",
  principalType: "merchant",
  principalId: "merchant_demo_public",
  delegateType: "agent",
  delegateId: "agent_demo_public",
  environment: "sandbox",
  merchantScope: ["merchant_demo_public"],
  payeeScope: ["*"],
  targetScope: ["0x000000000000000000000000000000000000f333"],
  selectorScope: ["0x095ea7b3", "0xa9059cbb"],
  asset: {
    symbol: "USDT0",
    tokenAddress: "0x0000000000000000000000000000000000000000",
    chainId: 988
  },
  maxAmount: { atomic: "100000000" },
  notBefore: "2026-01-01T00:00:00.000Z",
  notAfter: "2027-01-01T00:00:00.000Z",
  approvalState: "published",
  revocationState: "active",
  riskTier: "low"
} as const;
