# Spot SDK Review — 9 November 2026

Scope: `@orbs-network/spot-ui` (core SDK) and `@orbs-network/spot-react`. This is a code review only: no code was changed, and nothing was run against a live order. Items already fixed or documented in `SDK_DX_REVIEW.md` are not repeated.

**Summary:** the foundations are solid. Amounts are always integer strings, and abort and timeout handling is careful. The problems are a handful of real bugs, a few unsafe defaults, and an API that is harder to learn than it needs to be.

## Confirmed bugs

### spot-ui (core)

1. **Typed amounts round up.**
   - `toAmountRaw` uses BigNumber's default half-up rounding. For example, `"1.0000005"` USDC becomes `1000001` base units, so the user can spend 1 wei more than they typed.
   - **Where:** `packages/spot-ui/src/lib/order-form/amounts.ts:26`
   - **Fix:** round down (`BN.ROUND_DOWN`). Also consider rejecting hex and exponent input such as `"0x10"` or `"1e3"`, which BigNumber accepts today.

2. **Any page with `?devurl=true` switches the SDK to the dev backend.**
   - `getApiEndpoint()` checks the host page's own URL. A link with that parameter sends a user's signed orders to the dev order service.
   - The endpoint is resolved on every call, so it can change during a client's lifetime, for example after a navigation in a single-page app.
   - **Where:** `packages/spot-ui/src/lib/api-config.ts:7`
   - **Fix:** make it an explicit `createClient(partner, chainId, { apiUrl })` option, and fix the endpoint when the client is created.

3. **A token with no USD price leaves the form stuck, with no error.**
   - `isReady` requires `inputTokenUsdPrice > 0`, even when the quote already supplies `inputAmountUsd`.
   - Long-tail tokens can never become submittable, and `errors.primary` stays empty, so the host can't show a reason.
   - **Where:** `packages/spot-ui/src/lib/order-form/validation.ts:173`
   - **Fix:** accept `inputAmountUsd` as an alternative, and add a "not ready because…" field, for example `form.notReadyReason: "empty" | "awaiting-quote" | "missing-usd-price" | ...`.

4. **Analytics calls can break order submission.**
   - In `submitOrder`, the calls to `analytics.onCreateOrderRequest`, `onCreateOrderSuccess` and `onCreateOrderError` aren't guarded. `executeOrder` already wraps its analytics calls in `observe()`.
   - **Where:** `packages/spot-ui/src/lib/submit-order.ts:40`, `:94` and `:100`
   - **Fix:** use the same `observe()` wrapper.

### spot-react

5. **Switching to market flips the meaning of a typed trigger price.**
   - `toggle()` resets `isPriceInverted` to `false`, but keeps the typed `triggerPriceUi` and `limitPriceUi`. The core SDK reads those strings according to the inversion flag.
   - Example: on an inverted Stop-Loss, the trigger becomes wrong by orders of magnitude, and the order can still be submitted.
   - **Where:** `packages/spot-react/src/hooks/use-limit-price.ts:43`
   - **Fix:** apply `invertPriceInput` to the typed prices when resetting the flag, or stop resetting the flag on toggle.

6. **A successful cancel can be reported as failed.**
   - After the cancel transaction is mined, `refetchUntilStatusSynced` throws "orders not found" when `refetch` returns `undefined`. This happens when:
     - the history modal closes, which aborts polling;
     - the account or client changes while it polls;
     - the indexer takes more than 60 seconds.
   - The order is then marked FAILED and `onCancelOrderFailed` fires, even though success analytics were already sent.
   - `createCancelledOrder` builds the cancelled order but never writes it to the cache.
   - There is no guard against a double click, which sends two cancel transactions.
   - **Where:** `packages/spot-react/src/hooks/use-cancel-order.ts:29` and `:99–125`
   - **Fix:**
     - Once there is a `txHash`, write the cancelled order with `store.updateOrder(createCancelledOrder(order))`.
     - Treat a sync failure as "succeeded, waiting for the indexer", not as a failure.
     - Add a guard against running twice.

7. **The Retry button hides the error notice.**
   - `refetchClient` clears `error` as soon as a retry starts, and the notice renders only while `error` is set.
   - The notice disappears for several seconds and then reappears, so its `isRetrying` state is never shown.
   - **Where:** `packages/spot-react/src/context/create-spot-store.ts:157`, `context/client-error-notice.tsx:44`
   - **Fix:** keep the last error until the retry finishes.

8. **Unmounting the component that submitted cancels the execution.**
   - Each `useExecution()` owns its own `AbortController` and aborts it on unmount.
   - A tab switch or a closed dialog therefore fails the attempt, or leaves a swap UNCONFIRMED.
   - An account change also aborts tracking of a submitted swap, even though `watchOrder` needs no wallet.
   - **Where:** `packages/spot-react/src/hooks/use-submit-order.ts:27`, `hooks/use-resume-execution.ts:11`
   - **Fix:** create the controller in the provider store and abort it only when the provider unmounts or its scope changes.

9. **Changing `overrides.state` wipes the form and the current execution.**
   - `formScopeKey` includes the JSON of the initial state, which comes from `overrides.state`.
   - Example: a host that saves the user's fill delay back into `overrides` resets the typed prices and dismisses a visible success or failure modal.
   - **Where:** `packages/spot-react/src/context/use-spot-provider-state.ts:51–62`, `context/create-spot-store.ts:442–453`
   - **Fix:** treat overrides as initial values only, or document that changing them resets the form.

