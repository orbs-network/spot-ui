# Code Review — spot-ui monorepo (excl. apps/web)

Scope: `packages/spot-ui`, `packages/spot-react`, `packages/liquidity-hub-ui`, `scripts/`.
All high-severity items below were verified against source. No files were modified.

## Fix first (highest impact)

1. **Timezone-dependent default fill delay** — `spot-ui/src/lib/consts.ts:66-68,172-175`
   `MIN_FILL_DELAY_MINUTES = new Date(MIN_FILL_DELAY_MILLIS).getMinutes()` uses local-timezone
   minutes. In +5:30 (India) it returns 35, in +5:45 (Nepal) 50 — instead of 5. This corrupts the
   default order params for users in half/quarter-hour offset zones.
   Fix: `value: MIN_FILL_DELAY_MILLIS / 60000` (i.e. `5`).

2. **User order params wiped on every render** — `spot-react/src/spot-context.tsx:72-88`
   Effect depends on the object reference `props.overrides?.state`. Consumers passing an inline
   `overrides={{ state: {...} }}` produce a new reference each render, so the effect refires and
   overwrites `typedLimitPrice / typedTriggerPrice / typedChunks / typedDuration / *Percent` (usually
   with `undefined`). User-typed values get reset continuously.
   Fix: depend on the primitive fields, not the object; apply overrides once (init guard). Split the
   `module`-driven logic out.

3. **`"NaN"` strings written into V2 order data** — `spot-ui/src/lib/orders/v2-orders.ts:131-133,148`
   - Market orders: `getDstMinAmountPerTrade` returns `""` when `limit === 1`; `BN("").multipliedBy(n).toFixed()` → `"NaN"` in `dstMinAmountTotal`.
   - `triggerPricePerTrade: BN(order.order.witness.output.stop || "").toFixed()` → `"NaN"` when `stop` is empty.
   These poison downstream rate math and can surface in the UI.
   Fix: default to `0` (`BN(x || 0)`) or return explicit `""`/`"0"`.

4. **Missing `Content-Type` on create-order POST** — `spot-ui/src/lib/submit-order.ts:15-18`
   The most important call in the SDK sends no `Content-Type: application/json` header (every other
   POST in the repo sets it). Backends often refuse to parse a `text/plain` body.
   Fix: add `headers: { "Content-Type": "application/json", Accept: "application/json" }`.

5. **Swap submission errors silently swallowed** — `liquidity-hub-ui/src/lib/swap.ts:68-81`
   `swapX({...}).then().catch(() => {})` fires the actual submission un-awaited and discards both the
   returned txHash and any error. A bad signature / 4xx surfaces to the user only as a ~60s
   `waitForSwap` timeout, with the real reason lost.
   Fix: `await` the submission (or race it against the poll) and surface its error immediately.

6. **Poll/retry loops defeated by the first transient error** — `liquidity-hub-ui/src/lib/swap.ts:187-189` and `:149-152`
   `waitForSwap` and `getTxDetails` both `catch { return / throw }` *inside* the retry loop, so a
   single network blip ends the loop — the "retry N times" intent never happens, and the backend's
   real error message is replaced by a generic one.
   Fix: `continue` on transient errors; only throw/return on a definitive backend error, and propagate `result.error`.

## Medium

- **Unguarded division → `Infinity`/`NaN`**
  - `spot-ui/src/lib/orders/v1-orders.ts:150-153` — `.div(order.ask_srcBidAmount)` has no guard despite the "Avoid division by zero" comment; `Infinity` chunks corrupt `isFilled`, totals, min-amounts.
  - `spot-ui/src/lib/orders/v2-orders.ts:57-67` — `getProgress` returns `NaN` when `expectedChunks === 0`. Add `if (!totalChunks) return 0;`.
  - `spot-ui/src/lib/orders/v2-orders.ts:29-33` — `getOrderType` divides by `input.amount` with no zero guard.
- **Non-functional state update race** — `spot-react/src/hooks/use-cancel-order.ts:38-56`
  `setCancelOrder`/`clearCancelOrder` spread a render-time snapshot of `cancelOrders` across `await`
  points. Concurrent cancels or a re-render between LOADING/SUCCESS writes drop other orders' state.
  Fix: read `useSpotStore.getState()` at write time, or a functional store action.
