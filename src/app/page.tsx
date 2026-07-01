import { NavAuth } from "~/app/_components/nav-auth";
import { CatRoster } from "~/app/_home/CatRoster";
import { ClosingCta } from "~/app/_home/ClosingCta";
import { HeroSection } from "~/app/_home/HeroSection";
import { HowItPlays } from "~/app/_home/HowItPlays";
import { SiteFooter } from "~/app/_home/SiteFooter";
import { YarnThread } from "~/app/_home/YarnThread";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-dusk-900 text-mist">
      {/* Slim account control, floating over the hero */}
      <header className="absolute inset-x-0 top-0 z-30 flex justify-end px-6 py-4">
        <NavAuth />
      </header>

      {/* The signature yarn thread, drawn over the whole scroll */}
      <YarnThread />

      <div className="relative z-10">
        <HeroSection />
        <CatRoster />
        <HowItPlays />
        <ClosingCta />
        <SiteFooter />
      </div>
    </main>
  );
}
