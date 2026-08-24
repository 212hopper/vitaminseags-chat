export type SpotlightShape = "circle" | "rect";

export type SpotlightHole = {
  x: number;
  y: number;
  w: number;
  h: number;
  feather: number;
  shape: SpotlightShape;
};

export type LayoutLook = {
  fontFamily: string;
  fontSizePx: number;
  posX: number;
  posY: number;
  boxWidth: number;
  boxHeight: number;
  spotlightDarknessPct: number;
  spotlightCount: number;
  spotlightHoles: SpotlightHole[];
};

export type LayoutPreset = LayoutLook & {
  id: string;
  name: string;
};

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;
export const MAX_SPOTLIGHTS = 6;
export const MIN_SPOTLIGHT_SIZE = 80;
export const MAX_SPOTLIGHT_WIDTH = CANVAS_W;
export const MAX_SPOTLIGHT_HEIGHT = CANVAS_H;
export const DEFAULT_SPOTLIGHT_FEATHER = 70;
export const DEFAULT_SPOTLIGHT_SHAPE: SpotlightShape = "circle";
export const MAX_LAYOUT_PRESETS = 24;

export const DEFAULT_SPOTLIGHT_HOLES: SpotlightHole[] = [
  { x: 418, y: 428, w: 610, h: 610, feather: DEFAULT_SPOTLIGHT_FEATHER, shape: DEFAULT_SPOTLIGHT_SHAPE },
  { x: 1502, y: 428, w: 610, h: 610, feather: DEFAULT_SPOTLIGHT_FEATHER, shape: DEFAULT_SPOTLIGHT_SHAPE },
  { x: 960, y: 858, w: 636, h: 636, feather: DEFAULT_SPOTLIGHT_FEATHER, shape: DEFAULT_SPOTLIGHT_SHAPE },
  { x: 960, y: 400, w: 440, h: 440, feather: DEFAULT_SPOTLIGHT_FEATHER, shape: DEFAULT_SPOTLIGHT_SHAPE },
  { x: 240, y: 860, w: 360, h: 360, feather: DEFAULT_SPOTLIGHT_FEATHER, shape: DEFAULT_SPOTLIGHT_SHAPE },
  { x: 1680, y: 860, w: 360, h: 360, feather: DEFAULT_SPOTLIGHT_FEATHER, shape: DEFAULT_SPOTLIGHT_SHAPE },
];

export const DEFAULT_SPOTLIGHT_COUNT = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cloneSpotlightHoles(list: SpotlightHole[] | undefined): SpotlightHole[] {
  const source = list ?? DEFAULT_SPOTLIGHT_HOLES;
  return DEFAULT_SPOTLIGHT_HOLES.map((fallback, index) => sanitizeSpotlightHole(source[index], fallback));
}

export function cloneLayoutPresets(list: LayoutPreset[] | undefined): LayoutPreset[] {
  return (list ?? []).map((preset) => ({
    ...preset,
    spotlightHoles: cloneSpotlightHoles(preset.spotlightHoles),
  }));
}

export function sanitizeSpotlightCount(value: unknown, fallback: number): number {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return clamp(Math.round(raw), 0, MAX_SPOTLIGHTS);
}

function readAxisSize(primary: unknown, legacyRadius: unknown, fallback: number): number {
  if (typeof primary === "number" && Number.isFinite(primary)) {
    return primary;
  }
  if (typeof legacyRadius === "number" && Number.isFinite(legacyRadius)) {
    return legacyRadius * 2;
  }
  return fallback;
}

export function sanitizeSpotlightShape(value: unknown, fallback: SpotlightShape): SpotlightShape {
  if (value === "rect" || value === "rectangle" || value === "square") {
    return "rect";
  }
  if (value === "circle" || value === "ellipse" || value === "oval") {
    return "circle";
  }
  return fallback;
}

export function sanitizeSpotlightHole(value: unknown, fallback: SpotlightHole): SpotlightHole {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }
  const raw = value as Partial<SpotlightHole> & { r?: number };
  const x = typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : fallback.x;
  const y = typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : fallback.y;
  const w = readAxisSize(raw.w, raw.r, fallback.w);
  const h = readAxisSize(raw.h, raw.r, fallback.h);
  const feather =
    typeof raw.feather === "number" && Number.isFinite(raw.feather) ? raw.feather : fallback.feather;
  return {
    x: clamp(Math.round(x), 0, CANVAS_W),
    y: clamp(Math.round(y), 0, CANVAS_H),
    w: clamp(Math.round(w), MIN_SPOTLIGHT_SIZE, MAX_SPOTLIGHT_WIDTH),
    h: clamp(Math.round(h), MIN_SPOTLIGHT_SIZE, MAX_SPOTLIGHT_HEIGHT),
    feather: clamp(Math.round(feather), 0, 100),
    shape: sanitizeSpotlightShape(raw.shape, fallback.shape),
  };
}

export function sanitizeSpotlightHoles(value: unknown, fallback: SpotlightHole[]): SpotlightHole[] {
  const source = Array.isArray(value) ? value : fallback;
  return DEFAULT_SPOTLIGHT_HOLES.map((def, index) =>
    sanitizeSpotlightHole(source[index], fallback[index] ?? def),
  );
}

export function activeSpotlightHoles(holes: SpotlightHole[], count: number): SpotlightHole[] {
  return holes.slice(0, sanitizeSpotlightCount(count, 0));
}

