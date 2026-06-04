"use client";
import React, { CSSProperties, ReactNode, useMemo } from "react";
import { useNetwork, type Token } from "@orbs-network/spot-react";
import { useFormatNumber, useDateFormat, useCopyToClipboard } from "@/lib/hooks/common";
import { fillDelayText, makeEllipsisAddress } from "@/lib/utils";
import BN from "bignumber.js";
import { FormatNumber } from "./format-number";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { InfoIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "@/lib/use-translations";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";

const USD = ({ value }: { value?: string }) => {
  const formattedValue = useFormatNumber({ value: value, decimalScale: 2 });
  if (!formattedValue) return null;
  return <small className="twap-order-details__detail-row-value-usd">{` ($${formattedValue})`}</small>;
};

const Deadline = ({ deadline, label, tooltip }: { deadline?: number; label: string; tooltip: string }) => {
  const res = useDateFormat(deadline);
  return (
    <DetailRow title={label} tooltip={tooltip}>
      {res}
    </DetailRow>
  );
};

const Price = ({ price, dstToken, label, tooltip, usd, srcToken }: { price?: string; dstToken?: Token; label: string; tooltip?: string; usd?: string; srcToken?: Token }) => {
  const priceF = useFormatNumber({ value: price, decimalScale: 3 });
  if (BN(price || 0).isZero()) return null;

  return (
    <DetailRow title={label} tooltip={tooltip}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
       1 {srcToken?.symbol} = {`${priceF ? priceF : "-"} ${dstToken?.symbol}`}
        <USD value={usd} />
      </div>
    </DetailRow>
  );
};

const TradeSize = ({ tradeSize, srcToken, trades, label, tooltip }: { tradeSize?: string; srcToken?: Token; trades: number; label: string; tooltip: string }) => {
  if (trades === 1) return null;

  return (
    <DetailRow title={label} tooltip={tooltip}>
      {tradeSize ? <FormatNumber value={tradeSize} decimalScale={3} /> : "-"} {srcToken?.symbol || ""}
    </DetailRow>
  );
};

const MinDestAmount = ({ dstToken, dstMinAmountOut, label, tooltip, usd }: { dstToken?: Token; dstMinAmountOut?: string; label: string; tooltip: string; usd?: string }) => {
  const formattedValue = useFormatNumber({ value: dstMinAmountOut });

  if (BN(dstMinAmountOut || 0).isZero()) return null;

  return (
    <DetailRow title={label} tooltip={tooltip}>
      {`${dstMinAmountOut ? formattedValue : "-"} ${dstToken?.symbol}`}
      <USD value={usd} />
    </DetailRow>
  );
};

const TradesAmount = ({ trades, label, tooltip }: { trades?: number; label: string; tooltip: string }) => {
  if (trades === 1) return null;

  return (
    <DetailRow title={label} tooltip={tooltip}>
      {trades}
    </DetailRow>
  );
};

const Recipient = () => {
  const t = useTranslations();
  const network = useNetwork();
  const { address: account } = useActiveConnection();
  const explorerUrl = network?.explorer;

  return (
    <DetailRow title={t("recipient") || ""}>
      <a href={`${explorerUrl}/address/${account}`} target="_blank" rel="noopener noreferrer">{makeEllipsisAddress(account || "")}</a>
    </DetailRow>
  );
};

const TradeInterval = ({ fillDelayMillis, chunks = 0, label, tooltip }: { fillDelayMillis?: number; chunks?: number; label: string; tooltip: string }) => {
  const text = useMemo(() => fillDelayText(fillDelayMillis), [fillDelayMillis]);

  if (chunks === 1) return null;

  return (
    <DetailRow title={label} tooltip={tooltip}>
      {text}
    </DetailRow>
  );
};

const DetailRow = ({
  title,
  tooltip,
  children,
  className = "",
  onClick,
  style,
}: {
  title: string;
  tooltip?: string;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) => {
  return (
    <div className={`${className} twap-order-details__detail-row`} onClick={onClick} style={style}>
      <div className="twap-order-details__detail-row-label">
        <p className="twap-order-details__detail-row-label-value">{title}</p>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger><InfoIcon className="size-3" /></TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="twap-order-details__detail-row-value">{children}</div>
    </div>
  );
};

const OrderID = ({ id }: { id: string }) => {
  const copy = useCopyToClipboard();

  if (!id.startsWith("0x")) {
    return <DetailRow title="ID">{id}</DetailRow>;
  }
  return (
    <DetailRow title="ID" onClick={() => copy(id)} style={{ cursor: "pointer" }}>
      <Tooltip>
        <TooltipTrigger>
          <div className="twap-order-details__detail-row-value-id">
            <p>{makeEllipsisAddress(id)}</p>
            <CopyIcon className="size-3" />
          </div>
        </TooltipTrigger>
        <TooltipContent>{id}</TooltipContent>
      </Tooltip>
    </DetailRow>
  );
};

const OrderDetailsContainer = ({ children }: { children: ReactNode }) => {
  return children;
};

const Fees = ({ fees, label, usd, dstTokenSymbol }: { fees?: string; label: string; usd?: string; dstTokenSymbol?: string }) => {
  const formattedValue = useFormatNumber({ value: fees });

  return (
    <DetailRow title={label}>
      {`${fees ? formattedValue : "-"} ${dstTokenSymbol}`}
      <USD value={usd} />
    </DetailRow>
  );
};

export function OrderDetails({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={`${className} twap-order-details`}>{children}</div>;
}

OrderDetails.Deadline = Deadline;
OrderDetails.Fees = Fees;
OrderDetails.TradeSize = TradeSize;
OrderDetails.MinDestAmount = MinDestAmount;
OrderDetails.TradesAmount = TradesAmount;
OrderDetails.Recipient = Recipient;
OrderDetails.TradeInterval = TradeInterval;
OrderDetails.DetailRow = DetailRow;
OrderDetails.Price = Price;
OrderDetails.OrderID = OrderID;
OrderDetails.Container = OrderDetailsContainer;
OrderDetails.USD = USD;
