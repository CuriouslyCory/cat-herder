"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { resolvePlayCta } from "./play-cta";

interface PlayCtaProps {
  /** "lg" for the hero + closing CTA; "md" for tighter placements. */
  size?: "lg" | "md";
  /** Show the quiet "Sign in to play" hint beneath (hero only). */
  showHint?: boolean;
  className?: string;
}

const SIZES = {
  lg: "px-8 py-4 text-lg",
  md: "px-6 py-3 text-base",
} as const;

export function PlayCta({ size = "lg", showHint = false, className }: PlayCtaProps) {
  const { user, loading, refreshAuth } = useAuth();
  const state = resolvePlayCta({ user, loading });

  // Solid ember with a DARK label — white would fail contrast on gold.
  const base = `inline-flex items-center justify-center gap-2 rounded-full font-display font-bold tracking-wide shadow-lg shadow-black/30 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:translate-y-0 ${SIZES[size]}`;
  const solid = "bg-ember text-dusk-900 hover:bg-ember-deep";

  // Fixed-size placeholder while auth resolves — same box, no layout shift.
  if (state.kind === "loading") {
    return (
      <div className={className}>
        <span
          aria-hidden
          className={`${base} ${solid} pointer-events-none animate-pulse opacity-60`}
        >
          Play
        </span>
      </div>
    );
  }

  if (state.kind === "play") {
    return (
      <div className={className}>
        <a href={state.href} className={`${base} ${solid}`}>
          <span aria-hidden>🐾</span> Play
        </a>
      </div>
    );
  }

  // Signed out — the primary action starts WorkOS hosted sign-in, then /play.
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void refreshAuth({ ensureSignedIn: true })}
        className={`${base} ${solid}`}
      >
        <span aria-hidden>🐾</span> Play
      </button>
      {showHint && (
        <p className="mt-2 text-sm text-mist-dim">Sign in to play — it&rsquo;s free.</p>
      )}
    </div>
  );
}
