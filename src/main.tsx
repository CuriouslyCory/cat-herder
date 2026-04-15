/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import { AuthKitProvider } from "@workos-inc/authkit-react";
import { App } from "./App";
import type { AuthModule } from "./modules/auth/AuthModule";

const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string;
const redirectUri = import.meta.env.VITE_WORKOS_REDIRECT_URI as string;

const rootEl = document.getElementById("react-root");
if (!rootEl) throw new Error("Missing #react-root element");

const reactRoot = createRoot(rootEl);

function handleAuthenticated(auth: AuthModule): void {
  // Game bootstrap will be wired here in US-018
  console.log("Authenticated as", auth.getUser()?.email);
}

reactRoot.render(
  <AuthKitProvider clientId={clientId} redirectUri={redirectUri}>
    <App onAuthenticated={handleAuthenticated} />
  </AuthKitProvider>,
);
