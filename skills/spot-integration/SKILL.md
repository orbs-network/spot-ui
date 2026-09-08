---
name: spot-integration
description: Integrate @orbs-network/spot-ui into an existing DEX application's TypeScript state and component tree. Use with any frontend framework or custom TypeScript adapter that needs Spot form calculation, wallet execution, history, and cancellation while reusing the app's existing components and state architecture.
---

# Spot TypeScript Integration

Use this skill to integrate `@orbs-network/spot-ui` into an existing TypeScript application regardless of its frontend framework. The SDK supports TWAP, Limit, Stop-Loss, and Take-Profit orders. It calculates one authoritative form model and exposes a configured client for order preparation, signing, submission, history, and cancellation requests.

## Expected Result

The completed integration should include:

1. Spot added inside the application's existing `App`/order-form component tree, using the app's current components and design-system primitives rather than a new Spot component hierarchy.
2. DEX-owned form and quote state mapped into `calculateOrderForm` for every supported order module.
3. Optimized state ownership: minimal editable source state, memoized/computed derivations, narrow subscriptions, keyed async resources, and no mirrored calculated state.
4. One host-managed `SpotClient` resource per partner and chain, with loading, retry, and invalidation behavior appropriate to the host application.
5. A wallet adapter that handles native wrapping, allowance reads, approval, EIP-712 signing, contract cancellation, and confirmed transaction receipts.
6. A submission flow that prepares the order immediately before signing and forwards the wallet's original signature unchanged.
7. Order history keyed by `order.historyKey`, plus cancellation and refresh behavior.
8. Chain names, wrapped-native tokens, explorer links, notifications, and visual components supplied by the host DEX.

## Distribution

This skill lives in `skills/spot-integration/` of the [`orbs-network/spot-ui`](https://github.com/orbs-network/spot-ui) repository.

## Workflow

1. Read [references/01-quickstart.md](references/01-quickstart.md) for package setup, integration ownership, preflight checks, and the minimum lifecycle.
2. Read [references/02-form-calculation.md](references/02-form-calculation.md) when implementing form state, market quotes, validation, price inversion, or display values.
3. Read [references/03-client-and-execution.md](references/03-client-and-execution.md) when implementing client reuse, wallet adapters, order preparation, signing, approval, or submission.
4. Read [references/04-history-and-cancellation.md](references/04-history-and-cancellation.md) when implementing order lists, polling, normalized history, or cancellation.
5. Read [references/05-integration-principles.md](references/05-integration-principles.md) before implementation for the existing-component requirement and optimized state architecture, then use its checklist before finalizing.
6. Use [assets/spot-integration-example.ts](assets/spot-integration-example.ts) as a framework-neutral starting point, adapting its ports to the host's wallet and data layer.
7. Before finalizing, verify all imports against the installed package's root exports and types. Never assume an internal file or `dist/*` path is public.

## Guardrails

1. Every DEX needs an enabled Spot partner configuration. If the requested partner and chain are not returned by `getPartners()` / `getPartnerChains(partner)`, contact **[@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup)** on Telegram rather than inventing configuration.
2. Locate and extend the existing `App`/order-form component that owns the swap flow. Reuse the app's existing inputs, selectors, dialogs, buttons, rows, and styling. Do not create a new UI component, parallel Spot page, replacement form, component library, or wrapper component unless the user explicitly changes this requirement; non-visual TypeScript adapters may be added when needed.
3. Use the application's existing state solution. Do not introduce a second global store for Spot. Keep only user-editable/source values in reactive state, calculate the form once per relevant input snapshot, subscribe existing components to narrow slices, and keep clients/wallet adapters outside render-reactive state.
4. Install and import only `@orbs-network/spot-ui` for the framework-neutral integration. Do not introduce another frontend framework, wallet library, state library, or numeric library; adapt the libraries the host application already uses.
5. Use `calculateOrderForm` as the only order-calculation entry point. Do not recreate defaults, validation, schedules, price protection, or protocol order values in host code.
6. Treat `form.values` as execution data and `{ raw, ui, usd }` objects as display/form data. Never send `.ui` or `.usd` values to wallet or protocol calls.
7. `quotedOutputAmountRaw` must be the current raw output-token quote for the complete `userInput.inputAmountUi`. Omit a stale quote while its replacement is loading.
8. Preserve explicitly selected `tradeCount` values across input edits. If the amount lowers `maxTrades`, surface `InputErrors.MAX_TRADES` and block submission; do not silently clamp the user's choice.
9. `createClient` fetches configuration on every call and has no global cache. Reuse or invalidate its promise/client in the host's normal lifecycle, and remove rejected promises so retry can work.
10. Do not fetch, validate, or reconstruct RePermit configuration in the host. Use the addresses, signing payloads, order data, cancellation requests, and history methods exposed by `SpotClient`.
11. Native input must be wrapped before approval. Pass the host chain's wrapped-native token address to `prepareOrder`, and approve that token against `client.spenderAddress`.
12. Wallet write methods must resolve only after transaction confirmation. After approval, verify the raw allowance with a bounded retry before preparing and signing the order.
13. Call `prepareOrder` after wrapping and approval, immediately before signing. It stamps the fresh start, deadline, and monotonic client nonce and rejects any form whose `canSubmit` is false.
14. Return the wallet's original `0x`-prefixed EIP-712 signature from the signing adapter. Do not split it into `{ v, r, s }`, rewrite `v`, or normalize the bytes.
15. Prevent concurrent submissions for the same form. Do not blindly retry an ambiguously failed `submitOrder`; reconcile history or ask the user before creating another signed order.
16. Use `order.historyKey` for list/cache identity. `order.id` is a protocol display/cancellation value and can collide across legacy deployments.
17. Spot has no network registry. The host owns wrapped-native tokens, connected-chain policy, explorer URLs, and chain labels.
