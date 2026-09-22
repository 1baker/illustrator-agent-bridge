import test from "node:test";
import assert from "node:assert/strict";
import { planScientificConceptScene } from "../src/planner/scientificConceptPlanner.js";
import { reviewArtworkQuality } from "../src/qa/artworkReviewGuard.js";
import type { SemanticItem } from "../src/semantic/types.js";

const corpus: SemanticItem[] = [
  {
    id: "concept.molecular-self-assembly",
    kind: "scientific_concept",
    title: "Molecular self-assembly",
    text: "Small monomers organize into ordered polymer networks.",
    tags: ["molecular", "assembly", "polymer", "network"]
  },
  {
    id: "concept.core-shell-emulsion-polymerization",
    kind: "scientific_concept",
    title: "Core-shell emulsion polymerization",
    text: "Show surfactant micelles with head-tail grammar, seed latex, initiator radicals, core growth, shell monomer feed, and a final core-shell particle cross-section. Reserve diffusion arrows for core polymerization.",
    tags: ["core-shell", "emulsion", "latex", "seed", "surfactant", "shell", "monomer", "initiator"]
  },
  {
    id: "concept.catalytic-reaction-cycle",
    kind: "scientific_concept",
    title: "Catalytic reaction cycle",
    text: "A catalyst active site binds reactants and releases products with a lower energy barrier.",
    tags: ["catalyst", "reaction", "active-site", "energy"]
  },
  {
    id: "concept.cell-membrane-transport",
    kind: "scientific_concept",
    title: "Cell membrane transport",
    text: "A bilayer membrane with a protein channel controls particle movement down a gradient.",
    tags: ["membrane", "transport", "protein", "gradient"]
  },
  {
    id: "metaphor.abstract-mechanism-to-map",
    kind: "visual_metaphor",
    title: "Abstract mechanism as a map",
    text: "Use context, mechanism, and outcome panels connected by arrows.",
    tags: ["concept", "mechanism", "map"]
  },
  {
    id: "requirement.scientific-concept-legibility",
    kind: "publication_requirement",
    title: "Scientific concept figure legibility",
    text: "Separate context, mechanism, and outcome, and keep arrows consistent.",
    tags: ["scientific", "concept", "publication"]
  }
];

test("planScientificConceptScene retrieves semantic evidence and builds a complex validated scene", () => {
  const plan = planScientificConceptScene("polymer catalyst membrane electron transfer concept", corpus);

  assert.equal(plan.planner, "scientific-deterministic");
  assert.equal(plan.qa.ok, true);
  assert.ok(plan.conceptQueries.length >= 4);
  assert.ok(plan.evidence.some((result) => result.item.kind === "scientific_concept"));
  assert.ok(plan.evidence.some((result) => result.item.kind === "visual_metaphor"));
  assert.ok(plan.scene.elements.some((element) => element.type === "path"));
  assert.ok(plan.scene.elements.some((element) => element.name?.includes("catalyst surface")));
  assert.ok(plan.scene.elements.some((element) => element.name?.includes("protein channel")));
  assert.ok(plan.scene.elements.length > 30);
  assert.ok(plan.recommendedExports.includes("svg"));
});

