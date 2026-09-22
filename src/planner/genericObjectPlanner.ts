import type { CartoonScene, PathPoint, SceneElement } from "../bridge/types.js";
import { searchCorpus } from "../semantic/search.js";
import type { SemanticItem, SemanticKind, SemanticSearchResult } from "../semantic/types.js";
import { qaCartoonScene, recommendedExportFormats, type SceneQaReport } from "./sceneQa.js";

export interface GenericObjectPlanOptions {
  width?: number;
  height?: number;
  title?: string;
  evidenceLimit?: number;
}

export type GenericObjectArchetype = "microscope" | "reactor" | "mechanical" | "apparatus";

export interface GenericObjectPlan {
  prompt: string;
  planner: "generic-object-deterministic";
  subject: string;
  archetype: GenericObjectArchetype;
  semanticQueries: string[];
  evidence: SemanticSearchResult[];
  scene: CartoonScene;
  qa: SceneQaReport;
  recommendedExports: string[];
  notes: string[];
}

interface GenericObjectDescriptor {
  subject: string;
  archetype: GenericObjectArchetype;
}

export function planGenericObjectScene(
  prompt: string,
  corpus: SemanticItem[],
  options: GenericObjectPlanOptions = {}
): GenericObjectPlan {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required to plan a generic object scene.");
  }

  const descriptor = inferGenericObjectDescriptor(trimmedPrompt);
  const semanticQueries = buildSemanticQueries(trimmedPrompt, descriptor);
  const evidence = collectEvidence(semanticQueries, corpus, options.evidenceLimit ?? 12);
  const scene = buildGenericObjectScene(trimmedPrompt, descriptor, options);
  const qa = qaCartoonScene(scene);

  return {
    prompt: trimmedPrompt,
    planner: "generic-object-deterministic",
    subject: descriptor.subject,
    archetype: descriptor.archetype,
    semanticQueries,
    evidence,
    scene,
    qa,
    recommendedExports: recommendedExportFormats(scene),
    notes: [
      `Retrieved ${evidence.length} semantic evidence item(s) for ${descriptor.archetype} object planning.`,
      "This is a generic editable object fallback for prompts outside the strict cat/lock/key object guard.",
      "Run the Adobe SVG proof workflow and feed artworkReview.nextGoalPrompt into the next pass if the exported object is sparse, cropped, or too label-driven."
    ]
  };
}

export function inferGenericObjectDescriptor(prompt: string): GenericObjectDescriptor {
  const lower = prompt.toLowerCase();
  const subject = subjectFromPrompt(prompt);

  if (/\b(microscope|objective|eyepiece|slide|stage|optical)\b/.test(lower)) {
    return { subject, archetype: "microscope" };
  }

  if (/\b(reactor|bioreactor|fermenter|vessel|tank|impeller|baffle)\b/.test(lower)) {
    return { subject, archetype: "reactor" };
  }

  if (/\b(machine|mechanical|gear|engine|motor|robot|drone|pump|valve|sensor|assembly)\b/.test(lower)) {
    return { subject, archetype: "mechanical" };
  }

  return { subject, archetype: "apparatus" };
}

function buildSemanticQueries(prompt: string, descriptor: GenericObjectDescriptor): string[] {
  return uniqueStrings([
    prompt,
    `${descriptor.subject} object semantics silhouette component parts`,
    `${descriptor.archetype} shape combination named vector parts`,
    `${descriptor.subject} scientific instrument diagram callouts editable layers`,
    "publication vector readability outline named parts",
    "illustrator paths ellipses rectangles text named editable objects"
  ]);
}

function collectEvidence(queries: string[], corpus: SemanticItem[], limit: number): SemanticSearchResult[] {
  const kinds: SemanticKind[] = [
    "object_semantics",
    "shape_recipe",
    "shape_combination",
    "scientific_concept",
    "visual_metaphor",
    "style_reference",
    "publication_requirement",
    "illustrator_capability"
  ];
  const byId = new Map<string, SemanticSearchResult>();

  for (const query of queries) {
    for (const kind of kinds) {
      for (const result of searchCorpus(query, corpus, { kind, limit: 8 })) {
        const existing = byId.get(result.item.id);
        if (!existing || result.score > existing.score) {
          byId.set(result.item.id, result);
        }
      }
    }
  }

  return [...byId.values()]
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    .slice(0, Math.max(1, Math.min(limit, 25)));
}

