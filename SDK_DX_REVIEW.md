# Spot SDK Developer-Experience Review

A review of `@orbs-network/spot-ui` and `@orbs-network/spot-react` from the point of view of a developer integrating them.

## Implementation update — 26 October 2026

The findings below record the SDK before this follow-up. The required fixes and compatible improvements are implemented:

- Invalid or missing swap minima report `InputErrors.INVALID_SWAP_MINIMUM` through primary/all/field errors. React disables submission without an indefinite spinner; genuine quote, balance, client, and execution loading is preserved.
- Both READMEs open with integration-path guidance and explain the framework-neutral package, preview-account refresh, and submitted-intent metadata.
- `client.getQuote` supplies its configured chain and partner; standalone quoting remains available.
- `SpotError` provides stable SDK codes and optional cause, HTTP status, and service code. Existing quote, settlement, wallet, and abort contracts remain intact.
- React wallet interactions reuse the SDK wallet type. Existing public aliases remain available.
- Swap examples use percentage slippage consistently, and integration assets/guides match the APIs.

Validation corrected two recommendations: swaps enforce `minTradeSizeUsd`, and signed 500-bps oracle protection is separate from UI slippage. Public naming, shared form inputs, and intent metadata remain compatible; their behavior is documented.

Verification: 377 workspace tests pass; package builds, typed examples, consumer and skill typechecks pass. Built packages share all 41 SDK runtime exports. Editor checks confirm hover documentation for all eight client methods through both imports. Lint has no errors and three existing warnings.

## Original findings

**Summary:** the foundations are good. The SDK is framework-neutral, every amount is an integer string, quotes are frozen, typed examples ship in the package, and the docs are thorough. Most of the friction is in the swap path. One issue leaves a developer stuck with no clue why. The rest are too many entry points, inconsistent naming and units, and a few inputs or fields that do nothing.

## Highest impact

### 1. A missing swap minimum causes an endless spinner

With `Module.SWAP`, if the host's `marketQuote` has no valid `minimumOutputAmountRaw`, the form never becomes ready. The form never reports an error for this. In spot-react, `useSubmitButton` then keeps showing a loading spinner indefinitely, because `!form.isReady` keeps the button loading. Forgetting this field is the most likely integration mistake, and nothing points at it.

- **Where:** `packages/spot-ui/src/lib/order-form/validation.ts` (`validSwapQuote` feeds `isReady`). The spinner comes from `packages/spot-react/src/hooks/use-execution.ts` (`useSubmitButton`).
- **Fix:** report an explicit error, for example a new `InputErrors.MISSING_SWAP_MINIMUM`, or at least log a development-time warning.

### 2. Three ways to swap, and no guidance on which to pick

A developer can swap with any of these:

- `client.prepareSwap` → `client.submitOrder`
- `submitSwap`
- `calculateOrder({ module: Module.SWAP })` → `client.prepareOrder`

`executeOrder`, `waitForOrder` and `watchOrder` are exported as well. The README's "API at a glance" table has 17 rows before any guidance on which path to take.

- **Fix:** open the README with a three-row "I'm a… → use…" table: React app, DEX router, custom wallet flow. Move the full API table below it.

### 3. Errors can only be told apart by their message text

Only `QuoteError` and `OrderSettlementError` (plus the legacy `NoGraphEndpointError`) can be checked by type. Roughly 40 other `throw new Error(...)` sites in spot-ui use plain strings, for example:

- "Swap quote does not match the client chain, partner, or signer"
- "Order form is not submittable"
- "An order execution is already in progress for this account"

Developers can't handle these without matching on the message.

- **Fix:** add a single `SpotError` class with a stable `code`.

## Consistency

### 4. The same concept goes by different names

| Concept | Names used |
| --- | --- |
| Input/output tokens | `inToken` / `outToken` / `inAmount` (`getQuote`) vs `inputTokenAddress` / `inputTokenDecimals` (client, form) |
| Signer | `user` (`getQuote`), `swapperAddress` (`prepareSwap`), `account` (`executeOrder`, `SpotProvider`) |
| Form calculation | Function `calculateOrder`, but types `CalculateOrderFormParams` / `CalculatedOrderForm` |

### 5. Slippage uses different units in different places

- `getQuote` and `getMinimumOutputAmount` take a percent number, where `0.5` means 0.5%.
- The signed order's `slippage` field is in basis points.
- `examples/swap.ts` takes a bigint `uiSlippageBps` and converts it with `Number(uiSlippageBps) / 100`.

**Fix:** pick one unit for the public API (percent works) and use it in the examples as well.

### 6. Inconsistent entry points

- `getQuote` is a standalone function that needs `chainId` and `partner`, even though the host already has a client for both. `validateSwap` exists partly to catch the resulting mismatches.
- `getOrder` is a client method.
- `waitForOrder` / `watchOrder` need no client at all.

**Fix:** add a `client.getQuote(...)` shortcut that fills in `chainId` and `partner`.

### 7. `getQuote` requires `user` before a wallet is connected

Hosts that show a preview quote before the wallet connects need a placeholder address. The demo app uses `0x0000000000000000000000000000000000000001`.

**Fix:** either make `user` optional for preview quotes or document the placeholder.

### 8. The wallet interface is defined twice

spot-react's `WalletInteractions` repeats the four methods of spot-ui's `OrderWalletInteractions` and adds `cancelOrder`. It also uses renamed prop types (`ApproveTokenProps`, `GetAllowanceProps`).

**Fix:** declare it as `OrderWalletInteractions & { cancelOrder: ... }` so the relationship is obvious.

## Noise

### 9. Swaps still require inputs they ignore

For `Module.SWAP`:

- `calculateOrder` still requires `priceProtectionPercent`, `minTradeSizeUsd` and `userInput.isMarketOrder`.
- `SpotProvider` still requires `priceProtectionPercent`.

**Fix:** make the params a discriminated union keyed on `module`, so each module shows only the inputs it uses.

### 10. Required props that accept `undefined`

`wrappedNativeToken`, `inputBalanceRaw` and `inputTokenUsdPrice` are required props typed `T | undefined`, so every host must write `prop={undefined}`. This is probably deliberate, so that hosts can't forget them, but a one-line explanation in the props table would help.

### 11. Fields that never vary

`SubmittedSwap.type` is always `"intent"` and `SubmittedSwap.status` is always `"submitted"`. The README also tells hosts to translate `orderId` → `intentId` themselves.

**Fix:** drop these fields, or document what they're for.

### 12. The package name implies a UI

`@orbs-network/spot-ui` describes itself as framework-neutral with no UI. Renaming is too late, but one line near the top of the README would avoid the obvious "is this the React one?" confusion.

## What already works well

- All amounts are base-unit integer strings, never floats.
- Typed examples ship in the package (`examples/swap.ts`, `examples/router-swap.ts`) and are typechecked as part of the build.
- spot-react re-exports the whole SDK, so React hosts install only one package.
- `waitForOrder` and `watchOrder` need only the submitted order. Their outcomes are typed via `OrderSettlementError.reason`, and the docs say clearly that "aborted" and "unconfirmed" don't mean the order failed.
- `calculateOrderForm` is kept as a deprecated alias, so the rename doesn't break existing integrations.

## Suggested order

1. Fix the silent endless spinner (#1). It's small and has the biggest effect.
2. Add the "which path?" table to the README (#2).
3. Add `SpotError` with error codes (#3).
4. Unify slippage units and signer naming (#4, #5) before more integrators start using the new swap APIs.
5. Add `client.getQuote` and the shared wallet type (#6, #8).
6. Use a discriminated union for the params and clean up the props (#9–#11).
