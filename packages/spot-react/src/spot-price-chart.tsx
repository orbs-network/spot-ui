"use client";

import BN from "bignumber.js";
import { InputErrors } from "@orbs-network/spot-ui";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChartPriceLineKind, type ChartPriceLine } from "./hooks/use-chart-price-panel";
import { useSpot } from "./hooks/use-spot";

export interface SpotChartPoint {
  /** Unix time in seconds. */
  time: number;
  /** Destination-token units for one source token. */
  value: number;
}

export interface SpotPriceChartColors {
  background: string;
  border: string;
  grid: string;
  text: string;
  mutedText: string;
  series: string;
  areaTop: string;
  areaBottom: string;
  /** Rising candle color. Falls back to `takeProfit`. */
  candleUp?: string;
  /** Falling candle color. Falls back to `stopLoss`. */
  candleDown?: string;
  limit: string;
  stopLoss: string;
  takeProfit: string;
  controlText: string;
  error: string;
}

export interface SpotPriceChartProps {
  data: readonly SpotChartPoint[];
  /** Latest source/destination market price. Each change appends a live tick. */
  livePrice?: number;
  /** Unix time in seconds for `livePrice`. Defaults to the current time. */
  liveTimestamp?: number;
  liveStatus?: SpotPriceChartLiveStatus;
  /** Stable market identity used to reset accumulated live ticks. */
  marketKey?: string;
  /** Candle duration in seconds. Defaults to one hour. */
  barIntervalSeconds?: number;
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
  height?: number | string;
  /** Fixed decimal precision. Defaults to a market-price-aware precision. */
  pricePrecision?: number;
  priceStep?: number;
  colors?: Partial<SpotPriceChartColors>;
  timeframeLabel?: string;
  emptyState?: ReactNode;
  ariaLabel?: string;
  formatPrice?: (price: number) => string;
  formatLineLabel?: (line: ChartPriceLine) => string;
  formatValidationMessage?: (
    line: ChartPriceLine,
    defaultMessage: string,
  ) => ReactNode;
}

export type SpotPriceChartLiveStatus = "connecting" | "live" | "delayed";

const DEFAULT_COLORS: SpotPriceChartColors = {
  background: "#151515",
  border: "#2f2f32",
  grid: "#27272a",
  text: "#f4f4f5",
  mutedText: "#a1a1aa",
  series: "#ff37c7",
  areaTop: "rgba(255, 55, 199, 0.28)",
  areaBottom: "rgba(255, 55, 199, 0.015)",
  candleUp: "#1fa67d",
  candleDown: "#ed7088",
  limit: "#3b82f6",
  stopLoss: "#ef4444",
  takeProfit: "#22c55e",
  controlText: "#ffffff",
  error: "#fb7185",
};

const CONTROL_GAP = 38;
const CONTROL_EDGE = 22;
const DRAG_THRESHOLD_PX = 3;
const DEFAULT_BAR_INTERVAL_SECONDS = 60 * 60;
const MAX_LIVE_CANDLES = 2_000;
const defaultFormatLineLabel = (line: ChartPriceLine) => line.label;

const LIVE_STATUS_LABELS: Record<SpotPriceChartLiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  delayed: "Delayed",
};

function getLineColor(
  kind: ChartPriceLineKind,
  colors: SpotPriceChartColors,
) {
  if (kind === ChartPriceLineKind.STOP_LOSS) return colors.stopLoss;
  if (kind === ChartPriceLineKind.TAKE_PROFIT) return colors.takeProfit;
  return colors.limit;
}

function getKeyboardPriceStep(price: number, precision: number) {
  if (!Number.isFinite(price) || price <= 0) return 10 ** -precision;
  const contextualStep = 10 ** (Math.floor(Math.log10(price)) - 3);
  return Math.max(10 ** -precision, contextualStep);
}

function normalizeInputPrice(price: number, precision: number) {
  if (!Number.isFinite(price) || price <= 0) return "";
  return BN(price).decimalPlaces(precision).toFixed();
}

function getAdaptivePricePrecision(price?: number) {
  if (!Number.isFinite(price) || !price || price <= 0) return 8;
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 6;
  return 8;
}

function normalizeChartData(
  data: readonly SpotChartPoint[],
  isInverted: boolean,
) {
  const byTime = new Map<number, number>();
  for (const point of data) {
    if (
      !Number.isFinite(point.time) ||
      !Number.isFinite(point.value) ||
      point.value <= 0
    ) {
      continue;
    }
    byTime.set(
      Math.floor(point.time),
      isInverted ? 1 / point.value : point.value,
    );
  }

  return [...byTime]
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ time, value }));
}

