/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import { AuthKitProvider } from "@workos-inc/authkit-react";
import { App } from "./App";
import type { AuthModule } from "./modules/auth/AuthModule";
import { Game } from "./engine/Game";
import { TestMap } from "./maps/TestMap";
import { env } from "./env";

const rootEl = document.getElementById("react-root");
if (!rootEl) throw new Error("Missing #react-root element");

const reactRoot = createRoot(rootEl);

let game: Game | null = null;

function handleAuthenticated(auth: AuthModule): void {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  if (!canvas) throw new Error("Missing #game-canvas element");

  canvas.style.display = "block";

  game = new Game(canvas, auth);
  game.mapManager.loadMap(TestMap);
  game.start();
}

reactRoot.render(
  <AuthKitProvider clientId={env.VITE_WORKOS_CLIENT_ID} redirectUri={env.VITE_WORKOS_REDIRECT_URI}>
    <App onAuthenticated={handleAuthenticated} />
  </AuthKitProvider>,
);
