# Order Sink Integration

This guide is for teams that want to create Spot orders from any application or service.
The integration has three core steps:

1. Build a RePermit EIP-712 order with `buildRePermitOrderData`.
2. Ask the user, wallet, or custody system to sign that EIP-712 typed data.
3. Submit the signed order to Order Sink with `submitOrder`, or POST the same payload directly.

## Concepts

| Term | Meaning |
| --- | --- |
| Order Sink | Off-chain service that accepts signed RePermit orders and exposes them through the V2 orders API. |
| RePermit | On-chain contract used for token authorization and cancellation. Users approve this contract to spend the source token. |
| Reactor | Contract encoded as the signed permit `spender`. It is part of the signed order and is not the ERC-20 allowance spender. |
| Swapper | User address that owns the order. This must be the EIP-712 signer and is stored at `order.witness.swapper`. |
| RePermit digest | Order cancellation digest returned by Order Sink as `metadata.repermitDigest`. This is passed to the RePermit `cancel(bytes32[])` function. |

## Function Contracts

This document describes the behavior of two functions. Your implementation can be in Java, Python, TypeScript, Go, or any other stack.

`buildRePermitOrderData(...)` builds the EIP-712 payload the user signs. It returns:

| Field | Purpose |
| --- | --- |
| `domain` | EIP-712 domain. Uses `name: "RePermit"`, `version: "1"`, the order chain ID, and the RePermit contract as `verifyingContract`. |
| `types` | EIP-712 type definitions for the RePermit witness order. |
| `primaryType` | Always `"RePermitWitnessTransferFrom"`. |
| `order` | The message the user signs and the same order object later sent to Order Sink. |

`submitOrder(order, signature)` sends the signed order to Order Sink. It posts:

```json
{
  "signature": { "v": "0x1b", "r": "0x...", "s": "0x..." },
  "order": { "...": "the signed RePermitOrder" },
  "status": "pending"
}
```

Your integration must know the RePermit contract, reactor, executor, exchange adapter, and fee reference addresses for the relevant partner and chain.

## Prerequisites

Before signing and submitting:

- The user must be on the same `chainId` used in the order.
- Token amounts must be integer decimal strings in token base units, not human-readable decimals. For example, `1.5` tokens with 18 decimals is `"1500000000000000000"`.
- The signed source token must be an ERC-20 address. If the user starts with a native asset, wrap it first and use the wrapped token address in the signed order.
- The user must approve the signed source token for the RePermit contract with allowance at least `order.permitted.amount`.
- Do not confuse token allowance with the signed permit spender: ERC-20 allowance is granted to the RePermit contract, while `order.spender` is the reactor.
- The EIP-712 signer must match `order.witness.swapper`.

## Build the Order

`buildRePermitOrderData` should return the EIP-712 payload the user signs:

```json
{
  "domain": {
    "name": "RePermit",
    "version": "1",
    "chainId": 137,
    "verifyingContract": "0xRePermit..."
  },
  "types": { "...": "see EIP-712 Types below" },
  "primaryType": "RePermitWitnessTransferFrom",
  "order": {
    "permitted": {
      "token": "0xSourceToken...",
      "amount": "1000000000000000000"
    },
    "spender": "0xReactor...",
    "nonce": "1785273600000",
    "deadline": "1785878400",
    "witness": {
      "reactor": "0xReactor...",
      "executor": "0xExecutor...",
      "exchange": {
        "adapter": "0xAdapter...",
        "ref": "0xFeeReference...",
        "share": 0,
        "data": "0x"
      },
      "swapper": "0xUserAddress...",
      "nonce": "1785273600000",
      "start": "1785273600",
      "deadline": "1785878400",
      "chainid": 137,
      "exclusivity": 0,
      "epoch": 300,
      "slippage": 50,
      "freshness": 60,
      "input": {
        "token": "0xSourceToken...",
        "amount": "250000000000000000",
        "maxAmount": "1000000000000000000"
      },
      "output": {
        "token": "0xDestinationToken...",
        "limit": "120000000",
        "triggerLower": "0",
        "triggerUpper": "0",
        "recipient": "0xUserAddress..."
      }
    }
  }
}
```

Do not mutate `order`, `domain`, `types`, or `primaryType` after signing. Any field change changes the signed digest.

## Signed Values

The user does not sign the builder input object. The user signs the EIP-712 payload returned by `buildRePermitOrderData`: `domain`, `types`, `primaryType`, and `order`.

