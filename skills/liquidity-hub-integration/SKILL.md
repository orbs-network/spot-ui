---
name: liquidity-hub-integration
description: Migrate the deprecated @orbs-network/liquidity-hub-sdk to @orbs-network/spot-ui. Use for Liquidity Hub migration or maintenance of an existing legacy integration; new swap integrations use Spot quotes and limit orders.
---

# Migrate Liquidity Hub to Spot

`@orbs-network/liquidity-hub-sdk` is deprecated. Use `@orbs-network/spot-ui` for new swap integrations and migrate existing Liquidity Hub integrations to Spot.

For a new Spot integration, use the [TypeScript swap workflow](https://github.com/orbs-network/spot-ui/blob/master/skills/spot-integration/references/07-swap-and-migration.md) or [React swap workflow](https://github.com/orbs-network/spot-ui/blob/master/skills/spot-react-integration/references/07-swap-and-migration.md).

Read the [Spot migration guide](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/README.md#migrating-from-liquidity-hub) and [typed swap example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts). Use the [framework-neutral integration guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-integration), or the [React integration guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-react-integration) for an existing React frontend.

Use `client.executeSwap({ quote, account, walletInteractions, signal })` for the
default SDK-coordinated wallet flow; it returns a `CompletedSwap` after the fill.
Separate preparation and signed submission remain available for an existing DEX
that controls those steps independently.

Migration changes the execution flow, not just the import:

1. Fetch `getQuote` from Spot, mapping the chain, partner, tokens, raw amount, connected account, UI slippage percentage, DEX minimum, and abort signal.
2. Use Spot `quote.netAmountOut` and its authoritative `quote.minimumAmountOut` unchanged; do not apply slippage again. Pass the original quote to the provider-free swap client; no React form/provider props are required.
3. For SDK-managed execution, implement `shouldWrap()` and confirmed `wrapNativeToken`; quote the actual wrapped ERC-20 input address. For manual wallet execution, complete wrapping in the host before preparation/signing. Use the configured Spot client's approval spender. Do not reuse the Liquidity Hub Permit2 spender.
4. After confirmed wallet steps, use `await client.prepareSwap({ quote, account, signal })` immediately before signing. Verify the installed declaration accepts an object and returns a promise; older sync positional APIs require the version-specific flow in the Spot integration guide. Sign the prepared order, not the legacy quote payload, then call installed `client.submitSignedSwap(prepared, signature, { signal })` with the wallet's unchanged signature.
5. Await execution or signed swap submission until its internal settlement flow confirms a fill. Do not start another poller. Preserve `OrderSettlementError.orderId` and its optional `order` if tracking becomes uncertain, and resume accepted snapshots through `client.executeOrder({ order, signal })` without submitting again. Advanced orders resolve at acceptance. React hosts use the same provider-free client flow and keep their own loading/recovery state around the awaited call. `AdvancedOrdersProvider` supports advanced orders only; optional `swap-ui` renders presentation.

## Archived Liquidity Hub maintenance references

Read these only when the user is maintaining an existing legacy integration during migration:

- [Quickstart](references/01-quickstart.md)
- [SDK API](references/02-sdk.md)
- [Swap flow](references/03-swap-flow.md)
- [Best practices](references/04-best-practices.md)
- [Legacy example](assets/liquidity-hub-example.ts)

Keep existing legacy execution behavior when making maintenance fixes. Do not mix a Liquidity Hub quote or signature with Spot order submission.
