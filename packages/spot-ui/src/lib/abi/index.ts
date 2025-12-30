// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import IWETHABI from "./iweth.json";
import ERC20 from "./erc20.json";
// @ts-ignore
import * as Spot from "@orbs-network/spot";
import TwapAbi from "@orbs-network/twap/twap.abi.json";

const ABIS = Spot.abis();

export const IWETH_ABI = IWETHABI;
export const ERC20_ABI = ERC20;
export const REPERMIT_ABI = ABIS.repermit;
export const TWAP_ABI = TwapAbi;
