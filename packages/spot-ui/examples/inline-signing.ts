import type {
  Address,
  Eip712TypedData,
  Hex,
  Order,
  PrepareOrderParams,
  PrepareSwapParams,
  SpotClient,
} from "@orbs-network/spot-ui";

/** Use the equivalent typed-data signing method from the host's wallet library. */
export interface InlineWalletClient {
  signTypedData(params: Eip712TypedData & { account: Address }): Promise<Hex>;
}

interface InlineSigningHost {
  client: SpotClient;
  walletClient: InlineWalletClient;
}

/**
 * Before calling, the host confirms any native wrap and sufficient allowance to
 * client.spenderAddress, and validates the reviewed account and chain.
 * Preparation occurs immediately before the inline wallet signing call.
 */
export async function submitAdvancedOrderInline({
  client, walletClient, signal, ...params
}: InlineSigningHost & PrepareOrderParams & { signal?: AbortSignal }): Promise<Order> {
  signal?.throwIfAborted();
  const prepared = client.prepareOrder(params);
  const { signerAddress, typedData } = prepared.signingRequest;
  const signature = await walletClient.signTypedData({
    ...typedData,
    account: signerAddress,
  });
  return client.submitOrder(prepared.order, signature, { signal });
}

/** Same host-owned wallet flow, using a reviewed quote and its protected minimum. */
export async function submitSwapInline({
  client, walletClient, ...params
}: InlineSigningHost & PrepareSwapParams): Promise<Order> {
  const prepared = await client.prepareSwap(params);
  params.signal?.throwIfAborted();
  const { signerAddress, typedData } = prepared.signingRequest;
  const signature = await walletClient.signTypedData({
    ...typedData,
    account: signerAddress,
  });
  return client.submitSwap(prepared.order, signature, { signal: params.signal });
}

// These functions return acceptance, including for swaps. Inspect fills through
// client.getOrder({ orderId: accepted.id }); the host owns further status polling.
// Abort the supplied signal when the reviewed wallet or intent changes.
// Preserve the exact order and original signature if a POST response is lost;
// reconcile that intent in history before creating a replacement or fallback.
