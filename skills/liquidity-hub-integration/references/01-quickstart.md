# Quickstart

## Install

```bash
npm install @orbs-network/liquidity-hub-sdk
```

## Partner Name

Set the `partner` field to the DEX name (lowercase, e.g. `"myDex"`). No registration needed.

## Supported Chains

| Chain ID | Network |
|----------|---------|
| 1 | Ethereum |
| 56 | BNB Chain |
| 137 | Polygon |
| 146 | Sonic |
| 250 | Fantom |
| 1101 | Polygon zkEVM |
| 8453 | Base |
| 42161 | Arbitrum |
| 59144 | Linea |
| 81457 | Blast |

## Minimum Steps

1. Install `@orbs-network/liquidity-hub-sdk`.
3. Initialize the SDK with `constructSDK({ chainId, partner })` (see [02-sdk.md](02-sdk.md)).
4. On every swap, fetch a Liquidity Hub quote alongside your DEX quote.
5. Compare prices — use whichever gives a better output amount.
6. If Liquidity Hub wins: approve Permit2, sign the quote, execute the swap (see [03-swap-flow.md](03-swap-flow.md)).
7. If DEX wins: execute the normal DEX swap and report it via `sdk.analytics.dexSwap(...)`.
8. Review best practices in [04-best-practices.md](04-best-practices.md).
