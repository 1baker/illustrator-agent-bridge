import test from "node:test";
import assert from "node:assert/strict";
import { renderSceneToSvg } from "../src/render/svgRenderer.js";

test("renders lines plus empty and filled closed shapes", () => {
  const svg = renderSceneToSvg({
    document: { title: "Geometry & Style", width: 320, height: 180 },
    elements: [
      { type: "line", name: "segment", x: 10, y: 20, x2: 90, y2: 20, style: { stroke: "#123456", strokeWidth: 3 } },
      {
        type: "path",
        name: "empty triangle",
        x: 0,
        y: 0,
        closed: true,
        points: [{ x: 20, y: 140 }, { x: 70, y: 60 }, { x: 120, y: 140 }],
        style: { fill: null, stroke: "#111111" }
      },
      {
        type: "polygon",
        name: "filled triangle",
        x: 0,
        y: 0,
        points: [{ x: 180, y: 140 }, { x: 230, y: 60 }, { x: 280, y: 140 }],
        style: { fill: "#4DA3FF", stroke: null }
      }
    ]
  });

  assert.match(svg, /<title id="scene-title">Geometry &amp; Style<\/title>/);
  assert.match(svg, /<line[^>]*x1="10"[^>]*x2="90"[^>]*stroke="#123456"/);
  assert.match(svg, /<path[^>]*data-name="empty triangle"[^>]*d="M 20,140 L 70,60 L 120,140 Z"[^>]*fill="none"/);
  assert.match(svg, /<polygon[^>]*data-name="filled triangle"[^>]*fill="#4DA3FF"[^>]*stroke="none"/);
});

test("renders open and curved paths with SVG cubic commands", () => {
  const svg = renderSceneToSvg({
    elements: [
      {
        type: "path",
        x: 0,
        y: 0,
        closed: false,
        points: [
          { x: 10, y: 20, rightX: 30, rightY: 5 },
          { x: 80, y: 40, leftX: 60, leftY: 55 }
        ],
        style: { fill: null }
      }
    ]
  });

  assert.match(svg, /d="M 10,20 C 30,5 60,55 80,40"/);
  assert.doesNotMatch(svg, /80,40 Z/);
});

test("embeds validated scientific identity and relationship annotations", () => {
  const svg = renderSceneToSvg({
    elements: [
      { id: "cell-membrane", type: "ellipse", name: "cell membrane", x: 10, y: 10, width: 80, height: 80 },
      { id: "binding-arrow", type: "line", name: "binding arrow", x: 100, y: 50, x2: 160, y2: 50 }
    ],
    semantics: {
      objects: [
        { id: "cell-1", kind: "cell", elementIds: ["cell-membrane"] },
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
  });

  assert.match(svg, /<metadata id="scientific-semantics"/);
  assert.match(svg, /id="cell-membrane"[^>]*data-scientific-objects="cell-1"[^>]*data-scientific-kinds="cell"/);
  assert.match(svg, /id="binding-arrow"[^>]*data-scientific-relationships="binding-1"/);
  assert.match(svg, /&quot;predicate&quot;:&quot;binds_to&quot;/);
});

test("renders nested groups in z-order with opacity, visibility, and clipping", () => {
  const svg = renderSceneToSvg({
    elements: [
      { id: "front", type: "rect", x: 10, y: 10, width: 20, height: 20, zIndex: 5 },
      { id: "back", type: "rect", x: 0, y: 0, width: 20, height: 20, zIndex: -5 },
      { id: "particle", type: "ellipse", x: 40, y: 40, width: 30, height: 30, groupId: "particles" },
      { id: "hidden", type: "ellipse", x: 0, y: 0, width: 10, height: 10, visible: false }
    ],
    groups: [
      { id: "cell", zIndex: 2, clip: { type: "ellipse", x: 30, y: 30, width: 100, height: 80 } },
      { id: "particles", parentId: "cell", opacity: 60 }
    ]
  });

  assert.match(svg, /<defs>[\s\S]*<clipPath id="clip-cell-1">[\s\S]*<ellipse/);
  assert.match(svg, /<g id="group-cell-1"[^>]*clip-path="url\(#clip-cell-1\)"/);
  assert.match(svg, /<g id="group-particles-1"[^>]*opacity="0\.6"/);
  assert.ok(svg.indexOf('id="back"') < svg.indexOf('id="group-cell-1"'));
  assert.ok(svg.indexOf('id="group-cell-1"') < svg.indexOf('id="front"'));
  assert.doesNotMatch(svg, /id="hidden"/);
});
