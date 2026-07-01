import { HOME_CATS, HOME_COPY, costLabel, type HomeCat } from "./cats";
import { Reveal } from "./Reveal";

function CatCard({ cat, index }: { cat: HomeCat; index: number }) {
  const color = `var(${cat.colorVar})`;
  const permanent = cat.lifecycle === "permanent";

  return (
    <Reveal
      as="li"
      delay={index * 90}
      className="relative flex flex-col rounded-2xl border border-dusk-700 bg-dusk-800 p-6"
    >
      {/* Cat-color edge where the thread enters */}
      <span
        aria-hidden
        className="absolute left-0 top-6 h-[calc(100%-3rem)] w-1 rounded-full"
        style={{ background: color, opacity: 0.9 }}
      />

      <div className="flex items-center gap-4">
        {/* Bead — a bead of yarn strung on the thread */}
        <span
          data-thread-anchor={`cat-${index}`}
          data-thread-color={cat.colorHex}
          aria-hidden
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${color}, color-mix(in oklab, ${color} 55%, #000) 100%)`,
            boxShadow: `0 0 18px 1px color-mix(in oklab, ${color} 55%, transparent)`,
          }}
        >
          🐾
        </span>
        <div>
          <h3 className="font-display text-2xl font-bold text-mist">{cat.name}</h3>
          {/* Cost + lifecycle pill */}
          <span
            className="mt-1 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold"
            style={{
              color,
              background: `color-mix(in oklab, ${color} 16%, transparent)`,
              border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
            }}
          >
            {costLabel(cat)}
          </span>
        </div>
      </div>

      <p className="mt-4 leading-relaxed text-mist-dim">{cat.blurb}</p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-mist-dim/70">
        {permanent ? "Stays until dismissed · yarn refunded" : "Fades on its own · yarn consumed"}
      </p>
    </Reveal>
  );
}

export function CatRoster() {
  return (
    <section
      aria-labelledby="cats-heading"
      className="relative mx-auto w-full max-w-6xl px-6 py-20"
    >
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2
          id="cats-heading"
          className="font-display text-[clamp(2rem,4.5vw,3rem)] font-bold text-mist"
        >
          {HOME_COPY.catsHeading}
        </h2>
        <p className="mt-3 text-lg text-mist-dim">{HOME_COPY.catsLede}</p>
      </Reveal>

      <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {HOME_CATS.map((cat, i) => (
          <CatCard key={cat.id} cat={cat} index={i} />
        ))}
      </ul>
    </section>
  );
}
