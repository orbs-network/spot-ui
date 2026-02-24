"use client";

import { useState } from "react";
import {
  useUpDownMarkets,
  useFilteredMarkets,
} from "@/lib/hooks/use-predictions";
import { PredictionCard } from "@/components/predictions/prediction-card";
import { PredictionCardSkeleton } from "@/components/predictions/prediction-card-skeleton";
import { Spinner } from "@/components/ui/spinner";

export default function PredictionsPage() {
  const [currentAsset, setCurrentAsset] = useState("btc");
  const [currentFilter, setCurrentFilter] = useState<
    "all" | "crypto" | "macro"
  >("all");

  const {
    data: updownItems = [],
    isLoading: updownLoading,
    isFetching: updownFetching,
    refetch: refetchUpDown,
  } = useUpDownMarkets(currentAsset);

  const {
    data: marketsItems = [],
    isLoading: marketsLoading,
    isError: marketsError,
    isFetching: marketsFetching,
    refetch: refetchMarkets,
  } = useFilteredMarkets(currentFilter);

  const refreshBtnClass =
    "cursor-pointer border-none bg-transparent px-2 py-1 text-xs text-[#555] transition-colors hover:text-[#e0e0e0]";

  const pillBase =
    "px-3.5 py-1.5 rounded-full text-[13px] font-medium cursor-pointer border transition-all border-[#2a2a2a] bg-transparent text-[#888] hover:text-[#e0e0e0] hover:border-[#444]";
  const pillActive = "text-white bg-[#2a2a2a] border-[#444]";

  return (
    <div className="min-h-screen w-full bg-[#0d0d0d] text-[#e0e0e0]">
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-10">
          <div className="mb-2 flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Predictions
            </h1>
            <span className="rounded-full bg-[#1a2a1a] px-2.5 py-0.5 text-xs font-medium text-[#4ade80]">
              Live
            </span>
          </div>
          <p className="max-w-xl text-[15px] leading-relaxed text-[#888]">
            Trade real-time event odds with USDC. Start with crypto moves, then
            explore what the crowd is pricing.
          </p>
          <p className="mt-1 text-xs text-[#555]">
            Powered by{" "}
            <a
              href="https://polymarket.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#666] underline-offset-2 hover:text-[#888] hover:underline"
            >
              Polymarket
            </a>
          </p>
        </header>

        {/* Live Price Predictions */}
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-[#1a1a1a] pb-2">
            <h2 className="text-base font-semibold text-white">
              Live Price Predictions
            </h2>
            <button
              type="button"
              onClick={() => refetchUpDown()}
              disabled={updownFetching}
              className={`${refreshBtnClass} flex items-center gap-1.5`}
            >
              {updownFetching && (
                <Spinner className="size-3.5 shrink-0 text-[#555]" />
              )}
              Refresh
            </button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {["btc", "eth", "sol", "xrp"].map((asset) => (
              <button
                key={asset}
                onClick={() => setCurrentAsset(asset)}
                className={`${pillBase} ${
                  currentAsset === asset ? pillActive : ""
                }`}
              >
                {asset.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {updownLoading ? (
              <>
                <PredictionCardSkeleton />
                <PredictionCardSkeleton />
                <PredictionCardSkeleton />
                <PredictionCardSkeleton />
              </>
            ) : updownItems.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#444]">
                No markets found
              </div>
            ) : (
              updownItems.map((market) => (
                <PredictionCard key={market.id} market={market} />
              ))
            )}
          </div>
        </section>

        {/* Markets */}
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-[#1a1a1a] pb-2">
            <h2 className="text-base font-semibold text-white">Markets</h2>
            <button
              type="button"
              onClick={() => refetchMarkets()}
              disabled={marketsFetching}
              className={`${refreshBtnClass} flex items-center gap-1.5`}
            >
              {marketsFetching && (
                <Spinner className="size-3.5 shrink-0 text-[#555]" />
              )}
              Refresh
            </button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["all", "crypto", "macro"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setCurrentFilter(filter)}
                className={`${pillBase} capitalize ${
                  currentFilter === filter ? pillActive : ""
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {marketsLoading ? (
              <>
                <PredictionCardSkeleton />
                <PredictionCardSkeleton />
                <PredictionCardSkeleton />
                <PredictionCardSkeleton />
                <PredictionCardSkeleton />
              </>
            ) : marketsError ? (
              <div className="py-10 text-center text-[13px] text-[#ff6b6b]">
                Failed to load. Is the API available?
              </div>
            ) : marketsItems.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#444]">
                No markets found
              </div>
            ) : (
              marketsItems.map((market) => (
                <PredictionCard key={market.id} market={market} />
              ))
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