function buildGenericObjectScene(
  prompt: string,
  descriptor: GenericObjectDescriptor,
  options: GenericObjectPlanOptions
): CartoonScene {
  const width = options.width ?? 1000;
  const height = options.height ?? 700;
  const title = options.title ?? titleFromPrompt(prompt);

  const elements =
    descriptor.archetype === "microscope"
      ? microscopeScene(width, height, descriptor.subject)
      : descriptor.archetype === "reactor"
        ? reactorScene(width, height, descriptor.subject)
        : descriptor.archetype === "mechanical"
          ? mechanicalScene(width, height, descriptor.subject)
          : apparatusScene(width, height, descriptor.subject);

  return {
    document: {
      title,
      width,
      height,
      colorMode: "RGB"
    },
    elements
  };
}

function microscopeScene(width: number, height: number, subject: string): SceneElement[] {
  const m = scaler(width, height, 1000, 700);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    ellipse("object ground shadow", m.x(205), m.y(616), m.s(610), m.s(48), "#CBD5E1", null, 0, 55),
    polygon("microscope base wedge", [[184, 602], [760, 602], [706, 526], [262, 526]].map(m.point), "#334155", "#0F172A", m.s(4)),
    rect("microscope base top plate", m.x(284), m.y(492), m.sx(356), m.sy(54), "#475569", "#0F172A", m.s(4)),
    rect("microscope stage platform", m.x(352), m.y(360), m.sx(340), m.sy(38), "#E2E8F0", "#0F172A", m.s(4)),
    rect("glass slide on stage", m.x(408), m.y(336), m.sx(192), m.sy(24), "#BAE6FD", "#0369A1", m.s(2), 82),
    ellipse("specimen dot one", m.x(462), m.y(342), m.s(16), m.s(10), "#16A34A", "#14532D", m.s(1)),
    ellipse("specimen dot two", m.x(504), m.y(344), m.s(12), m.s(8), "#22C55E", "#14532D", m.s(1)),
    ellipse("stage left clip", m.x(372), m.y(326), m.s(52), m.s(20), "#94A3B8", "#0F172A", m.s(2)),
    ellipse("stage right clip", m.x(590), m.y(326), m.s(52), m.s(20), "#94A3B8", "#0F172A", m.s(2)),
    rect("rear support column", m.x(636), m.y(194), m.sx(54), m.sy(336), "#64748B", "#0F172A", m.s(5)),
    path(
      "curved microscope arm",
      ([
        { x: 640, y: 196, rightX: 540, rightY: 194, pointType: "smooth" },
        { x: 454, y: 244, leftX: 554, leftY: 206, rightX: 380, rightY: 302, pointType: "smooth" },
        { x: 388, y: 372, leftX: 360, leftY: 308, rightX: 390, rightY: 432, pointType: "smooth" },
        { x: 444, y: 424, leftX: 394, leftY: 418, pointType: "smooth" },
        { x: 472, y: 366, rightX: 450, rightY: 300, pointType: "smooth" },
        { x: 536, y: 280, leftX: 486, leftY: 330, rightX: 620, rightY: 250, pointType: "smooth" },
        { x: 686, y: 238, leftX: 628, leftY: 220, pointType: "smooth" }
      ] as PathPoint[]).map(m.pathPoint),
      "#94A3B8",
      "#0F172A",
      m.s(5)
    ),
    rect("angled optical tube", m.x(404), m.y(178), m.sx(290), m.sy(54), "#1E293B", "#0F172A", m.s(4)),
    ellipse("eyepiece rim", m.x(670), m.y(152), m.s(76), m.s(76), "#475569", "#0F172A", m.s(4)),
    ellipse("eyepiece glass", m.x(690), m.y(171), m.s(36), m.s(36), "#7DD3FC", "#0369A1", m.s(2), 86),
    ellipse("objective turret", m.x(342), m.y(242), m.s(132), m.s(82), "#475569", "#0F172A", m.s(4)),
    rect("objective lens long", m.x(386), m.y(306), m.sx(34), m.sy(86), "#0F172A", "#020617", m.s(3)),
    rect("objective lens short left", m.x(332), m.y(298), m.sx(30), m.sy(62), "#334155", "#020617", m.s(3)),
    rect("objective lens short right", m.x(446), m.y(292), m.sx(30), m.sy(62), "#334155", "#020617", m.s(3)),
    polygon("light cone under objective", [[394, 394], [446, 394], [514, 492], [326, 492]].map(m.point), "#FDE68A", null, 0, 42),
    ellipse("coarse focus outer knob", m.x(704), m.y(318), m.s(96), m.s(96), "#334155", "#0F172A", m.s(4)),
    ellipse("coarse focus inner knob", m.x(730), m.y(344), m.s(44), m.s(44), "#94A3B8", "#0F172A", m.s(3)),
    ellipse("fine focus outer knob", m.x(694), m.y(422), m.s(68), m.s(68), "#64748B", "#0F172A", m.s(3)),
    ellipse("fine focus inner knob", m.x(714), m.y(442), m.s(28), m.s(28), "#CBD5E1", "#0F172A", m.s(2)),
    rect("illumination housing", m.x(426), m.y(460), m.sx(152), m.sy(38), "#FACC15", "#854D0E", m.s(3)),
    ellipse("lamp aperture", m.x(482), m.y(468), m.s(42), m.s(22), "#FEF3C7", "#854D0E", m.s(2)),
    rect("calibration panel", m.x(700), m.y(516), m.sx(126), m.sy(64), "#F1F5F9", "#0F172A", m.s(3)),
    text("calibration panel label", m.x(716), m.y(558), "calibration", m.s(19), "#0F172A"),
    text("object subject caption", m.x(204), m.y(112), compactTitle(subject), m.s(24), "#0F172A")
  ];

  addTickMarks(elements, "coarse focus tick", m, 752, 366, 46, 12, "#E2E8F0");
  addScrews(elements, "stage screw", m, [
    [366, 370],
    [672, 370],
    [302, 518],
    [626, 518],
    [728, 538],
    [798, 538]
  ]);
  addCallout(elements, m, "eyepiece callout", 746, 176, 818, 126, "eyepiece optics");
  addCallout(elements, m, "stage callout", 592, 344, 790, 300, "slide stage");
  addCallout(elements, m, "focus callout", 760, 392, 818, 430, "focus controls");
  addCallout(elements, m, "illumination callout", 514, 474, 716, 618, "illumination path");

  return elements;
}

