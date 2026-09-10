# Quickstart

## Install

Install the framework-neutral SDK with the package manager already used by the host:

```bash
pnpm add @orbs-network/spot-ui
```

Import only from the package root:

```ts
import {
  Module,
  Partners,
  calculateOrderForm,
  createClient,
  getPartnerChains,
} from "@orbs-network/spot-ui";
```

Do not import from `@orbs-network/spot-ui/dist/*`. The package does not require a wallet library or frontend framework.

## Ownership Boundary

| Concern | Owner |
| --- | --- |
| Root/order-form layout and all visual controls | Existing host `App` and existing components |
| Selected input/output tokens and typed input | Host DEX |
| Current market quote and quote freshness | Host DEX/router |
| Token balances and one-token USD prices | Host DEX |
| Connected account and chain | Host wallet state |
| Wrapped-native token and explorer metadata | Host chain configuration |
| Form defaults, derived values, schedules, and validation | `calculateOrderForm` |
| RePermit configuration and configured protocol addresses | `createClient` / `SpotClient` |
| EIP-712 signing and transaction writes | Host wallet adapter |
| Prepared order, approval request, submission, history, cancellation request | `SpotClient` |
| Notifications, translations, modal flow, and polling lifecycle | Host application |

## Preflight

Confirm these inputs before implementation:

- The DEX has a member in `Partners`, and the connected chain is included in `getPartnerChains(partner)`.
- The existing `App`/swap form component and its reusable inputs, selectors, buttons, dialogs, rows, loading states, and error surfaces have been identified.
- The application's current state container and the narrow selectors/computed values used by those components have been identified.
- The host can provide input/output token addresses, symbols, and decimals.
- The host chain configuration supplies the wrapped-native token.
- The router exposes a raw output amount and enough request metadata to reject stale quotes.
- The host can provide a raw input-token balance and the USD price of one input and output token.
- The integration has a positive partner-approved `minTradeSizeUsd` and a percentage-unit `priceProtectionPercent` (`3` means 3%).
- The wallet layer can read allowance, wrap native tokens, approve ERC-20 tokens, sign EIP-712 typed data, and send cancellation contract calls.
- Wallet writes can wait for confirmed receipts and return transaction hashes.
- The product has UI/state for all requested modules: `TWAP`, `LIMIT`, `STOP_LOSS`, and `TAKE_PROFIT`.

For a new chain, validate the host's wallet, read clients, native-token list, wrapped-token mapping, and price lookups together using [Chain Integration](06-chain-integration.md). A successful Spot config lookup alone does not establish host support.

If the partner/chain is absent, first check the runtime package and partner filters using that reference. If support is still absent, direct the user to `@dTWAPSupportGroup` on Telegram. Do not substitute another partner or hard-code protocol addresses.

## Minimum Lifecycle

1. Extend the existing app/order-form component in place and map Spot states into its existing controls. Do not create a separate Spot component or page.
2. Validate the partner/chain and initialize `createClient(partner, chainId)` through the host's data lifecycle.
3. Recalculate `calculateOrderForm(params)` only when controlled form or current market inputs change.
4. Render defaults and derived values through existing components; render validation from `form.errors` and gate submission with `form.canSubmit`.
5. On submit, capture the current form, tokens, account, chain, and client as one immutable attempt.
6. Normalize native input to the host's wrapped-native token, check allowance, wrap if needed, approve if needed, and verify allowance.
7. Call `client.prepareOrder(...)` immediately before `wallet.signOrder(preparedOrder.signingRequest)`.
8. Submit once with `client.submitOrder(preparedOrder, signature)` and refresh balances/history after success.
9. Poll history through `client.getAccountOrders(...)`; cancel through `client.getCancelOrderRequest(order)` and the host wallet.

Use the host's established state/data primitives—such as computed selectors, derived stores, services, signals, or a small TypeScript controller—to implement the lifecycle without introducing another UI component or global store.