function createHistoricalCandles(
  points: readonly SpotChartPoint[],
) {
  let previousClose: number | undefined;

  return points.map<CandlestickData<Time>>((point) => {
    const open = previousClose ?? point.value;
    previousClose = point.value;

    return {
      time: point.time as UTCTimestamp,
      open,
      high: Math.max(open, point.value),
      low: Math.min(open, point.value),
      close: point.value,
    };
  });
}

function mergeChartCandles(
  historicalCandles: readonly CandlestickData<Time>[],
  liveCandles: readonly CandlestickData<Time>[],
) {
  const lastHistoricalTime = Number(historicalCandles.at(-1)?.time ?? 0);
  const dataByTime = new Map<number, CandlestickData<Time>>();

  for (const candle of historicalCandles) {
    dataByTime.set(Number(candle.time), candle);
  }
  for (const candle of liveCandles) {
    if (Number(candle.time) >= lastHistoricalTime) {
      dataByTime.set(Number(candle.time), candle);
    }
  }

  return [...dataByTime.values()].sort(
    (a, b) => Number(a.time) - Number(b.time),
  );
}

function getPanelValidationMessage(
  line: ChartPriceLine,
  isInverted: boolean,
) {
  const errorType = line.error?.type;
  if (
    errorType === InputErrors.EMPTY_LIMIT_PRICE ||
    errorType === InputErrors.MISSING_LIMIT_PRICE ||
    errorType === InputErrors.EMPTY_TRIGGER_PRICE
  ) {
    return `${line.label} is required.`;
  }
  if (
    errorType ===
    InputErrors.STOP_LOSS_TRIGGER_PRICE_GREATER_THAN_MARKET_PRICE
  ) {
    return `Stop loss must be ${isInverted ? "above" : "below"} market price.`;
  }
  if (
    errorType === InputErrors.TAKE_PROFIT_TRIGGER_PRICE_LESS_THAN_MARKET_PRICE
  ) {
    return `Take profit must be ${isInverted ? "below" : "above"} market price.`;
  }
  if (errorType === InputErrors.TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE) {
    return `Limit price must be ${isInverted ? "above" : "below"} trigger price.`;
  }
  return undefined;
}

function getChartValidationMessage({
  line,
  lines,
  latestMarketPrice,
  isInverted,
  loading,
}: {
  line: ChartPriceLine;
  lines: readonly ChartPriceLine[];
  latestMarketPrice?: number;
  isInverted: boolean;
  loading: boolean;
}) {
  const panelMessage = getPanelValidationMessage(line, isInverted);
  if (panelMessage) return panelMessage;
  if (!line.hasPrice) {
    return loading || line.isLoading ? undefined : `${line.label} is required.`;
  }

  const price = BN(line.price);
  const marketPrice = BN(latestMarketPrice || 0);
  if (price.isNaN() || !price.gt(0)) return `${line.label} must be greater than 0.`;
  if (!marketPrice.gt(0)) return undefined;

  if (line.kind === ChartPriceLineKind.STOP_LOSS) {
    const invalid = isInverted
      ? price.lte(marketPrice)
      : price.gte(marketPrice);
    return invalid
      ? `Stop loss must be ${isInverted ? "above" : "below"} market price.`
      : undefined;
  }
  if (line.kind === ChartPriceLineKind.TAKE_PROFIT) {
    const invalid = isInverted
      ? price.gte(marketPrice)
      : price.lte(marketPrice);
    return invalid
      ? `Take profit must be ${isInverted ? "below" : "above"} market price.`
      : undefined;
  }

  const triggerLine = lines.find(
    (candidate) => candidate.kind !== ChartPriceLineKind.LIMIT,
  );
  if (!triggerLine?.hasPrice) return undefined;
  const triggerPrice = BN(triggerLine.price);
  const invalid = isInverted
    ? price.lte(triggerPrice)
    : price.gte(triggerPrice);
  return invalid
    ? `Limit price must be ${isInverted ? "above" : "below"} trigger price.`
    : undefined;
}

function haveSamePositions(
  a: Partial<Record<ChartPriceLineKind, number>>,
  b: Partial<Record<ChartPriceLineKind, number>>,
) {
  const keys = Object.values(ChartPriceLineKind);
  return keys.every((key) => a[key] === b[key]);
}

