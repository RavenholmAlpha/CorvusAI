/**
 * Semantic color palette for the Ink workbench (cassette-futurist: cyan primary,
 * amber accent, dark instrument-panel surface). Centralize color choices so the
 * UI reads as one coherent product instead of ad-hoc color tags.
 *
 * The `ui` object is mutable at runtime: components read `ui.brand` etc. on every
 * render, so calling setTheme()/cycleTheme() and triggering a re-render swaps the
 * whole palette without touching any source files. The active theme can be
 * persisted to .corvus/config.json via `config.theme`.
 */

export interface UiTheme {
  brand: string; // primary active signal
  brandBright: string;
  accent: string; // attention / highlights
  success: string;
  danger: string;
  muted: string;
  user: string; // user message
  assistant: string; // assistant message (brand)
  tool: string;
  code: string;
  codeBg: string; // dark block for code
  panelBorder: string;
}

const THEMES: Record<string, UiTheme> = {
  // Default — cassette-futurist: cyan primary, amber accent.
  cassette: {
    brand: "cyan",
    brandBright: "cyanBright",
    accent: "#ffaf00",
    success: "green",
    danger: "red",
    muted: "gray",
    user: "#7ee787",
    assistant: "cyan",
    tool: "gray",
    code: "#e6edf3",
    codeBg: "#21262d",
    panelBorder: "gray",
  },
  // Violet — magenta primary, soft lilac accent.
  violet: {
    brand: "magenta",
    brandBright: "magentaBright",
    accent: "#b388ff",
    success: "green",
    danger: "red",
    muted: "gray",
    user: "#a5d6ff",
    assistant: "magenta",
    tool: "gray",
    code: "#f5f0ff",
    codeBg: "#2a2336",
    panelBorder: "gray",
  },
  // Emerald — green primary, mint accent.
  emerald: {
    brand: "green",
    brandBright: "greenBright",
    accent: "#4ade80",
    success: "green",
    danger: "red",
    muted: "gray",
    user: "#b9fbc0",
    assistant: "green",
    tool: "gray",
    code: "#eafff0",
    codeBg: "#16251c",
    panelBorder: "gray",
  },
  // Ember — red primary, warm orange accent.
  ember: {
    brand: "red",
    brandBright: "redBright",
    accent: "#ff6b4a",
    success: "green",
    danger: "red",
    muted: "gray",
    user: "#ffd6c2",
    assistant: "red",
    tool: "gray",
    code: "#fff0e8",
    codeBg: "#2b1a14",
    panelBorder: "gray",
  },
  // Ocean — blue primary, sky accent.
  ocean: {
    brand: "blue",
    brandBright: "blueBright",
    accent: "#60a5fa",
    success: "green",
    danger: "red",
    muted: "gray",
    user: "#bfdbfe",
    assistant: "blue",
    tool: "gray",
    code: "#eaf4ff",
    codeBg: "#101c2e",
    panelBorder: "gray",
  },
};

export const THEME_NAMES: string[] = Object.keys(THEMES);

let activeTheme: string = "cassette";

/** Live palette object — mutate via setTheme()/cycleTheme(), then re-render. */
export const ui: UiTheme = { ...THEMES[activeTheme] };

export function getActiveThemeName(): string {
  return activeTheme;
}

/** Apply a named preset. Returns false if the name is unknown. */
export function setTheme(name: string): boolean {
  const palette = THEMES[name];
  if (!palette) return false;
  activeTheme = name;
  Object.assign(ui, palette);
  return true;
}

/** Advance to the next preset (wraps around). Returns the new theme name. */
export function cycleTheme(): string {
  const index = THEME_NAMES.indexOf(activeTheme);
  const next = THEME_NAMES[(index + 1) % THEME_NAMES.length];
  setTheme(next);
  return next;
}