- **Context values recreated every render** — `spot-context.tsx:197-223` and `use-spot.tsx:69-92`
  Inline provider `value` objects change identity on every render; combined with the live price feed
  this recomputes the whole form (~15 hooks) on every price tick. Wrap both in `useMemo`.
- **`getStatus` can throw on missing `description`** — `v2-orders.ts:75` — use `?.toLowerCase()`; otherwise the order is silently dropped by the surrounding try/catch.
- **`feePercentage` prop is dead; fee `share` hardcoded to 0** — `build-repermit-order-data.ts:24,88-93` — either partner fees are never collected or the prop is misleading. `FEES` / `EXCLUSIVITY_OVERRIDE_BPS` consts are also unused. Wire up or remove + document.
- **`getDexOutAmountWS` routes wei through `Number`** — `liquidity-hub-ui/src/lib/analytics.ts:8-12,254` — loses precision above 2^53 (corrupts the analytics field). Keep the wei value a string: `BigInt(dexMinAmountOut || "0")`.
- **`fetchQuote` never checks `response.ok`** — `liquidity-hub-ui/src/lib/quote.ts:96-104` — a 5xx with an unexpected shape can be treated as a valid quote.
- **Two divergent "args changed" definitions** — `quote.ts:40-62` vs `analytics.ts:220-238` — session/`liquidityHubId` continuity can desync. Derive from one source of truth.
- **Publish scripts mutate `package.json` before build/publish** — `scripts/publish-*.mjs` — on failure the tree is left bumped-but-unpublished; next run bumps from the wrong base. Bump after success or roll back in `catch`.
- **`bumpVersion` breaks on prerelease versions** — `scripts/publish-version.mjs:25-37` — `Number("3-beta")` = `NaN` → `"1.2.NaN"`. Use a real semver parser.

## Low / cleanup

- `decimals === 0` treated as "no value" (falsy check) in `spot-ui/src/lib/utils.ts:70,76`, `lib.ts:42,55,73`, and `spot-react/src/utils.ts:9-22` — breaks 0-decimal tokens. Use `decimals == null`.
- Min-trade-size error fires at zero input and is duplicated — `spot-react/src/hooks/use-input-errors.ts:13-24` vs `use-trades.ts:29-37`. Gate on non-zero input; consolidate the two implementations.
- Duplicated `getTheGraphUrl` — `spot-ui/src/lib/utils.ts:20-23` and `orders/v1-orders.ts:20-23`.
- Wrong comments: `utils.ts:237` says "365 days" (it's 60); `swap.ts:168` says "2 minutes" (it's 1); `analytics.ts:41` says "16 characters" (yields 14).
- `networks.ts:504` `bera.publicRpcUrl` is a `wss://` URL (all others are `https://`); `bera.logoUrl` points at the Katana logo.
- SSR: `analytics.ts:304,365` read `window.location` without the `typeof window` guard used elsewhere.
- `use-swap-execution.ts:7-9` `?? {}` selector returns a fresh object — latent infinite-render risk if the slot is ever undefined; hoist a module-level `EMPTY`.
- `store.ts:43-53` `swapExecutions` array grows unbounded per session; cap or reuse a slot.
- `constructSDK.ts:13` `analyticsCallbacks.liquidityHubId` snapshots `{}` at import → always `undefined`; use a getter.
- `swap.ts:49` `error.message.error || error.message` is dead (`.error` on a string is always undefined).
- Analytics `fetch` has no `keepalive`/`sendBeacon` — events at page unload may be dropped (`analytics.ts:26-39`).
- OTP interpolated into a shell string in publish scripts (`publish-*.mjs`); validate `/^\d{6,}$/` or pass argv as array.
- `promiseWithTimeout` doesn't abort the underlying fetch on timeout (`quote.ts:6-26`).
- Various `exhaustive-deps` gaps (lint-only): `spot-context.tsx:92-116`, `order-hooks.ts:60-69`, `use-input-errors.ts:44-51`, `use-trigger-price.ts:49-51`, `use-limit-price-panel.tsx:25-28`.

---

# Flow & logic review (second pass)

Traced four end-to-end flows: order lifecycle (form → witness → sign → submit → read-back), swap execution state machine, liquidity-hub quote→swap→poll, and price/percentage/time derivation.