export function sanitizePresetName(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 32);
}

function normalizePresetKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findLayoutPreset(presets: LayoutPreset[], query: string): LayoutPreset | null {
  const key = normalizePresetKey(query);
  if (!key) {
    return null;
  }
  return (
    presets.find((item) => item.id.toLowerCase() === key) ??
    presets.find((item) => normalizePresetKey(item.name) === key) ??
    presets.find((item) => normalizePresetKey(item.name).replace(/ /g, "") === key.replace(/ /g, "")) ??
    null
  );
}

export function lookFieldsFrom(look: LayoutLook): LayoutLook {
  return {
    fontFamily: look.fontFamily,
    fontSizePx: look.fontSizePx,
    posX: look.posX,
    posY: look.posY,
    boxWidth: look.boxWidth,
    boxHeight: look.boxHeight,
    spotlightDarknessPct: look.spotlightDarknessPct,
    spotlightCount: look.spotlightCount,
    spotlightHoles: cloneSpotlightHoles(look.spotlightHoles),
  };
}

export function sanitizeLayoutPreset(
  value: unknown,
  fallback: LayoutPreset | null,
  others: LayoutPreset[],
): LayoutPreset | null {
  if (!value || typeof value !== "object") {
    return fallback ? { ...fallback, spotlightHoles: cloneSpotlightHoles(fallback.spotlightHoles) } : null;
  }
  const raw = value as Partial<LayoutPreset>;
  const id =
    typeof raw.id === "string" && /^p_[a-z0-9]+$/i.test(raw.id)
      ? raw.id
      : fallback?.id ?? newPresetId();
  const name = sanitizePresetName(raw.name, fallback?.name ?? "");
  if (!name) {
    return fallback ? { ...fallback, spotlightHoles: cloneSpotlightHoles(fallback.spotlightHoles) } : null;
  }
  if (others.some((item) => item.id !== id && normalizePresetKey(item.name) === normalizePresetKey(name))) {
    return fallback ? { ...fallback, spotlightHoles: cloneSpotlightHoles(fallback.spotlightHoles) } : null;
  }
  const holes = sanitizeSpotlightHoles(raw.spotlightHoles, fallback?.spotlightHoles ?? DEFAULT_SPOTLIGHT_HOLES);
  return {
    id,
    name,
    fontFamily: typeof raw.fontFamily === "string" ? raw.fontFamily : (fallback?.fontFamily ?? ""),
    fontSizePx:
      typeof raw.fontSizePx === "number" && Number.isFinite(raw.fontSizePx)
        ? raw.fontSizePx
        : (fallback?.fontSizePx ?? 17),
    posX: typeof raw.posX === "number" && Number.isFinite(raw.posX) ? raw.posX : (fallback?.posX ?? 16),
    posY: typeof raw.posY === "number" && Number.isFinite(raw.posY) ? raw.posY : (fallback?.posY ?? 200),
    boxWidth:
      typeof raw.boxWidth === "number" && Number.isFinite(raw.boxWidth) ? raw.boxWidth : (fallback?.boxWidth ?? 420),
    boxHeight:
      typeof raw.boxHeight === "number" && Number.isFinite(raw.boxHeight)
        ? raw.boxHeight
        : (fallback?.boxHeight ?? 860),
    spotlightDarknessPct: clampDarkness(raw.spotlightDarknessPct, fallback?.spotlightDarknessPct ?? 40),
    spotlightCount: sanitizeSpotlightCount(raw.spotlightCount, fallback?.spotlightCount ?? DEFAULT_SPOTLIGHT_COUNT),
    spotlightHoles: holes,
  };
}

function clampDarkness(value: unknown, fallback: number): number {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return clamp(Math.round(raw), 0, 100);
}

export function sanitizeLayoutPresets(partial: unknown, current: LayoutPreset[]): LayoutPreset[] {
  if (!Array.isArray(partial)) {
    return cloneLayoutPresets(current);
  }
  const next: LayoutPreset[] = [];
  const seen = new Set<string>();
  for (const item of partial.slice(0, MAX_LAYOUT_PRESETS)) {
    const sanitized = sanitizeLayoutPreset(item, null, next);
    if (!sanitized || seen.has(sanitized.id)) {
      continue;
    }
    seen.add(sanitized.id);
    next.push(sanitized);
  }
  return next;
}

export function createLayoutPreset(
  name: string,
  look: LayoutLook,
  existing: LayoutPreset[],
): LayoutPreset | { error: string } {
  if (existing.length >= MAX_LAYOUT_PRESETS) {
    return { error: `You can have at most ${MAX_LAYOUT_PRESETS} layout presets.` };
  }
  const trimmed = sanitizePresetName(name, "");
  if (!trimmed) {
    return { error: "Give this preset a short name." };
  }
  if (existing.some((item) => normalizePresetKey(item.name) === normalizePresetKey(trimmed))) {
    return { error: `"${trimmed}" already exists.` };
  }
  return {
    id: newPresetId(),
    name: trimmed,
    ...lookFieldsFrom(look),
  };
}

export function listLayoutPresetHelp(presets: LayoutPreset[]): string {
  if (!presets.length) {
    return "No layout presets saved. Add some on the Settings page.";
  }
  const names = presets.map((item) => item.name).join(" · ");
  return `Layout presets: ${names}. Use !preset name to apply one.`.slice(0, 500);
}

function newPresetId(): string {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
