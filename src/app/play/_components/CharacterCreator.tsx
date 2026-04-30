"use client";

import { useState } from "react";

import type { PlayerCharacterConfig } from "~/game/engine/Game";
import { api } from "~/trpc/react";

interface CharacterCreatorProps {
  onComplete: (config: PlayerCharacterConfig) => void;
}

type ShapeValue = "box" | "sphere" | "cylinder";

const SHAPES: { value: ShapeValue; label: string }[] = [
  { value: "box", label: "Block" },
  { value: "sphere", label: "Sphere" },
  { value: "cylinder", label: "Cylinder" },
];

const PRESET_COLORS = [
  "#ff6b35",
  "#e63946",
  "#457b9d",
  "#2a9d8f",
  "#e9c46a",
  "#f4a261",
  "#8338ec",
  "#06d6a0",
] as const;

const SIZES: { value: number; label: string }[] = [
  { value: 0.8, label: "Small" },
  { value: 1.0, label: "Medium" },
  { value: 1.2, label: "Large" },
];

export function CharacterCreator({ onComplete }: CharacterCreatorProps) {
  const [shape, setShape] = useState<ShapeValue>("box");
  const [colorHex, setColorHex] = useState("#ff6b35");
  const [sizeScale, setSizeScale] = useState(1.0);

  const upsertCharacter = api.game.upsertCharacter.useMutation({
    onSuccess: () => onComplete({ shape, colorHex, sizeScale }),
  });

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <h2 style={styles.title}>Create Your Character</h2>

        {/* Shape picker */}
        <section style={styles.section}>
          <p style={styles.sectionLabel}>Shape</p>
          <div style={styles.row}>
            {SHAPES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setShape(value)}
                style={{
                  ...styles.shapeBtn,
                  ...(shape === value ? styles.shapeBtnActive : {}),
                }}
              >
                <ShapePreview shape={value} color={colorHex} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Color picker */}
        <section style={styles.section}>
          <p style={styles.sectionLabel}>Color</p>
          <div style={styles.row}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColorHex(c)}
                title={c}
                style={{
                  ...styles.colorSwatch,
                  backgroundColor: c,
                  outline:
                    colorHex === c ? "3px solid #fff" : "3px solid transparent",
                }}
              />
            ))}
            <input
              type="color"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              style={styles.colorInput}
              title="Custom color"
            />
          </div>
        </section>

        {/* Size picker */}
        <section style={styles.section}>
          <p style={styles.sectionLabel}>Size</p>
          <div style={styles.row}>
            {SIZES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSizeScale(value)}
                style={{
                  ...styles.sizeBtn,
                  ...(sizeScale === value ? styles.sizeBtnActive : {}),
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {upsertCharacter.isError && (
          <p style={styles.error}>{upsertCharacter.error.message}</p>
        )}

        <button
          onClick={() => upsertCharacter.mutate({ shape, colorHex, sizeScale })}
          disabled={upsertCharacter.isPending}
          style={{
            ...styles.startBtn,
            ...(upsertCharacter.isPending ? styles.startBtnDisabled : {}),
          }}
        >
          {upsertCharacter.isPending ? "Creating…" : "Start Game"}
        </button>
      </div>
    </div>
  );
}

function ShapePreview({
  shape,
  color,
}: {
  shape: ShapeValue;
  color: string;
}) {
  if (shape === "sphere") {
    return (
      <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
        <circle cx="22" cy="22" r="18" fill={color} />
      </svg>
    );
  }
  if (shape === "cylinder") {
    return (
      <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
        <ellipse cx="22" cy="11" rx="15" ry="5" fill={color} />
        <rect x="7" y="11" width="30" height="22" fill={color} />
        <ellipse cx="22" cy="33" rx="15" ry="5" fill={color} opacity="0.75" />
      </svg>
    );
  }
  // box
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden>
      <rect x="8" y="8" width="28" height="28" fill={color} rx="3" />
    </svg>
  );
}

const styles = {
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.82)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  panel: {
    backgroundColor: "#1a1a2e",
    border: "1px solid #3a3a5a",
    borderRadius: 14,
    padding: "2rem",
    width: 440,
    maxWidth: "90vw",
    color: "#fff",
    fontFamily:
      "var(--font-geist-sans, ui-sans-serif, system-ui, sans-serif)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
  },
  title: {
    margin: "0 0 1.75rem",
    fontSize: "1.4rem",
    fontWeight: 700,
    textAlign: "center" as const,
    letterSpacing: "-0.01em",
  },
  section: {
    marginBottom: "1.5rem",
  },
  sectionLabel: {
    margin: "0 0 0.6rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    color: "#888",
  },
  row: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    alignItems: "center",
  },
  shapeBtn: {
    flex: 1,
    minWidth: 90,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 6,
    padding: "0.75rem 0.5rem",
    background: "#252540",
    border: "2px solid transparent",
    borderRadius: 10,
    color: "#ccc",
    cursor: "pointer",
    fontSize: "0.82rem",
    fontWeight: 500,
    transition: "border-color 0.1s, background 0.1s",
  },
  shapeBtnActive: {
    borderColor: "#7b7bff",
    background: "#2e2e50",
    color: "#fff",
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    outlineOffset: 3,
    flexShrink: 0,
  },
  colorInput: {
    width: 34,
    height: 34,
    padding: 0,
    border: "2px solid #3a3a5a",
    borderRadius: "50%",
    cursor: "pointer",
    background: "none",
    overflow: "hidden",
    flexShrink: 0,
  },
  sizeBtn: {
    flex: 1,
    padding: "0.65rem 0.5rem",
    background: "#252540",
    border: "2px solid transparent",
    borderRadius: 10,
    color: "#ccc",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 500,
    textAlign: "center" as const,
    transition: "border-color 0.1s, background 0.1s",
  },
  sizeBtnActive: {
    borderColor: "#7b7bff",
    background: "#2e2e50",
    color: "#fff",
  },
  startBtn: {
    width: "100%",
    padding: "0.9rem",
    marginTop: "0.5rem",
    background: "#5a5aff",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.01em",
  },
  startBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed" as const,
  },
  error: {
    color: "#ff6b6b",
    fontSize: "0.82rem",
    marginBottom: "0.75rem",
    textAlign: "center" as const,
  },
} as const;
