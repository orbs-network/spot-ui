import { Partners } from "../../config/partners";
import { type Config } from "./types";

// Legacy deployments copied from @orbs-network/twap 2.7.28.
// Keep these values for historical orders; current clients use order-sink /config.
// See THIRD_PARTY_NOTICES.md for the upstream MIT license.
const Configs = {
  SushiArb: {
    chainName: "arb",
    chainId: 42161,
    twapVersion: 4,
    twapAddress: "0x0B94dcC0EA2d1ee33Ab064DaC252de980a941eF3",
    lensAddress: "0x549e1fc9a47FCc0C5C2EbdfF31254cc49fF7164e",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "SushiArb",
    partner: "Orbs:TWAP:Sushi",
    exchangeAddress: "0x04eB53119079FA779492720D1EfeAEBF0aF2e5ad",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  SushiBase: {
    chainName: "base",
    chainId: 8453,
    twapVersion: 4,
    twapAddress: "0xc918bdC47264687796Cd54FE362FaC4f8b99Eb55",
    lensAddress: "0x6313188c1909b161074D62E43105faC9B756A23e",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "SushiBase",
    partner: "Orbs:TWAP:Sushi",
    exchangeAddress: "0x04eB53119079FA779492720D1EfeAEBF0aF2e5ad",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  SushiEth: {
    chainName: "eth",
    chainId: 1,
    twapVersion: 4,
    twapAddress: "0xb1ed8BCAD1EaC8a1DF0764700472391800D12946",
    lensAddress: "0x0967f448c4d4dbd14c355E635AE9CbF68cc44A60",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 200,
    name: "SushiEth",
    partner: "Orbs:TWAP:Sushi",
    exchangeAddress: "0x04eB53119079FA779492720D1EfeAEBF0aF2e5ad",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  PancakeSwap: {
    chainName: "bsc",
    chainId: 56,
    twapVersion: 4,
    twapAddress: "0xa6F7444D2b92Aa9F94a2165c77aAF2B671e63994",
    lensAddress: "0xEdB0c077fa87Fb21d050c619FF426798f8Fc1264",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "PancakeSwap",
    partner: "Orbs:TWAP:PancakeSwap",
    exchangeAddress: "0x1A2bb6B75D58b740d88413ef4840D6fa3F637940",
    exchangeType: "P2Exchange",
    pathfinderKey: "",
  },
  PancakeSwapArbitrum: {
    chainName: "arb",
    chainId: 42161,
    twapVersion: 4,
    twapAddress: "0x0B94dcC0EA2d1ee33Ab064DaC252de980a941eF3",
    lensAddress: "0x549e1fc9a47FCc0C5C2EbdfF31254cc49fF7164e",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "PancakeSwap",
    partner: "Orbs:TWAP:PancakeSwap",
    exchangeAddress: "0xb37cB9A058c03081Ae6EF934313588cD53d408e7",
    exchangeType: "P2Exchange",
    pathfinderKey: "",
  },
  PancakeSwapBase: {
    chainName: "base",
    chainId: 8453,
    twapVersion: 4,
    twapAddress: "0xc918bdC47264687796Cd54FE362FaC4f8b99Eb55",
    lensAddress: "0x6313188c1909b161074D62E43105faC9B756A23e",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "PancakeSwap",
    partner: "Orbs:TWAP:PancakeSwap",
    exchangeAddress: "0xb37cB9A058c03081Ae6EF934313588cD53d408e7",
    exchangeType: "P2Exchange",
    pathfinderKey: "",
  },
  PancakeSwapLinea: {
    chainName: "linea",
    chainId: 59144,
    twapVersion: 4,
    twapAddress: "0x48423e62acbfEF7779b5b4a5E7d6Fbd39E623d78",
    lensAddress: "0xe84CaEc86eCF3f0AB4267dC6130D9a5510e73DFb",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 100,
    name: "PancakeSwap",
    partner: "Orbs:TWAP:PancakeSwap",
    exchangeAddress: "0xb37cB9A058c03081Ae6EF934313588cD53d408e7",
    exchangeType: "P2Exchange",
    pathfinderKey: "",
  },
  QuickSwap: {
    chainName: "poly",
    chainId: 137,
    twapVersion: 4,
    twapAddress: "0x688C027B0f7FaCeFcBa73e472900d28c12C5bDF4",
    lensAddress: "0xe0D4E736fc76af7C256ae7652c8c1e850bfb7849",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 10,
    name: "QuickSwap",
    partner: "Orbs:TWAP:QuickSwap",
    exchangeAddress: "0x8FCc245209bE85C49D738D0CE5613F74E5d91E86",
    exchangeType: "ParaswapExchange",
    pathfinderKey: "QuickSwap,QuickSwapV3",
  },
  Thena: {
    chainName: "bsc",
    chainId: 56,
    twapVersion: 4,
    twapAddress: "0xa6F7444D2b92Aa9F94a2165c77aAF2B671e63994",
    lensAddress: "0xEdB0c077fa87Fb21d050c619FF426798f8Fc1264",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "Thena",
    partner: "Orbs:TWAP:Thena",
    exchangeAddress: "0x2B2fABDbfa4a15da0d351F947C14F4520db0bDc1",
    exchangeType: "ExchangeV2",
    pathfinderKey: "43,47",
  },
  Lynex: {
    chainName: "linea",
    chainId: 59144,
    twapVersion: 4,
    twapAddress: "0x48423e62acbfEF7779b5b4a5E7d6Fbd39E623d78",
    lensAddress: "0xe84CaEc86eCF3f0AB4267dC6130D9a5510e73DFb",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 100,
    name: "Lynex",
    partner: "Orbs:TWAP:Lynex",
    exchangeAddress: "0x04C06C96d7D19977156016DD408B5992af0570a2",
    exchangeType: "ExchangeV2",
    pathfinderKey: "19,18",
  },
  DragonSwap: {
    chainName: "sei",
    chainId: 1329,
    twapVersion: 4,
    twapAddress: "0xde737dB24548F8d41A4a3Ca2Bac8aaaDc4DBA099",
    lensAddress: "0xa1376f2Bb80D3cF6c2D8ebEf34b3d122e9af4020",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "DragonSwap",
    partner: "Orbs:TWAP:DragonSwap",
    exchangeAddress: "0xf2F933FafbDB97062CfA3c447ff373e76A90Efd6",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  SpookySwapSonic: {
    chainName: "sonic",
    chainId: 146,
    twapVersion: 4,
    twapAddress: "0x8963992816b4EafE5a22b7DB2A99513c18be9afA",
    lensAddress: "0x67e631F71232D63AcA98a2D5E9B2Bce5FCc39d5D",
    takers: [
      "0xDF406A27C58a8Cd6Fd43e143339bCE131216a913",
      "0x504f6E10173249dD22491829D98862Cf81DeF79E",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 10,
    name: "SpookySwapSonic",
    partner: "Orbs:TWAP:SpookySwap",
    exchangeAddress: "0x6699bE3aF75e5c1B807b1031dBde6dA9A67739F3",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  SpookySwap: {
    chainName: "ftm",
    chainId: 250,
    twapVersion: 4,
    twapAddress: "0xd3B290FEB04E353d1821bc0a12397FdEa9a846C0",
    lensAddress: "0x0221EfDF1Fd3212AF87F23cceB7693a65fAF1d7f",
    takers: [
      "0xDF406A27C58a8Cd6Fd43e143339bCE131216a913",
      "0x504f6E10173249dD22491829D98862Cf81DeF79E",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 10,
    name: "SpookySwap",
    partner: "Orbs:TWAP:SpookySwap",
    exchangeAddress: "0xdF7CCd5fc7077E9de5f27a7b7bfDC837c82f8496",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  SwapX: {
    chainName: "sonic",
    chainId: 146,
    twapVersion: 4,
    twapAddress: "0x8963992816b4EafE5a22b7DB2A99513c18be9afA",
    lensAddress: "0x67e631F71232D63AcA98a2D5E9B2Bce5FCc39d5D",
    takers: [
      "0xDF406A27C58a8Cd6Fd43e143339bCE131216a913",
      "0x504f6E10173249dD22491829D98862Cf81DeF79E",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 10,
    name: "SwapX",
    partner: "Orbs:TWAP:SwapX",
    exchangeAddress: "0xDA902994b7F7a1ecDd8De02E4a17dbFF2E6F67b7",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  SushiKatana: {
    chainName: "katana",
    chainId: 747474,
    twapVersion: 4,
    twapAddress: "0xf2d96E7BE676153d202e1453804E2749923C7c5b",
    lensAddress: "0x1579EED0527781B1A748043AA1f59a3858Ace4a7",
    takers: [
      "0xF74437A3Fc45a518640828E5D6A3E8c9A9BbDC3a",
      "0x07A6C715063e94c0D95e809efefFCbF4EBEdfD55",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "SushiKatana",
    partner: "Orbs:TWAP:Sushi",
    exchangeAddress: "0x92209481507e6B2d14C9b5b70Ed287024177220E",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  SparkDEX: {
    chainName: "flare",
    chainId: 14,
    twapVersion: 4,
    twapAddress: "0x9D70B0b90915Bb8b9bdAC7e6a7e6435bBF1feC4D",
    lensAddress: "0xf2d96E7BE676153d202e1453804E2749923C7c5b",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 10,
    name: "SparkDEX",
    partner: "Orbs:TWAP:SparkDEX",
    exchangeAddress: "0xe59c53C76bB7EEc01401A18fA8215B94bC65Bf56",
    exchangeType: "P2Exchange",
  },
  QuickSwapBase: {
    chainName: "base",
    chainId: 8453,
    twapVersion: 4,
    twapAddress: "0xc918bdC47264687796Cd54FE362FaC4f8b99Eb55",
    lensAddress: "0x6313188c1909b161074D62E43105faC9B756A23e",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 10,
    name: "QuickSwap",
    partner: "Orbs:TWAP:QuickSwap",
    exchangeAddress: "0xb7a3d74895bfd3aff6780525e36d79fcf26a895f",
    exchangeType: "ExchangeV2",
    pathfinderKey: "",
  },
  BlackholeAvax: {
    chainName: "avax",
    chainId: 43114,
    twapVersion: 4,
    twapAddress: "0xf77Ad005aBF7e31f669ce89a6568B2f39Ca92cDe",
    lensAddress: "0x48466B82Ce1575c5c9eCa168ac1090048dD47fA3",
    takers: [
      "0xA05405b6340A7F43dC5835351BFC4f5b1F028359",
      "0xE3Efef1563a5960ACc731F9e4d6f4cBf5bd87dcA",
    ],
    bidDelaySeconds: 60,
    minChunkSizeUsd: 50,
    name: "BlackholeAvax",
    partner: "Orbs:TWAP:BlackholeAvax",
    exchangeAddress: "0xb7A3d74895bFD3Aff6780525e36D79FCf26a895F",
    exchangeType: "ExchangeV2",
  },
} satisfies Record<string, Config & { takers: string[] }>;

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

export const getEstimatedDelayBetweenTradesMillis = (config: Config): number =>
  config.bidDelaySeconds * 1000 * 2;
