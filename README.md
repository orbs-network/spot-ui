# Spot Monorepo

A monorepo containing the Spot SDK, UI components, and a demo web application.

## Packages

| Package | Description | Published |
|---------|-------------|-----------|
| `spot` | Core SDK for event tracking | ✅ npm |
| `spot-ui` | React components consuming the Spot SDK | ✅ npm |
| `web` | Next.js demo app for local testing | ❌ Private |

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
│   └── web/              # Next.js demo app (private)
├── packages/
│   ├── spot/             # Core SDK (published)
│   └── spot-ui/          # React components (published)
├── package.json          # Root package.json
├── pnpm-workspace.yaml   # Workspace configuration
└── tsconfig.json         # Root TypeScript config
```

## Package Dependencies

```
web (Next.js app)
 └── spot-ui (React components)
      └── spot (Core SDK)
```

## License

MIT

