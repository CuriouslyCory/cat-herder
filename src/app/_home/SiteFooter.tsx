import { HOME_COPY } from "./cats";

export function SiteFooter() {
  return (
    <footer className="border-t border-dusk-700 px-6 py-10 text-center">
      <p className="text-mist-dim">{HOME_COPY.footerLine}</p>
      <nav className="mt-4 flex justify-center gap-5 text-sm text-mist-dim/80">
        <a href="/play" className="hover:text-ember">
          Play
        </a>
      </nav>
    </footer>
  );
}
