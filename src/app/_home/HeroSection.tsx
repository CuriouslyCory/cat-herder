import Image from "next/image";

import { HOME_COPY } from "./cats";
import { PlayCta } from "./PlayCta";
import { Starfield } from "./Starfield";

/**
 * Full-bleed title hero: dusk landscape + scrim, the wordmark, an honest
 * subhead, the Play CTA, and the glowing hero cat playing with the thread.
 */
export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative flex min-h-[88svh] w-full items-center overflow-hidden"
    >
      {/* Background art */}
      <Image
        src="/images/title-bg.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-bottom opacity-60"
      />
      {/* Dusk scrim — guarantees text contrast over variable art */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 30% 40%, rgba(26,20,38,0.62) 0%, rgba(26,20,38,0.78) 55%, var(--color-dusk-900) 100%)",
        }}
      />
      <Starfield />

      {/* Content */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="order-2 text-center lg:order-1 lg:text-left">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-mist-dim">
            🐾 A quiet little game
          </p>

          <h1
            id="hero-heading"
            data-thread-anchor="wordmark"
            data-thread-color="#f2b04a"
            className="ch-wordmark ch-wordmark-sheen font-display text-[clamp(3.25rem,9vw,6.5rem)] font-extrabold leading-[0.95]"
          >
            Cat
            <span
              aria-hidden
              className="text-ember"
              style={{ WebkitTextFillColor: "var(--color-ember)" }}
            >
              &ndash;
            </span>
            Herder
          </h1>

          <p className="mt-3 font-display text-xl font-bold tracking-wide text-ember">
            {HOME_COPY.tagline}
          </p>

          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-mist-dim lg:mx-0">
            {HOME_COPY.heroSubhead}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start">
            <PlayCta size="lg" showHint />
          </div>
        </div>

        {/* Hero cat */}
        <div className="order-1 flex justify-center lg:order-2">
          <div
            data-thread-anchor="hero"
            data-thread-color="#f2b04a"
            className="ch-float ch-pulse-glow relative"
          >
            <Image
              src="/images/hero-cat.webp"
              alt="A cat wreathed in a warm glow, batting at a strand of yarn"
              width={440}
              height={440}
              priority
              className="h-auto w-[min(72vw,440px)] select-none drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
            />
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-5 z-10 flex justify-center"
      >
        <span className="ch-float text-mist-dim/70 text-sm">↓ meet your cats</span>
      </div>
    </section>
  );
}
