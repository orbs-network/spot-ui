import Configs from "@orbs-network/twap/configs.json";
import { Partners, type Config } from "../types";

const getGatewayUrl = (name: string): string =>
  `https://hub.orbs.network/api/private/project_cm7nb67z86nyr01z12gs0fxpf/subgraphs/orbs-twap-${name}/prod/gn`;

const SPARKDEX_LEGACY_ORDERS_API =
  "https://hub.orbs.network/api/private/project_cm7nb67z86nyr01z12gs0fxpf/subgraphs/orbs-twap-flare/prod/gn";
const THE_GRAPH_API = "https://hub.orbs.network/api/apikey/subgraphs/id";

export const THE_GRAPH_ORDERS_API = {
  1: `${THE_GRAPH_API}/Bf7bvMYcJbDAvYWJmhMpHZ4cpFjqzkhK6GXXEpnPRq6`,
  14: SPARKDEX_LEGACY_ORDERS_API,
  56: `${THE_GRAPH_API}/4NfXEi8rreQsnAr4aJ45RLCKgnjcWX46Lbt9SadiCcz6`,
  137: `${THE_GRAPH_API}/3PyRPWSvDnMowGbeBy7aNsvUkD5ZuxdXQw2RdJq4NdXi`,
  146: `${THE_GRAPH_API}/DtBr6a5vsoDd2oAXdPszcn4gLgrr1XC68Q3AJQKXnNLV`,
  250: `${THE_GRAPH_API}/DdRo1pmJkrJC9fjsjEBWnNE1uqrbh7Diz4tVKd7rfupp`,
  388: getGatewayUrl("cronos-zkevm"),
  1329: `${THE_GRAPH_API}/5zjzRnURzoddyFSZBw5E5NAM3oBgPq3NasTYbtMk6EL6`,
  8453: `${THE_GRAPH_API}/DFhaPQb3HATXkpsWNZw3gydYHehLBVEDiSk4iBdZJyps`,
  42161: `${THE_GRAPH_API}/83bpQexEaqBjHaQbKoFTbtvCXuo5RudRkfLgtRUYqo2c`,
  43114: `${THE_GRAPH_API}/FxZ1vMwE5Xy1qvKvZENUMz4vhW8Sh4vXJf9Vp7o17pTx`,
  59144: `${THE_GRAPH_API}/6VsNPEYfFLPZCqdMMDadoXQjLHWJdjEwiD768GAtb7j6`,
  80094: getGatewayUrl("berachain"),
  747474: `${THE_GRAPH_API}/CGi9sDFMQcnBwF3C3NoCFqnaE34sssbgwPLTwiskSXmW`,
};

const getPartnerIdentifier = (config: Config): string =>
  `${config.name}_${config.chainId}`;

