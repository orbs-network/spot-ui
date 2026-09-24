import { describe, expect, it } from "vitest";
import { createConfig, http } from "wagmi";
import { bsc, mainnet, polygon } from "viem/chains";
import { scopeWalletChains } from "../lib/wallet-chain-config";

const createWalletConfig = () => createConfig({
  chains: [mainnet, bsc, polygon],
  transports: { [mainnet.id]: http(), [bsc.id]: http(), [polygon.id]: http() },
  ssr: true,
  storage: null,
});

describe("partner-scoped wallet config", () => {
  it("changes choices without mutating the base config or replacing wallet resources", () => {
    const base = createWalletConfig();
    const thena = scopeWalletChains(base, [bsc]);
    const quick = scopeWalletChains(base, [polygon]);
    expect(thena.chains).toEqual([bsc]);
    expect(quick.chains).toEqual([polygon]);
    expect(base.chains).toEqual([mainnet, bsc, polygon]);
    expect(thena.connectors).toBe(base.connectors);
    expect(thena.subscribe).toBe(base.subscribe);
    expect(thena.getClient()).toBe(base.getClient());
    expect(quick.getClient()).toBe(base.getClient());
  });

  it("keeps state live in every view when the wallet network changes", () => {
    const base = createWalletConfig();
    const thena = scopeWalletChains(base, [bsc]);
    const quick = scopeWalletChains(base, [polygon]);
    base.setState(state => ({ ...state, chainId: bsc.id }));
    expect(thena.state).toBe(base.state);
    expect(quick.state.chainId).toBe(bsc.id);
    quick.setState(state => ({ ...state, chainId: polygon.id }));
    expect(base.state.chainId).toBe(polygon.id);
    expect(thena.state.chainId).toBe(polygon.id);
  });

  it("offers no choices when partner support is unavailable", () => {
    const base = createWalletConfig();
    const scoped = scopeWalletChains(base, []);
    expect(scoped.chains).toEqual([]);
    expect(scoped.state).toBe(base.state);
    expect(base.chains).toHaveLength(3);
    expect(scoped.getClient()).toBe(base.getClient());
  });
});
