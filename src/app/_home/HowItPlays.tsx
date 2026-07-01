import { HOW_IT_PLAYS, HOME_COPY } from "./cats";
import { Reveal } from "./Reveal";

/** Three plain steps: Summon → Build → Wander. Each is a knot on the thread. */
export function HowItPlays() {
  return (
    <section
      aria-labelledby="how-heading"
      className="relative mx-auto w-full max-w-5xl px-6 py-20"
    >
      <Reveal className="text-center">
        <h2
          id="how-heading"
          className="font-display text-[clamp(2rem,4.5vw,3rem)] font-bold text-mist"
        >
          {HOME_COPY.howHeading}
        </h2>
      </Reveal>

      <ol className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
        {HOW_IT_PLAYS.map((step, i) => (
          <Reveal as="li" key={step.n} delay={i * 110} className="text-center">
            <span
              data-thread-anchor={`step-${i}`}
              aria-hidden
              className="mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-ember font-display text-2xl font-extrabold text-ember"
              style={{ boxShadow: "0 0 20px 1px color-mix(in oklab, var(--color-ember) 40%, transparent)" }}
            >
              {step.n}
            </span>
            <h3 className="mt-5 font-display text-xl font-bold text-mist">{step.title}</h3>
            <p className="mx-auto mt-2 max-w-xs leading-relaxed text-mist-dim">
              {step.body}
            </p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
