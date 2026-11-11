---
name: liquidity-hub-integration
description: Migrate the deprecated @orbs-network/liquidity-hub-sdk to @orbs-network/spot-ui. Use for Liquidity Hub migration or maintenance of an existing legacy integration; new swap integrations use Spot quotes and limit orders.
---

# Migrate Liquidity Hub to Spot

`@orbs-network/liquidity-hub-sdk` is deprecated. Use `@orbs-network/spot-ui` for new swap integrations and migrate existing Liquidity Hub integrations to Spot.

For a new Spot integration, use the [TypeScript swap workflow](https://github.com/orbs-network/spot-ui/blob/master/skills/spot-integration/references/07-swap-and-migration.md) or [React swap workflow](https://github.com/orbs-network/spot-ui/blob/master/skills/spot-react-integration/references/07-swap-and-migration.md).

Read the [Spot migration guide](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/README.md#migrating-from-liquidity-hub) and [typed swap example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts). Use the [framework-neutral integration guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-integration), or the [React integration guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-react-integration) for an existing React frontend.

Use the public client preparation/signing/submission path. The DEX owns
wrapping, approval, confirmed receipts, progress, retries, and status polling.

Migration changes the execution flow, not just the import:

1. Fetch a Spot quote with actual chain/partner, protocol ERC-20 tokens, raw input, preview account, slippage percentage, optional DEX minimum, and abort signal.
2. Preserve `quote.minimumAmountOut` unchanged and display quote/token data in host UI. No calculated swap form or React provider is required.
3. Read allowance for `client.spenderAddress` before wrapping. Confirm required native wrapping and approval, then verify allowance covers the exact input after the approval receipt. A suggested approval cap is optional host policy; sufficient exact approval is valid. Do not reuse Liquidity Hub's Permit2 spender.
4. Call `client.prepareSwap({ quote, account, signal })` after confirmations. Sign its EIP-712 typed data inline and pass the unchanged prepared order/original signature to `client.submitSwap()`.
5. Submission returns acceptance. Retain the accepted/latest order and use one host-owned `client.getOrder` polling lifecycle until a fill. Preserve exact prepared data/signature when acceptance is uncertain and reconcile configured account history before a replacement or fallback. Advanced orders use `client.prepareOrder()` and the same signing/submission calls.

## Archived Liquidity Hub maintenance references

Read these only when the user is maintaining an existing legacy integration during migration:

- [Quickstart](references/01-quickstart.md)
- [SDK API](references/02-sdk.md)
- [Swap flow](references/03-swap-flow.md)
- [Best practices](references/04-best-practices.md)
- [Legacy example](assets/liquidity-hub-example.ts)

Keep existing legacy execution behavior when making maintenance fixes. Do not mix a Liquidity Hub quote or signature with Spot order submission.