### Also worth checking (unclear whether intended)

- **The form stays frozen after FAILED, REJECTED or SUCCESS until the host resets it.**
  - Typed changes don't update the form until then.
  - A retry sends the old frozen amount together with the current token.
  - **Where:** `packages/spot-react/src/context/order-form-context.tsx:50`
  - **Fix:** document this, or freeze the form only while execution is locked.

## Making it easier to use and understand

- **Make `calculateOrder` params a discriminated union on `module`.**
  - Swaps still require `priceProtectionPercent`, `minTradeSizeUsd` and `userInput.isMarketOrder`, and then ignore them.
  - `examples/swap.ts` passes `priceProtectionPercent: 5` with a comment saying it does nothing.
- **Let the SDK own the price check before signing.**
  - The README's DEX-router recipe asks hosts to re-quote and compare the minimum themselves before `prepareSwap`. `submitSwap` does this internally, but `prepareSwap` does not.
  - Add a helper such as `client.refreshAndPrepareSwap(quote, account)` that re-quotes and throws `INVALID_QUOTE` when the price got worse.
- **Pass the quote, and tokens as `{ address, decimals }`, into `calculateOrder`.**
  - Today the market price is the quoted output divided by the currently typed input. A stale quote for a previous amount silently gives a wrong price. Using the quote's own `request.inAmount` avoids that.
  - Tokens are currently passed twice: decimals to `calculateOrder` and addresses to `prepareOrder`, which can mismatch. With tokens on the form, `prepareOrder` would only need `{ form, account }`.
- **Use one name for the signer.**
  - Today it is `user` in `getQuote`, `userAddress` in `prepareSwap` and `submitSwap`, `swapperAddress` in `prepareOrder`, `account` in `executeOrder` and history, and `swapper` in `getOrders`.
  - `prepareSwap(quote, addr)` is positional, while `prepareOrder` and `submitSwap` take objects.
- **Rename the order-history flags.**
  - `getv1orders` means the old order-sink service, `legacyOrders` means V1 TWAP orders, and `order.version === 1` is a third meaning.
  - `getOrders` takes `exchange: Partners`, while everything else calls it `partner`.
  - Merge `getAccountOrders` and `getAccountOrdersResult` into one call.
- **Have one error type.**
  - `QuoteError` and `OrderSettlementError` don't extend `SpotError`, so hosts need three `instanceof` checks.
  - Make them subclasses with their own codes.
- **Make `Order` a discriminated union on `version: 1 | 2`.**
  - Fields such as `repermitDigest` and `twapAddress` are currently empty or optional depending on the version.
- **Trim the public surface.**
  - The deprecated `analytics` singleton, which is still enabled.
  - `setUIVersion`, which lets hosts overwrite the version spot-react sets.
  - `SpotAnalytics = Analytics`, which exposes internal fields (`data`, `timeout`, `configDetails`).
  - The `calculateOrderForm` alias, in the React entry point at least.
  - In spot-react, `CancelOrderStatus` doesn't match what `useCancelOrder` returns, and `OrdersResult`, `ClientResult` and `CategorizedOrders` aren't exported.
  - `Callbacks.onCopy` is never called.
- **Clean up small inconsistencies.**
  - `useAmountUi(decimals, value)` takes its arguments in the reverse order of `toAmountUI(value, decimals)`. The spelling also differs: `Ui` vs `UI`.
  - `isPreparingOrder` is true while the client is still loading. The numeric `ExecutionStatus` overlaps with the string `ExecutionPhase`.
  - `useDuration` and `useFillDelay` turn an empty input into `0` and accept negative numbers.
  - `getMaxOrderDurationError` has a Stop-Loss/Take-Profit branch with the same 60-day limit as the default, so the branch does nothing.
- **Narrow the error boundary.** `SpotErrorBoundary` wraps the host's own components:
  - Host crashes are reported to Spot analytics.
  - The README tells hosts not to add their own boundary.
  - A token or module change doesn't reset the crashed state.
- **Improve the docs.**
  - The README's provider example doesn't work for `Module.SWAP`: it omits `minimumOutputAmountRaw`, so it always reports `INVALID_SWAP_MINIMUM`.
  - Open each README with a short quickstart before the 17-row API table.
  - Say up front that analytics are on by default and sent to `bi.orbs.network`.

## Performance

- **One large trading context re-renders order-history rows on every keystroke.**
  - `SpotTradingContext` holds the typed amount, quote fields and balance alongside stable config.
  - `useCancelOrder`, `useHistoryOrder`, `useClient` and `useOrders` all read it, so every keystroke or quote update re-renders every history row.
  - **Fix:** split it into a stable config context and a live quote context, or move the live values into the existing zustand store with selectors.

## Tests

The repository has no tests. Fixes 1, 3, 5 and 6 should come with small unit tests, since silent regressions in this logic would do the most damage.

## Suggested order

1. Bugs 2 (dev-backend switch) and 5 (inverted trigger price), which affect funds or safety.
2. Bugs 1, 3, 6 and 8.
3. Discriminated union for `calculateOrder`, `refreshAndPrepareSwap`, and passing the quote into `calculateOrder`.
4. Consistent naming and a single error hierarchy. Add deprecated aliases so existing integrations keep working.
5. The context split, trimming exports, and README updates.
