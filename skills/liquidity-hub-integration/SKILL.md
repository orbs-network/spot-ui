---
name: liquidity-hub-integration
description: Migrate the deprecated @orbs-network/liquidity-hub-sdk to @orbs-network/spot-ui. Use for Liquidity Hub migration or maintenance of an existing legacy integration; new swap integrations use Spot quotes and limit orders.
---

# Migrate Liquidity Hub to Spot

`@orbs-network/liquidity-hub-sdk` is deprecated. Use `@orbs-network/spot-ui` for new swap integrations and migrate existing Liquidity Hub integrations to Spot.

For a new Spot integration, use the [TypeScript swap workflow](https://github.com/orbs-network/spot-ui/blob/master/skills/spot-integration/references/07-swap-and-migration.md) or [React swap workflow](https://github.com/orbs-network/spot-ui/blob/master/skills/spot-react-integration/references/07-swap-and-migration.md).

Read the [Spot migration guide](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/README.md#migrating-from-liquidity-hub) and [typed swap example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts). Use the [framework-neutral integration guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-integration), or the [React integration guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-react-integration) for an existing React frontend.

Migration changes the execution flow, not just the import:

1. Fetch `getQuote` from Spot, mapping the chain, partner, tokens, raw amount, connected account, UI slippage percentage, DEX minimum, and abort signal.
2. Use Spot `quote.netAmountOut` and its authoritative `quote.minimumAmountOut` unchanged; do not apply slippage again. Existing DEX routers use `client.prepareSwap`; provider forms use `Module.SWAP` with `minimumOutputAmountRaw: quote.minimumAmountOut`.
3. Wrap native input when required and use the configured Spot client's approval spender. Do not reuse the Liquidity Hub Permit2 spender.
4. Prepare a fresh Spot order immediately before signing. Sign the prepared order, not the legacy quote payload, and submit with the wallet's unchanged signature.
5. Pass the submitted order to `waitForOrder({ order })` until it fills or reaches a terminal or uncertain outcome; it derives the ID, chain, and deadline from the order and supports optional cancellation. No client is needed for tracking. Submission acceptance does not mean execution completed. In React, `SpotProvider module={Module.SWAP}` handles this lifecycle and progress/cache updates; use `isExecuting` to pause quotes and keep the progress UI active.

## Archived Liquidity Hub maintenance references

Read these only when the user is maintaining an existing legacy integration during migration:

- [Quickstart](references/01-quickstart.md)
- [SDK API](references/02-sdk.md)
- [Swap flow](references/03-swap-flow.md)
- [Best practices](references/04-best-practices.md)
- [Legacy example](assets/liquidity-hub-example.ts)

Keep existing legacy execution behavior when making maintenance fixes. Do not mix a Liquidity Hub quote or signature with Spot order submission.
