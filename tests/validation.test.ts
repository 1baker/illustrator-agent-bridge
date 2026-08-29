import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCommand, normalizeScene, ValidationError } from "../src/bridge/validation.js";

test("normalizes a ping command", () => {
  assert.deepEqual(normalizeCommand({ kind: "ping", message: "hi" }), {
    kind: "ping",
    message: "hi"
  });
});

test("rejects invalid colors before JSX generation", () => {
  assert.throws(
    () =>
      normalizeCommand({
        kind: "cartoon_scene",
        scene: {
          elements: [
            {
              type: "rect",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              style: { fill: "red" }
            }
          ]
        }
      }),
    ValidationError
  );
});

test("normalizes export commands", () => {
  assert.deepEqual(
    normalizeCommand({
      kind: "export",
      format: "PDF",
      outputPath: "out/figure.pdf"
    }),
    {
      kind: "export",
      format: "pdf",
      outputPath: "out/figure.pdf"
    }
  );
});

test("normalizes curved path elements", () => {
  const command = normalizeCommand({
    kind: "cartoon_scene",
    scene: {
      elements: [
        {
          type: "path",
          name: "curve",
          x: 0,
          y: 0,
          closed: false,
          points: [
            { x: 0, y: 0, rightX: 20, rightY: 0, pointType: "smooth" },
            { x: 40, y: 40, leftX: 20, leftY: 40, pointType: "corner" }
          ],
          style: { fill: null, stroke: "#abcdef" }
        }
      ]
    }
  });

  assert.equal(command.kind, "cartoon_scene");
  if (command.kind !== "cartoon_scene") {
    throw new Error("expected cartoon_scene command");
  }
  assert.equal(command.scene.elements[0]?.type, "path");
  assert.equal(command.scene.elements[0]?.style?.fill, null);
  assert.equal(command.scene.elements[0]?.style?.stroke, "#ABCDEF");
});

test("rejects closed path elements with fewer than three points", () => {
  assert.throws(
    () =>
      normalizeCommand({
        kind: "cartoon_scene",
        scene: {
          elements: [
            {
              type: "path",
              x: 0,
              y: 0,
              points: [
                { x: 0, y: 0 },
                { x: 10, y: 10 }
              ]
            }
          ]
        }
      }),
    ValidationError
  );
});

test("rejects incomplete Bezier control handles", () => {
  assert.throws(
    () => normalizeScene({ elements: [{ type: "path", x: 0, y: 0, closed: false, points: [{ x: 0, y: 0, rightX: 10 }, { x: 20, y: 0 }] }] }),
    /rightX and .*rightY must be provided together/
  );
});

test("normalizes scientific objects and relationships with valid references", () => {
  const command = normalizeCommand({
    kind: "cartoon_scene",
    scene: {
      elements: [
        { id: "cell-membrane", type: "ellipse", x: 10, y: 10, width: 80, height: 80 },
        { id: "binding-arrow", type: "line", x: 100, y: 50, x2: 160, y2: 50 }
      ],
      semantics: {
        objects: [
          { id: "cell-1", kind: "cell", elementIds: ["cell-membrane"], properties: { species: "example", count: 1 } },
          { id: "ligand-1", kind: "ligand", elementIds: ["binding-arrow"] }
        ],
        relationships: [
          {
            id: "binding-1",
            sourceObjectId: "ligand-1",
            predicate: "binds_to",
            targetObjectId: "cell-1",
            visualElementIds: ["binding-arrow"]
          }
        ]
      }
    }
  });

  assert.equal(command.kind, "cartoon_scene");
  if (command.kind !== "cartoon_scene") {
    throw new Error("expected cartoon_scene command");
  }
  assert.equal(command.scene.semantics?.objects[0]?.kind, "cell");
  assert.equal(command.scene.semantics?.relationships?.[0]?.predicate, "binds_to");
});

test("rejects duplicate element ids and dangling semantic references", () => {
  assert.throws(
    () =>
      normalizeCommand({
        kind: "cartoon_scene",
        scene: {
          elements: [
            { id: "same-id", type: "ellipse", x: 0, y: 0, width: 10, height: 10 },
            { id: "same-id", type: "ellipse", x: 20, y: 0, width: 10, height: 10 }
          ]
        }
      }),
    /scene element ids must be unique/
  );

  assert.throws(
    () =>
      normalizeCommand({
        kind: "cartoon_scene",
        scene: {
          elements: [{ id: "visible-cell", type: "ellipse", x: 0, y: 0, width: 10, height: 10 }],
          semantics: {
            objects: [{ id: "cell-1", kind: "cell", elementIds: ["missing-element"] }]
          }
        }
      }),
    /references unknown scene element id: missing-element/
  );
});

test("normalizes nested composition groups and closed clip geometry", () => {
  const scene = normalizeScene({
    elements: [
      { id: "background", type: "rect", x: 0, y: 0, width: 200, height: 200, zIndex: -10 },
      { id: "particle", type: "ellipse", x: 20, y: 20, width: 30, height: 30, groupId: "particles", zIndex: 2 }
    ],
    groups: [
      { id: "cell", clip: { type: "ellipse", x: 10, y: 10, width: 160, height: 140 } },
      { id: "particles", parentId: "cell", opacity: 75, zIndex: 3 }
    ]
  });

  assert.equal(scene.groups?.[0]?.clip?.type, "ellipse");
  assert.equal(scene.groups?.[1]?.parentId, "cell");
  assert.equal(scene.elements[1]?.groupId, "particles");
});

test("rejects missing groups, parent cycles, open clipping paths, and fractional z-order", () => {
  assert.throws(
    () => normalizeScene({ elements: [{ type: "rect", x: 0, y: 0, width: 20, height: 20, groupId: "missing" }] }),
    /references unknown group/
  );
  assert.throws(
    () =>
      normalizeScene({
        elements: [{ type: "rect", x: 0, y: 0, width: 20, height: 20 }],
        groups: [
          { id: "a", parentId: "b" },
          { id: "b", parentId: "a" }
        ]
      }),
    /parent cycle/
  );
  assert.throws(
    () =>
      normalizeScene({
        elements: [{ type: "rect", x: 0, y: 0, width: 20, height: 20 }],
        groups: [{ id: "clip", clip: { type: "path", x: 0, y: 0, closed: false, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }] } }]
      }),
    /must be closed/
  );
  assert.throws(
    () => normalizeScene({ elements: [{ type: "rect", x: 0, y: 0, width: 20, height: 20, zIndex: 1.5 }] }),
    /zIndex must be an integer/
  );
});