function reactorScene(width: number, height: number, subject: string): SceneElement[] {
  const m = scaler(width, height, 1000, 700);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    ellipse("object ground shadow", m.x(210), m.y(612), m.s(580), m.s(48), "#CBD5E1", null, 0, 55),
    rect("reactor support frame left", m.x(272), m.y(176), m.sx(34), m.sy(412), "#475569", "#0F172A", m.s(4)),
    rect("reactor support frame right", m.x(690), m.y(176), m.sx(34), m.sy(412), "#475569", "#0F172A", m.s(4)),
    rect("reactor vessel body", m.x(340), m.y(170), m.sx(320), m.sy(388), "#DBEAFE", "#0F172A", m.s(5), 88),
    ellipse("reactor top dome", m.x(340), m.y(134), m.s(320), m.s(82), "#E0F2FE", "#0F172A", m.s(5), 94),
    ellipse("reactor bottom dome", m.x(340), m.y(516), m.s(320), m.s(82), "#BFDBFE", "#0F172A", m.s(5), 88),
    rect("liquid phase fill", m.x(358), m.y(322), m.sx(284), m.sy(218), "#38BDF8", null, 0, 48),
    path("reactor liquid meniscus", [{ x: 360, y: 322, rightX: 450, rightY: 300 }, { x: 520, y: 326, leftX: 430, leftY: 346, rightX: 600, rightY: 350 }, { x: 642, y: 322, leftX: 594, leftY: 308 }].map(m.pathPoint), null, "#0284C7", m.s(3), false),
    rect("agitator shaft", m.x(492), m.y(116), m.sx(18), m.sy(404), "#334155", "#0F172A", m.s(3)),
    ellipse("top motor housing", m.x(436), m.y(64), m.s(130), m.s(70), "#64748B", "#0F172A", m.s(4)),
    rect("top motor vent one", m.x(462), m.y(82), m.sx(12), m.sy(34), "#CBD5E1", "#0F172A", m.s(1)),
    rect("top motor vent two", m.x(488), m.y(82), m.sx(12), m.sy(34), "#CBD5E1", "#0F172A", m.s(1)),
    rect("top motor vent three", m.x(514), m.y(82), m.sx(12), m.sy(34), "#CBD5E1", "#0F172A", m.s(1)),
    polygon("upper impeller blade left", [[502, 292], [430, 268], [426, 292], [500, 316]].map(m.point), "#0EA5E9", "#075985", m.s(3)),
    polygon("upper impeller blade right", [[508, 292], [580, 268], [584, 292], [510, 316]].map(m.point), "#0EA5E9", "#075985", m.s(3)),
    polygon("lower impeller blade left", [[502, 430], [422, 408], [420, 434], [500, 454]].map(m.point), "#0EA5E9", "#075985", m.s(3)),
    polygon("lower impeller blade right", [[508, 430], [588, 408], [590, 434], [510, 454]].map(m.point), "#0EA5E9", "#075985", m.s(3)),
    rect("left internal baffle", m.x(372), m.y(228), m.sx(22), m.sy(264), "#93C5FD", "#075985", m.s(2), 74),
    rect("right internal baffle", m.x(606), m.y(228), m.sx(22), m.sy(264), "#93C5FD", "#075985", m.s(2), 74),
    rect("feed inlet pipe", m.x(160), m.y(214), m.sx(184), m.sy(28), "#CBD5E1", "#0F172A", m.s(4)),
    polygon("feed inlet arrow head", [[340, 200], [390, 228], [340, 256]].map(m.point), "#CBD5E1", "#0F172A", m.s(3)),
    rect("outlet pipe", m.x(660), m.y(488), m.sx(192), m.sy(28), "#CBD5E1", "#0F172A", m.s(4)),
    polygon("outlet arrow head", [[852, 474], [904, 502], [852, 530]].map(m.point), "#CBD5E1", "#0F172A", m.s(3)),
    ellipse("pressure gauge body", m.x(734), m.y(178), m.s(86), m.s(86), "#F8FAFC", "#0F172A", m.s(4)),
    line("pressure gauge needle", m.x(777), m.y(220), m.x(802), m.y(196), "#DC2626", m.s(3)),
    rect("sensor probe", m.x(660), m.y(304), m.sx(126), m.sy(18), "#F97316", "#7C2D12", m.s(3)),
    text("object subject caption", m.x(164), m.y(104), compactTitle(subject), m.s(24), "#0F172A")
  ];

  addBubbles(elements, "reactor bubble", m, [
    [420, 482, 14],
    [462, 438, 18],
    [548, 470, 16],
    [586, 384, 12],
    [442, 356, 11],
    [548, 346, 15],
    [492, 512, 10]
  ]);
  addCallout(elements, m, "impeller callout", 574, 430, 808, 386, "mixing impellers");
  addCallout(elements, m, "baffle callout", 620, 256, 828, 286, "anti-vortex baffles");
  addCallout(elements, m, "sensor callout", 750, 314, 840, 330, "process sensor");
  addCallout(elements, m, "phase callout", 410, 520, 188, 594, "active liquid phase");

  return elements;
}

