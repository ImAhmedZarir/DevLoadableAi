import React from "react";
import { cn } from "@/lib/utils";

export interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  showSubtitle?: boolean;
  className?: string;
}

export function Logo({
  size = "md",
  showWordmark = true,
  showSubtitle = false,
  className,
}: LogoProps) {
  const sizeClasses = {
    sm: "h-6 w-6 rounded-md",
    md: "h-8 w-8 rounded-lg",
    lg: "h-10 w-10 rounded-xl",
    xl: "h-12 w-12 rounded-2xl",
  };

  const textClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
    xl: "text-lg",
  };

  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div
        className={cn(
          "relative overflow-hidden flex-shrink-0 border border-white/10 bg-black shadow-[0_0_15px_rgba(255,255,255,0.08)]",
          sizeClasses[size],
        )}
      >
        <img
          src="/faviconandlogo.png"
          alt="DevLoadable"
          className="h-full w-full object-cover"
          loading="eager"
        />
      </div>

      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-bold tracking-tight text-white flex items-center gap-1.5",
              textClasses[size],
            )}
          >
            <span>DevLoadable</span>
          </span>
          {showSubtitle && (
            <span className="text-[10px] tracking-wider text-zinc-400 font-mono mt-0.5">
              by ZarGPT
            </span>
          )}
        </div>
      )}
    </div>
  );
}
