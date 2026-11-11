---
name: liquidity-hub-integration
description: Migrate the deprecated @orbs-network/liquidity-hub-sdk to @orbs-network/spot-ui. Use for Liquidity Hub migration or maintenance of an existing legacy integration; new swap integrations use Spot quotes and limit orders.
---

# Migrate Liquidity Hub to Spot

`@orbs-network/liquidity-hub-sdk` is deprecated. Use `@orbs-network/spot-ui` for new swap integrations and migrate existing Liquidity Hub integrations to Spot.

For a new Spot integration, use the [TypeScript swap workflow](https://github.com/orbs-network/spot-ui/blob/master/skills/spot-integration/references/07-swap-and-migration.md) or [React swap workflow](https://github.com/orbs-network/spot-ui/blob/master/skills/spot-react-integration/references/07-swap-and-migration.md).

Read the [Spot migration guide](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/README.md#migrating-from-liquidity-hub) and [typed swap example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts). Use the [framework-neutral integration guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-integration), or the [React integration guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-react-integration) for an existing React frontend.

Create one `client.createSwapExecution({ quote, account, walletInteractions,
signal })` and await `execution.run({ onProgress })` for the completed `Order`.
An existing DEX can control `wrap()`/`approve()`/`sign()`/`submit()`/
`waitForCompletion()` on the same session using its host wallet callbacks.

Migration changes the execution flow, not just the import:

1. Fetch a Spot quote with actual chain/partner, protocol ERC-20 tokens, raw input, preview account, slippage percentage, optional DEX minimum, and abort signal.
2. Preserve `quote.minimumAmountOut` unchanged and display quote/token data in the host UI. No calculated swap form or React provider is required.
3. Supply captured `shouldWrap`/`shouldApprove` decisions that return booleans or promises; the approval decision compares host allowance with exact required `ApprovalRequest.amount`. `approvalAmount` is a suggested write cap (maximum uint256 by default); the host may choose that cap, the exact amount, or its own policy without mutating the SDK request. False skips writes, while invoked wrap/approval callbacks return confirmed hashes and throw on failure. Preserve signing bytes. Use the configured client's spender, not Liquidity Hub's Permit2 spender.
4. Create a session without wallet work, then choose `run()` or individual steps. `sign()` checks prerequisites and stores freshly prepared data and its original signature; `submit()` sends that stored pair once and returns acceptance.
5. Await swap completion, retain accepted/latest `execution.order` or settlement error metadata when uncertain, and reconcile before replacing an intent. Check saved IDs with ordinary `client.getOrder` reads or reconcile exact original signed identity through configured history. The host owns any further polling; constructors accept only new reviewed input. Advanced sessions use `createOrderExecution` and their `run()` ends at acceptance.

## Archived Liquidity Hub maintenance references

Read these only when the user is maintaining an existing legacy integration during migration:

- [Quickstart](references/01-quickstart.md)
- [SDK API](references/02-sdk.md)
- [Swap flow](references/03-swap-flow.md)
- [Best practices](references/04-best-practices.md)
- [Legacy example](assets/liquidity-hub-example.ts)

Keep existing legacy execution behavior when making maintenance fixes. Do not mix a Liquidity Hub quote or signature with Spot order submission.