function mechanicalScene(width: number, height: number, subject: string): SceneElement[] {
  const m = scaler(width, height, 1000, 700);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    ellipse("object ground shadow", m.x(186), m.y(604), m.s(620), m.s(50), "#CBD5E1", null, 0, 55),
    polygon("machine main chassis", [[202, 246], [714, 196], [804, 320], [720, 504], [250, 536], [144, 392]].map(m.point), "#D1D5DB", "#111827", m.s(5)),
    rect("front access panel", m.x(262), m.y(316), m.sx(206), m.sy(122), "#F8FAFC", "#111827", m.s(3)),
    rect("rear module housing", m.x(548), m.y(274), m.sx(168), m.sy(150), "#94A3B8", "#111827", m.s(4)),
    ellipse("left drive gear outer", m.x(286), m.y(334), m.s(126), m.s(126), "#64748B", "#111827", m.s(4)),
    ellipse("left drive gear hub", m.x(326), m.y(374), m.s(46), m.s(46), "#E5E7EB", "#111827", m.s(3)),
    ellipse("right drive gear outer", m.x(520), m.y(330), m.s(140), m.s(140), "#475569", "#111827", m.s(4)),
    ellipse("right drive gear hub", m.x(566), m.y(376), m.s(48), m.s(48), "#E5E7EB", "#111827", m.s(3)),
    path("drive belt top span", [{ x: 348, y: 330 }, { x: 586, y: 322 }].map(m.pathPoint), null, "#111827", m.s(8), false),
    path("drive belt bottom span", [{ x: 348, y: 464 }, { x: 586, y: 472 }].map(m.pathPoint), null, "#111827", m.s(8), false),
    rect("sensor mast", m.x(690), m.y(150), m.sx(34), m.sy(132), "#334155", "#111827", m.s(3)),
    ellipse("sensor head", m.x(660), m.y(108), m.s(94), m.s(64), "#38BDF8", "#075985", m.s(3)),
    rect("control stack", m.x(738), m.y(360), m.sx(90), m.sy(122), "#F8FAFC", "#111827", m.s(3)),
    text("object subject caption", m.x(176), m.y(120), compactTitle(subject), m.s(24), "#0F172A")
  ];

  addGearTeeth(elements, "left gear tooth", m, 349, 397, 78, 12);
  addGearTeeth(elements, "right gear tooth", m, 590, 400, 88, 14);
  addScrews(elements, "machine screw", m, [
    [236, 282],
    [754, 318],
    [258, 498],
    [704, 480],
    [282, 338],
    [444, 338],
    [282, 424],
    [444, 424]
  ]);
  addCallout(elements, m, "drive train callout", 586, 338, 796, 230, "exposed drive train");
  addCallout(elements, m, "sensor callout", 704, 132, 820, 134, "sensor module");
  addCallout(elements, m, "access panel callout", 362, 378, 170, 210, "serviceable panel");
  addCallout(elements, m, "controls callout", 786, 416, 858, 510, "control stack");

  return elements;
}

