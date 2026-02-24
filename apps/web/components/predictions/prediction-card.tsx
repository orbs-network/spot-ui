"use client";

import type { PredictionMarket } from "@/lib/types/polymarket";
import { fmtVol } from "@/lib/hooks/use-predictions";

interface PredictionCardProps {
  market: PredictionMarket;
}

export function PredictionCard({ market }: PredictionCardProps) {
  return (
    <a
      href={market.polymarketUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 rounded-lg border border-[#1f1f1f] bg-[#141414] px-4 py-3 transition-colors hover:border-[#333] hover:bg-[#1a1a1a]"
    >
      <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#1f1f1f]">
        {market.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={market.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[14px] font-medium text-[#666]">
            ?
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[14px] font-medium leading-snug text-[#e0e0e0]">
          {market.title}
        </p>
        <div className="mt-0.5 flex items-center gap-3 text-[12px] text-[#888]">
          <span className="font-medium text-[#4ade80]">
            {market.chancePercent}%
          </span>
          <span>{fmtVol(market.volume)} vol</span>
        </div>
      </div>
      <span className="shrink-0 text-[12px] text-[#555] transition-colors group-hover:text-[#888]">
        →
      </span>
    </a>
  );
}
