import BN from "bignumber.js";
import { useEffect, useRef } from "react";
import { useSpot } from "./hooks/use-spot";
import {
  ChartPriceLineKind,
  type ChartPriceLine,
} from "./hooks/use-chart-price-panel";

export interface TradingViewOrderLine {
  getPrice: () => number;
  onMove: (callback: () => void) => TradingViewOrderLine;
  remove: () => void;
  setBodyBorderColor: (color: string) => TradingViewOrderLine;
  setBodyTextColor: (color: string) => TradingViewOrderLine;
  setEditable: (editable: boolean) => TradingViewOrderLine;
  setLineColor: (color: string) => TradingViewOrderLine;
  setLineLength: (length: number) => TradingViewOrderLine;
  setLineStyle: (style: number) => TradingViewOrderLine;
  setModifyTooltip: (tooltip: string) => TradingViewOrderLine;
  setPrice: (price: number) => TradingViewOrderLine;
  setText: (text: string) => TradingViewOrderLine;
}

export interface TradingViewChartWithOrderLines {
  createOrderLine: () => Promise<TradingViewOrderLine>;
}

export interface SpotChartLineColors {
  limit: string;
  stopLoss: string;
  takeProfit: string;
  text: string;
}

export interface SpotTradingViewPriceLinesProps {
  chart?: TradingViewChartWithOrderLines | null;
  colors?: Partial<SpotChartLineColors>;
  lineLength?: number;
  pricePrecision?: number;
  toChartPrice?: (price: string, line: ChartPriceLine) => number;
  fromChartPrice?: (price: number, line: ChartPriceLine) => string;
  formatLabel?: (line: ChartPriceLine) => string;
  formatModifyTooltip?: (line: ChartPriceLine) => string;
  onError?: (error: unknown) => void;
}

export type SpotTradingViewPriceLineControllerOptions = Omit<
  SpotTradingViewPriceLinesProps,
  "chart"
>;

const DEFAULT_COLORS: SpotChartLineColors = {
  limit: "#3b82f6",
  stopLoss: "#ef4444",
  takeProfit: "#22c55e",
  text: "#ffffff",
};

const LINE_STYLE_DASHED = 2;

function getLineColor(
  kind: ChartPriceLineKind,
  colors: SpotChartLineColors,
) {
  if (kind === ChartPriceLineKind.STOP_LOSS) return colors.stopLoss;
  if (kind === ChartPriceLineKind.TAKE_PROFIT) return colors.takeProfit;
  return colors.limit;
}

function defaultToChartPrice(price: string) {
  return Number(price);
}

function normalizeChartPrice(price: number, precision = 8) {
  if (!Number.isFinite(price) || price <= 0) return "";
  return BN(price).decimalPlaces(precision).toFixed();
}

/**
 * Imperative controller for integrations that do not render the React helper.
 * It reconciles Spot price controls with TradingView order-line instances.
 */
