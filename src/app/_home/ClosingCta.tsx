import { HOME_COPY } from "./cats";
import { PlayCta } from "./PlayCta";
import { Reveal } from "./Reveal";

/** The payoff: the thread winds into a ball of yarn behind the Play button. */
export function ClosingCta() {
  return (
    <section
      aria-labelledby="cta-heading"
      className="relative mx-auto w-full max-w-3xl px-6 py-24 text-center"
    >
      <Reveal>
        {/* Ball of yarn — the thread's destination */}
        <span
          data-thread-anchor="ball"
          aria-hidden
          className="ch-float-slow mx-auto mb-8 block h-20 w-20 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, var(--color-ember), var(--color-ember-deep) 70%, color-mix(in oklab, var(--color-ember-deep) 60%, #000) 100%)",
            boxShadow: "0 0 30px 4px color-mix(in oklab, var(--color-ember) 45%, transparent)",
          }}
        />
        <h2
          id="cta-heading"
          className="font-display text-[clamp(2rem,5vw,3.25rem)] font-extrabold text-mist"
        >
          {HOME_COPY.ctaHeading}
        </h2>
        <div className="mt-8 flex justify-center">
          <PlayCta size="lg" />
        </div>
        <p className="mt-4 text-sm text-mist-dim">{HOME_COPY.ctaMicrocopy}</p>
      </Reveal>
    </section>
  );
}