## Fixed in this pass

- **Signed order didn't match the confirmation** (`use-src-amount.ts`) — the summary showed the frozen `acceptedSrcAmount` but the signed witness re-derived from the live input, so a mid-flow input change meant the user signed a different amount than approved. `useSrcAmount` now freezes to the accepted snapshot while an execution is in flight (same pattern as price/tokens).
- **Double-submit** (`use-submit-order.ts`) — no in-flight guard and the button wasn't disabled during LOADING; a fast second click launched a second concurrent flow (double wrap/approve/sign). Added an early-return guard on the active slot's status.
- **CTA stuck spinning** (`use-submit-order.ts`) — `allowanceLoading` was never cleared if the allowance read threw. Now cleared in the catch.
- **Just-created order missing from history** (`use-submit-order.ts` / `order-hooks.ts`) — the flow did a single indexer refetch (which usually hasn't ingested the order yet) and the optimistic-insert helper `useAddNewOrder` was dead code. Now inserts the authoritative order immediately, then reconciles in the background.
- **Confirmed cancel reported as FAILED** (`use-cancel-order.ts`) — a lagging indexer during the v2 post-cancel poll flipped an already-on-chain cancel to FAILED. Now updates cache optimistically on txHash and treats the poll as best-effort reconcile.
- **getTxDetails misreported failures as timeouts** (`swap.ts`) — never inspected `result.error` or terminal `failed`/`reverted` status. Now surfaces those immediately (transient errors still retry).
- **Analytics session split on wallet switch** (`analytics.ts`) — `resetSessionIfNeeded` ignored `account`. Added it to match quote.ts.
- **Market-price precision** (`spot-context.tsx`) — `useParsedMarketPrice` rounded the per-token rate to whole dst-wei (~4% skew for low-priced tokens like PEPE, feeding limit min-out). Removed the rounding; downstream still rounds final wei amounts.
- **Abandoned submission promise** (`swap.ts`) — the losing side of the swap `Promise.race` could throw an unhandled rejection; now swallowed.

## Deferred — need your input (behavior/product decision)

- **Partner fee never encoded** (`build-repermit-order-data.ts:88-92`, `use-repermit-order-data.ts:42`) — `feePercentage` is passed in but dropped, and `exchange.share` is hardcoded `0`, so the fee shown to users isn't in the signed order. Wiring it wrong could misdirect funds, so I left it: confirm whether fees are collected elsewhere or `share` should carry it (and in what unit/bps).
- **Inverted-view % chips** (`use-input-with-percentage.ts`, `use-price-panel.ts`) — the +/-% chips act on the canonical price while the panel shows the inverted price, so in inverted view the sign appears flipped from what the user sees. The signed order is canonically correct; this is a UX convention decision.
- **nonce/start at render vs sign time** (`build-repermit-order-data.ts:36,69`) — captured when the memo last recomputed, not at signing. `nonce` staleness is harmless; `start` can drift up to ~1 min. A correct fix means capturing one timestamp at sign time, which touches the sign flow — deferred as higher-risk than the minor drift warrants.
- **Stale quote can be swapped** (liquidity-hub) — the real bug is in `apps/web/.../use-swap-best-trade.tsx` (the excluded web folder): on a failed/worse re-quote it returns the stale quote. A lib-level `isFreshQuote` guard in `swap()` would enforce the invariant regardless of integrator; left it since it's in the excluded folder and could reject valid consumer flows.

## Verified correct (flow)

EIP-712 witness ↔ read-back round-trips (epoch/deadline s↔ms, order-type bounds, single-chunk epoch=0); slippage→bps direction; approval-before-sign and wrap-before-approve ordering; native wrap/approve/order amount consistency; sign payload == submit payload; stale-slot isolation via bound `swapExecutionIndex`; typed-price inversion cancels exactly once; SL-below / TP-above trigger direction; swap poll terminal states after the retry fix.

---

## Verified correct (checked, not bugs)
EIP-712 witness/Order struct field ordering matches the signed message; deadline/epoch/start
seconds↔ms conversions are consistent; EIP-2098 signature decoding in `use-submit-order.ts` is
correct; `TimeUnit` enum-as-millis multiplication is consistent throughout.
