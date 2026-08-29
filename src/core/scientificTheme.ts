import type { VectorStyle } from "./vectorScene.js";

export type ScientificVisualRole =
  | "background"
  | "title"
  | "body_text"
  | "annotation_text"
  | "label_background"
  | "label_border"
  | "primary_object"
  | "secondary_object"
  | "compartment"
  | "activation"
  | "inhibition"
  | "association"
  | "transport"
  | "conversion";

export interface ScientificStyleToken extends VectorStyle {
  fontSize?: number;
  fontFamily?: string;
}

export interface ScientificTheme {
  id: string;
  tokens: Record<ScientificVisualRole, ScientificStyleToken>;
}

export const DEFAULT_SCIENTIFIC_THEME: ScientificTheme = {
  id: "scientific-light-v1",
  tokens: {
    background: { fill: "#F8FAFC", stroke: null },
    title: { fill: "#0F172A", stroke: null, fontSize: 29, fontFamily: "Arial" },
    body_text: { fill: "#475569", stroke: null, fontSize: 17, fontFamily: "Arial" },
    annotation_text: { fill: "#334155", stroke: null, fontSize: 15, fontFamily: "Arial" },
    label_background: { fill: "#FFFFFF", stroke: null, opacity: 96 },
    label_border: { fill: null, stroke: "#64748B", strokeWidth: 2 },
    primary_object: { fill: "#DBEAFE", stroke: "#2563EB", strokeWidth: 4 },
    secondary_object: { fill: "#CCFBF1", stroke: "#0F766E", strokeWidth: 4 },
    compartment: { fill: "#E0F2FE", stroke: "#0369A1", strokeWidth: 8 },
    activation: { fill: null, stroke: "#2563EB", strokeWidth: 5 },
    inhibition: { fill: null, stroke: "#DB2777", strokeWidth: 5 },
    association: { fill: null, stroke: "#475569", strokeWidth: 4 },
    transport: { fill: null, stroke: "#0F766E", strokeWidth: 5 },
    conversion: { fill: null, stroke: "#7C3AED", strokeWidth: 5 }
  }
};

export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeError";
  }
}

export function validateScientificTheme(theme: ScientificTheme): ScientificTheme {
  if (!theme || typeof theme.id !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(theme.id)) throw new ThemeError("theme id must be stable");
  const roles = Object.keys(DEFAULT_SCIENTIFIC_THEME.tokens) as ScientificVisualRole[];
  for (const role of roles) {
    const token = theme.tokens?.[role];
    if (!token) throw new ThemeError(`theme ${theme.id} is missing role: ${role}`);
    validateToken(token, role);
  }
  assertContrast(theme, "title", 4.5);
  assertContrast(theme, "body_text", 4.5);
  assertContrast(theme, "annotation_text", 4.5);
  assertContrast(theme, "activation", 3);
  assertContrast(theme, "inhibition", 3);
  assertContrast(theme, "association", 3);
  assertContrast(theme, "transport", 3);
  assertContrast(theme, "conversion", 3);
  return theme;
}

export function styleFor(theme: ScientificTheme, role: ScientificVisualRole): ScientificStyleToken {
  validateScientificTheme(theme);
  return { ...theme.tokens[role] };
}

export function vectorStyle(token: ScientificStyleToken): VectorStyle {
  return { fill: token.fill, stroke: token.stroke, strokeWidth: token.strokeWidth, opacity: token.opacity };
}

export function contrastRatio(first: string, second: string): number {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function assertContrast(theme: ScientificTheme, role: ScientificVisualRole, minimum: number): void {
  const background = theme.tokens.background.fill;
  const token = theme.tokens[role];
  const foreground = token.fill ?? token.stroke;
  if (typeof background !== "string" || typeof foreground !== "string") throw new ThemeError(`theme role ${role} requires a color against the background`);
  const ratio = contrastRatio(background, foreground);
  if (ratio < minimum) throw new ThemeError(`theme role ${role} contrast ${ratio.toFixed(2)} is below ${minimum}`);
}

function validateToken(token: ScientificStyleToken, role: ScientificVisualRole): void {
  for (const [name, value] of Object.entries({ fill: token.fill, stroke: token.stroke })) {
    if (value !== undefined && value !== null && (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value))) {
      throw new ThemeError(`theme role ${role}.${name} must be a #RRGGBB color or null`);
    }
  }
  if (token.strokeWidth !== undefined && (!Number.isFinite(token.strokeWidth) || token.strokeWidth < 0 || token.strokeWidth > 100)) {
    throw new ThemeError(`theme role ${role}.strokeWidth is invalid`);
  }
  if (token.opacity !== undefined && (!Number.isFinite(token.opacity) || token.opacity < 0 || token.opacity > 100)) {
    throw new ThemeError(`theme role ${role}.opacity is invalid`);
  }
  if (token.fontSize !== undefined && (!Number.isFinite(token.fontSize) || token.fontSize <= 0 || token.fontSize > 500)) {
    throw new ThemeError(`theme role ${role}.fontSize is invalid`);
  }
}

function luminance(color: string): number {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new ThemeError(`invalid contrast color: ${color}`);
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}