function apparatusScene(width: number, height: number, subject: string): SceneElement[] {
  const m = scaler(width, height, 1000, 700);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    ellipse("object ground shadow", m.x(186), m.y(604), m.s(628), m.s(52), "#CBD5E1", null, 0, 55),
    polygon("complex object main silhouette", [[194, 264], [438, 186], [716, 232], [822, 390], [672, 542], [326, 536], [142, 410]].map(m.point), "#CBD5E1", "#0F172A", m.s(5)),
    ellipse("central inspection window", m.x(374), m.y(278), m.s(212), m.s(156), "#BAE6FD", "#0369A1", m.s(4), 86),
    ellipse("inner inspection lens", m.x(426), m.y(314), m.s(108), m.s(82), "#E0F2FE", "#0369A1", m.s(3), 92),
    rect("left modular port", m.x(170), m.y(346), m.sx(142), m.sy(66), "#94A3B8", "#0F172A", m.s(4)),
    rect("right modular port", m.x(684), m.y(330), m.sx(160), m.sy(74), "#94A3B8", "#0F172A", m.s(4)),
    rect("top sensor rail", m.x(404), m.y(156), m.sx(220), m.sy(38), "#475569", "#0F172A", m.s(4)),
    ellipse("top sensor node one", m.x(434), m.y(132), m.s(54), m.s(54), "#38BDF8", "#075985", m.s(3)),
    ellipse("top sensor node two", m.x(548), m.y(128), m.s(62), m.s(62), "#FACC15", "#854D0E", m.s(3)),
    rect("lower service bay", m.x(354), m.y(450), m.sx(270), m.sy(74), "#F8FAFC", "#0F172A", m.s(3)),
    text("object subject caption", m.x(176), m.y(118), compactTitle(subject), m.s(24), "#0F172A")
  ];

  addScrews(elements, "apparatus screw", m, [
    [226, 294],
    [742, 284],
    [210, 466],
    [674, 504],
    [376, 472],
    [592, 472]
  ]);
  addPanelLights(elements, "status light", m, 382, 480);
  addCallout(elements, m, "window callout", 552, 300, 760, 214, "inspection window");
  addCallout(elements, m, "ports callout", 746, 368, 848, 452, "modular interfaces");
  addCallout(elements, m, "service bay callout", 486, 492, 214, 594, "editable service bay");
  addCallout(elements, m, "sensor rail callout", 584, 154, 812, 144, "sensor rail");

  return elements;
}

