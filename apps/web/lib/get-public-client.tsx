import { createPublicClient, http } from 'viem';
import { getChain } from './chains';

export function getPublicClient(chainId: number) {
  const chain = getChain(chainId);

  return createPublicClient({
    chain,
    transport: http(`${process.env.RPC_URL}?chainId=${chainId}&appId=twap-ui`),
  });
}
