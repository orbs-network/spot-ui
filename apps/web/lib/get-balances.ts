import { erc20Abi, zeroAddress, type Address } from "viem";
import { getPublicClient } from "./get-public-client";
import { isNativeAddress } from "./utils";
import type { Balances } from "./types";

export const getBalances = async (
  chainId: number,
  address: string,
  tokens: string[]
): Promise<Balances> => {
  const tokensWithoutNative = tokens.filter((token) => !isNativeAddress(token));
  try {
    const publicClient = getPublicClient(chainId);
    const balances = await publicClient.multicall({
      contracts: tokensWithoutNative.map((token) => ({
        address: token as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as Address],
      })),
    });
    const nativeBalance = await publicClient.getBalance({
      address: address as `0x${string}`,
    });

    const result: Balances = {};
    // Mutate this local accumulator once per token instead of copying it per result.
    tokensWithoutNative.forEach((token, index) => {
      result[token] = balances[index]?.result?.toString() ?? "0";
    });

    return {
      ...result,
      [zeroAddress]: nativeBalance.toString(),
    };
  } catch (error) {
    console.error("Error fetching balances:", error);
    throw error;
  }
};