Signed domain values:

| Signed value | Meaning |
| --- | --- |
| `domain.name` | Constant: `"RePermit"`. |
| `domain.version` | Constant: `"1"`. |
| `domain.chainId` | The chain where the order is valid. |
| `domain.verifyingContract` | The RePermit contract address. |

Signed order values:

| Signed value | Meaning |
| --- | --- |
| `order.permitted` | Source token and total permitted source amount. |
| `order.spender` | Reactor address. |
| `order.nonce` | Generated unique permit nonce. |
| `order.deadline` | Order expiry in Unix seconds. |
| `order.witness` | Full Spot order details: reactor, executor, exchange metadata, swapper, timing, chain, slippage, input token/amounts, output token/limits/triggers, and recipient. |

## Generated Order Fields

The returned `order` is a `RePermitOrder`. This is the object signed by the user and later sent to Order Sink as the `order` field.

| Field | Description |
| --- | --- |
| `permitted.token` | Source ERC-20 token address that RePermit is allowed to transfer. If the user started with a native asset, this should be the wrapped token address. |
| `permitted.amount` | Total source token amount authorized by the signed permit, in source-token base units. |
| `spender` | Reactor address allowed to spend the permitted tokens through RePermit. This is not the ERC-20 allowance spender; ERC-20 allowance is granted to the RePermit contract. |
| `nonce` | Unique permit nonce as a decimal string. The builder currently uses the current Unix time in milliseconds. It prevents two otherwise identical orders from sharing the same permit digest. |
| `deadline` | Permit and order expiry time as a Unix timestamp in seconds, serialized as a decimal string. After this time the order should not execute. |

### Witness Fields

`witness` is the Spot-specific order data attached to the RePermit signature. The user signs it together with `permitted`, `spender`, `nonce`, and `deadline`.

| Field | Description |
| --- | --- |
| `witness.reactor` | Reactor contract address. The reactor is the contract that validates and processes the order. |
| `witness.executor` | Executor address authorized for order execution. |
| `witness.exchange.adapter` | Exchange adapter address. This tells the execution system which adapter/integration should be used for routing fills. |
| `witness.exchange.ref` | Fee or referral reference address. It is part of the signed exchange metadata. |
| `witness.exchange.share` | Fee share encoded in the signed exchange metadata. The current builder sets this to `0`. |
| `witness.exchange.data` | Extra adapter data bytes. The current builder sets this to `"0x"`, meaning no additional adapter data. |
| `witness.swapper` | User address that owns the order. This must match the EIP-712 signer. |
| `witness.nonce` | Same nonce value as top-level `nonce`. Keeping both values equal ties the Spot witness to the RePermit permit. |
| `witness.start` | Earliest order start time as a Unix timestamp in seconds, serialized as a decimal string. The current builder uses the current time when the order is built. |
| `witness.deadline` | Same expiry timestamp as top-level `deadline`, in seconds as a decimal string. |
| `witness.chainid` | EVM chain ID where the order is valid. This must match the EIP-712 domain chain. |
| `witness.exclusivity` | Exclusivity setting for execution. The current builder sets this to `0`. |
| `witness.epoch` | Minimum delay between fills, in seconds. For a one-fill order this is usually `0`. |
| `witness.slippage` | Slippage tolerance in basis points. For example, `50` means `0.5%` and `100` means `1%`. |
| `witness.freshness` | Quote/oracle freshness window in seconds. Defaults to `60` unless Orbs explicitly gives the integration a different value. |
| `witness.input.token` | Source token address for each fill. This should match `permitted.token`. |
| `witness.input.amount` | Source amount per fill/chunk, in source-token base units. |
| `witness.input.maxAmount` | Maximum total source amount the order may consume, in source-token base units. This should match `permitted.amount`. |
| `witness.output.token` | Destination token address the user wants to receive. |
| `witness.output.limit` | Minimum destination amount required per fill, in destination-token base units. Use `"0"` for market-style execution. |
| `witness.output.triggerLower` | Stop-loss trigger amount, in destination-token base units. It is non-zero only for stop-loss orders; otherwise it is `"0"`. |
| `witness.output.triggerUpper` | Take-profit trigger amount, in destination-token base units. It is non-zero only for take-profit orders; otherwise it is `"0"`. |
| `witness.output.recipient` | Address that receives the destination tokens. |

### Output Limit And Trigger Rules

The builder reduces limit and trigger intent into three signed output fields:

| Signed field | Rule |
| --- | --- |
| `witness.output.limit` | Minimum destination amount per fill, in destination-token base units. If no limit is required, sign `"0"`. |
| `witness.output.triggerLower` | Stop-loss trigger threshold. For stop-loss orders, sign the trigger amount here. For all other orders, sign `"0"`. |
| `witness.output.triggerUpper` | Take-profit trigger threshold. For take-profit orders, sign the trigger amount here. For all other orders, sign `"0"`. |

Only the final signed fields above are part of the order. There are no additional order-type or helper trigger fields in the EIP-712 message or in the Order Sink request body.

When serializing these values, use plain integer decimal strings. Avoid scientific notation, decimal points, or locale formatting.

## EIP-712 Types

Use these exact EIP-712 type definitions when signing:

```json
{
  "RePermitWitnessTransferFrom": [
    { "name": "permitted", "type": "TokenPermissions" },
    { "name": "spender", "type": "address" },
    { "name": "nonce", "type": "uint256" },
    { "name": "deadline", "type": "uint256" },
    { "name": "witness", "type": "Order" }
  ],
  "Exchange": [
    { "name": "adapter", "type": "address" },
    { "name": "ref", "type": "address" },
    { "name": "share", "type": "uint32" },
    { "name": "data", "type": "bytes" }
  ],
  "Input": [
    { "name": "token", "type": "address" },
    { "name": "amount", "type": "uint256" },
    { "name": "maxAmount", "type": "uint256" }
  ],
  "Order": [
    { "name": "reactor", "type": "address" },
    { "name": "executor", "type": "address" },
    { "name": "exchange", "type": "Exchange" },
    { "name": "swapper", "type": "address" },
    { "name": "nonce", "type": "uint256" },
    { "name": "start", "type": "uint256" },
    { "name": "deadline", "type": "uint256" },
    { "name": "chainid", "type": "uint256" },
    { "name": "exclusivity", "type": "uint32" },
    { "name": "epoch", "type": "uint32" },
    { "name": "slippage", "type": "uint32" },
    { "name": "freshness", "type": "uint32" },
    { "name": "input", "type": "Input" },
    { "name": "output", "type": "Output" }
  ],
  "Output": [
    { "name": "token", "type": "address" },
    { "name": "limit", "type": "uint256" },
    { "name": "triggerLower", "type": "uint256" },
    { "name": "triggerUpper", "type": "uint256" },
    { "name": "recipient", "type": "address" }
  ],
  "TokenPermissions": [
    { "name": "token", "type": "address" },
    { "name": "amount", "type": "uint256" }
  ]
}
```

## Sign the EIP-712 Data

The user signs the returned EIP-712 payload with their wallet, custody system, or signing service:

```json
{
  "domain": { "...": "domain returned by buildRePermitOrderData" },
  "types": { "...": "types returned by buildRePermitOrderData" },
  "primaryType": "RePermitWitnessTransferFrom",
  "message": { "...": "order returned by buildRePermitOrderData" }
}
```

The signed message must be exactly `order`, using the returned `domain`, `types`, and `primaryType`. The signer address must match `order.witness.swapper`.

Order Sink expects the signature as `{ v, r, s }`, not as a single signature string. If your signing library already returns those components, use them directly. Otherwise split the hex signature:

```text
standard 65-byte hex signature:
  r = first 32 bytes
  s = next 32 bytes
  v = final byte, encoded as hex such as "0x1b" or "0x1c"

compact EIP-2098 64-byte hex signature:
  r = first 32 bytes
  recover v from the high bit of s
  clear the high bit from s before sending it
```

## Submit to Order Sink

`submitOrder(order, signature)` sends:

```json
{
  "signature": { "v": "0x1b", "r": "0x...", "s": "0x..." },
  "order": { "...": "the signed RePermitOrder" },
  "status": "pending"
}
```

Implement `submitOrder` as an HTTP POST:

```text
POST https://order-sink-v2.orbs.network/orders/new
Content-Type: application/json
Accept: application/json

{
  "signature": { "v": "0x1b", "r": "0x...", "s": "0x..." },
  "order": { "...": "the signed RePermitOrder" },
  "status": "pending"
}
```

A successful response contains `success: true` and a `signedOrder` object. Treat non-2xx responses, `success: false`, or a missing `signedOrder` as submission failures.

Successful response shape:

