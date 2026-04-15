import React, { useEffect, useRef } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { AuthModule } from "./modules/auth/AuthModule";

interface AppProps {
  onAuthenticated: (auth: AuthModule) => void;
}

export function App({ onAuthenticated }: AppProps): React.JSX.Element {
  const { isLoading, user, signIn, signOut, getAccessToken } = useAuth();
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!isLoading && user && !notifiedRef.current) {
      notifiedRef.current = true;
      const auth = new AuthModule(
        () => signIn(),
        () => signOut(),
        () => user,
        () => getAccessToken(),
      );
      onAuthenticated(auth);
    }
  }, [isLoading, user, signIn, signOut, getAccessToken, onAuthenticated]);

  if (isLoading) {
    return (
      <div style={styles.centered}>
        <p style={styles.text}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.centered}>
        <h1 style={styles.title}>Cat Herder</h1>
        <button style={styles.button} onClick={() => signIn()}>
          Sign In
        </button>
      </div>
    );
  }

  // Authenticated — the canvas (mounted elsewhere) is now visible
  return <></>;
}

const styles: Record<string, React.CSSProperties> = {
  centered: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0a",
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
    zIndex: 100,
  },
  title: {
    fontSize: "3rem",
    marginBottom: "2rem",
    letterSpacing: "0.05em",
  },
  text: {
    fontSize: "1.2rem",
    opacity: 0.7,
  },
  button: {
    padding: "0.75rem 2.5rem",
    fontSize: "1.1rem",
    background: "#ff5722",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
  },
};