export function SpotPriceChart({
  data,
  livePrice,
  liveTimestamp,
  liveStatus,
  marketKey,
  barIntervalSeconds = DEFAULT_BAR_INTERVAL_SECONDS,
  loading = false,
  className,
  style,
  height = "clamp(320px, 56vw, 620px)",
  pricePrecision,
  priceStep,
  colors: colorOverrides,
  timeframeLabel = "Price history",
  emptyState,
  ariaLabel,
  formatPrice,
  formatLineLabel = defaultFormatLineLabel,
  formatValidationMessage,
}: SpotPriceChartProps) {
  const { chartPricePanel } = useSpot();
  const validationIdPrefix = useId();
  const colors = useMemo<SpotPriceChartColors>(
    () => ({ ...DEFAULT_COLORS, ...colorOverrides }),
    [colorOverrides],
  );
  const candleUpColor = colors.candleUp ?? colors.takeProfit;
  const candleDownColor = colors.candleDown ?? colors.stopLoss;
  const normalizedData = useMemo(
    () => normalizeChartData(data, Boolean(chartPricePanel.isInverted)),
    [chartPricePanel.isInverted, data],
  );
  const historicalCandles = useMemo(
    () => createHistoricalCandles(normalizedData),
    [normalizedData],
  );
  const candleIntervalSeconds =
    Number.isFinite(barIntervalSeconds) && barIntervalSeconds > 0
      ? Math.max(1, Math.floor(barIntervalSeconds))
      : DEFAULT_BAR_INTERVAL_SECONDS;
  const normalizedLivePrice = useMemo(() => {
    const price = Number(livePrice);
    if (!Number.isFinite(price) || price <= 0) return undefined;
    return chartPricePanel.isInverted ? 1 / price : price;
  }, [chartPricePanel.isInverted, livePrice]);
  const liveTick = useMemo(() => {
    if (!normalizedLivePrice) return undefined;
    const time = Math.floor(liveTimestamp ?? Date.now() / 1_000);
    if (!Number.isFinite(time) || time <= 0) return undefined;
    return { time, value: normalizedLivePrice };
  }, [liveTimestamp, normalizedLivePrice]);
  const pairLabel = `${chartPricePanel.fromToken?.symbol ?? "—"}/${
    chartPricePanel.toToken?.symbol ?? "—"
  }`;
  const liveSeriesKey = `${marketKey ?? ""}:${
    chartPricePanel.fromToken?.address?.toLowerCase() ?? ""
  }:${chartPricePanel.toToken?.address?.toLowerCase() ?? ""}:${candleIntervalSeconds}`;
  const dataMarketPrice = normalizedData.at(-1)?.value;
  const spotMarketPrice = Number(chartPricePanel.marketPrice);
  const validationMarketPrice =
    Number.isFinite(spotMarketPrice) && spotMarketPrice > 0
      ? spotMarketPrice
      : normalizedLivePrice ?? dataMarketPrice;
  const resolvedPricePrecision =
    typeof pricePrecision === "number" && Number.isFinite(pricePrecision)
    ? Math.max(0, Math.min(12, Math.floor(pricePrecision)))
    : getAdaptivePricePrecision(validationMarketPrice);
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        maximumFractionDigits: resolvedPricePrecision,
      }),
    [resolvedPricePrecision],
  );
  const formatPriceValue = useCallback(
    (price: number) => formatPrice?.(price) ?? numberFormatter.format(price),
    [formatPrice, numberFormatter],
  );
  const [dragPreview, setDragPreview] = useState<{
    id: ChartPriceLineKind;
    price: string;
  } | null>(null);
  const dragPreviewRef = useRef(dragPreview);
  dragPreviewRef.current = dragPreview;
  const displayedLines = useMemo(
    () =>
      chartPricePanel.lines.map((line) =>
        dragPreview?.id === line.id
          ? {
              ...line,
              price: dragPreview.price,
              hasPrice: true,
              error: undefined,
            }
          : line,
      ),
    [chartPricePanel.lines, dragPreview],
  );
  const validationMessages = useMemo(() => {
    const messages = new Map<ChartPriceLineKind, string>();
    for (const line of displayedLines) {
      const message = getChartValidationMessage({
        line,
        lines: displayedLines,
        latestMarketPrice: validationMarketPrice,
        isInverted: Boolean(chartPricePanel.isInverted),
        loading,
      });
      if (message) messages.set(line.id, message);
    }
    return messages;
  }, [
    chartPricePanel.isInverted,
    displayedLines,
    loading,
    validationMarketPrice,
  ]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef(
    new Map<ChartPriceLineKind, IPriceLine>(),
  );
  const latestLinesRef = useRef(displayedLines);
  const initializedLinesRef = useRef(new Set<string>());
  const liveCandlesRef = useRef<{
    key: string;
    candles: CandlestickData<Time>[];
  }>({ key: liveSeriesKey, candles: [] });
  const positionFrameRef = useRef<number | null>(null);
  const dragRef = useRef<{
    id: ChartPriceLineKind;
    pointerId: number;
    ownerDocument: Document;
    startClientY: number;
    hasMoved: boolean;
    previousUserSelect: string;
  } | null>(null);
  const pointerMoveHandlerRef = useRef<(event: globalThis.PointerEvent) => void>(
    () => undefined,
  );
  const pointerUpHandlerRef = useRef<(event: globalThis.PointerEvent) => void>(
    () => undefined,
  );
  const pointerCancelHandlerRef = useRef<
    (event: globalThis.PointerEvent) => void
  >(() => undefined);
  const [controlPositions, setControlPositions] = useState<
    Partial<Record<ChartPriceLineKind, number>>
  >({});
  latestLinesRef.current = displayedLines;

  const pointerMoveListener = useCallback((event: globalThis.PointerEvent) => {
    pointerMoveHandlerRef.current(event);
  }, []);
  const pointerUpListener = useCallback((event: globalThis.PointerEvent) => {
    pointerUpHandlerRef.current(event);
  }, []);
  const pointerCancelListener = useCallback(
    (event: globalThis.PointerEvent) => {
      pointerCancelHandlerRef.current(event);
    },
    [],
  );

  const updateControlPositions = useCallback(() => {
    const plot = plotRef.current;
    const series = seriesRef.current;
    if (!plot || !series) return;

    const plotHeight = plot.clientHeight;
    const positions: Array<{
      id: ChartPriceLineKind;
      coordinate: number;
    }> = latestLinesRef.current
      .filter((line) => line.hasPrice)
      .flatMap((line) => {
        const coordinate = series.priceToCoordinate(Number(line.price));
        return coordinate === null
          ? []
          : [{ id: line.id, coordinate: Number(coordinate) }];
      })
      .sort((a, b) => a.coordinate - b.coordinate);

    let nextMinimum = CONTROL_EDGE;
    for (const position of positions) {
      position.coordinate = Math.max(
        nextMinimum,
        Math.min(plotHeight - CONTROL_EDGE, position.coordinate),
      );
      nextMinimum = position.coordinate + CONTROL_GAP;
    }

    const overflow =
      positions.length > 0
        ? positions[positions.length - 1]!.coordinate -
          (plotHeight - CONTROL_EDGE)
        : 0;
    if (overflow > 0) {
      for (const position of positions) position.coordinate -= overflow;
    }

    const nextPositions: Partial<Record<ChartPriceLineKind, number>> = {};
    for (const position of positions) {
      nextPositions[position.id] = position.coordinate;
    }
    setControlPositions((current) =>
      haveSamePositions(current, nextPositions) ? current : nextPositions,
    );
  }, []);

  const requestPositionUpdate = useCallback(() => {
    if (positionFrameRef.current !== null) return;
    positionFrameRef.current = requestAnimationFrame(() => {
      positionFrameRef.current = null;
      updateControlPositions();
    });
  }, [updateControlPositions]);

  useEffect(() => {
    const container = chartContainerRef.current;
    const plot = plotRef.current;
    if (!container || !plot) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.mutedText,
        attributionLogo: true,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.14, bottom: 0.14 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: candleUpColor,
      downColor: candleDownColor,
      borderUpColor: candleUpColor,
      borderDownColor: candleDownColor,
      wickUpColor: candleUpColor,
      wickDownColor: candleDownColor,
      borderVisible: true,
      wickVisible: true,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: "price",
        precision: resolvedPricePrecision,
        minMove: 10 ** -resolvedPricePrecision,
      },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(requestPositionUpdate);
    timeScale.subscribeSizeChange(requestPositionUpdate);
    const resizeObserver = new ResizeObserver(requestPositionUpdate);
    resizeObserver.observe(plot);

    return () => {
      resizeObserver.disconnect();
      timeScale.unsubscribeVisibleLogicalRangeChange(requestPositionUpdate);
      timeScale.unsubscribeSizeChange(requestPositionUpdate);
      if (positionFrameRef.current !== null) {
        cancelAnimationFrame(positionFrameRef.current);
        positionFrameRef.current = null;
      }
      priceLinesRef.current.clear();
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [
    colors.background,
    colors.border,
    colors.grid,
    colors.mutedText,
    candleDownColor,
    candleUpColor,
    resolvedPricePrecision,
    requestPositionUpdate,
  ]);

  const dataKey = normalizedData.length
    ? `${liveSeriesKey}:${normalizedData[0]!.time}:${
        normalizedData.at(-1)!.time
      }`
    : `${liveSeriesKey}:empty`;
  const fittedDataKeyRef = useRef("");
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    if (liveCandlesRef.current.key !== liveSeriesKey) {
      liveCandlesRef.current = { key: liveSeriesKey, candles: [] };
    }

    const chartData = mergeChartCandles(
      historicalCandles,
      liveCandlesRef.current.candles,
    );
    series.setData(chartData);
    if (chartData.length && fittedDataKeyRef.current !== dataKey) {
      chart.timeScale().fitContent();
      fittedDataKeyRef.current = dataKey;
    }
    requestPositionUpdate();
  }, [dataKey, historicalCandles, liveSeriesKey, requestPositionUpdate]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !liveTick) return;

    if (liveCandlesRef.current.key !== liveSeriesKey) {
      liveCandlesRef.current = { key: liveSeriesKey, candles: [] };
    }

    const candles = liveCandlesRef.current.candles;
    const lastLiveCandle = candles.at(-1);
    const lastHistoricalCandle = historicalCandles.at(-1);
    const lastHistoricalTime = Number(lastHistoricalCandle?.time ?? 0);
    const liveBarTime =
      Math.floor(liveTick.time / candleIntervalSeconds) * candleIntervalSeconds;
    const nextTime = Math.max(
      liveBarTime,
      Number(lastLiveCandle?.time ?? 0),
      lastHistoricalTime,
    ) as UTCTimestamp;
    const existingCandle =
      Number(lastLiveCandle?.time) === nextTime
        ? lastLiveCandle
        : Number(lastHistoricalCandle?.time) === nextTime
          ? lastHistoricalCandle
          : undefined;
    const previousClose =
      lastLiveCandle?.close ?? lastHistoricalCandle?.close ?? liveTick.value;
    const nextCandle: CandlestickData<Time> = {
      time: nextTime,
      open: existingCandle?.open ?? previousClose,
      high: Math.max(existingCandle?.high ?? previousClose, liveTick.value),
      low: Math.min(existingCandle?.low ?? previousClose, liveTick.value),
      close: liveTick.value,
    };

    let trimmed = false;
    if (lastLiveCandle?.time === nextCandle.time) {
      candles[candles.length - 1] = nextCandle;
    } else {
      candles.push(nextCandle);
      if (candles.length > MAX_LIVE_CANDLES) {
        candles.splice(0, candles.length - MAX_LIVE_CANDLES);
        trimmed = true;
      }
    }

    if (trimmed) {
      series.setData(mergeChartCandles(historicalCandles, candles));
    } else {
      series.update(nextCandle);
    }
    if (!historicalCandles.length && candles.length === 1) {
      chartRef.current?.timeScale().fitContent();
    }
    requestPositionUpdate();
  }, [
    candleIntervalSeconds,
    historicalCandles,
    liveSeriesKey,
    liveTick,
    requestPositionUpdate,
  ]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const drawableLines = displayedLines.filter((line) => line.hasPrice);
    const activeIds = new Set(drawableLines.map((line) => line.id));

    for (const [id, priceLine] of priceLinesRef.current) {
      if (!activeIds.has(id)) {
        series.removePriceLine(priceLine);
        priceLinesRef.current.delete(id);
      }
    }

    for (const line of drawableLines) {
      const options = {
        price: Number(line.price),
        color: validationMessages.has(line.id)
          ? colors.error
          : getLineColor(line.kind, colors),
        lineWidth: 2 as const,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: formatLineLabel(line),
      };
      const existing = priceLinesRef.current.get(line.id);
      if (existing) existing.applyOptions(options);
      else priceLinesRef.current.set(line.id, series.createPriceLine(options));
    }
    requestPositionUpdate();
  }, [
    colors,
    displayedLines,
    formatLineLabel,
    requestPositionUpdate,
    validationMessages,
  ]);

  useEffect(() => {
    if (!validationMarketPrice) return;
    for (const line of chartPricePanel.lines) {
      const initializationKey = `${chartPricePanel.fromToken?.address ?? ""}:${
        chartPricePanel.toToken?.address ?? ""
      }:${line.id}`;
      if (line.hasPrice || initializedLinesRef.current.has(initializationKey)) {
        continue;
      }
      initializedLinesRef.current.add(initializationKey);
      const percent = BN(line.percentage || 0).div(100);
      const factor = chartPricePanel.isInverted
        ? BN(1).div(BN(1).plus(percent))
        : BN(1).plus(percent);
      const initialPrice = BN(validationMarketPrice)
        .multipliedBy(factor)
        .toNumber();
      const normalizedPrice = normalizeInputPrice(
        initialPrice,
        resolvedPricePrecision,
      );
      if (normalizedPrice) line.onPriceChange(normalizedPrice);
    }
  }, [
    chartPricePanel.fromToken?.address,
    chartPricePanel.isInverted,
    chartPricePanel.lines,
    chartPricePanel.toToken?.address,
    resolvedPricePrecision,
    validationMarketPrice,
  ]);

  const getLinePriceFromPointer = useCallback(
    (clientY: number) => {
      const plot = plotRef.current;
      const series = seriesRef.current;
      if (!plot || !series) return undefined;
      const coordinate = clientY - plot.getBoundingClientRect().top;
      const price = Number(series.coordinateToPrice(coordinate));
      return normalizeInputPrice(price, resolvedPricePrecision) || undefined;
    },
    [resolvedPricePrecision],
  );

  const setCurrentDragPreview = useCallback(
    (preview: { id: ChartPriceLineKind; price: string } | null) => {
      dragPreviewRef.current = preview;
      setDragPreview(preview);
    },
    [],
  );

  const stopDocumentPriceDrag = useCallback(
    (ownerDocument: Document) => {
      ownerDocument.removeEventListener("pointermove", pointerMoveListener);
      ownerDocument.removeEventListener("pointerup", pointerUpListener);
      ownerDocument.removeEventListener("pointercancel", pointerCancelListener);
    },
    [pointerCancelListener, pointerMoveListener, pointerUpListener],
  );

  const finishDrag = useCallback(
    (commit: boolean, finalClientY?: number) => {
      const drag = dragRef.current;
      if (!drag) return;

      dragRef.current = null;
      stopDocumentPriceDrag(drag.ownerDocument);
      drag.ownerDocument.body.style.userSelect = drag.previousUserSelect;

      const preview = dragPreviewRef.current;
      const finalPrice =
        finalClientY === undefined
          ? preview?.id === drag.id
            ? preview.price
            : undefined
          : getLinePriceFromPointer(finalClientY) ??
            (preview?.id === drag.id ? preview.price : undefined);

      setCurrentDragPreview(null);
      if (!commit || !drag.hasMoved || !finalPrice) return;

      const line = latestLinesRef.current.find((item) => item.id === drag.id);
      line?.onPriceChange(finalPrice);
    },
    [getLinePriceFromPointer, setCurrentDragPreview, stopDocumentPriceDrag],
  );

  const handleDocumentPointerMove = useCallback(
    (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.hasMoved) {
        if (Math.abs(event.clientY - drag.startClientY) < DRAG_THRESHOLD_PX) {
          return;
        }
        drag.hasMoved = true;
      }

      const price = getLinePriceFromPointer(event.clientY);
      if (!price) return;
      event.preventDefault();
      setCurrentDragPreview({ id: drag.id, price });
    },
    [getLinePriceFromPointer, setCurrentDragPreview],
  );

  const handleDocumentPointerUp = useCallback(
    (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      finishDrag(true, event.clientY);
    },
    [finishDrag],
  );

  const handleDocumentPointerCancel = useCallback(
    (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      finishDrag(false);
    },
    [finishDrag],
  );

  useEffect(() => {
    pointerMoveHandlerRef.current = handleDocumentPointerMove;
  }, [handleDocumentPointerMove]);
  useEffect(() => {
    pointerUpHandlerRef.current = handleDocumentPointerUp;
  }, [handleDocumentPointerUp]);
  useEffect(() => {
    pointerCancelHandlerRef.current = handleDocumentPointerCancel;
  }, [handleDocumentPointerCancel]);

  const handlePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      id: ChartPriceLineKind,
    ) => {
      if (event.button !== 0 || dragRef.current) return;
      const ownerDocument = event.currentTarget.ownerDocument;
      if (!getLinePriceFromPointer(event.clientY)) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        id,
        pointerId: event.pointerId,
        ownerDocument,
        startClientY: event.clientY,
        hasMoved: false,
        previousUserSelect: ownerDocument.body.style.userSelect,
      };
      ownerDocument.body.style.userSelect = "none";
      ownerDocument.addEventListener("pointermove", pointerMoveListener);
      ownerDocument.addEventListener("pointerup", pointerUpListener);
      ownerDocument.addEventListener("pointercancel", pointerCancelListener);
    },
    [
      getLinePriceFromPointer,
      pointerCancelListener,
      pointerMoveListener,
      pointerUpListener,
    ],
  );

  const handleLostPointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      finishDrag(false);
    },
    [finishDrag],
  );

  useEffect(() => () => finishDrag(false), [finishDrag]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, line: ChartPriceLine) => {
      const direction =
        event.key === "ArrowUp" || event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowDown" || event.key === "ArrowLeft"
            ? -1
            : 0;
      if (!direction) return;
      event.preventDefault();
      const currentPrice = Number(line.price);
      const step =
        priceStep ?? getKeyboardPriceStep(currentPrice, resolvedPricePrecision);
      const multiplier = event.shiftKey ? 10 : 1;
      const nextPrice = normalizeInputPrice(
        currentPrice + direction * step * multiplier,
        resolvedPricePrecision,
      );
      if (nextPrice) line.onPriceChange(nextPrice);
    },
    [priceStep, resolvedPricePrecision],
  );

  const hasData = historicalCandles.length > 0 || Boolean(liveTick);
  const resolvedAriaLabel = ariaLabel ?? `${pairLabel} price chart`;
  const liveStatusColor =
    liveStatus === "live"
      ? colors.takeProfit
      : liveStatus === "delayed"
        ? "#f59e0b"
        : colors.mutedText;

  return (
    <section
      className={className}
      aria-label={resolvedAriaLabel}
      style={{
        minWidth: 0,
        overflow: "hidden",
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        background: colors.background,
        color: colors.text,
        ...style,
      }}
    >
      <style>{`
        .spot-price-chart__control {
          -webkit-tap-highlight-color: transparent;
          transition: filter 120ms ease, box-shadow 120ms ease;
        }
        .spot-price-chart__control:hover { filter: brightness(1.12); }
        .spot-price-chart__control:focus-visible {
          outline: 2px solid #ffffff;
          outline-offset: 3px;
          box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.35);
        }
        @media (prefers-reduced-motion: reduce) {
          .spot-price-chart__control { transition: none; }
        }
      `}</style>
      <header
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          padding: "14px 16px 12px",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            translate="no"
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: 1.3,
              fontWeight: 700,
              overflowWrap: "anywhere",
            }}
          >
            {pairLabel}
          </p>
          {normalizedLivePrice ? (
            <p
              aria-label={`${pairLabel} live price ${formatPriceValue(
                normalizedLivePrice,
              )}`}
              data-live-timestamp={liveTimestamp}
              data-testid="spot-price-chart-live-price"
              translate="no"
              style={{
                margin: "5px 0 0",
                color: colors.text,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 18,
                lineHeight: 1.2,
                fontWeight: 750,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatPriceValue(normalizedLivePrice)}
            </p>
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 4,
            }}
          >
            <p
              style={{
                margin: 0,
                color: colors.mutedText,
                fontSize: 12,
                lineHeight: 1.3,
              }}
            >
              {timeframeLabel}
            </p>
            {liveStatus ? (
              <span
                aria-label={`Chart status: ${LIVE_STATUS_LABELS[liveStatus]}`}
                data-spot-chart-status={liveStatus}
                role="status"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 6px",
                  border: `1px solid ${liveStatusColor}`,
                  borderRadius: 999,
                  color: liveStatusColor,
                  fontSize: 10,
                  lineHeight: 1.2,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    background: liveStatusColor,
                  }}
                />
                {LIVE_STATUS_LABELS[liveStatus]}
              </span>
            ) : null}
          </div>
        </div>
        <div
          aria-label="Chart price controls"
          style={{ display: "flex", flexWrap: "wrap", gap: "8px 12px" }}
        >
          {chartPricePanel.lines.map((line) => (
            <span
              key={line.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: colors.mutedText,
                fontSize: 12,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: validationMessages.has(line.id)
                    ? colors.error
                    : getLineColor(line.kind, colors),
                }}
              />
              {formatLineLabel(line)}
            </span>
          ))}
        </div>
      </header>

      <div ref={plotRef} style={{ position: "relative", height }}>
        <div
          ref={chartContainerRef}
          data-price-precision={resolvedPricePrecision}
          data-series-type="candlestick"
          data-testid="spot-price-chart-surface"
          aria-hidden="true"
          style={{ position: "absolute", inset: 0 }}
        />

        <div aria-live="polite">
          {loading && !hasData ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                padding: 24,
                color: colors.mutedText,
                fontSize: 14,
                pointerEvents: "none",
              }}
            >
              Loading market history…
            </div>
          ) : null}
          {!loading && !hasData ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                padding: 24,
                color: colors.mutedText,
                fontSize: 14,
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              {emptyState ?? "Market history is unavailable for this pair."}
            </div>
          ) : null}
        </div>

        {displayedLines
          .filter((line) => line.hasPrice && controlPositions[line.id] !== undefined)
          .map((line) => {
            const formattedPrice = formatPriceValue(Number(line.price));
            const validationMessage = validationMessages.get(line.id);
            const color = validationMessage
              ? colors.error
              : getLineColor(line.kind, colors);
            const validationId = `${validationIdPrefix}-${line.id}-error`;
            return (
              <button
                key={line.id}
                type="button"
                role="slider"
                aria-label={`Set ${formatLineLabel(line).toLowerCase()}`}
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={Number.MAX_SAFE_INTEGER}
                aria-valuenow={Number(line.price)}
                aria-valuetext={formattedPrice}
                aria-invalid={Boolean(validationMessage)}
                aria-errormessage={
                  validationMessage ? validationId : undefined
                }
                title={`Drag or use arrow keys to set ${formatLineLabel(line).toLowerCase()}`}
                className="spot-price-chart__control"
                onPointerDown={(event) => handlePointerDown(event, line.id)}
                onLostPointerCapture={handleLostPointerCapture}
                onKeyDown={(event) => handleKeyDown(event, line)}
                style={{
                  position: "absolute",
                  zIndex: 3,
                  top: controlPositions[line.id],
                  left: 14,
                  maxWidth: "calc(100% - 96px)",
                  transform: "translateY(-50%)",
                  display: "inline-flex",
                  alignItems: "stretch",
                  padding: 0,
                  overflow: "hidden",
                  border: `1px solid ${color}`,
                  borderRadius: 7,
                  background: colors.background,
                  color: colors.controlText,
                  cursor: "ns-resize",
                  touchAction: "none",
                  font: "inherit",
                  boxShadow: validationMessage
                    ? `0 0 0 2px ${colors.background}, 0 0 0 4px ${colors.error}`
                    : undefined,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                    padding: "6px 8px",
                    background: color,
                    fontSize: 11,
                    lineHeight: 1,
                    fontWeight: 750,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span aria-hidden="true">⋮⋮</span>
                  <span
                    style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {formatLineLabel(line)}
                  </span>
                </span>
                <span
                  translate="no"
                  style={{
                    minWidth: 0,
                    padding: "6px 8px",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 11,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formattedPrice}
                </span>
              </button>
            );
          })}
      </div>

      {chartPricePanel.lines.length ? (
        <footer
          style={{
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          {displayedLines.flatMap((line) => {
            const message = validationMessages.get(line.id);
            if (!message) return [];
            const validationId = `${validationIdPrefix}-${line.id}-error`;
            return [
              <p
                key={line.id}
                id={validationId}
                aria-live="polite"
                style={{
                  margin: 0,
                  padding: "9px 16px",
                  borderBottom: `1px solid ${colors.border}`,
                  background: "rgba(251, 113, 133, 0.1)",
                  color: colors.error,
                  fontSize: 12,
                  lineHeight: 1.45,
                  fontWeight: 650,
                }}
              >
                {formatValidationMessage?.(line, message) ?? message}
              </p>,
            ];
          })}
          <p
            style={{
              margin: 0,
              padding: "10px 16px 12px",
              color: colors.mutedText,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            Drag a price marker or focus it and use the arrow keys. Hold Shift
            for larger steps.
          </p>
        </footer>
      ) : null}
    </section>
  );
}
