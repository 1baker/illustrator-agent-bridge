import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type SceneElement = {
  id?: string;
  type?: string;
  text?: string;
  size?: number;
  style?: { fill?: string | null; stroke?: string | null; opacity?: number };
};

type Scene = {
  document?: { width?: number; height?: number };
  elements?: SceneElement[];
  semantics?: { objects?: Array<{ id?: string; elementIds?: string[] }> };
};

async function readScene(path: string): Promise<Scene> {
  return JSON.parse(await readFile(path, "utf8")) as Scene;
}

test("manuscript figure makes morphology, time resolution, and schematic status visible", async () => {
  const scene = await readScene("examples/manuscript-raft-pisa-morphogenesis.scene.json");
  const byId = new Map((scene.elements ?? []).map((element) => [element.id, element]));
  for (const id of [
    "worm-branch-halo",
    "worm-branch-core",
    "vesicle-outer-corona",
    "vesicle-inner-corona",
    "saxs-curve-early",
    "saxs-curve-middle",
    "saxs-curve-late",
    "saxs-time-early",
    "saxs-time-late"
  ]) assert.ok(byId.has(id), `missing visual evidence element ${id}`);

  assert.match(byId.get("saxs-plot-note")?.text ?? "", /schematic profiles \(not fitted data\)/);
  assert.equal(byId.get("vesicle")?.style?.fill, "#F59E0B");
  assert.equal(byId.get("vesicle-outer-corona")?.style?.stroke, "#60A5FA");
  assert.equal(byId.get("vesicle-inner-corona")?.style?.stroke, "#60A5FA");

  for (const id of ["unimer-label", "nucleus-label", "sphere-label", "worm-label", "vesicle-label"]) {
    assert.ok((byId.get(id)?.size ?? 0) >= 18, `${id} is too small for the declared full-width layout`);
  }

  const objects = new Map((scene.semantics?.objects ?? []).map((object) => [object.id, object]));
  assert.deepEqual(objects.get("worm-morphology")?.elementIds, ["worm-halo", "worm-core", "worm-branch-halo", "worm-branch-core"]);
  assert.ok(objects.get("vesicle-morphology")?.elementIds?.includes("vesicle-inner-corona"));
  assert.equal(objects.get("saxs-observation")?.elementIds?.filter((id) => id.startsWith("saxs-curve-")).length, 3);
});

test("conformance atlas exposes nominal endpoints, invisible opacity, and clip boundaries", async () => {
  const scene = await readScene("examples/tikz-conformance-atlas.scene.json");
  const byId = new Map((scene.elements ?? []).map((element) => [element.id, element]));
  for (const id of [
    "butt-start-guide",
    "round-start-guide",
    "square-start-guide",
    "opacity-0-footprint",
    "clip-rect-outline",
    "clip-ellipse-outline",
    "clip-polygon-outline",
    "clip-path-outline"
  ]) assert.ok(byId.has(id), `missing instructional guide ${id}`);
  assert.equal(byId.get("opacity-0")?.style?.opacity, 0);
  assert.equal(byId.get("opacity-label-0")?.text, "0% (invisible)");
});
