import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileScientificFigure } from "../src/scientific/figureCompiler.js";
import { planScientificStory } from "../src/scientific/storyPlanner.js";

const examplePath = resolve("examples/scientific-story.json");
const grammarExamplePath = resolve("examples/scientific-interaction-grammar.json");
const vocabularyExamplePath = resolve("examples/scientific-symbol-vocabulary.json");

test("infers figure recipes, dimensions, styles, and relationship conventions from a scientific story", () => {
  const figure = planScientificStory({
    schemaVersion: 1,
    document: { title: "minimal story" },
    entities: [
      { id: "ligand", type: "molecule", kind: "signaling_molecule", label: "ligand" },
      { id: "receptor", type: "receptor", kind: "membrane_receptor", label: "receptor", emphasis: "secondary" },
      { id: "response", type: "process", kind: "gene_expression", label: "gene response" }
    ],
    interactions: [
      { id: "binding", sourceId: "ligand", type: "binds_to", targetId: "receptor", label: "binds" },
      { id: "activation", sourceId: "receptor", type: "activates", targetId: "response" }
    ]
  });
  assert.equal(figure.settings?.layoutMode, "layered");
  assert.equal(figure.objects[0]?.recipe, "molecule");
  assert.equal(figure.objects[1]?.recipe, "receptor");
  assert.equal(figure.objects[1]?.styleRole, "secondary_object");
  assert.equal(figure.objects[2]?.recipe, "process");
  assert.equal(figure.relationships?.[0]?.predicate, "binds_to");
  assert.equal(figure.relationships?.[0]?.role, "association");
  assert.ok(figure.objects.every((object) => object.x === undefined && object.y === undefined));
});

test("plans and compiles the scientific story example deterministically", async () => {
  const story = JSON.parse(await readFile(examplePath, "utf8"));
  const first = planScientificStory(story);
  const second = planScientificStory(story);
  assert.deepEqual(first, second);
  const scene = compileScientificFigure(first);
  assert.equal(scene.semantics?.objects.length, 6);
  assert.equal(scene.semantics?.relationships?.length, 6);
  assert.equal(scene.semantics?.objects.find((object) => object.id === "kinase_a")?.properties?.layoutComponent, scene.semantics?.objects.find((object) => object.id === "kinase_b")?.properties?.layoutComponent);
  assert.ok(scene.semantics?.relationships?.every((relationship) => relationship.properties?.crossings === 0));
  assert.ok(scene.elements.some((element) => element.id === "inhibitor_action.inhibition-bar"));
});

test("fails closed on invalid, duplicate, dangling, and unsupported scientific story content", () => {
  const base = {
    schemaVersion: 1,
    document: { title: "invalid story" },
    entities: [{ id: "a", type: "protein", label: "A" }]
  };
  assert.throws(() => planScientificStory({ ...base, entities: [...base.entities, base.entities[0]] }), /must be unique/);
  assert.throws(() => planScientificStory({ ...base, interactions: [{ id: "bad", sourceId: "a", type: "activates", targetId: "missing" }] }), /unknown scientific entity/);
  assert.throws(() => planScientificStory({ ...base, entities: [{ id: "a", type: "planet", label: "A" }] }), /type must be one of/);
  assert.throws(() => planScientificStory({ ...base, entities: [{ id: "unsafe id", type: "protein", label: "A" }] }), /stable identifier/);
});

test("supports every story visual and interaction type plus top-to-bottom presentation", () => {
  const entityTypes = ["molecule", "receptor", "protein", "process", "cell", "nucleus", "generic", "dna", "rna", "membrane", "organelle", "particle", "apparatus"] as const;
  const interactionTypes = ["activates", "inhibits", "binds_to", "transports_to", "converts_to", "associates_with"] as const;
  const figure = planScientificStory({
    schemaVersion: 1,
    document: { title: "complete visual grammar", width: 1400, height: 5600 },
    entities: entityTypes.map((type, index) => ({ id: `entity_${index}`, type, label: index === 6 ? "long generic scientific endpoint" : type })),
    interactions: entityTypes.slice(0, -1).map((_, index) => ({ id: `interaction_${index}`, sourceId: `entity_${index}`, type: interactionTypes[index % interactionTypes.length], targetId: `entity_${index + 1}` })),
    presentation: { direction: "top_to_bottom", spacing: "open" }
  });
  assert.deepEqual(figure.objects.map((object) => object.recipe), ["molecule", "receptor", "protein", "process", "cell", "nucleus", "generic", "dna", "rna", "membrane", "organelle", "particle", "apparatus"]);
  assert.deepEqual(figure.relationships?.map((relationship) => relationship.predicate), entityTypes.slice(0, -1).map((_, index) => interactionTypes[index % interactionTypes.length]));
  assert.equal(figure.relationships?.find((relationship) => relationship.predicate === "inhibits")?.role, "inhibition");
  assert.deepEqual(figure.relationships?.map((relationship) => relationship.role), ["activation", "inhibition", "association", "transport", "conversion", "association", "activation", "inhibition", "association", "transport", "conversion", "association"]);
  assert.equal(figure.settings?.layoutDirection, "top_to_bottom");
  assert.equal(figure.settings?.rankGap, 190);
  assert.ok((figure.objects.at(-1)?.width ?? 0) > 140);
  const scene = compileScientificFigure(figure);
  assert.equal(scene.semantics?.objects.length, 13);
});

test("compiles the interaction grammar example with all five visual roles", async () => {
  const story = JSON.parse(await readFile(grammarExamplePath, "utf8"));
  const scene = compileScientificFigure(planScientificStory(story));
  const roles = new Set(scene.semantics?.relationships?.map((relationship) => relationship.properties?.role));
  assert.deepEqual(roles, new Set(["association", "activation", "inhibition", "conversion", "transport"]));
  assert.ok(scene.elements.some((element) => element.id === "inhibition.inhibition-bar"));
  assert.ok(!scene.elements.some((element) => element.id === "binding.arrowhead"));
  assert.equal(scene.elements.find((element) => element.id === "transport.path")?.style?.stroke, "#0F766E");
  assert.equal(scene.elements.find((element) => element.id === "conversion.path")?.style?.stroke, "#7C3AED");
  assert.ok(scene.semantics?.relationships?.every((relationship) => relationship.properties?.crossings === 0));
});

test("compiles the expanded scientific symbol vocabulary as one semantic figure", async () => {
  const story = JSON.parse(await readFile(vocabularyExamplePath, "utf8"));
  const scene = compileScientificFigure(planScientificStory(story));
  assert.deepEqual(scene.semantics?.objects.map((object) => object.properties?.recipe), ["dna", "rna", "membrane", "organelle", "particle", "apparatus"]);
  assert.ok(scene.elements.some((element) => element.id === "dna_template.base-pair-3" && element.type === "line"));
  assert.ok(scene.elements.some((element) => element.id === "rna_transcript.strand" && element.type === "path" && element.closed === false));
  assert.ok(scene.elements.some((element) => element.id === "membrane.top-head-4" && element.type === "ellipse"));
  assert.ok(scene.elements.some((element) => element.id === "organelle.inner-membrane" && element.type === "ellipse" && element.style?.fill === null));
  assert.ok(scene.elements.some((element) => element.id === "particle.core" && element.type === "ellipse"));
  assert.ok(scene.elements.some((element) => element.id === "apparatus.liquid" && element.type === "polygon" && element.style?.fill !== null));
  assert.ok(scene.semantics?.relationships?.every((relationship) => relationship.properties?.crossings === 0));
});
