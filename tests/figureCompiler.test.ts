import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileScientificFigure } from "../src/scientific/figureCompiler.js";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

const examplePath = resolve("examples/scientific-figure-spec.json");
const autoLayoutExamplePath = resolve("examples/scientific-auto-layout-spec.json");

test("compiles one figure specification through every software-native stage", async () => {
  const spec = JSON.parse(await readFile(examplePath, "utf8"));
  const scene = compileScientificFigure(spec);
  assert.equal(scene.semantics?.objects.length, 5);
  assert.equal(scene.semantics?.relationships?.length, 4);
  assert.equal(scene.semantics?.relationships?.filter((relationship) => relationship.visualElementIds?.length).length, 3);
  assert.equal(scene.semantics?.objects.find((object) => object.id === "kinase")?.properties?.x, 640);
  assert.equal(scene.semantics?.objects.find((object) => object.id === "kinase")?.properties?.recipe, "protein");
  assert.equal(scene.semantics?.objects.find((object) => object.id === "ligand")?.properties?.recipe, "molecule");
  assert.equal(scene.semantics?.objects.find((object) => object.id === "gene_response")?.properties?.labelPosition, "inside");
  assert.equal(scene.semantics?.relationships?.find((relationship) => relationship.id === "nuclear_containment")?.properties?.visual, false);
  assert.ok(scene.elements.some((element) => element.id === "expression_activation.path" && element.type === "path" && element.closed === false));
});

test("renders editable SVG with semantic identity, routed relationships, and automatic labels", async () => {
  const spec = JSON.parse(await readFile(examplePath, "utf8"));
  const svg = renderSceneToSvg(compileScientificFigure(spec));
  assert.match(svg, /data-format="scientific-image-generator\.scene-semantics\.v1"/);
  assert.match(svg, /id="kinase\.body"[^>]*data-scientific-objects="kinase"/);
  assert.match(svg, /id="binding\.path"[^>]*data-scientific-relationships="binding"/);
  assert.match(svg, /id="gene_response\.label-text"/);
  assert.match(svg, /font-family="Arial"/);
});

test("fails closed on dangling relationships, layout overlaps, and invalid roles", () => {
  const base = {
    schemaVersion: 1,
    document: { title: "invalid figure", width: 700, height: 500 },
    objects: [
      { id: "a", kind: "protein", label: "A", x: 80, y: 180, width: 100, height: 70 },
      { id: "b", kind: "protein", label: "B", x: 300, y: 180, width: 100, height: 70 }
    ]
  };
  assert.throws(() => compileScientificFigure({ ...base, relationships: [{ id: "bad", sourceObjectId: "a", predicate: "activates", targetObjectId: "missing" }] }), /unknown scientific object/);
  assert.throws(() => compileScientificFigure({ ...base, objects: [base.objects[0], { ...base.objects[1], x: 120 }] }), /overlap without containment/);
  assert.throws(() => compileScientificFigure({ ...base, objects: [{ ...base.objects[0], styleRole: "glow" }, base.objects[1]] }), /styleRole must be one of/);
});

test("infers ports and renders the scientific inhibition convention", () => {
  const scene = compileScientificFigure({
    schemaVersion: 1,
    document: { title: "inhibition", width: 760, height: 500 },
    objects: [
      { id: "inhibitor", kind: "molecule", label: "inhibitor", x: 80, y: 220, width: 90, height: 70 },
      { id: "enzyme", kind: "enzyme", label: "enzyme", x: 520, y: 210, width: 120, height: 90 }
    ],
    relationships: [
      { id: "blocks", sourceObjectId: "inhibitor", predicate: "inhibits", targetObjectId: "enzyme", label: "inhibits", role: "inhibition" }
    ]
  });
  const relationship = scene.semantics?.relationships?.[0];
  assert.equal(relationship?.properties?.sourcePort, "right");
  assert.equal(relationship?.properties?.targetPort, "left");
  assert.ok(relationship?.visualElementIds?.includes("blocks.inhibition-bar"));
  assert.ok(!relationship?.visualElementIds?.includes("blocks.arrowhead"));
});

