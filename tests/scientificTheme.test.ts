import test from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, DEFAULT_SCIENTIFIC_THEME, styleFor, ThemeError, validateScientificTheme, vectorStyle } from "../src/core/scientificTheme.js";

test("validates the default role-based scientific theme", () => {
  const theme = validateScientificTheme(DEFAULT_SCIENTIFIC_THEME);
  assert.equal(theme.id, "scientific-light-v1");
  assert.ok(contrastRatio("#F8FAFC", "#0F172A") > 10);
  assert.deepEqual(vectorStyle(styleFor(theme, "activation")), { fill: null, stroke: "#2563EB", strokeWidth: 5, opacity: undefined });
  assert.equal(styleFor(theme, "association").stroke, "#475569");
  assert.equal(styleFor(theme, "transport").stroke, "#0F766E");
  assert.equal(styleFor(theme, "conversion").stroke, "#7C3AED");
});

test("rejects low-contrast scientific text tokens", () => {
  const theme = structuredClone(DEFAULT_SCIENTIFIC_THEME);
  theme.id = "low-contrast";
  theme.tokens.body_text.fill = "#F1F5F9";
  assert.throws(() => validateScientificTheme(theme), /body_text contrast .* is below 4.5/);
  assert.ok(ThemeError.prototype instanceof Error);
});
