import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PredictionMarket, PolymarketEvent, PolymarketMarket } from "@/lib/types/polymarket";

const API = "/api";
const POLYMARKET_BASE = "https://polymarket.com/event";

export function fmtVol(v: number | string | undefined): string {
  const n = parseFloat(String(v ?? 0));
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseYesChance(outcomePrices?: string): number {
  if (!outcomePrices) return 0;
  try {
    const prices = JSON.parse(outcomePrices) as string[];
    const yesPrice = parseFloat(prices[0] ?? "0");
    return Math.round(yesPrice * 100);
  } catch {
    return 0;
  }
}

function marketToPrediction(m: PolymarketMarket & { events?: { slug?: string }[] }): PredictionMarket {
  const volume = m.volumeNum ?? (typeof m.volume === "number" ? m.volume : parseFloat(String(m.volume ?? 0)));
  const volume24hr = m.volume24hr ?? (m as { volume24hrClob?: number }).volume24hrClob;

  
  const slug = m.slug ?? m.id ?? "";
  const eventSlug = m.events?.[0]?.slug ?? slug;
  return {
    id: m.id,
    title: m.question ?? "",
    slug,
    imageUrl: m.image ?? m.icon ?? null,
    chancePercent: parseYesChance(m.outcomePrices),
    volume,
    volume24hr,
    polymarketUrl: `${POLYMARKET_BASE}/${eventSlug}`,
  };
}

function eventToPrediction(e: PolymarketEvent): PredictionMarket | null {
  const markets = e.markets ?? [];
  const vol = (m: PolymarketMarket) => {
    const v24 = m.volume24hr ?? (m as { volume24hrClob?: number }).volume24hrClob;
    const v = m.volumeNum ?? (typeof m.volume === "number" ? m.volume : parseFloat(String(m.volume ?? 0)));
    return v24 ?? v;
  };
  const best = [...markets]
    .filter((m) => !m.closed)
    .sort((a, b) => vol(b) - vol(a))[0];
  if (!best) return null;
  const slug = best.slug ?? e.slug ?? "";
  const volume = (e as { volumeNum?: number }).volumeNum ?? (typeof e.volume === "number" ? e.volume : parseFloat(String(e.volume ?? 0)));
  const vol24 = e.volume24hr ?? (e as { volume24hrClob?: number }).volume24hrClob ?? best.volume24hr ?? (best as { volume24hrClob?: number }).volume24hrClob;
  return {
    id: e.id,
    title: e.title ?? best.question ?? "",
    slug,
    imageUrl: e.image ?? e.icon ?? best.image ?? best.icon ?? null,
    chancePercent: parseYesChance(best.outcomePrices),
    volume,
    volume24hr: vol24,
    polymarketUrl: `${POLYMARKET_BASE}/${e.slug ?? slug}`,
  };
}

const ASSET_FULLNAMES: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  xrp: "xrp",
};

const CRYPTO_TAG_SLUGS = new Set([
  "crypto",
  "bitcoin",
  "ethereum",
  "solana",
  "xrp",
  "ripple",
  "crypto-prices",
  "token-launch",
  "fdv",
]);
const MACRO_TAG_SLUGS = new Set([
  "finance",
  "economy",
  "economic-policy",
  "fed",
  "fed-rates",
  "business",
  "commodities",
  "gold",
  "silver",
  "big-tech",
  "tariffs",
  "trade-war",
]);

function dedupeEvents<T>(
  events: T[],
  limit: number,
  getId: (e: T) => string = (e) => String((e as { id?: string }).id ?? "")
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const e of events) {
    const id = getId(e);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(e);
    if (result.length >= limit) break;
  }
  return result;
}

function isUpDownEvent(event: { slug?: string }): boolean {
  return !!(event.slug || "").match(/updown-\d+[mh]-/);
}