test("renders distinct connector conventions for scientific relationship roles", () => {
  const compileRole = (role: "activation" | "inhibition" | "association" | "transport" | "conversion") => compileScientificFigure({
    schemaVersion: 1,
    document: { title: role, width: 760, height: 500 },
    objects: [
      { id: "source", kind: "protein", label: "source", x: 80, y: 220, width: 120, height: 80 },
      { id: "target", kind: "process", label: "target", x: 520, y: 220, width: 120, height: 80 }
    ],
    relationships: [{ id: "relation", sourceObjectId: "source", predicate: role, targetObjectId: "target", role }]
  });
  const activation = compileRole("activation");
  const inhibition = compileRole("inhibition");
  const association = compileRole("association");
  const transport = compileRole("transport");
  const conversion = compileRole("conversion");
  assert.ok(activation.elements.some((element) => element.id === "relation.arrowhead"));
  assert.ok(inhibition.elements.some((element) => element.id === "relation.inhibition-bar"));
  assert.deepEqual(association.semantics?.relationships?.[0]?.visualElementIds, ["relation.path"]);
  assert.equal(association.elements.find((element) => element.id === "relation.path")?.style?.stroke, "#475569");
  assert.equal(transport.elements.find((element) => element.id === "relation.path")?.style?.stroke, "#0F766E");
  assert.equal(conversion.elements.find((element) => element.id === "relation.path")?.style?.stroke, "#7C3AED");
  assert.ok(transport.elements.some((element) => element.id === "relation.arrowhead"));
  assert.ok(conversion.elements.some((element) => element.id === "relation.arrowhead"));
});

test("compiles a coordinate-free graph and preserves feedback components", async () => {
  const spec = JSON.parse(await readFile(autoLayoutExamplePath, "utf8"));
  assert.ok(spec.objects.every((object: { x?: number; y?: number }) => object.x === undefined && object.y === undefined));
  const scene = compileScientificFigure(spec);
  const objects = new Map(scene.semantics?.objects.map((object) => [object.id, object]));
  assert.equal(objects.get("ligand")?.properties?.layoutRank, 0);
  assert.equal(objects.get("receptor")?.properties?.layoutRank, 1);
  assert.equal(objects.get("kinase_a")?.properties?.layoutRank, 2);
  assert.equal(objects.get("kinase_b")?.properties?.layoutRank, 2);
  assert.equal(objects.get("kinase_a")?.properties?.layoutComponent, objects.get("kinase_b")?.properties?.layoutComponent);
  assert.equal(objects.get("gene_response")?.properties?.layoutRank, 3);
  assert.ok(Number(objects.get("ligand")?.properties?.x) < Number(objects.get("receptor")?.properties?.x));
  assert.ok(scene.elements.some((element) => element.id === "inhibitor_action.inhibition-bar"));
  const forward = scene.semantics?.relationships?.find((relationship) => relationship.id === "forward_feedback");
  const reverse = scene.semantics?.relationships?.find((relationship) => relationship.id === "reverse_feedback");
  assert.equal(forward?.properties?.sourcePort, "bottom");
  assert.equal(forward?.properties?.targetPort, "top");
  assert.equal(reverse?.properties?.sourcePort, "bottom");
  assert.equal(reverse?.properties?.targetPort, "top");
  assert.equal(forward?.properties?.crossings, 0);
  assert.equal(reverse?.properties?.crossings, 0);
  assert.ok(scene.semantics?.relationships?.filter((relationship) => relationship.properties?.visual !== false).every((relationship) => relationship.properties?.crossings === 0));
});

test("keeps layered and explicit layout contracts unambiguous", () => {
  const base = {
    schemaVersion: 1,
    document: { title: "layered", width: 700, height: 500 },
    objects: [{ id: "a", kind: "protein", label: "A", width: 100, height: 70 }],
    settings: { layoutMode: "layered" }
  };
  assert.throws(() => compileScientificFigure({ ...base, objects: [{ ...base.objects[0], x: 80 }] }), /cannot declare x or y/);
  assert.throws(
    () => compileScientificFigure({ ...base, constraints: [{ id: "bad", type: "contain", childId: "a", containerId: "a" }] }),
    /cannot also declare explicit constraints/
  );
});
