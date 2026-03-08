# Spot Monorepo

A monorepo containing the Spot SDK, UI components, and a demo web application.

## Packages

| Package | Description | Published |
|---------|-------------|-----------|
| `@orbs-network/spot-ui` | Order building, config, types, submit, analytics (framework-agnostic) | ✅ npm |
| `@orbs-network/spot-react` | React context, hooks, and UI (SubmitOrderPanel, Orders) consuming spot-ui | ✅ npm |
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
pnpm dev:web
```

### Building Individual Packages

```bash
pnpm build:spot     # Build spot SDK
pnpm build:spot-ui  # Build spot-ui components
```

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

## Project Structure

```
├── apps/
│   └── web/                    # Next.js app (SpotProvider, SpotForm, orders)
├── packages/
│   ├── spot-ui/                # @orbs-network/spot-ui (config, order build, submit)
│   ├── spot-react/             # @orbs-network/spot-react (context, hooks, components)
│   └── liquidity-hub-ui/      # @orbs-network/liquidity-hub-sdk
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

## Package Dependencies

```
web
 └── spot-react (SpotProvider, useSubmitOrderPanel, Components.SubmitOrderPanel, Orders)
      └── spot-ui (getConfig, buildRePermitOrderData, submitOrder, types)
```

## License

MIT

