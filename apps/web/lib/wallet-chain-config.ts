import type { Chain } from "viem";
import type { Config } from "wagmi";

/**
 * Give RainbowKit a scoped chain list without creating another wallet store.
 * Forward live getters and methods to the original config: spreading it would
 * freeze state/connectors at the time of the copy and break wallet updates.
 * An empty UI list is intentional while support is unknown or unavailable;
 * the underlying wagmi config still has its complete, non-empty chain list.
 */
export function scopeWalletChains(config: Config, chains: readonly Chain[]): Config {
  return new Proxy(config, {
    get(target, property) {
      return property === "chains" ? chains : Reflect.get(target, property, target);
    },
  });
}
