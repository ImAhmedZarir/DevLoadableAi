import React from "react";
import { cn } from "@/lib/utils";

interface ParentBrandPillProps {
  className?: string;
}

export function ParentBrandPill({ className }: ParentBrandPillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/80 px-3.5 py-1 text-[12px] font-medium text-zinc-300 backdrop-blur-md transition-all hover:border-white/20 hover:bg-zinc-900/90 shadow-sm",
        className,
      )}
    >
      <span className="flex h-2 w-2 relative">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span className="text-zinc-200">DevLoadable</span>
      <span className="text-zinc-500 font-mono text-[11px]">·</span>
      <span className="text-zinc-400">part of ZarGPT</span>
    </div>
  );
}