export function createSpotTradingViewPriceLineController(
  chart: TradingViewChartWithOrderLines,
  options: SpotTradingViewPriceLineControllerOptions = {},
) {
  const orderLines = new Map<ChartPriceLineKind, TradingViewOrderLine>();
  const latestLines = new Map<ChartPriceLineKind, ChartPriceLine>();
  let destroyed = false;
  let syncVersion = 0;

  const colors: SpotChartLineColors = {
    limit: options.colors?.limit ?? DEFAULT_COLORS.limit,
    stopLoss: options.colors?.stopLoss ?? DEFAULT_COLORS.stopLoss,
    takeProfit: options.colors?.takeProfit ?? DEFAULT_COLORS.takeProfit,
    text: options.colors?.text ?? DEFAULT_COLORS.text,
  };
  const lineLength = options.lineLength ?? 50;
  const toChartPrice = options.toChartPrice ?? defaultToChartPrice;
  const fromChartPrice =
    options.fromChartPrice ??
    ((price: number) => normalizeChartPrice(price, options.pricePrecision));
  const formatLabel = options.formatLabel ?? ((line) => line.label);
  const formatModifyTooltip =
    options.formatModifyTooltip ??
    ((line: ChartPriceLine) => `Set ${line.label.toLowerCase()}`);

  const applyLine = (orderLine: TradingViewOrderLine, line: ChartPriceLine) => {
    const price = toChartPrice(line.price, line);
    const color = getLineColor(line.kind, colors);
    if (!Number.isFinite(price) || price <= 0) return;

    orderLine
      .setPrice(price)
      .setText(formatLabel(line))
      .setLineColor(color)
      .setLineStyle(LINE_STYLE_DASHED)
      .setLineLength(lineLength)
      .setBodyBorderColor(color)
      .setBodyTextColor(colors.text)
      .setEditable(true)
      .setModifyTooltip(formatModifyTooltip(line));
  };

  const sync = async (lines: readonly ChartPriceLine[]) => {
    const version = ++syncVersion;
    const drawableLines = lines.filter((line) => line.hasPrice);
    const activeIds = new Set(drawableLines.map((line) => line.id));

    latestLines.clear();
    for (const line of drawableLines) latestLines.set(line.id, line);

    for (const [id, orderLine] of orderLines) {
      if (!activeIds.has(id)) {
        orderLine.remove();
        orderLines.delete(id);
      }
    }

    await Promise.all(
      drawableLines.map(async (line) => {
        try {
          const existing = orderLines.get(line.id);
          if (existing) {
            applyLine(existing, line);
            return;
          }

          const orderLine = await chart.createOrderLine();
          if (destroyed || version !== syncVersion || !latestLines.has(line.id)) {
            orderLine.remove();
            return;
          }

          orderLine.onMove(() => {
            const currentLine = latestLines.get(line.id);
            if (!currentLine) return;
            const nextPrice = fromChartPrice(orderLine.getPrice(), currentLine);
            if (nextPrice) currentLine.onPriceChange(nextPrice);
          });
          orderLines.set(line.id, orderLine);
          applyLine(orderLine, line);
        } catch (error) {
          options.onError?.(error);
        }
      }),
    );
  };

  const destroy = () => {
    destroyed = true;
    syncVersion += 1;
    latestLines.clear();
    for (const orderLine of orderLines.values()) orderLine.remove();
    orderLines.clear();
  };

  return { sync, destroy };
}

/**
 * Synchronizes the active `spot-react` price controls with TradingView order
 * lines. Render it under `SpotProvider` after the host chart is ready.
 */
export function SpotTradingViewPriceLines({
  chart,
  colors,
  lineLength,
  pricePrecision,
  toChartPrice,
  fromChartPrice,
  formatLabel,
  formatModifyTooltip,
  onError,
}: SpotTradingViewPriceLinesProps) {
  const { chartPricePanel } = useSpot();
  const limitColor = colors?.limit;
  const stopLossColor = colors?.stopLoss;
  const takeProfitColor = colors?.takeProfit;
  const textColor = colors?.text;
  const controllerRef = useRef<ReturnType<
    typeof createSpotTradingViewPriceLineController
  > | null>(null);
  const latestLinesRef = useRef(chartPricePanel.lines);
  const syncedLinesRef = useRef<readonly ChartPriceLine[] | null>(null);
  latestLinesRef.current = chartPricePanel.lines;

  useEffect(() => {
    if (!chart) return;
    const controller = createSpotTradingViewPriceLineController(chart, {
      colors: {
        limit: limitColor,
        stopLoss: stopLossColor,
        takeProfit: takeProfitColor,
        text: textColor,
      },
      lineLength,
      pricePrecision,
      toChartPrice,
      fromChartPrice,
      formatLabel,
      formatModifyTooltip,
      onError,
    });
    controllerRef.current = controller;
    syncedLinesRef.current = latestLinesRef.current;
    void controller.sync(latestLinesRef.current);

    return () => {
      controller.destroy();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        syncedLinesRef.current = null;
      }
    };
  }, [
    chart,
    formatLabel,
    formatModifyTooltip,
    fromChartPrice,
    lineLength,
    limitColor,
    onError,
    pricePrecision,
    stopLossColor,
    takeProfitColor,
    textColor,
    toChartPrice,
  ]);

  useEffect(() => {
    if (syncedLinesRef.current === chartPricePanel.lines) return;
    syncedLinesRef.current = chartPricePanel.lines;
    void controllerRef.current?.sync(chartPricePanel.lines);
  }, [chartPricePanel.lines]);

  return null;
}
