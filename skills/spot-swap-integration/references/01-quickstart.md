# Swap Quickstart

## Establish the installed contract and host

Inspect the manifest, lockfile, resolved Spot package, installed root declarations, wallet adapter, quote state, review/progress UI, network/token registry, and partner configuration. Use the host's package manager and existing state/wallet/numeric libraries. Prefer the installed `@orbs-network/spot-ui/dist/integration-skills/spot-swap-integration/` documentation when its manifest version matches the package; repository source may describe a newer release.

A React host can use the core client re-exports from an existing `@orbs-network/spot-react` install without mounting a provider. Keep source state and wallet execution in the host. For a new installation choose a concrete compatible release from its published exports; preserve the user's version choices and avoid blind upgrades or private imports.

Choose the smallest deliverable:

- For an existing router, add one quote candidate and connect its selected route to the existing wallet/review flow. No new form or history screen is required.
- For a standalone swap form, reuse existing inputs/selectors and implement quote, review, execution, and settlement states.
- If trading services are missing, build only the required services in [Host services](04-host-services.md). Preserve an existing app's stack; scaffold a minimal app only when none exists.

## Initialize a reusable client

```ts
import { createClient } from "@orbs-network/spot-ui";

const client = await createClient(partner, chainId);
```

The client loads validated protocol configuration and exposes its `spenderAddress`, quote/preparation/submission APIs, status, and configured history. Reuse it through the host's resource/cache pattern for the actual partner and chain; do not initialize another client on every render or poll. Keep failed initialization retryable and invalidate the resource when partner/chain changes. Reporting policy is selected by `createClient(..., { disableAnalytics })`; direct hosts own wallet/tracking telemetry.

## Connect the swap lifecycle

1. Convert the typed amount with verified token decimals using exact arithmetic. Use the wrapped ERC-20 address for a native input. For automatic/custom tolerance, resolve policy through [Slippage and pricing](03-slippage-and-pricing.md).
2. Request `client.getQuote` with the actual pair and exactly one `inAmount` or `outAmount`. Own cancellation, refreshes, and full request identity. Display the quote's actual amounts, `request.slippage`, and unchanged `minimumAmountOut`.
3. Reuse that quote when opening review. Capture its resolved fixed input and account/chain under the host execution lock. Preserve gas, balance, minimum-trade, and route-support policies.
4. Read allowance before any wrap prompt, confirm required wrapping and approval, and verify sufficient exact-input allowance after approval receipts.
5. Call `client.prepareSwap` after confirmations; publish and freeze its final quote before inline signing. Submit its unchanged order with the wallet's original signature once.
6. Retain the full attempt and use a single `client.getOrder` polling lifecycle. Submission is acceptance; show completion only when the order fills. Reconcile an uncertain response against the original signed identity before replacing it.

Read [Swap flow](02-swap-flow.md) for the exact contracts, quote freshness, and recovery behavior. Adapt the [router example](../assets/spot-router-swap-example.ts) to the host's services after checking imports against installed declarations.

## Missing partner or chain

Check package resolution, host chain filters, wallet/read-client support, RPC routing, wrapped-native metadata, and the actual read-only `createClient(partner, chainId)` result. SDK initialization alone does not establish that the host's balances, token catalog, and wallet support the chain. Never substitute another partner or hard-code protocol addresses.

If external activation remains unresolved, complete independent services/UI and keep submission unavailable. Provide a sanitized, ready-to-forward draft using facts already discovered:

> Please enable or confirm Spot configuration for [DEX/partner] on [chain name and ID]. The integration uses [package and resolved version]. Read-only initialization returned [SDK code, HTTP status, service code, and short message]. We verified [relevant host support/package resolution]. Please confirm the supported partner identifier and activation status.

Remove account addresses, signatures, signed orders, credentials/private URLs, and unrelated logs. Give the draft and [support destination](https://t.me/dTWAPSupportGroup) to the user; do not send it automatically.
