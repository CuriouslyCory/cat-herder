import { NavAuth } from "~/app/_components/nav-auth";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-bold">Cat Herder</span>
        <NavAuth />
      </header>
      <div className="container mx-auto flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          Cat <span className="text-[hsl(280,100%,70%)]">Herder</span>
        </h1>
        <p className="max-w-prose text-center text-lg opacity-80">
          Sign in to start herding cats.
        </p>
      </div>
    </main>
  );
}
