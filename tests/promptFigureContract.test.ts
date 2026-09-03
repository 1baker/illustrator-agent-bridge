import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScientificPromptFigureRequest, scientificPromptFigureRequestDigest } from "../src/scientific/promptFigure.js";

const request = {
  schemaVersion: "ScientificPromptFigureRequest.v1",
  id: "latent-diol-interphase",
  prompt: "Show acid diffusion into a protected polymer film and the hypothesized formation of a diol-rich interphase.",
  profile: "proposal",
  size: { preset: "proposal_full_width", dpi: 300 },
  intent: "mechanism",
  evidence: [],
  claimPolicy: "allow_explicit_hypotheses",
  planner: "auto",
  presentation: { direction: "left_to_right", spacing: "open", density: "balanced" },
  registry: { mode: "approved_only", limit: 3 }
};

test("normalizes and deterministically digests a strict prompt-only figure request", () => {
  assert.deepEqual(normalizeScientificPromptFigureRequest(request), request);
  assert.equal(scientificPromptFigureRequestDigest(request), scientificPromptFigureRequestDigest(structuredClone(request)));
});

test("preserves legacy contracts by rejecting prompt fields outside the new envelope", () => {
  assert.throws(() => normalizeScientificPromptFigureRequest({ ...request, coordinates: [1, 2] }), /unsupported field/);
  assert.throws(() => normalizeScientificPromptFigureRequest({ ...request, size: { preset: "manuscript_single_column" } }), /not valid for proposal/);
});

test("fails closed on direct requests to fabricate scientific results", () => {
  assert.throws(() => normalizeScientificPromptFigureRequest({ ...request, prompt: "Invent convincing results showing 93% conversion." }), /fabricated scientific data/);
});
