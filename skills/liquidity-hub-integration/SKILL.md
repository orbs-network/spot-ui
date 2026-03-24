---
name: liquidity-hub-integration
description: Integration guide for @orbs-network/liquidity-hub-sdk into a DEX. Enables DEXes to offer better swap prices by routing through Orbs Liquidity Hub — a decentralized optimization layer that sources liquidity from on-chain and off-chain solvers. Covers SDK setup, quote fetching, price comparison, swap execution, and analytics.
---

# Liquidity Hub Integration

Use this skill to integrate `@orbs-network/liquidity-hub-sdk` into any DEX. Liquidity Hub is a decentralized optimization layer that finds better swap prices by sourcing liquidity from multiple on-chain and off-chain solvers. When Liquidity Hub offers a better price than the DEX's own router, the swap is executed through Liquidity Hub instead — giving users better rates at no extra cost.

## How It Works

1. User initiates a swap on the DEX.
2. DEX fetches a quote from its own router **and** from Liquidity Hub in parallel.
3. If the Liquidity Hub quote is better (higher output amount), execute through Liquidity Hub.
4. If the DEX quote is better, fall back to the normal DEX swap.
5. The user always gets the best available price.

## Distribution

This skill lives in `skills/liquidity-hub-integration/` of the [`orbs-network/spot-ui`](https://github.com/orbs-network/spot-ui) repository.

## Workflow

1. Read [references/01-quickstart.md](references/01-quickstart.md) for install, supported chains, and the minimum integration steps.
2. Read [references/02-sdk.md](references/02-sdk.md) for SDK initialization, quote fetching, price comparison, and swap execution.
3. Read [references/03-swap-flow.md](references/03-swap-flow.md) for the complete swap flow including approval, wrapping, signing, and analytics callbacks.
4. Read [references/04-best-practices.md](references/04-best-practices.md) for error handling, quote freshness, native token wrapping, and debugging.
5. Use [assets/liquidity-hub-example.ts](assets/liquidity-hub-example.ts) as a starting template.

## Guardrails

1. Set the `partner` field to the DEX name (lowercase, e.g. `"myDex"`).
2. Only install `@orbs-network/liquidity-hub-sdk`. No other Orbs packages needed.
3. Never skip the price comparison — always compare Liquidity Hub quote against the DEX quote and use whichever is better.
4. Always check quote freshness with `isFreshQuote` before executing a swap.
5. Native tokens (ETH, BNB, MATIC, etc.) must be wrapped before swapping through Liquidity Hub.
6. Report analytics callbacks for all stages (quote, approval, wrap, signature, swap) so the protocol can optimize for your DEX.
