import test from "node:test";
import assert from "node:assert/strict";
import { compileScientificFigure } from "../src/scientific/figureCompiler.js";
import { planScientificStory } from "../src/scientific/storyPlanner.js";
import { parseScientificText } from "../src/scientific/textStoryParser.js";

const pathway = `
Title: Central dogma and delivery
Subtitle: Controlled text becomes deterministic vector geometry
Direction: left-to-right
Spacing: open
Canvas: 1800x920

DNA template [dna] converts to RNA transcript [rna].
RNA transcript transports to mitochondrion [organelle].
Reaction flask [apparatus] converts to nanoparticle [particle].
Nanoparticle associates with lipid membrane [membrane].
Lipid membrane transports to mitochondrion.
`;

test("parses controlled scientific text into a deterministic validated story", () => {
  const first = parseScientificText(pathway);
  const second = parseScientificText(pathway);
  assert.deepEqual(first, second);
  assert.equal(first.grammar, "scientific-controlled-text.v1");
  assert.equal(first.story.document.title, "Central dogma and delivery");
  assert.equal(first.story.presentation?.direction, "left_to_right");
  assert.equal(first.story.document.width, 1800);
  assert.equal(first.story.document.height, 920);
  assert.deepEqual(first.story.entities.map((entity) => entity.type), ["dna", "rna", "organelle", "apparatus", "particle", "membrane"]);
  assert.deepEqual(first.story.interactions?.map((interaction) => interaction.type), ["converts_to", "transports_to", "converts_to", "associates_with", "transports_to"]);
  assert.equal(first.statements.filter((statement) => statement.kind === "interaction").length, 5);
  const scene = compileScientificFigure(planScientificStory(first.story));
  assert.equal(scene.semantics?.objects.length, 6);
  assert.equal(scene.semantics?.relationships?.length, 5);
  assert.ok(scene.semantics?.relationships?.every((relationship) => relationship.properties?.crossings === 0));
});

test("supports quoted labels, explicit entity declarations, request overrides, and stable id collisions", () => {
  const parsed = parseScientificText({
    text: `
Entity: "A B" [protein].
Entity: "A-B" [protein].
"A B" activates "A-B".
`,
    title: "Override title",
    direction: "top_to_bottom",
    spacing: "compact",
    width: 900,
    height: 700
  });
  assert.deepEqual(parsed.story.entities.map((entity) => entity.id), ["a_b", "a_b_2"]);
  assert.equal(parsed.story.document.title, "Override title");
  assert.equal(parsed.story.document.width, 900);
  assert.equal(parsed.story.presentation?.direction, "top_to_bottom");
});

test("fails closed with line-specific errors for ambiguous or conflicting text", () => {
  assert.throws(() => parseScientificText("Signal activates Response [process]."), /line 1: unknown entity Signal/);
  assert.throws(() => parseScientificText("Entity: Signal."), /line 1: Entity declarations require/);
  assert.throws(() => parseScientificText("Signal [molecule] activates Response [process].\nSignal [protein] inhibits Response."), /line 2: entity Signal was already declared/);
  assert.throws(() => parseScientificText("Signal [molecule] activates Response [process].\nSignal activates Response."), /line 2: duplicate interaction/);
  assert.throws(() => parseScientificText("Signal [molecule] causes Response [process]."), /line 1: unsupported statement/);
  assert.throws(() => parseScientificText("Direction: diagonal\nEntity: Signal [molecule]."), /Direction must be/);
  assert.throws(() => parseScientificText("Canvas: wide\nEntity: Signal [molecule]."), /Canvas must use/);
  assert.throws(() => parseScientificText("Title: One\nTitle: Two\nEntity: Signal [molecule]."), /line 2: duplicate title directive/);
});