function addScrews(elements: SceneElement[], prefix: string, m: ReturnType<typeof scaler>, points: number[][]): void {
  points.forEach(([x, y], index) => {
    elements.push(ellipse(`${prefix} ${index + 1}`, m.x(x), m.y(y), m.s(18), m.s(18), "#E5E7EB", "#0F172A", m.s(2)));
    elements.push(line(`${prefix} slot ${index + 1}`, m.x(x + 4), m.y(y + 9), m.x(x + 14), m.y(y + 9), "#0F172A", m.s(1)));
  });
}

function addBubbles(elements: SceneElement[], prefix: string, m: ReturnType<typeof scaler>, bubbles: number[][]): void {
  bubbles.forEach(([x, y, size], index) => {
    elements.push(ellipse(`${prefix} ${index + 1}`, m.x(x), m.y(y), m.s(size), m.s(size), "#E0F2FE", "#0284C7", m.s(2), 82));
  });
}

function addTickMarks(
  elements: SceneElement[],
  prefix: string,
  m: ReturnType<typeof scaler>,
  cx: number,
  cy: number,
  radius: number,
  count: number,
  color: string
): void {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const inner = radius - 7;
    const outer = radius - 1;
    elements.push(
      line(
        `${prefix} ${index + 1}`,
        m.x(cx + Math.cos(angle) * inner),
        m.y(cy + Math.sin(angle) * inner),
        m.x(cx + Math.cos(angle) * outer),
        m.y(cy + Math.sin(angle) * outer),
        color,
        m.s(2)
      )
    );
  }
}

function addGearTeeth(
  elements: SceneElement[],
  prefix: string,
  m: ReturnType<typeof scaler>,
  cx: number,
  cy: number,
  radius: number,
  count: number
): void {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    elements.push(rect(`${prefix} ${index + 1}`, m.x(x - 7), m.y(y - 7), m.s(14), m.s(14), "#475569", "#111827", m.s(2)));
  }
}

function addPanelLights(elements: SceneElement[], prefix: string, m: ReturnType<typeof scaler>, x: number, y: number): void {
  ["#22C55E", "#FACC15", "#EF4444"].forEach((color, index) => {
    elements.push(ellipse(`${prefix} ${index + 1}`, m.x(x + index * 44), m.y(y), m.s(24), m.s(24), color, "#0F172A", m.s(2)));
  });
}