async function fetchMarketBySlug(slug: string): Promise<PolymarketMarket | null> {
  try {
    const res = await fetch(`${API}/markets?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    const markets = Array.isArray(data) ? data : [data];
    return (markets as PolymarketMarket[]).find((m) => m.slug === slug) ?? (markets[0] as PolymarketMarket) ?? null;
  } catch {
    return null;
  }
}

async function fetchUpDownItems(asset: string): Promise<PredictionMarket[]> {
  const fullname = ASSET_FULLNAMES[asset] ?? asset;
  const now = Math.floor(Date.now() / 1000);
  const w5 = now - (now % 300);
  const w15 = now - (now % 900);

  const syntheticSlugs: { label: string; slug: string }[] = [
    { label: `${asset.toUpperCase()} 5M — ${fmtTime(w5)}`, slug: `${asset}-updown-5m-${w5}` },
    { label: `${asset.toUpperCase()} 15M — ${fmtTime(w15)}`, slug: `${asset}-updown-15m-${w15}` },
  ];

  const results: PredictionMarket[] = [];

  for (const { label, slug } of syntheticSlugs) {
    const m = await fetchMarketBySlug(slug);

    if (m) {
      results.push({
        ...marketToPrediction(m),
        title: label,
        polymarketUrl: `${POLYMARKET_BASE}/${slug}`,
      });
    } else {
      results.push({
        id: slug,
        title: label,
        slug,
        imageUrl: null,
        chancePercent: 0,
        volume: 0,
        polymarketUrl: `${POLYMARKET_BASE}/${slug}`,
      });
    }
  }

  try {
    const [hourlyRes, tsRes] = await Promise.all([
      fetch(
        `${API}/events?closed=false&limit=12&order=endDate&ascending=true&tag_slug=1H`
      ).then((r) => r.json()),
      fetch(
        `${API}/events?closed=false&limit=30&order=startDate&ascending=false&slug_contains=${asset}-updown`
      ).then((r) => r.json()),
    ]);

    const hourly = (hourlyRes as PolymarketEvent[]).find((e) =>
      e.slug?.startsWith(`${fullname}-up-or-down-`)
    );
    if (hourly) {
      const pred = eventToPrediction(hourly);
      if (pred) results.push(pred);
    }

    const tsEvents = tsRes as PolymarketEvent[];
    const match4h = tsEvents.find((e) => e.slug?.match(new RegExp(`^${asset}-updown-4h-`)));
    if (match4h) {
      const pred = eventToPrediction(match4h);
      if (pred) results.push(pred);
    }
  } catch {
    // 5m + 15m only
  }

  return results;
}

type MarketFilter = "all" | "crypto" | "macro";

async function fetchFilteredMarkets(filter: MarketFilter): Promise<PredictionMarket[]> {
  if (filter === "all") {
    const res = await fetch(
      `${API}/markets?closed=false&order=volume24hr&ascending=false&limit=80`
    );
    const markets = (await res.json()) as (PolymarketMarket & {
      events?: { id?: string; tags?: { slug?: string }[] }[];
    })[];
    const filtered = markets.filter((m) => {
      if ((m.slug || "").match(/updown-\d+[mh]-/)) return false;
      const tags = (m.events?.[0]?.tags || []).map((t) => t.slug);
      const hasCrypto = tags.some((s) => CRYPTO_TAG_SLUGS.has(s ?? ""));
      const hasMacro = tags.some((s) => MACRO_TAG_SLUGS.has(s ?? ""));
      return !hasCrypto && !hasMacro;
    });
    const seen = new Set<string>();
    const top: typeof markets = [];
    for (const m of filtered) {
      const eid = m.events?.[0]?.id ?? m.slug ?? "";
      if (seen.has(eid)) continue;
      seen.add(eid);
      top.push(m);
      if (top.length >= 5) break;
    }
    return top.map((m) => marketToPrediction(m));
  }

  if (filter === "crypto") {
    const res = await fetch(
      `${API}/events?closed=false&order=volume24hr&ascending=false&limit=20&tag_slug=crypto`
    );
    const crypto = (await res.json()) as PolymarketEvent[];
    const filtered = crypto.filter((e) => !isUpDownEvent(e));
  const top = dedupeEvents<PolymarketEvent>(
    filtered,
    5,
    (e) => e.id ?? e.slug ?? ""
  );
    return top
      .map((e) => eventToPrediction(e))
      .filter((p): p is PredictionMarket => p !== null);
  }

  const tags = ["finance", "economy", "fed-rates"];
  const results = await Promise.all(
    tags.map((tag) =>
      fetch(
        `${API}/events?closed=false&order=volume24hr&ascending=false&limit=20&tag_slug=${tag}`
      ).then((r) => r.json())
    )
  );
  const merged = results.flat() as PolymarketEvent[];
  merged.sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0));
  const top = dedupeEvents<PolymarketEvent>(
    merged,
    5,
    (e) => e.id ?? e.slug ?? ""
  );
  return top
    .map((e) => eventToPrediction(e))
    .filter((p): p is PredictionMarket => p !== null);
}

export const PREDICTIONS_QUERY_KEYS = {
  upDown: (asset: string) => ["predictions", "updown", asset] as const,
  markets: (filter: MarketFilter) => ["predictions", "markets", filter] as const,
};

export function useUpDownMarkets(asset: string) {
  return useQuery({
    queryKey: PREDICTIONS_QUERY_KEYS.upDown(asset),
    queryFn: () => fetchUpDownItems(asset),
    staleTime: 60 * 1000,
    refetchInterval: 20 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useFilteredMarkets(filter: MarketFilter) {
  return useQuery({
    queryKey: PREDICTIONS_QUERY_KEYS.markets(filter),
    queryFn: () => fetchFilteredMarkets(filter),
    staleTime: 60 * 1000,
    refetchInterval: 20 * 1000,
  });
}

export function useInvalidatePredictions() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["predictions"] });
  };
}
