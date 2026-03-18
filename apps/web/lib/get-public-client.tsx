import { createPublicClient, http } from 'viem';
import * as chains from 'viem/chains';
import { katanaChain } from './chains';

const customChains = [katanaChain];

export function getPublicClient(chainId: number) {
  const chain = customChains.find((c) => c.id === chainId) ??
    Object.values(chains).find((chain) => chain.id === chainId);

  return createPublicClient({
    chain,
    transport: http(`${process.env.RPC_URL}?chainId=${chainId}&appId=twap-ui`),
  });
}
