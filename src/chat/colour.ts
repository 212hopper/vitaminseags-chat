/** CSS named colors (lowercase) → #RRGGBB */
export const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff",
  orange: "#ffa500",
  pink: "#ffc0cb",
  gold: "#ffd700",
  coral: "#ff7f50",
  tomato: "#ff6347",
  orangered: "#ff4500",
  crimson: "#dc143c",
  hotpink: "#ff69b4",
  deeppink: "#ff1493",
  salmon: "#fa8072",
  khaki: "#f0e68c",
  violet: "#ee82ee",
  orchid: "#da70d6",
  plum: "#dda0dd",
  indigo: "#4b0082",
  slateblue: "#6a5acd",
  royalblue: "#4169e1",
  dodgerblue: "#1e90ff",
  deepskyblue: "#00bfff",
  skyblue: "#87ceeb",
  steelblue: "#4682b4",
  seagreen: "#2e8b57",
  mediumseagreen: "#3cb371",
  springgreen: "#00ff7f",
  chartreuse: "#7fff00",
  yellowgreen: "#9acd32",
  turquoise: "#40e0d0",
  aquamarine: "#7fffd4",
  chocolate: "#d2691e",
  peru: "#cd853f",
  tan: "#d2b48c",
  wheat: "#f5deb3",
  snow: "#fffafa",
  ivory: "#fffff0",
  mintcream: "#f5fffa",
  azure: "#f0ffff",
  ghostwhite: "#f8f8ff",
  whitesmoke: "#f5f5f5",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  dimgray: "#696969",
  dimgrey: "#696969",
  lightblue: "#add8e6",
  lightgreen: "#90ee90",
  lightpink: "#ffb6c1",
  lightyellow: "#ffffe0",
  darkred: "#8b0000",
  darkgreen: "#006400",
  darkblue: "#00008b",
  darkorange: "#ff8c00",
  darkviolet: "#9400d3",
  darkturquoise: "#00ced1",
  midnightblue: "#191970",
  rebeccapurple: "#663399",
};

const HEX3 = /^#?([0-9a-f]{3})$/i;
const HEX6 = /^#?([0-9a-f]{6})$/i;

export function parseColour(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) {
    return null;
  }

  const named = NAMED_COLORS[value];
  if (named) {
    return named;
  }

  const hex6 = value.match(HEX6);
  if (hex6?.[1]) {
    return `#${hex6[1].toLowerCase()}`;
  }

  const hex3 = value.match(HEX3);
  if (hex3?.[1]?.length === 3) {
    const [r, g, b] = hex3[1];
    if (r && g && b) {
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
  }

  return null;
}

export const DEFAULT_TICK_COLOR = "#d6ff3f";
export const DEFAULT_TEXT_COLOR = "#f4f1ea";

export function sanitizeCssColour(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return parseColour(value) ?? fallback;
}

export function parseColourCommand(text: string): { color: string } | "invalid" | null {
  const match = text.trim().match(/^!(?:colour|color)(?:\s+(\S+))?$/i);
  if (!match) {
    return null;
  }
  const arg = match[1];
  if (!arg) {
    return "invalid";
  }
  const color = parseColour(arg);
  return color ? { color } : "invalid";
}