function addCallout(
  elements: SceneElement[],
  m: ReturnType<typeof scaler>,
  name: string,
  anchorX: number,
  anchorY: number,
  labelX: number,
  labelY: number,
  label: string
): void {
  elements.push(line(`${name} leader`, m.x(anchorX), m.y(anchorY), m.x(labelX), m.y(labelY), "#334155", m.s(2)));
  elements.push(ellipse(`${name} anchor`, m.x(anchorX - 5), m.y(anchorY - 5), m.s(10), m.s(10), "#FFFFFF", "#334155", m.s(2)));
  elements.push(text(`${name} label`, m.x(labelX), m.y(labelY), label, m.s(18), "#0F172A"));
}

function scaler(width: number, height: number, baseWidth: number, baseHeight: number) {
  const sx = width / baseWidth;
  const sy = height / baseHeight;
  const uniform = Math.min(sx, sy);

  return {
    x: (value: number) => Math.round(value * sx),
    y: (value: number) => Math.round(value * sy),
    sx: (value: number) => Math.round(value * sx),
    sy: (value: number) => Math.round(value * sy),
    s: (value: number) => Math.max(1, Math.round(value * uniform)),
    point: ([x, y]: number[]) => ({ x: Math.round(x * sx), y: Math.round(y * sy) }),
    pathPoint: (point: PathPoint): PathPoint => ({
      x: Math.round(point.x * sx),
      y: Math.round(point.y * sy),
      leftX: point.leftX === undefined ? undefined : Math.round(point.leftX * sx),
      leftY: point.leftY === undefined ? undefined : Math.round(point.leftY * sy),
      rightX: point.rightX === undefined ? undefined : Math.round(point.rightX * sx),
      rightY: point.rightY === undefined ? undefined : Math.round(point.rightY * sy),
      pointType: point.pointType
    })
  };
}

function rect(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string | null,
  strokeWidth: number,
  opacity = 100
): SceneElement {
  return { type: "rect", name, x, y, width, height, style: { fill, stroke, strokeWidth, opacity } };
}

function ellipse(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string | null,
  strokeWidth: number,
  opacity = 100
): SceneElement {
  return { type: "ellipse", name, x, y, width, height, style: { fill, stroke, strokeWidth, opacity } };
}

function line(name: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number): SceneElement {
  return { type: "line", name, x, y, x2, y2, style: { fill: null, stroke, strokeWidth } };
}

function polygon(name: string, points: Array<{ x: number; y: number }>, fill: string, stroke: string | null, strokeWidth: number, opacity = 100): SceneElement {
  return {
    type: "polygon",
    name,
    x: 0,
    y: 0,
    points,
    style: { fill, stroke, strokeWidth, opacity }
  };
}

function path(
  name: string,
  points: PathPoint[],
  fill: string | null,
  stroke: string | null,
  strokeWidth: number,
  closed = true,
  opacity = 100
): SceneElement {
  return { type: "path", name, x: 0, y: 0, points, closed, style: { fill, stroke, strokeWidth, opacity } };
}

function text(name: string, x: number, y: number, content: string, size: number, fill: string): SceneElement {
  return {
    type: "text",
    name,
    x,
    y,
    text: content,
    size,
    style: { fill, stroke: null }
  };
}

function subjectFromPrompt(prompt: string): string {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9 -]+/g, " ")
    .split(/\s+/g)
    .filter(Boolean)
    .filter(
      (token) =>
        !new Set([
          "a",
          "an",
          "the",
          "make",
          "create",
          "draw",
          "generate",
          "complex",
          "very",
          "object",
          "icon",
          "illustration",
          "scientific",
          "concept",
          "with",
          "and",
          "for",
          "of",
          "in",
          "on"
        ]).has(token)
    );

  const subject = tokens.slice(0, 5).join(" ").trim();
  return subject.length > 0 ? subject : "complex object";
}

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[^a-z0-9 ]+/gi, " ").trim().replace(/\s+/g, " ");
  const title = cleaned.length > 0 ? cleaned : "Generic object scene";
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

function compactTitle(value: string): string {
  const title = titleFromPrompt(value);
  return title.length > 34 ? `${title.slice(0, 31)}...` : title;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
