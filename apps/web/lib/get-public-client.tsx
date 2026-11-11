import { createPublicClient, http } from 'viem';
import { getChain } from './chains';
import { getRpcUrl } from './get-rpc-url';

export function getPublicClient(chainId: number) {
  const chain = getChain(chainId);

  return createPublicClient({
    chain,
    transport: http(getRpcUrl(chainId)),
  });
}
