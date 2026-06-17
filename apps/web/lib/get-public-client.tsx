import { createPublicClient, http } from 'viem';
import * as chains from 'viem/chains';
import { hyperEvmChain, katanaChain, megaethChain } from './chains';

const customChains = [katanaChain, hyperEvmChain, megaethChain];

export function getPublicClient(chainId: number) {
  const chain = customChains.find((c) => c.id === chainId) ??
    Object.values(chains).find((chain) => chain.id === chainId);

  return createPublicClient({
    chain,
    transport: http(`${process.env.RPC_URL}?chainId=${chainId}&appId=twap-ui`),
  });
}
