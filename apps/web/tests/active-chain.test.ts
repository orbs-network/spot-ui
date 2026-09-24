import { describe, expect, it, vi } from "vitest";
import { useActiveChainId } from "../lib/hooks/use-active-chain-id";

const state = vi.hoisted(() => ({
  connectedChain: undefined as number | undefined,
  selectedChain: 56,
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ chainId: state.connectedChain }),
  useChainId: () => state.selectedChain,
}));

describe("active wagmi chain", () => {
  it("follows wagmi's network selection while disconnected", () => {
    state.connectedChain = undefined;
    state.selectedChain = 137;
    expect(useActiveChainId()).toBe(137);
  });
  it("follows the connected wallet, including an unsupported chain", () => {
    state.connectedChain = 999999;
    state.selectedChain = 56;
    expect(useActiveChainId()).toBe(999999);
  });
});