```json
{
  "success": true,
  "signedOrder": {
    "hash": "0xOrderHash...",
    "order": { "...": "RePermitOrder" },
    "signature": "0x...",
    "timestamp": "2026-08-04T12:00:00.000Z",
    "metadata": {
      "status": "pending",
      "repermitDigest": "0xPermitDigest..."
    }
  }
}
```

Submit flow:

1. Build the EIP-712 payload.
2. Get the user signature over exactly that payload.
3. Split the signature into `{ v, r, s }` if needed.
4. POST `{ signature, order, status: "pending" }` to `/orders/new`.
5. Store the returned `signedOrder.hash` for tracking.
6. Store `signedOrder.metadata.repermitDigest` if present; this is the value used for cancellation.
7. Fetch the order from the V2 orders endpoint when you need the latest status, fills, or cancellation digest.

Order submission is not an on-chain transaction from the user. The user signs off-chain EIP-712 data, and Order Sink stores the signed order for execution.

## Fetch V2 Order Sink Orders

Fetch only V2 RePermit orders from Order Sink with the swapper address and chain ID. The `swapper` query value is the order owner address, matching `order.witness.swapper`.

```text
GET https://order-sink-v2.orbs.network/orders?swapper=0xUserAddress...&chainId=137
Accept: application/json
```

If your integration has a specific exchange adapter, include it as an additional filter:

```text
GET https://order-sink-v2.orbs.network/orders?swapper=0xUserAddress...&chainId=137&exchange=0xAdapter...
Accept: application/json
```

Successful responses contain an `orders` array:

```json
{
  "orders": [
    {
      "hash": "0xOrderHash...",
      "order": { "...": "RePermitOrder" },
      "signature": "0x...",
      "timestamp": "2026-08-04T12:00:00.000Z",
      "metadata": {
        "status": "pending",
        "description": "",
        "expectedChunks": 4,
        "repermitDigest": "0xPermitDigest...",
        "chunks": []
      }
    }
  ]
}
```

Important fields for consumers:

| Field | Description |
| --- | --- |
| `hash` | Order Sink order ID/hash. Store this for tracking. |
| `order` | Original signed RePermit order. |
| `metadata.status` | Order Sink status. `"pending"` and `"eligible"` are open states; `"completed"` is filled. |
| `metadata.description` | Additional status description. A cancelled V2 order may be reported as `"cancelled by contract"` after the on-chain cancel is indexed. |
| `metadata.expectedChunks` | Expected number of fills/chunks. |
| `metadata.chunks` | Fill/chunk execution details, when available. |
| `metadata.repermitDigest` | Permit digest required for on-chain cancellation. Store this value. |

The endpoint returns raw Order Sink objects. If you normalize them in your own service, keep the raw `metadata.repermitDigest`; it is needed to cancel the order.

## Cancel V2 Order Sink Orders

Cancelling a V2 RePermit order is an on-chain transaction. Do not send a cancel request to Order Sink and do not use a V1/TWAP cancel flow. Instead, call the RePermit contract from the order owner address.

Contract:

```text
address: RePermit contract
function: cancel(bytes32[] digests)
digests: [metadata.repermitDigest]
```

Minimal ABI fragment:

```json
[
  {
    "type": "function",
    "name": "cancel",
    "inputs": [
      {
        "name": "digests",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
]
```

Cancellation flow:

1. Fetch the V2 order from `https://order-sink-v2.orbs.network/orders`.
2. Read `metadata.repermitDigest`.
3. Ask the user or custody system to send a transaction to the RePermit contract.
4. Call `cancel([metadata.repermitDigest])`. Use `metadata.repermitDigest`, not the Order Sink `hash`.
5. Wait for the transaction receipt.
6. Refetch the same V2 Order Sink endpoint until metadata reflects the cancelled state.

The transaction sender should be the same address that signed the original order. In the signed order this is `order.witness.swapper`.

## Operational Checklist

- Build the order close to signing time so `nonce`, `start`, and `deadline` are fresh.
- Use the exact same `order` object for signing and submission.
- Confirm allowance owner is the signer, spender is the RePermit contract, and allowance is at least `order.permitted.amount`.
- Confirm `witness.swapper` and the EIP-712 signer are the same address.
- Confirm all amounts are integer base-unit strings.
- Confirm `deadline` is in the future and `chainId` matches the connected chain.
- Store the returned order ID/hash from Order Sink for tracking and cancellation flows.
- Store `metadata.repermitDigest` from fetched orders; it is the digest passed to `cancel(bytes32[])`.
