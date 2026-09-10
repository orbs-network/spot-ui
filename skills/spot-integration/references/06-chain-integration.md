# Chain Integration

Use this reference when enabling a chain or investigating missing partners, balances, native assets, or USD values. Spot protocol support and host application network support are separate concerns.

## Confirm the Runtime Partner List

- Execute `getPartners()` / `getPartnerChains(partner)` through the package resolution used by the app. A current GitHub config does not prove the installed SDK or running app contains it.
- Check the installed Spot version, the SDK's `Partners` enum, and any partner allowlist. A config entry can be excluded by an enum filter even when the underlying Spot config resolves.
- In a source workspace, inspect development aliases, package exports, and the actual app bundle before blaming stale `dist`. Rebuild only if the app consumes built output; source aliases should reflect source changes. An isolated test importing `dist` does not establish what the dev app runs.
- If the supported pair is still absent, report the evidence and direct the user to Spot support. Do not bypass SDK support checks or replace protocol addresses.

## Wire the Host Chain Once

Use the host's established chain registry or resolver for wallet setup, server/public read clients, chain labels, explorers, and token metadata. Include custom chains as well as library-provided chains. Avoid independent arrays that require every caller to be updated separately.

Verify the chain ID, RPC URL, native symbol/decimals, explorer, and wrapped-native token address against official chain or DEX documentation. Do not assume wrapped-token or contract addresses match another network.

For hosts using Viem or a similar client:

- Check the client used by balance and receipt services, not just the wallet provider. Its configured chain must match the selected chain.
- If balance reads use multicall, configure the chain's verified multicall deployment or the host's supported alternative. Do not guess a deployment block; omit optional block metadata when unknown.
- `client chain not configured. multicallAddress is required.` means the read client has no chain. Fix the chain lookup first; merely supplying an address can conceal that problem. A configured chain missing multicall metadata is a separate issue.
- Verify the RPC proxy supports the new chain. A public RPC working does not prove the host proxy routes it correctly.

## Native Tokens and Prices

The native asset must be represented consistently across token selection, balances, quotes, prices, and execution:

1. Read native metadata through the shared chain resolver, including custom chains. Ensure the token loader inserts the host's native-address sentinel with the correct symbol and decimals. A list of ERC-20 assets alone does not establish native support.
2. Populate the host's wrapped-native mapping with the verified address and decimals. Displaying native ETH successfully does not prove the price adapter or wrapping flow has this mapping.
3. If the price adapter queries the wrapped asset for native prices, normalize the native sentinel to that address, then map the returned price back to the original native key consumed by the UI. Do not silently drop native input because the wrapped-token mapping is absent.
4. Check each price provider's chain identifier independently of the token-list provider. A token list endpoint succeeding does not prove price coverage. Verify actual input and output token prices; use the host's existing fallback policy if needed, and keep unsupported prices visibly unavailable rather than inventing values.
5. Pass the USD price of one token into `inputTokenUsdPrice` and `outputTokenUsdPrice`. Continue deriving output quantities from the current router quote and SDK calculation; do not replace a missing quote with a USD ratio.
6. Ensure missing/failed prices can be retried. Invalidate affected cached results after correcting chain metadata or price mappings. An empty response cached with infinite freshness can survive a code fix; a reload may help diagnosis, but the integration needs the host's normal retry/invalidation path.

## Read-Only Completion Checks

Exercise the actual host functions with the new chain, rather than only testing a standalone chain object:

- Resolve the expected partner/chain and verify the host read client has that chain ID.
- Read the RPC chain ID and perform the balance service's multicall path where applicable. Test through the configured proxy when the app uses one.
- Load the token list and confirm the native asset is selectable with the expected sentinel, symbol, decimals, and display metadata; retain the ERC-20 entries.
- Read native and ERC-20 balances for a public test address without sending a transaction.
- Fetch positive, finite one-token USD prices for the selected native/ERC-20 pair and verify the native key is present. Check both directions when the host normalizes native input and output differently.
- Feed a current quote and those prices into the form, then check that output quantity and USD value render. Confirm switching chains or tokens cannot retain the previous pair's balances, quote, or prices.

Use targeted tests or mocked responses for lookup and normalization failures; use live read-only requests to establish RPC/provider coverage. Type-checking alone cannot validate these runtime dependencies. If a live check is unavailable, report exactly which behavior remains unverified. These checks do not require approvals, wrapping transactions, or order submission.
