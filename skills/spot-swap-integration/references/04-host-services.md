# Host Services for Swaps

Use this reference when starting without a DEX or when adding a network exposes missing wallet, token, balance, or pricing services. Spot supplies quote/preparation/submission/read APIs; it does not supply wallet connection, RPC access, a token catalog, balances, or a rendered trading app.

## Build only what the requested flow needs

Inventory the existing services once. Keep an existing application's framework, components, state, and wallet/data libraries. If there is no app, scaffold a minimal one using the user's chosen stack or an appropriate small default. Discover technical contracts yourself; ask only for unresolved product choices such as supported networks or token restrictions.

| Service | Contract |
| --- | --- |
| Network registry | One source of chain IDs, RPC access, native currency, explorer URLs, and verified wrapped-native address/decimals for wallet, reads, selectors, and links. Confirm the actual RPC chain ID and browser/proxy access. Keep private service credentials server-side. |
| Wallet | Connect/disconnect, active account/chain, network switching, account-change handling, signing, allowance reads, native wrapping, approval, and successful receipt confirmation. A preview account never signs. Reuse the existing wallet/read stack; add one only when missing. |
| Token catalog | A maintained chain-specific list or a small verified curated set with chain/address/decimals validation, deduplication, selection, and loading/error/empty states. Never identify by symbol alone or default unknown decimals to 18. Keep a native selection distinct from its wrapped ERC-20 protocol address. |
| Balances | Native balance and selected-token ERC-20 balances, keyed by account, chain, and token. Preserve raw integers and format separately. A confirmed zero is `"0"`; disconnected/loading/failed reads remain unavailable. Refresh after confirmed writes and relevant settlement events. |
| Editable state | Selected tokens, amount, input/output direction, and slippage live once in host state. Convert decimals exactly with the host numeric/wallet library; never pass raw spending values through JavaScript floating-point arithmetic. Invalidate dependent resources on scope changes. |
| Quotes | Use `client.getQuote` directly when no router exists; another aggregator is unnecessary. Key by partner/chain, pair, amount/direction, preview user, slippage, and competing minimum. Cancel or ignore obsolete results and expose loading, unavailable-liquidity, failure, refresh, and retry states. Omit `dexMinAmountOut` when there is no competing quote. |
| Optional USD display/policy | Use positive, finite unit prices from the SDK or a host source covering the actual chain/tokens. Keep unavailable values unavailable. Read [Slippage and pricing](03-slippage-and-pricing.md) for unit conversion and automatic tolerance; never derive executable output from a USD ratio. |
| Review/progress | Show the captured tokens, resolved spend, output, unchanged protected minimum, quote percentage, wallet/network actions, and pending/failure/filled outcomes. Keep input after failure. Settlement continues outside transient modals. |

## Native assets and network coverage

Resolve chain metadata from one host resolver. Check custom chains as well as the wallet library's built-in registry. Read clients must receive the actual chain, not only an RPC URL. If balance services use multicall, configure a verified deployment or the host's supported alternative; do not guess addresses or deployment blocks. A `multicallAddress is required` error can mean the read client has no chain at all.

Ensure the token loader includes the native selection with its actual symbol/decimals and the host's native sentinel. Protocol quotes and orders use its verified wrapped ERC-20 address. Native input needs wrapping funds plus gas; use the wallet's fee/estimation policy instead of wrapping the entire native balance.

For native USD pricing, normalize the sentinel to the wrapped address, then map the result back to the UI's native key. Verify each price provider's chain identifier independently from the token-list provider. Do not assume price coverage because a token list loads. Keep missing prices retryable and invalidate failed/stale resources when metadata is corrected.

Use the real partner/chain and let `createClient` resolve protocol addresses. Follow [Quickstart](01-quickstart.md#missing-partner-or-chain) for external activation; continue independent host work while it is pending.

## Verify the actual services

Use read-only public inputs to verify the configured RPC/proxy chain, native/ERC-20 catalog entries, balance reads, positive prices where needed, and a current quote. Exercise the host adapters rather than only checking a standalone chain object. Token-list availability alone proves none of the other services.

In the browser check disconnected previews, wallet/network controls, loading/failure/retry states, real zero versus failed balances, precision for different token decimals, stale invalidation when scope changes, protected minimum mapping, and settlement UI. Use mocks for unavailable wallet interactions and label the limitation. Live signing, submission, or cancellation requires explicit authorization for verification.

Report the services implemented, actual checks performed, and one concrete action for any remaining external blocker. Mocked balances or quotes do not establish a live integration.
