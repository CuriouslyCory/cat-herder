export interface CharacterAppearance {
  shape: "box" | "sphere" | "cylinder";
  color: string; // hex string e.g. "#ff5722"
  size: 0.8 | 1.0 | 1.2;
}

type OnConfirm = (appearance: CharacterAppearance) => void;

const PRESET_COLORS = [
  "#f44336",
  "#e91e63",
  "#9c27b0",
  "#3f51b5",
  "#2196f3",
  "#00bcd4",
  "#4caf50",
  "#ff9800",
];

const SHAPES: Array<{ value: CharacterAppearance["shape"]; label: string }> = [
  { value: "box", label: "Block" },
  { value: "sphere", label: "Sphere" },
  { value: "cylinder", label: "Cylinder" },
];

const SIZES: Array<{ value: CharacterAppearance["size"]; label: string }> = [
  { value: 0.8, label: "Small" },
  { value: 1.0, label: "Medium" },
  { value: 1.2, label: "Large" },
];

export class CharacterCreatorUI {
  private readonly overlay: HTMLElement;
  private appearance: CharacterAppearance = {
    shape: "box",
    color: PRESET_COLORS[0] ?? "#f44336",
    size: 1.0,
  };

  constructor(private readonly onConfirm: OnConfirm) {
    this.overlay = this.build();
    document.body.appendChild(this.overlay);
  }

  /** Remove the overlay from the DOM. */
  dismiss(): void {
    this.overlay.remove();
  }

  private build(): HTMLElement {
    const overlay = el("div", {
      style: Object.assign({}, styles.overlay),
    });

    const panel = el("div", { style: Object.assign({}, styles.panel) });

    panel.appendChild(heading("Create Your Character"));

    // Shape picker
    panel.appendChild(label("Shape"));
    const shapePicker = el("div", { style: Object.assign({}, styles.row) });
    for (const s of SHAPES) {
      const btn = el("button", { style: Object.assign({}, styles.optionBtn) });
      btn.textContent = s.label;
      btn.dataset["value"] = s.value;
      btn.addEventListener("click", () => {
        this.appearance.shape = s.value;
        updateActive(shapePicker, btn);
      });
      if (s.value === this.appearance.shape) {
        btn.style.outline = "2px solid #fff";
      }
      shapePicker.appendChild(btn);
    }
    panel.appendChild(shapePicker);

    // Color picker
    panel.appendChild(label("Color"));
    const colorRow = el("div", { style: Object.assign({}, styles.row) });
    for (const color of PRESET_COLORS) {
      const swatch = el("button", {
        style: {
          ...styles.swatch,
          background: color,
          outline: color === this.appearance.color ? "2px solid #fff" : "none",
        },
      });
      swatch.title = color;
      swatch.addEventListener("click", () => {
        this.appearance.color = color;
        updateActive(colorRow, swatch);
      });
      colorRow.appendChild(swatch);
    }
    // Hex input
    const hexInput = el("input", {
      style: Object.assign({}, styles.hexInput),
    });
    hexInput.type = "text";
    hexInput.placeholder = "#rrggbb";
    hexInput.maxLength = 7;
    hexInput.addEventListener("input", () => {
      const v = hexInput.value;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        this.appearance.color = v;
      }
    });
    colorRow.appendChild(hexInput);
    panel.appendChild(colorRow);

    // Size selector
    panel.appendChild(label("Size"));
    const sizeRow = el("div", { style: Object.assign({}, styles.row) });
    for (const s of SIZES) {
      const btn = el("button", { style: Object.assign({}, styles.optionBtn) });
      btn.textContent = s.label;
      btn.addEventListener("click", () => {
        this.appearance.size = s.value;
        updateActive(sizeRow, btn);
      });
      if (s.value === this.appearance.size) {
        btn.style.outline = "2px solid #fff";
      }
      sizeRow.appendChild(btn);
    }
    panel.appendChild(sizeRow);

    // Start Game button
    const startBtn = el("button", { style: Object.assign({}, styles.startBtn) });
    startBtn.textContent = "Start Game";
    startBtn.addEventListener("click", () => {
      this.onConfirm({ ...this.appearance });
    });
    panel.appendChild(startBtn);

    overlay.appendChild(panel);
    return overlay;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { style?: Partial<CSSStyleDeclaration>; [k: string]: unknown },
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.style) Object.assign(element.style, props.style);
  return element;
}

function heading(text: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = text;
  Object.assign(h.style, styles.heading);
  return h;
}

function label(text: string): HTMLElement {
  const p = document.createElement("p");
  p.textContent = text;
  Object.assign(p.style, styles.label);
  return p;
}

function updateActive(container: HTMLElement, active: HTMLElement): void {
  for (const child of container.children) {
    (child as HTMLElement).style.outline = "none";
  }
  active.style.outline = "2px solid #fff";
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, Partial<CSSStyleDeclaration>> = {
  overlay: {
    position: "fixed",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.85)",
    zIndex: "200",
    fontFamily: "system-ui, sans-serif",
    color: "#fff",
  },
  panel: {
    background: "#1a1a2e",
    borderRadius: "1rem",
    padding: "2rem",
    width: "360px",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  heading: {
    margin: "0 0 0.5rem",
    fontSize: "1.5rem",
    textAlign: "center",
  },
  label: {
    margin: "0",
    fontWeight: "600",
    fontSize: "0.9rem",
    opacity: "0.7",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  optionBtn: {
    padding: "0.4rem 1rem",
    background: "#2d2d44",
    color: "#fff",
    border: "none",
    borderRadius: "0.4rem",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  swatch: {
    width: "28px",
    height: "28px",
    border: "none",
    borderRadius: "50%",
    cursor: "pointer",
  },
  hexInput: {
    background: "#2d2d44",
    color: "#fff",
    border: "none",
    borderRadius: "0.4rem",
    padding: "0 0.5rem",
    width: "80px",
    fontSize: "0.85rem",
  },
  startBtn: {
    marginTop: "1rem",
    padding: "0.75rem",
    background: "#ff5722",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "1.1rem",
    fontWeight: "600",
  },
};
