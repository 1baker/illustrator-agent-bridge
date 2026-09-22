import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScene } from "../src/core/sceneValidation.js";
import { DEFAULT_SCIENTIFIC_THEME } from "../src/core/scientificTheme.js";
import type { VectorElement } from "../src/core/vectorScene.js";
import { inferScientificSymbolRecipe, renderScientificSymbol, type ScientificSymbolRecipeId } from "../src/scientific/symbolRegistry.js";

function geometryCoordinates(element: VectorElement): Array<{ x: number; y: number }> {
  if (element.type === "line") return [{ x: element.x, y: element.y }, { x: element.x2, y: element.y2 }];
  if (element.type === "rect" || element.type === "ellipse") {
    return [{ x: element.x, y: element.y }, { x: element.x + element.width, y: element.y + element.height }];
  }
  if (element.type === "polygon") return element.points;
  if (element.type === "path") {
    return element.points.flatMap((point) => [
      { x: point.x, y: point.y },
      ...(point.leftX !== undefined && point.leftY !== undefined ? [{ x: point.leftX, y: point.leftY }] : []),
      ...(point.rightX !== undefined && point.rightY !== undefined ? [{ x: point.rightX, y: point.rightY }] : [])
    ]);
  }
  return [{ x: element.x, y: element.y }];
}

test("infers scientific recipes from semantic kinds", () => {
  assert.equal(inferScientificSymbolRecipe("membrane_receptor"), "receptor");
  assert.equal(inferScientificSymbolRecipe("signaling_molecule"), "molecule");
  assert.equal(inferScientificSymbolRecipe("protein_kinase"), "protein");
  assert.equal(inferScientificSymbolRecipe("gene_expression_process"), "process");
  assert.equal(inferScientificSymbolRecipe("nuclear_compartment"), "nucleus");
  assert.equal(inferScientificSymbolRecipe("double_stranded_dna"), "dna");
  assert.equal(inferScientificSymbolRecipe("messenger_rna"), "rna");
  assert.equal(inferScientificSymbolRecipe("lipid_bilayer"), "membrane");
  assert.equal(inferScientificSymbolRecipe("mitochondrial_organelle"), "organelle");
  assert.equal(inferScientificSymbolRecipe("polymer_nanoparticle"), "particle");
  assert.equal(inferScientificSymbolRecipe("laboratory_flask"), "apparatus");
  assert.equal(inferScientificSymbolRecipe("unknown_scientific_kind"), "generic");
});

test("expands every recipe into unique validated vector parts", () => {
  const recipeIds: ScientificSymbolRecipeId[] = ["generic", "cell", "nucleus", "receptor", "molecule", "protein", "process", "dna", "rna", "membrane", "organelle", "particle", "apparatus"];
  for (const recipe of recipeIds) {
    const rendered = renderScientificSymbol({
      objectId: `test-${recipe}`,
      kind: "test_kind",
      box: { x: 40, y: 140, width: 180, height: 120 },
      shape: "rect",
      role: recipe === "cell" || recipe === "nucleus" ? "compartment" : "primary_object",
      recipe,
      theme: DEFAULT_SCIENTIFIC_THEME
    });
    assert.equal(rendered.recipeId, recipe);
    assert.ok(rendered.elements.some((element) => element.id === rendered.mainElementId));
    const ids = rendered.elements.map((element) => element.id);
    assert.equal(new Set(ids).size, ids.length);
    normalizeScene({ document: { width: 300, height: 300 }, elements: rendered.elements });
  }
});

test("builds recognizable domain symbols from primitive vector parts", () => {
  const render = (recipe: ScientificSymbolRecipeId) => renderScientificSymbol({
    objectId: recipe,
    kind: recipe,
    box: { x: 20, y: 80, width: 220, height: 150 },
    shape: recipe === "organelle" || recipe === "particle" ? "ellipse" : "rect",
    role: recipe === "membrane" || recipe === "organelle" || recipe === "apparatus" ? "secondary_object" : "primary_object",
    recipe,
    theme: DEFAULT_SCIENTIFIC_THEME
  });
  const dna = render("dna");
  const rna = render("rna");
  const membrane = render("membrane");
  const organelle = render("organelle");
  const particle = render("particle");
  const apparatus = render("apparatus");
  assert.equal(dna.elements.filter((element) => element.type === "path").length, 2);
  assert.equal(dna.elements.filter((element) => element.type === "line").length, 5);
  assert.ok(rna.elements.some((element) => element.id === "rna.strand" && element.type === "path" && element.closed === false));
  assert.ok(membrane.elements.filter((element) => element.id?.includes("head")).length >= 12);
  assert.ok(organelle.elements.some((element) => element.id === "organelle.inner-membrane" && element.type === "ellipse" && element.style?.fill === null));
  assert.ok(particle.elements.some((element) => element.id === "particle.core" && element.type === "ellipse"));
  assert.ok(apparatus.elements.some((element) => element.id === "apparatus.body" && element.type === "path" && element.closed === true));
  assert.ok(apparatus.elements.some((element) => element.id === "apparatus.liquid" && element.type === "polygon" && element.style?.fill !== null));
});

test("keeps every symbol recipe inside its assigned layout box", () => {
  const box = { x: 40, y: 80, width: 220, height: 160 };
  const recipeIds: ScientificSymbolRecipeId[] = ["generic", "cell", "nucleus", "receptor", "molecule", "protein", "process", "dna", "rna", "membrane", "organelle", "particle", "apparatus"];
  for (const recipe of recipeIds) {
    const rendered = renderScientificSymbol({
      objectId: recipe,
      kind: recipe,
      box,
      shape: recipe === "organelle" || recipe === "particle" ? "ellipse" : "rect",
      role: recipe === "membrane" || recipe === "organelle" || recipe === "apparatus" ? "secondary_object" : "primary_object",
      recipe,
      theme: DEFAULT_SCIENTIFIC_THEME
    });
    for (const element of rendered.elements) {
      for (const point of geometryCoordinates(element)) {
        assert.ok(point.x >= box.x && point.x <= box.x + box.width, `${recipe}/${element.id} x=${point.x}`);
        assert.ok(point.y >= box.y && point.y <= box.y + box.height, `${recipe}/${element.id} y=${point.y}`);
      }
    }
  }
});

test("produces multi-part semantic shapes instead of generic boxes", () => {
  const molecule = renderScientificSymbol({
    objectId: "ligand",
    kind: "signaling_molecule",
    box: { x: 20, y: 120, width: 120, height: 80 },
    shape: "ellipse",
    role: "primary_object",
    theme: DEFAULT_SCIENTIFIC_THEME
  });
  assert.equal(molecule.recipeId, "molecule");
  assert.equal(molecule.elements.length, 5);
  assert.ok(molecule.elements.some((element) => element.id === "ligand.bond-left" && element.type === "line"));
  assert.ok(molecule.elements.some((element) => element.id === "ligand.body" && element.type === "ellipse"));
});
