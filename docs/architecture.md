# Spot package architecture

`spot-ui` owns protocol and execution behavior. `spot-react` adapts that behavior
to React and a provider-scoped Zustand store. `apps/web` owns wallet integration,
partner discovery, selectors, routing, and presentation.

## SDK: packages/spot-ui/src

| Folder | Responsibility |
| --- | --- |
| `client` | Client composition and the public client contract |
| `config` | Order-sink config transport, validation, and config types |
| `orders` | Order preparation, submission, cancellation requests, and metrics |
| `execution` | Wallet adapter contract, execution workflow, observers, and state machine |
| `history/current` | Current API transport and separate normalization |
| `history/legacy` | Legacy subgraph transport, normalization, and bundled deployments |
| `order-form` | Synchronous form calculations and validation |
| `analytics` | Client-owned events, private payload state, and delivery |
| `contracts` | Protocol types and bundled ABIs |
| `shared` | Addresses, numbers, time, errors, and common primitives |

`createClient` composes the transport and order helpers. The config fetcher
validates the response before client creation initializes analytics. Preparation
and normalization do not fetch data. Nonce generation is owned by each client's
order preparer.

`executeOrder` works without React or Zustand. Pass a wallet adapter and an
execution controller. `createExecutionController()` owns state directly, or can
bind to a host store through synchronous `get` and `set` functions. The same
controller backs React. Callbacks are observational: failures in callbacks do
not change the transaction result. Optional cache callbacks let a host update
history after submission.

Execution snapshots form a discriminated union. Idle has no execution ID;
active and terminal phases have one; success requires an order ID; failure and
rejection require both the original error and its parsed presentation. The
controller rejects duplicate starts, stale writes, and invalid phase transitions.

## React: packages/spot-react/src

| Folder | Responsibility |
| --- | --- |
| `provider` | Public provider, unified trading context, lifecycle composition, errors |
| `store` | Store creation, local state/actions, SDK controller binding, and selectors |
| `client` | Client resource lifecycle and read/configure hooks |
| `form` | Form defaults, synchronization, calculated context, and field hooks |
| `execution` | Execution presentation hooks |
| `history` | History resource, loaders, cache commands, selectors, and hooks |
| `cancellation` | Wallet command and history synchronization |

One provider creates one store. Small local actions live directly in
`store/create-store.ts`, with a shared form-reset helper and the SDK execution
controller. Client loading and history polling remain separate resource modules
because they own request deduplication, retries, and cleanup. There is one form-default type, with
`InitialState` retained as a public alias. Resource setup mounts once through
`SpotResources`; public hooks subscribe to existing resources. History consumers
share requests and polling. The last consumer stops polling and aborts its
request. Account/chain changes invalidate stale resource results.

Use `history/resource-hooks.ts` for history commands needed by execution and
cancellation. Keep categorization and structural sharing in `selectors.ts`;
loading and observer notifications belong in `load-history.ts`.

## Imports, metadata, and compatibility

- Consumers import from the package root. Root exports are explicit. Internal
  files import their owning modules, never their own package barrel.
- React consumes only the SDK root. The SDK must not import React, Zustand, the
  React package, or web application files.
- Network requests belong in SDK config/history/order transports or analytics.
  The web application's GitHub config request supplies only its partner picker.
- Pass UI metadata with `createClient(partner, chainId, { uiVersion })`. The React
  client loader supplies its package version. Importing `spot-react` no longer
  mutates global analytics metadata.
- `client.analytics` exposes event methods. Timers and mutable event data are
  private. The deprecated singleton and `setUIVersion` remain available for
  compatibility; the setter applies only to that singleton.
- Existing package-root export names remain available. Consumers constructing
  execution snapshots must now provide the fields required by their phase.
  Internal source paths have moved and are not package exports.

## Verification

`pnpm check:architecture` checks package imports, explicit exports, test isolation,
and network boundaries. Both package builds run it. `pnpm test:spot` runs these
checks plus both test suites. Feature tests live beside their implementation;
package-wide integration tests remain in `tests/`. Production TypeScript and
bundled declarations exclude test files. React unit tests resolve the SDK's
public root to workspace source, while web dist typechecking/builds validate
published-artifact consumption.

After changing a public contract, run:

```sh
pnpm test:spot
pnpm typecheck:dist
pnpm typecheck:skills
pnpm --filter web test
pnpm --filter web lint
pnpm build:web
```
