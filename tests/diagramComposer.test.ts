import test from "node:test";
import assert from "node:assert/strict";
import { composeScientificDiagram } from "../src/scientific/diagramComposer.js";

test("composes reusable scientific symbols and a directed relationship", () => {
  const scene = composeScientificDiagram({
    document: { title: "Binding recipe", width: 1000, height: 620 },
    symbols: [
      { id: "cell-1", kind: "cell", x: 70, y: 150, width: 400, height: 320, label: "target cell" },
      { id: "receptor-1", kind: "membrane_receptor", x: 470, y: 260, width: 150, height: 110, label: "receptor" },
      { id: "ligand-1", kind: "ligand", x: 820, y: 280, width: 68, height: 68, label: "ligand" }
    ],
    relationships: [
      { id: "binding-1", sourceObjectId: "ligand-1", predicate: "binds_to", targetObjectId: "receptor-1" }
    ]
  });

  assert.equal(scene.semantics?.objects.length, 3);
  assert.equal(scene.semantics?.relationships?.[0]?.predicate, "binds_to");
  assert.ok(scene.elements.some((element) => element.id === "cell-1.membrane" && element.style?.fill === null));
  assert.ok(scene.elements.some((element) => element.id === "cell-1.cytoplasm" && element.style?.fill === "#E0F2FE"));
  assert.ok(scene.elements.some((element) => element.id === "receptor-1.binding-pocket" && element.type === "path"));
  assert.ok(scene.elements.some((element) => element.id === "ligand-1.body" && element.type === "ellipse"));
  assert.deepEqual(scene.semantics?.relationships?.[0]?.visualElementIds, ["binding-1.line", "binding-1.arrowhead", "binding-1.label"]);

  const line = scene.elements.find((element) => element.id === "binding-1.line");
  assert.equal(line?.type, "line");
  if (line?.type !== "line") {
    throw new Error("expected relationship line");
  }
  assert.ok(line.x > line.x2, "ligand-to-receptor relationship should point left toward the receptor");
});

test("rejects undersized, out-of-canvas, duplicate, and dangling symbol specifications", () => {
  assert.throws(
    () => composeScientificDiagram({ symbols: [{ id: "tiny-cell", kind: "cell", x: 10, y: 100, width: 40, height: 40 }] }),
    /must be at least 160 x 130/
  );

  assert.throws(
    () => composeScientificDiagram({ symbols: [{ id: "off-canvas", kind: "ligand", x: 980, y: 100, width: 50, height: 50 }] }),
    /must fit inside the canvas/
  );

  assert.throws(
    () =>
      composeScientificDiagram({
        symbols: [
          { id: "same", kind: "ligand", x: 100, y: 100, width: 50, height: 50 },
          { id: "same", kind: "ligand", x: 200, y: 100, width: 50, height: 50 }
        ]
      }),
    /must have unique ids/
  );

  assert.throws(
    () =>
      composeScientificDiagram({
        symbols: [{ id: "ligand-1", kind: "ligand", x: 100, y: 100, width: 50, height: 50 }],
        relationships: [{ id: "bad-link", sourceObjectId: "ligand-1", predicate: "binds_to", targetObjectId: "missing" }]
      }),
    /targetObjectId references unknown symbol/
  );
});

test("resolves object-local ports through a dependency chain", () => {
  const scene = composeScientificDiagram({
    document: { width: 1100, height: 650 },
    symbols: [
      {
        id: "ligand-1",
        kind: "ligand",
        width: 76,
        height: 76,
        anchor: { targetObjectId: "receptor-1", targetPort: "right", ownPort: "left", gap: 230 }
      },
      { id: "cell-1", kind: "cell", x: 70, y: 150, width: 430, height: 340 },
      {
        id: "receptor-1",
        kind: "membrane_receptor",
        width: 170,
        height: 140,
        anchor: { targetObjectId: "cell-1", targetPort: "right", ownPort: "left", gap: -12 }
      }
    ]
  });

  const receptor = scene.semantics?.objects.find((object) => object.id === "receptor-1");
  const ligand = scene.semantics?.objects.find((object) => object.id === "ligand-1");
  assert.equal(receptor?.properties?.resolvedX, 488);
  assert.equal(receptor?.properties?.resolvedY, 250);
  assert.equal(receptor?.properties?.anchorTarget, "cell-1");
  assert.equal(receptor?.properties?.targetPort, "right");
  assert.equal(ligand?.properties?.resolvedX, 888);
  assert.equal(ligand?.properties?.resolvedY, 282);
});

test("rejects ambiguous placement, cycles, unknown anchor targets, and accidental collisions", () => {
  assert.throws(
    () =>
      composeScientificDiagram({
        symbols: [
          {
            id: "mixed",
            kind: "ligand",
            x: 100,
            y: 100,
            width: 50,
            height: 50,
            anchor: { targetObjectId: "base", targetPort: "right" }
          },
          { id: "base", kind: "ligand", x: 200, y: 100, width: 50, height: 50 }
        ]
      }),
    /either x\/y or anchor placement/
  );

  assert.throws(
    () =>
      composeScientificDiagram({
        symbols: [
          { id: "a", kind: "ligand", width: 50, height: 50, anchor: { targetObjectId: "b", targetPort: "right" } },
          { id: "b", kind: "ligand", width: 50, height: 50, anchor: { targetObjectId: "a", targetPort: "left" } }
        ]
      }),
    /anchor placement cycle/
  );

  assert.throws(
    () =>
      composeScientificDiagram({
        symbols: [
          { id: "orphan", kind: "ligand", width: 50, height: 50, anchor: { targetObjectId: "missing", targetPort: "right" } }
        ]
      }),
    /unknown target symbol/
  );

  assert.throws(
    () =>
      composeScientificDiagram({
        symbols: [
          { id: "a", kind: "ligand", x: 100, y: 100, width: 60, height: 60 },
          { id: "b", kind: "ligand", x: 130, y: 120, width: 60, height: 60 }
        ]
      }),
    /overlap without an anchor relationship/
  );
});