const LEGACY_EXCHANGES_BY_CONFIG: Record<string, string[]> = {
  [getPartnerIdentifier(Configs.SushiArb)]: [
    "0x846F2B29ef314bF3D667981b4ffdADc5B858312a",
    "0x08c41f5D1C844061f6D952E25827eeAA576c6536",
  ],
  [getPartnerIdentifier(Configs.SushiBase)]: [
    "0x846F2B29ef314bF3D667981b4ffdADc5B858312a",
    "0x08c41f5D1C844061f6D952E25827eeAA576c6536",
  ],
  [getPartnerIdentifier(Configs.SushiEth)]: [
    "0xc55943Fa6509004B2903ED8F8ab7347BfC47D0bA",
    "0x08c41f5D1C844061f6D952E25827eeAA576c6536",
  ],
  [getPartnerIdentifier(Configs.PancakeSwap)]: [
    "0xb2BAFe188faD927240038cC4FfF2d771d8A58905",
    "0xE2a0c3b9aD19A18c4bBa7fffBe5bC1b0E58Db1CE",
  ],
  [getPartnerIdentifier(Configs.PancakeSwapArbitrum)]: [
    "0xE20167871dB616DdfFD0Fd870d9bC068C350DD1F",
    "0x807488ADAD033e95C438F998277bE654152594dc",
  ],
  [getPartnerIdentifier(Configs.PancakeSwapBase)]: [
    "0x10ed1F36e4eBE76E161c9AADDa20BE841bc0082c",
    "0x3A9df3eE209b802D0337383f5abCe3204d623588",
  ],
  [getPartnerIdentifier(Configs.PancakeSwapLinea)]: [
    "0x3A9df3eE209b802D0337383f5abCe3204d623588",
  ],
  [getPartnerIdentifier(Configs.QuickSwap)]: [
    "0x26D0ec4Be402BCE03AAa8aAf0CF67e9428ba54eF",
  ],
  [getPartnerIdentifier(Configs.Thena)]: [
    "0xc2aBC02acd77Bb2407efA22348dA9afC8B375290",
  ],
  [getPartnerIdentifier(Configs.Lynex)]: [
    "0x72e3e1fD5D2Ee2F1C2Eb695206D490a1D45C3835",
  ],
  [getPartnerIdentifier(Configs.DragonSwap)]: [
    "0x101e1B65Bb516FB5f4547C80BAe0b51f1b8D7a22",
  ],
  [getPartnerIdentifier(Configs.SpookySwapSonic)]: [
    "0xAd97B770ad64aE47fc7d64B3bD820dCDbF9ff7DA",
  ],
  [getPartnerIdentifier(Configs.SpookySwap)]: [
    "0x3924d62219483015f982b160d48c0fa5Fd436Cba",
  ],
  [getPartnerIdentifier(Configs.SwapX)]: [
    "0xE5012eBDe5e26EE3Ea41992154731a03023CF274",
  ],
  [getPartnerIdentifier(Configs.SushiKatana)]: [
    "0x92209481507e6B2d14C9b5b70Ed287024177220E",
  ],
  [getPartnerIdentifier(Configs.SparkDEX)]: [
    "0xe59c53C76bB7EEc01401A18fA8215B94bC65Bf56",
  ],
};

export const getLegacyExchanges = (config: Config): string[] =>
  LEGACY_EXCHANGES_BY_CONFIG[getPartnerIdentifier(config)] ?? [];

const indexTwapConfigsByChain = (
  configs: Config[],
): ReadonlyMap<number, Config> =>
  new Map(configs.map((config) => [config.chainId, config]));

const LEGACY_TWAP_CONFIGS_BY_SPOT_PARTNER: Partial<
  Record<Partners, ReadonlyMap<number, Config>>
> = {
  [Partners.Pancake]: indexTwapConfigsByChain([
    Configs.PancakeSwap,
    Configs.PancakeSwapArbitrum,
    Configs.PancakeSwapBase,
    Configs.PancakeSwapLinea,
  ]),
  [Partners.Sushiswap]: indexTwapConfigsByChain([
    Configs.SushiEth,
    Configs.SushiArb,
    Configs.SushiBase,
    Configs.SushiKatana,
  ]),
  [Partners.Quick]: indexTwapConfigsByChain([
    Configs.QuickSwap,
    Configs.QuickSwapBase,
  ]),
  [Partners.Thena]: indexTwapConfigsByChain([Configs.Thena]),
  [Partners.Spooky]: indexTwapConfigsByChain([
    Configs.SpookySwap,
    Configs.SpookySwapSonic,
  ]),
  [Partners.Lynex]: indexTwapConfigsByChain([Configs.Lynex]),
  [Partners.Swapx]: indexTwapConfigsByChain([Configs.SwapX]),
  [Partners.Blackhole]: indexTwapConfigsByChain([Configs.BlackholeAvax]),
  [Partners.Spark]: indexTwapConfigsByChain([Configs.SparkDEX]),
  [Partners.Katana]: indexTwapConfigsByChain([Configs.SushiKatana]),
};

/** Returns the legacy TWAP config for an exact Spot partner and chain pair. */
export const getTwapConfig = (
  partner: Partners,
  chainId: number,
): Config | undefined => {
  return LEGACY_TWAP_CONFIGS_BY_SPOT_PARTNER[partner]?.get(chainId);
};

export const getEstimatedDelayBetweenTradesMillis = (
  config: Config,
): number => config.bidDelaySeconds * 1000 * 2;