test("planScientificConceptScene builds a targeted core-shell emulsion polymerization diagram", () => {
  const plan = planScientificConceptScene(
    "core shell emulsion polymerization with seed latex, surfactant micelles, initiator radicals, shell monomer feed, and final particle",
    corpus,
    { width: 1400, height: 900, title: "Core-shell emulsion polymerization" }
  );

  assert.equal(plan.qa.ok, true);
  assert.ok(plan.conceptQueries.some((query) => query.includes("seeded latex")));
  assert.ok(plan.evidence.some((result) => result.item.id === "concept.core-shell-emulsion-polymerization"));
  assert.ok(plan.scene.elements.some((element) => element.name === "seed latex particle 1"));
  assert.ok(plan.scene.elements.some((element) => element.name === "surfactant micelle cluster 1 monomer core"));
  assert.ok(plan.scene.elements.some((element) => element.name === "surfactant micelles label leader"));
  assert.ok(plan.scene.elements.some((element) => element.name === "monomer droplet label leader"));
  assert.ok(plan.scene.elements.some((element) => element.name === "polymer core growing particle"));
  assert.ok(plan.scene.elements.some((element) => element.name === "shell monomer feed reservoir"));
  assert.ok(plan.scene.elements.some((element) => element.name === "forming shell layer"));
  assert.ok(!plan.scene.elements.some((element) => element.name === "partial shell layer"));
  assert.ok(plan.scene.elements.some((element) => element.name === "final core shell particle shell"));
  assert.ok(plan.scene.elements.some((element) => element.name === "final particle surfactant corona head 1"));
  assert.ok(!plan.scene.elements.some((element) => element.name === "radicals enter seed arrow"));
  assert.ok(!plan.scene.elements.some((element) => element.name === "monomer diffusion arrow"));
  const textContent = plan.scene.elements.flatMap((element) => (element.type === "text" ? [element.text] : []));
  assert.ok(textContent.includes("surfactant micelles"));
  assert.ok(textContent.includes("radical flux limits secondary nucleation"));
  assert.ok(!textContent.some((content) => content.includes("Evidence:")));
  assert.ok(!textContent.some((content) => content.includes("Named Illustrator vectors")));
  const elementByName = (name: string) => {
    const element = plan.scene.elements.find((candidate) => candidate.name === name);
    assert.ok(element, `Expected scene element ${name}`);
    return element;
  };
  const surfactantLabel = elementByName("surfactant micelles label");
  const rightMicelleHead = elementByName("surfactant micelle cluster 2 head 1");
  assert.equal(surfactantLabel.type, "text");
  assert.equal(rightMicelleHead.type, "ellipse");
  if (surfactantLabel.type === "text" && rightMicelleHead.type === "ellipse") {
    assert.ok(surfactantLabel.y + (surfactantLabel.size ?? 14) < rightMicelleHead.y);
  }
  const monomerLabel = elementByName("monomer droplet label");
  const monomerDroplet = elementByName("monomer droplet A");
  const seedParticle = elementByName("seed latex particle 1");
  assert.equal(monomerLabel.type, "text");
  assert.equal(monomerDroplet.type, "ellipse");
  assert.equal(seedParticle.type, "ellipse");
  if (monomerLabel.type === "text" && monomerDroplet.type === "ellipse" && seedParticle.type === "ellipse") {
    assert.ok(monomerLabel.y > monomerDroplet.y + monomerDroplet.height);
    assert.ok(monomerLabel.y > seedParticle.y + seedParticle.height);
  }
  assert.ok(plan.scene.elements.length > 100);
});

test("planScientificConceptScene core-shell plan passes artwork review without refinement warnings", () => {
  const plan = planScientificConceptScene("core shell emulsion polymerization scientific concept", corpus, { width: 1400, height: 900 });
  const review = reviewArtworkQuality({
    prompt: plan.prompt,
    scene: plan.scene,
    exportQa: {
      ok: true,
      path: "core-shell.svg",
      format: "svg",
      bytes: 100_000,
      dimensions: {
        width: 1400,
        height: 900
      },
      checks: [],
      details: {
        vectorElementCount: plan.scene.elements.length
      }
    }
  });

  assert.equal(review.ok, true);
  assert.equal(review.nextGoalPrompt, null);
  assert.deepEqual(
    review.checks.filter((check) => check.status !== "pass"),
    []
  );
});

test("planScientificConceptScene keeps nested refinement prompts out of scene title text", () => {
  const prompt = [
    "Revise the Illustrator artwork for: Revise the Illustrator artwork for: core shell emulsion polymerization scientific concept",
    "Keep the original intent, but add margin and recenter the drawing.",
    "Fix these review findings:",
    "- The visible artwork extends beyond the artboard."
  ].join("\n");
  const plan = planScientificConceptScene(prompt, corpus, { width: 1400, height: 900 });
  const title = plan.scene.elements.find((element) => element.name === "concept title");

  assert.equal(title?.type, "text");
  if (title?.type === "text") {
    assert.equal(title.text, "core shell emulsion polymerization scientific concept");
  }
  assert.ok(plan.conceptQueries[0]?.startsWith("core shell emulsion"));
});

test("planScientificConceptScene bounds long prompt-derived titles inside the artboard", () => {
  const prompt = "Create a publication-style membrane electron-transfer mechanism with donor and acceptor states, a directional charge-transfer path, and a compact energy-level inset.";
  const plan = planScientificConceptScene(prompt, corpus);
  const title = plan.scene.elements.find((element) => element.name === "concept title");
  assert.equal(title?.type, "text");
  if (title?.type === "text") assert.ok(title.text.length <= 60);
  const review = reviewArtworkQuality({
    prompt,
    scene: plan.scene,
    exportQa: { ok: true, path: "concept.svg", format: "svg", bytes: 10_000, dimensions: { width: 960, height: 640 }, checks: [], details: { vectorElementCount: plan.scene.elements.length } }
  });
  assert.equal(review.ok, true);
  assert.deepEqual(review.checks.filter((check) => check.status !== "pass"), []);
});
