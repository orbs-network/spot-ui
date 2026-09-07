# Spot Monorepo

A monorepo containing the Spot SDK, UI components, and a demo web application.

## Packages

| Package | Description | Published |
|---------|-------------|-----------|
| `@orbs-network/spot-ui` | Order building, config, types, submit, analytics (framework-agnostic) | ✅ npm |
| `@orbs-network/spot-react` | Headless React provider and hooks consuming spot-ui | ✅ npm |
| `web` | Next.js app integrating spot-react (SpotProvider, SpotForm, orders) | ❌ Private |

## Getting Started
### Prerequisites



- Node.js 18+
- pnpm 9+

### Installation

```bash
pnpm install
```

### Development

Build all packages:

```bash
pnpm build
```

Run the web app for local testing:

```bash
pnpm dev
```

### Building Individual Packages

```bash
pnpm build:spot-ui     # Build the framework-neutral SDK
pnpm build:spot-react  # Build the React provider and hooks
```

## Integrating Liquidity Hub in React

Install the framework-agnostic Liquidity Hub SDK in the React application:

```bash
npm install @orbs-network/liquidity-hub-sdk @tanstack/react-query
```

Create one SDK client per active chain, request a Liquidity Hub quote alongside the DEX quote, and compare their minimum output amounts. If Liquidity Hub wins, wrap native input when necessary, approve Permit2, sign the quote's EIP-712 data, and call `sdk.swap`. If the DEX route wins or the Liquidity Hub request fails, keep the existing DEX swap as the fallback.

The complete guide uses exactly two source files: a TypeScript SDK/execution module and a React module with TanStack Query's `useQuery` and `useMutation`. It is available in the [`@orbs-network/liquidity-hub-sdk` README](packages/liquidity-hub-ui/README.md#react-integration).

## Publishing to npm

Before publishing, make sure you're logged in to npm:

```bash
npm login
```

Then publish the packages:

```bash
pnpm publish:packages
```

Or publish individually:

```bash
cd packages/spot && pnpm publish --access public
cd packages/spot-ui && pnpm publish --access public
```

## Skills

| Skill | Description |
|-------|-------------|
| [`spot-react-integration`](skills/spot-react-integration/SKILL.md) | Integrating `@orbs-network/spot-react` into a DEX frontend. Covers SpotProvider setup, hook-driven panels, order submission, and DEX-native styling. |
| [`liquidity-hub-integration`](skills/liquidity-hub-integration/SKILL.md) | Integrating `@orbs-network/liquidity-hub-sdk` into a DEX. Routes swaps through Liquidity Hub for better prices via on-chain and off-chain solvers. |

## Project Structure

```
├── apps/
│   └── web/                    # Next.js app (SpotProvider, SpotForm, orders)
├── packages/
│   ├── spot-ui/                # @orbs-network/spot-ui (order config fetch, build, submit)
│   ├── spot-react/             # @orbs-network/spot-react (context, hooks, components)
│   └── liquidity-hub-ui/      # @orbs-network/liquidity-hub-sdk
├── skills/
│   └── spot-react-integration/ # AI-agent integration skill
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

## Package Dependencies

```
web
 └── spot-react (SpotProvider and focused React hooks)
      └── spot-ui (client initialization, order preparation, submission, history)
```

## Order Signatures

`walletInteractions.signOrder` must return the wallet's original `0x`-prefixed EIP-712 signature. `spot-react` forwards that value unchanged to `spot-ui` and the order submission request. Do not split the signature into `{ v, r, s }`, rewrite `v`, or normalize its byte representation.

## RePermit Configuration

`@orbs-network/spot-react` initializes a `@orbs-network/spot-ui` client as soon as the `partner` and `chainId` are available. Client and history state are scoped to each `SpotProvider`; no host query provider is required. The framework-neutral `createClient(partner, chainId)` factory performs a fresh RePermit request on every call and retains no global state, so Vue, Angular, Svelte, vanilla JavaScript, and server consumers can apply their own cache and refresh policy.

The client owns the configuration-derived spender, exchange, signing payload, approval/cancellation requests, submission, and configured order history. Pure calculations remain package-level functions. The `calculateOrderForm` helper accepts raw DEX form state and produces defaults, prices, trades, schedules, validation, raw/token-formatted/USD values, and the execution values shared by order construction and React displays. Form calculation is time-independent; `prepareOrder` assigns the exact start and deadline immediately before signing. A missing client represents initialization loading; after automatic retries, `SpotProvider` keeps the host form mounted and renders a retryable, host-customizable `clientErrorFallback` alongside it.

The client rejects configurations whose domain or order chain differs from the requested chain, and rejects malformed or zero RePermit and exchange-adapter addresses. `domain.verifyingContract` is used as the ERC-20 approval spender and v2 cancellation contract; the returned adapter, reactor, and executor are used for v2 orders. The endpoint remains security-critical because the SDK does not independently verify deployed bytecode or contract identity, so it must be served by the trusted Orbs service over TLS.

## License

MIT
