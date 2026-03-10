import { Address, Module, RePermitOrder, SpotConfig } from "./types";
import { getQueryParam, safeBNString } from "./utils";
import {
  EIP712_TYPES,
  EIP712_TYPES_DEV,
  isDev,
  maxUint256,
  QUERY_PARAMS,
  REPERMIT_PRIMARY_TYPE,
} from "./consts";
import BN from "bignumber.js";

type Props = {
  chainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  deadlineMillis: number;
  fillDelayMillis: number;
  slippage: number;
  account: string;
  srcAmountPerTrade: string;
  dstMinAmountPerTrade?: string;
  triggerAmountPerTrade?: string;
  config: SpotConfig;
  module: Module;
  feePercentage: number
};

const getSharedOrderData = (
  fillDelayMillis: number,
  deadlineMillis: number,
): {
  nonce: string;
  epoch: number;
  deadline: string;
  freshness: number;
} => {
  const nonce = Date.now().toString();
  const epoch = parseInt((fillDelayMillis / 1000).toFixed(0));
  const deadline = safeBNString(deadlineMillis / 1000);
  const customFreshness = getQueryParam(QUERY_PARAMS.FRESHNESS);
  const freshness = customFreshness ? parseInt(customFreshness) : 60;
  return {
    nonce,
    epoch,
    deadline,
    freshness,
  };
};

const buildRePermitOrderDataProd = ({
  chainId,
  srcToken,
  dstToken,
  srcAmount,
  deadlineMillis,
  fillDelayMillis,
  slippage,
  account,
  srcAmountPerTrade,
  dstMinAmountPerTrade = "0",
  triggerAmountPerTrade = "0",
  config,
  module,
}: Props) => {
  const { nonce, epoch, deadline, freshness } = getSharedOrderData(
    fillDelayMillis,
    deadlineMillis,
  );

  

  const stop =
    module === Module.TAKE_PROFIT ? maxUint256 : triggerAmountPerTrade;
  const limit =
    module === Module.TAKE_PROFIT
      ? triggerAmountPerTrade
      : dstMinAmountPerTrade;

  const orderData: RePermitOrder = {
    permitted: {
      token: srcToken as Address,
      amount: srcAmount,
    },
    spender: config.reactor,
    nonce,
    deadline,
    witness: {
      reactor: config.reactor,
      executor: config.executor,
      exchange: {
        adapter: config.adapter,
        ref: config.fee,
        share: 0,
        data: "0x",
      },
      swapper: account as Address,
      nonce,
      deadline,
      chainid: chainId,
      exclusivity: 0,
      epoch,
      slippage,
      freshness,
      input: {
        token: srcToken as Address,
        amount: srcAmountPerTrade,
        maxAmount: srcAmount,
      },
      output: {
        token: dstToken as Address,
        limit: BN(limit || 0).toFixed(),
        stop: BN(stop || 0).toFixed(),
        recipient: account as Address,
      },
    },
  };

  const domain = {
    name: "RePermit",
    version: "1",
    chainId,
    verifyingContract: config.repermit,
  };

  return {
    domain,
    order: orderData,
    types: EIP712_TYPES,
    primaryType: REPERMIT_PRIMARY_TYPE,
  };
};

const buildRePermitOrderDataDev = ({
  chainId,
  srcToken,
  dstToken,
  srcAmount,
  deadlineMillis,
  fillDelayMillis,
  slippage,
  account,
  srcAmountPerTrade,
  dstMinAmountPerTrade = "0",
  triggerAmountPerTrade = "0",
  config,
  module,
  feePercentage
}: Props) => {
  const { nonce, epoch, deadline, freshness } = getSharedOrderData(
    fillDelayMillis,
    deadlineMillis,
  );

  const start = Math.floor(Date.now() / 1000).toString();
  const limit = dstMinAmountPerTrade

  const feeBps = feePercentage * 100;

  const triggerLower =
    module === Module.STOP_LOSS
      ? triggerAmountPerTrade
      : "0";
  const triggerUpper =
    module === Module.TAKE_PROFIT
      ? triggerAmountPerTrade
      : "0";

  const orderData: RePermitOrder = {
    permitted: {
      token: srcToken as Address,
      amount: srcAmount,
    },
    spender: config.reactor,
    nonce,
    deadline,
    witness: {
      reactor: config.reactor,
      executor: config.executor,
      exchange: {
        adapter: config.adapter,
        ref: config.fee,
        share: feeBps,
        data: "0x",
      },
      swapper: account as Address,
      nonce,
      start,
      deadline,
      chainid: chainId,
      exclusivity: 0,
      epoch,
      slippage,
      freshness,
      input: {
        token: srcToken as Address,
        amount: srcAmountPerTrade,
        maxAmount: srcAmount,
      },
      output: {
        token: dstToken as Address,
        limit: BN(limit || 0).toFixed(),
        triggerLower:
          BN(triggerLower || 0).toFixed(),
        triggerUpper: BN(triggerUpper || 0).toFixed(),
        recipient: account as Address,
      },
    },
  };

  const domain = {
    name: "RePermit",
    version: "1",
    chainId,
    verifyingContract: config.repermit,
  };

  return {
    domain,
    order: orderData,
    types: EIP712_TYPES_DEV,
    primaryType: REPERMIT_PRIMARY_TYPE,
  };
};

export const buildRePermitOrderData = (props: Props) => {
  return isDev()
    ? buildRePermitOrderDataDev(props)
    : buildRePermitOrderDataProd(props);
};
