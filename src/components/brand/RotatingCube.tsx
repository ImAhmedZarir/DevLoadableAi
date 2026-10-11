import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface RotatingCubeProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZES = {
  sm: "w-36 h-36 md:w-44 md:h-44",
  md: "w-52 h-52 md:w-64 md:h-64",
  lg: "w-72 h-72 md:w-88 md:h-88",
  xl: "w-80 h-80 md:w-96 md:h-96",
} as const;

/**
 * Plays /cube.mp4 only. No canvas, no fake fallback cube.
 * The video has a pure black background, so `mix-blend-screen` makes
 * the black transparent and the cube floats on the page glow.
 */
export function RotatingCube({ className, size = "lg" }: RotatingCubeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Browsers only autoplay when the video is muted. React does not
    // always put `muted` on the DOM node, so set it explicitly.
    video.muted = true;
    video.defaultMuted = true;

    // Respect "reduce motion": stay on the first frame.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
      return;
    }

    video.play().catch(() => {
      /* autoplay blocked: video simply stays on its first frame */
    });

    // Save battery/CPU: pause while the cube is scrolled out of view.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.1 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center select-none pointer-events-none",
        SIZES[size],
        className,
      )}
    >
      {/* Soft ambient halo behind the cube */}
      <div className="absolute inset-0 -translate-y-2 scale-110 rounded-full bg-gradient-to-tr from-white/10 via-zinc-500/10 to-transparent blur-3xl" />

      <video
        ref={videoRef}
        src="/cube.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden="true"
        className="relative z-10 h-full w-full object-contain mix-blend-screen"
      />
    </div>
  );
}
