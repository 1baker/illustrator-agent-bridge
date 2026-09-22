import type { CartoonScene, PathPoint, SceneElement } from "../bridge/types.js";
import { searchCorpus } from "../semantic/search.js";
import type { SemanticItem, SemanticSearchResult } from "../semantic/types.js";
import { qaCartoonScene, recommendedExportFormats, type SceneQaReport } from "./sceneQa.js";

export interface CartoonPlanOptions {
  width?: number;
  height?: number;
  title?: string;
  evidenceLimit?: number;
}

export interface CartoonPlan {
  prompt: string;
  planner: "deterministic" | "openai";
  evidence: SemanticSearchResult[];
  scene: CartoonScene;
  qa: SceneQaReport;
  recommendedExports: string[];
  notes: string[];
}

export function planCartoonScene(prompt: string, corpus: SemanticItem[], options: CartoonPlanOptions = {}): CartoonPlan {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required to plan a cartoon scene.");
  }

  const evidence = searchCorpus(trimmedPrompt, corpus, { limit: options.evidenceLimit ?? 6 });
  const scene = buildScene(trimmedPrompt, options);
  const qa = qaCartoonScene(scene);

  return {
    prompt: trimmedPrompt,
    planner: "deterministic",
    evidence,
    scene,
    qa,
    recommendedExports: recommendedExportFormats(scene),
    notes: [
      "This is a deterministic first-pass plan. A stronger LLM planner should revise the scene using retrieved evidence before final Illustrator execution.",
      "Run the generated JSX in Illustrator, export PDF/SVG, then inspect visual output before treating artwork as publication-ready."
    ]
  };
}

function buildScene(prompt: string, options: CartoonPlanOptions): CartoonScene {
  const width = options.width ?? 720;
  const height = options.height ?? 480;
  const lower = prompt.toLowerCase();
  const wantsLab = /\b(lab|laboratory|scientist|chemistry|flask|beaker)\b/.test(lower);
  const title = options.title ?? titleFromPrompt(prompt);

  return {
    document: {
      title,
      width,
      height,
      colorMode: "RGB"
    },
    elements: wantsLab ? labScene(width, height, prompt) : broadPromptScene(width, height, prompt)
  };
}

function labScene(width: number, height: number, prompt: string): SceneElement[] {
  const scaleX = width / 720;
  const scaleY = height / 480;
  const scale = (value: number) => Math.round(value * Math.min(scaleX, scaleY));
  const x = (value: number) => Math.round(value * scaleX);
  const y = (value: number) => Math.round(value * scaleY);

  return [
    rect("background", 0, 0, width, height, "#F7F2E8", null, 0),
    ellipse("soft blue context window", x(452), y(55), scale(188), scale(128), "#B7D9E8", "#243845", 3),
    rect("workbench", x(78), y(328), x(564), scale(44), "#5E7485", "#243845", 3),
    ellipse("scientist head", x(186), y(106), scale(126), scale(126), "#F2C2A0", "#1D1B1B", 4),
    ellipse("left goggle lens", x(214), y(152), scale(30), scale(25), "#FFFFFF", "#1D1B1B", 3),
    ellipse("right goggle lens", x(258), y(152), scale(30), scale(25), "#FFFFFF", "#1D1B1B", 3),
    line("goggle bridge", x(244), y(165), x(258), y(165), "#1D1B1B", 3),
    polygon(
      "white lab coat",
      [
        [x(150), y(292)],
        [x(210), y(224)],
        [x(296), y(224)],
        [x(356), y(292)],
        [x(330), y(352)],
        [x(170), y(352)]
      ],
      "#FFFFFF",
      "#1D1B1B",
      4
    ),
    ellipse("round reaction flask", x(420), y(238), scale(96), scale(96), "#8DD6C8", "#1D1B1B", 4, 78),
    rect("flask neck", x(455), y(192), scale(26), scale(62), "#8DD6C8", "#1D1B1B", 4, 78),
    ellipse("reaction bubble one", x(506), y(156), scale(28), scale(28), "#F5D04C", "#1D1B1B", 3),
    ellipse("reaction bubble two", x(540), y(112), scale(42), scale(42), "#FF8A65", "#1D1B1B", 3),
    text("figure caption", x(104), y(412), captionFromPrompt(prompt), Math.max(16, scale(22)), "#243845")
  ];
}

function broadPromptScene(width: number, height: number, prompt: string): SceneElement[] {
  const lower = prompt.toLowerCase();

  if (/\b(city|urban|skyline|transit|train|rail|bus|street|neighborhood|infrastructure)\b/.test(lower)) {
    return cityTransitScene(width, height, prompt);
  }

  if (/\b(workflow|process|pipeline|supply chain|factory|manufacturing|logistics|timeline|cycle)\b/.test(lower)) {
    return processWorkflowScene(width, height, prompt);
  }

  if (/\b(ecosystem|landscape|forest|river|ocean|climate|habitat|farm|field|watershed|mountain)\b/.test(lower)) {
    return ecosystemScene(width, height, prompt);
  }

  return richExplainerScene(width, height, prompt);
}

function cityTransitScene(width: number, height: number, prompt: string): SceneElement[] {
  const m = scaler(width, height, 720, 480);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    rect("background sky wash", 0, 0, width, m.sy(244), "#DCEFFF", null, 0),
    polygon("background distant river ribbon", [[42, 320], [164, 286], [324, 302], [506, 268], [678, 286], [678, 342], [510, 324], [332, 356], [164, 344], [42, 376]].map(m.point), "#7DD3FC", "#0369A1", m.s(2), 82),
    polygon("background ground plane", [[42, 374], [678, 338], [678, 430], [54, 430]].map(m.point), "#D1FAE5", "#166534", m.s(2)),
    text("scene title", m.x(76), m.y(58), captionFromPrompt(prompt), m.s(22), "#0F172A")
  ];

  addSkyline(elements, m);
  addTransitMap(elements, m);
  addCityForeground(elements, m);
  addCallout(elements, m, "station callout", 492, 308, 590, 360, "transit hub");
  addCallout(elements, m, "river callout", 300, 328, 56, 318, "river corridor");
  addCallout(elements, m, "solar callout", 236, 182, 78, 128, "solar rooftops");
  addCallout(elements, m, "data overlay callout", 566, 174, 516, 92, "data overlay");

  return elements;
}

function processWorkflowScene(width: number, height: number, prompt: string): SceneElement[] {
  const m = scaler(width, height, 720, 480);
  const stages = [
    { name: "input feedstock", label: "input", x: 70, y: 180, fill: "#DBEAFE" },
    { name: "processing cell", label: "process", x: 220, y: 160, fill: "#DCFCE7" },
    { name: "quality gate", label: "QA", x: 382, y: 180, fill: "#FEF3C7" },
    { name: "output package", label: "output", x: 532, y: 160, fill: "#FCE7F3" }
  ];
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    text("scene title", m.x(66), m.y(62), captionFromPrompt(prompt), m.s(22), "#0F172A"),
    rect("workflow base lane", m.x(54), m.y(334), m.sx(612), m.sy(42), "#E2E8F0", "#334155", m.s(3)),
    line("timeline spine", m.x(96), m.y(356), m.x(628), m.y(356), "#334155", m.s(4))
  ];

  stages.forEach((stage, index) => {
    elements.push(rect(`${stage.name} panel`, m.x(stage.x), m.y(stage.y), m.sx(118), m.sy(104), stage.fill, "#0F172A", m.s(3)));
    elements.push(text(`${stage.name} label`, m.x(stage.x + 20), m.y(stage.y + 62), stage.label, m.s(18), "#0F172A"));
    elements.push(ellipse(`${stage.name} status node`, m.x(stage.x + 48), m.y(344), m.s(24), m.s(24), "#FFFFFF", "#334155", m.s(2)));
    addPanelDetails(elements, `${stage.name} detail`, m, stage.x + 22, stage.y + 18, index);
    if (index < stages.length - 1) {
      arrow(elements, `${stage.name} arrow`, m, stage.x + 124, stage.y + 52, stages[index + 1].x - 8, stages[index + 1].y + 52, "#2563EB");
    }
  });

  addCallout(elements, m, "feedback loop callout", 446, 168, 458, 92, "feedback loop");
  elements.push(path("feedback loop arrow", [
    { x: 582, y: 150, rightX: 554, rightY: 88 },
    { x: 330, y: 102, leftX: 496, leftY: 70, rightX: 190, rightY: 92 },
    { x: 130, y: 178, leftX: 204, leftY: 110 }
  ].map(m.pathPoint), null, "#7C3AED", m.s(3), false));
  elements.push(polygon("feedback loop arrow head", [[126, 178], [150, 164], [150, 192]].map(m.point), "#7C3AED", "#7C3AED", m.s(1)));

  return elements;
}

function ecosystemScene(width: number, height: number, prompt: string): SceneElement[] {
  const m = scaler(width, height, 720, 480);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    rect("background sky gradient band", 0, 0, width, m.sy(230), "#DCEFFF", null, 0),
    polygon("mountain back ridge", [[52, 278], [178, 138], [292, 278]].map(m.point), "#CBD5E1", "#475569", m.s(2)),
    polygon("mountain front ridge", [[212, 280], [402, 112], [612, 280]].map(m.point), "#94A3B8", "#334155", m.s(2)),
    polygon("background meadow plane", [[0, 276], [720, 260], [720, 480], [0, 480]].map(m.point), "#BBF7D0", null, 0),
    path("river flow ribbon", [
      { x: 450, y: 252, rightX: 420, rightY: 312 },
      { x: 338, y: 340, leftX: 450, leftY: 310, rightX: 250, rightY: 384 },
      { x: 186, y: 448, leftX: 276, leftY: 430 }
    ].map(m.pathPoint), null, "#0284C7", m.s(24), false, 68),
    text("scene title", m.x(60), m.y(58), captionFromPrompt(prompt), m.s(22), "#0F172A")
  ];

  addForest(elements, m);
  addFarmAndHabitat(elements, m);
  addSunAndClouds(elements, m);
  addCallout(elements, m, "watershed callout", 404, 166, 500, 104, "watershed");
  addCallout(elements, m, "habitat callout", 126, 366, 84, 304, "habitat patch");
  addCallout(elements, m, "river callout", 306, 360, 432, 398, "water flow");

  return elements;
}

function richExplainerScene(width: number, height: number, prompt: string): SceneElement[] {
  const m = scaler(width, height, 720, 480);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F8FAFC", null, 0),
    text("scene title", m.x(62), m.y(58), captionFromPrompt(prompt), m.s(22), "#0F172A"),
    ellipse("central concept core", m.x(282), m.y(156), m.s(152), m.s(152), "#8DD6C8", "#0F172A", m.s(4)),
    ellipse("central concept highlight", m.x(326), m.y(194), m.s(56), m.s(42), "#ECFEFF", "#0E7490", m.s(2), 88),
    rect("left context panel", m.x(76), m.y(168), m.sx(138), m.sy(100), "#DBEAFE", "#1E3A8A", m.s(3)),
    rect("right outcome panel", m.x(506), m.y(168), m.sx(138), m.sy(100), "#DCFCE7", "#166534", m.s(3)),
    rect("bottom evidence panel", m.x(246), m.y(338), m.sx(228), m.sy(70), "#FEF3C7", "#92400E", m.s(3)),
    text("left context label", m.x(100), m.y(224), "context", m.s(18), "#0F172A"),
    text("right outcome label", m.x(528), m.y(224), "outcome", m.s(18), "#0F172A"),
    text("bottom evidence label", m.x(282), m.y(382), "evidence layer", m.s(18), "#0F172A")
  ];

  addOrbitNodes(elements, m);
  arrow(elements, "context to core arrow", m, 214, 218, 280, 222, "#2563EB");
  arrow(elements, "core to outcome arrow", m, 436, 222, 506, 218, "#16A34A");
  arrow(elements, "core to evidence arrow", m, 358, 306, 358, 338, "#92400E");
  addPanelDetails(elements, "left context motif", m, 96, 184, 0);
  addPanelDetails(elements, "right outcome motif", m, 526, 184, 1);
  addPanelDetails(elements, "bottom evidence motif", m, 278, 352, 2);
  addCallout(elements, m, "core callout", 420, 178, 500, 116, "main idea");
  addCallout(elements, m, "relationship callout", 360, 310, 482, 330, "relationships");

  return elements;
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
  return { type: "line", name, x, y, x2, y2, style: { stroke, strokeWidth } };
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

function polygon(
  name: string,
  points: Array<{ x: number; y: number } | number[]>,
  fill: string,
  stroke: string | null,
  strokeWidth: number,
  opacity = 100
): SceneElement {
  return {
    type: "polygon",
    name,
    x: 0,
    y: 0,
    points: points.map((point) => (Array.isArray(point) ? { x: point[0] ?? 0, y: point[1] ?? 0 } : point)),
    style: { fill, stroke, strokeWidth, opacity }
  };
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

function addSkyline(elements: SceneElement[], m: ReturnType<typeof scaler>): void {
  const buildings = [
    { name: "library tower", x: 96, y: 168, w: 48, h: 130, fill: "#64748B" },
    { name: "civic block", x: 150, y: 202, w: 74, h: 96, fill: "#94A3B8" },
    { name: "solar office", x: 232, y: 150, w: 64, h: 148, fill: "#475569" },
    { name: "transit hotel", x: 304, y: 188, w: 56, h: 110, fill: "#64748B" },
    { name: "data tower", x: 372, y: 132, w: 74, h: 166, fill: "#334155" },
    { name: "green roof lab", x: 456, y: 176, w: 86, h: 122, fill: "#64748B" },
    { name: "station office", x: 552, y: 210, w: 68, h: 88, fill: "#94A3B8" }
  ];

  buildings.forEach((building) => {
    elements.push(rect(`${building.name} building`, m.x(building.x), m.y(building.y), m.sx(building.w), m.sy(building.h), building.fill, "#0F172A", m.s(3)));
    const rows = Math.max(2, Math.floor(building.h / 34));
    const cols = Math.max(2, Math.floor(building.w / 24));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        elements.push(rect(`${building.name} window ${row + 1}-${col + 1}`, m.x(building.x + 10 + col * 20), m.y(building.y + 18 + row * 28), m.sx(9), m.sy(13), "#E0F2FE", "#0369A1", m.s(1), 86));
      }
    }
  });

  elements.push(polygon("solar office roof panel 1", [[236, 146], [292, 136], [292, 150], [236, 160]].map(m.point), "#1D4ED8", "#0F172A", m.s(1)));
  elements.push(polygon("green roof lab roof garden", [[460, 170], [538, 164], [542, 178], [456, 184]].map(m.point), "#22C55E", "#166534", m.s(1)));
  elements.push(ellipse("data overlay node one", m.x(560), m.y(170), m.s(14), m.s(14), "#FACC15", "#854D0E", m.s(2)));
  elements.push(ellipse("data overlay node two", m.x(602), m.y(150), m.s(14), m.s(14), "#FACC15", "#854D0E", m.s(2)));
  elements.push(line("data overlay link", m.x(567), m.y(177), m.x(609), m.y(157), "#854D0E", m.s(2)));
}

function addTransitMap(elements: SceneElement[], m: ReturnType<typeof scaler>): void {
  elements.push(line("blue transit route west segment", m.x(84), m.y(356), m.x(276), m.y(334), "#2563EB", m.s(5)));
  elements.push(line("blue transit route east segment", m.x(276), m.y(334), m.x(600), m.y(304), "#2563EB", m.s(5)));
  elements.push(line("green transit route north segment", m.x(502), m.y(230), m.x(492), m.y(308), "#16A34A", m.s(5)));
  elements.push(line("green transit route south segment", m.x(492), m.y(308), m.x(390), m.y(394), "#16A34A", m.s(5)));
  [
    [104, 354],
    [214, 342],
    [276, 334],
    [390, 324],
    [492, 308],
    [586, 304],
    [502, 230],
    [440, 352]
  ].forEach(([x, y], index) => {
    elements.push(ellipse(`transit station node ${index + 1}`, m.x(x - 7), m.y(y - 7), m.s(14), m.s(14), "#FFFFFF", "#0F172A", m.s(2)));
  });
  elements.push(rect("main train car", m.x(456), m.y(286), m.sx(82), m.sy(28), "#F97316", "#7C2D12", m.s(3)));
  elements.push(rect("train car window 1", m.x(468), m.y(292), m.sx(18), m.sy(12), "#FED7AA", "#7C2D12", m.s(1)));
  elements.push(rect("train car window 2", m.x(494), m.y(292), m.sx(18), m.sy(12), "#FED7AA", "#7C2D12", m.s(1)));
  elements.push(rect("station platform", m.x(426), m.y(316), m.sx(142), m.sy(16), "#475569", "#0F172A", m.s(2)));
}

function addCityForeground(elements: SceneElement[], m: ReturnType<typeof scaler>): void {
  elements.push(rect("bike lane", m.x(74), m.y(394), m.sx(408), m.sy(18), "#86EFAC", "#166534", m.s(2)));
  elements.push(line("bike lane stripe 1", m.x(104), m.y(403), m.x(152), m.y(403), "#FFFFFF", m.s(2)));
  elements.push(line("bike lane stripe 2", m.x(192), m.y(403), m.x(240), m.y(403), "#FFFFFF", m.s(2)));
  elements.push(line("bike lane stripe 3", m.x(280), m.y(403), m.x(328), m.y(403), "#FFFFFF", m.s(2)));
  addTree(elements, m, "park tree 1", 118, 348);
  addTree(elements, m, "park tree 2", 166, 360);
  addTree(elements, m, "park tree 3", 638, 338);
  elements.push(ellipse("public plaza circle", m.x(544), m.y(352), m.s(62), m.s(44), "#FDE68A", "#92400E", m.s(2), 82));
  elements.push(rect("plaza bench", m.x(560), m.y(368), m.sx(46), m.sy(8), "#92400E", "#451A03", m.s(1)));
}

function addPanelDetails(elements: SceneElement[], prefix: string, m: ReturnType<typeof scaler>, x: number, y: number, variant: number): void {
  if (variant % 3 === 0) {
    elements.push(ellipse(`${prefix} circle one`, m.x(x), m.y(y), m.s(22), m.s(22), "#FFFFFF", "#334155", m.s(2)));
    elements.push(ellipse(`${prefix} circle two`, m.x(x + 38), m.y(y + 22), m.s(22), m.s(22), "#FFFFFF", "#334155", m.s(2)));
    elements.push(line(`${prefix} connector`, m.x(x + 20), m.y(y + 18), m.x(x + 42), m.y(y + 28), "#334155", m.s(2)));
    return;
  }

  if (variant % 3 === 1) {
    elements.push(rect(`${prefix} bar one`, m.x(x), m.y(y), m.sx(72), m.sy(12), "#FFFFFF", "#334155", m.s(1)));
    elements.push(rect(`${prefix} bar two`, m.x(x), m.y(y + 24), m.sx(52), m.sy(12), "#FFFFFF", "#334155", m.s(1)));
    elements.push(rect(`${prefix} bar three`, m.x(x), m.y(y + 48), m.sx(84), m.sy(12), "#FFFFFF", "#334155", m.s(1)));
    return;
  }

  elements.push(polygon(`${prefix} triangle`, [[x, y + 52], [x + 34, y], [x + 68, y + 52]].map(m.point), "#FFFFFF", "#334155", m.s(2)));
  elements.push(ellipse(`${prefix} center node`, m.x(x + 25), m.y(y + 24), m.s(20), m.s(20), "#FACC15", "#854D0E", m.s(2)));
}

function addForest(elements: SceneElement[], m: ReturnType<typeof scaler>): void {
  [
    [84, 322],
    [122, 338],
    [168, 320],
    [548, 318],
    [596, 340],
    [640, 314]
  ].forEach(([x, y], index) => addTree(elements, m, `forest tree ${index + 1}`, x, y));
}

function addFarmAndHabitat(elements: SceneElement[], m: ReturnType<typeof scaler>): void {
  elements.push(rect("field plot one", m.x(452), m.y(354), m.sx(88), m.sy(52), "#A7F3D0", "#166534", m.s(2)));
  elements.push(rect("field plot two", m.x(548), m.y(368), m.sx(86), m.sy(48), "#86EFAC", "#166534", m.s(2)));
  for (let index = 0; index < 4; index += 1) {
    elements.push(line(`field crop row ${index + 1}`, m.x(462), m.y(364 + index * 10), m.x(530), m.y(360 + index * 10), "#166534", m.s(1)));
  }
  elements.push(ellipse("habitat pond", m.x(96), m.y(366), m.s(96), m.s(48), "#7DD3FC", "#0369A1", m.s(2), 84));
  elements.push(ellipse("habitat island", m.x(130), m.y(378), m.s(28), m.s(14), "#FDE68A", "#92400E", m.s(1), 86));
}

function addSunAndClouds(elements: SceneElement[], m: ReturnType<typeof scaler>): void {
  elements.push(ellipse("sun disk", m.x(594), m.y(64), m.s(58), m.s(58), "#FACC15", "#854D0E", m.s(2)));
  [
    [102, 92],
    [136, 82],
    [168, 94],
    [502, 74],
    [536, 64],
    [570, 76]
  ].forEach(([x, y], index) => {
    elements.push(ellipse(`cloud lobe ${index + 1}`, m.x(x), m.y(y), m.s(48), m.s(28), "#FFFFFF", "#94A3B8", m.s(1), 90));
  });
}

function addOrbitNodes(elements: SceneElement[], m: ReturnType<typeof scaler>): void {
  const nodes = [
    [356, 118, "#DBEAFE"],
    [450, 218, "#DCFCE7"],
    [356, 318, "#FEF3C7"],
    [262, 218, "#FCE7F3"]
  ];
  nodes.forEach(([x, y, fill], index) => {
    elements.push(ellipse(`orbit node ${index + 1}`, m.x(Number(x)), m.y(Number(y)), m.s(34), m.s(34), String(fill), "#0F172A", m.s(2)));
    elements.push(line(`orbit spoke ${index + 1}`, m.x(358), m.y(232), m.x(Number(x) + 17), m.y(Number(y) + 17), "#475569", m.s(2)));
  });
}

function addTree(elements: SceneElement[], m: ReturnType<typeof scaler>, name: string, x: number, y: number): void {
  elements.push(rect(`${name} trunk`, m.x(x + 11), m.y(y + 28), m.sx(10), m.sy(32), "#92400E", "#451A03", m.s(1)));
  elements.push(ellipse(`${name} canopy`, m.x(x), m.y(y), m.s(34), m.s(40), "#22C55E", "#166534", m.s(2)));
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
  const fontSize = m.s(17);
  const labelPadding = m.s(6);
  const labelWidth = Math.round(label.length * fontSize * 0.58 + labelPadding * 2);
  const labelHeight = fontSize + labelPadding * 2;
  const labelLeft = m.x(labelX) - labelPadding;
  const labelTop = m.y(labelY) - fontSize - labelPadding;
  const anchorPxX = m.x(anchorX);
  const anchorPxY = m.y(anchorY);
  const labelCenterX = labelLeft + labelWidth / 2;
  const labelCenterY = labelTop + labelHeight / 2;
  const dx = anchorPxX - labelCenterX;
  const dy = anchorPxY - labelCenterY;
  const edgeScale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : labelWidth / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : labelHeight / 2 / Math.abs(dy)
  );
  const leaderEndX = Math.round(labelCenterX + dx * Math.min(1, edgeScale));
  const leaderEndY = Math.round(labelCenterY + dy * Math.min(1, edgeScale));
  elements.push(line(`${name} leader`, anchorPxX, anchorPxY, leaderEndX, leaderEndY, "#334155", m.s(2)));
  elements.push(ellipse(`${name} anchor`, m.x(anchorX - 5), m.y(anchorY - 5), m.s(10), m.s(10), "#FFFFFF", "#334155", m.s(2)));
  elements.push(rect(`${name} label background`, labelLeft, labelTop, labelWidth, labelHeight, "#F8FAFC", null, 0));
  elements.push(text(`${name} label`, m.x(labelX), m.y(labelY), label, fontSize, "#0F172A"));
}

function arrow(
  elements: SceneElement[],
  name: string,
  m: ReturnType<typeof scaler>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string
): void {
  elements.push(line(name, m.x(x1), m.y(y1), m.x(x2), m.y(y2), color, m.s(3)));
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = 15;
  const width = 8;
  const left = {
    x: x2 - Math.cos(angle) * length + Math.sin(angle) * width,
    y: y2 - Math.sin(angle) * length - Math.cos(angle) * width
  };
  const right = {
    x: x2 - Math.cos(angle) * length - Math.sin(angle) * width,
    y: y2 - Math.sin(angle) * length + Math.cos(angle) * width
  };
  elements.push(polygon(`${name} head`, [m.point([x2, y2]), m.point([left.x, left.y]), m.point([right.x, right.y])], color, color, m.s(1)));
}

function scaler(width: number, height: number, baseWidth: number, baseHeight: number) {
  const scaleX = width / baseWidth;
  const scaleY = height / baseHeight;
  const uniform = Math.min(scaleX, scaleY);

  return {
    x: (value: number) => Math.round(value * scaleX),
    y: (value: number) => Math.round(value * scaleY),
    sx: (value: number) => Math.round(value * scaleX),
    sy: (value: number) => Math.round(value * scaleY),
    s: (value: number) => Math.max(1, Math.round(value * uniform)),
    point: ([pointX, pointY]: number[]) => ({ x: Math.round(pointX * scaleX), y: Math.round(pointY * scaleY) }),
    pathPoint: (point: PathPoint): PathPoint => ({
      x: Math.round(point.x * scaleX),
      y: Math.round(point.y * scaleY),
      leftX: point.leftX === undefined ? undefined : Math.round(point.leftX * scaleX),
      leftY: point.leftY === undefined ? undefined : Math.round(point.leftY * scaleY),
      rightX: point.rightX === undefined ? undefined : Math.round(point.rightX * scaleX),
      rightY: point.rightY === undefined ? undefined : Math.round(point.rightY * scaleY),
      pointType: point.pointType
    })
  };
}

function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/[^a-z0-9 ]+/gi, " ").trim().replace(/\s+/g, " ");
  const title = cleaned.length > 0 ? cleaned : "Agent planned cartoon";
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

function captionFromPrompt(prompt: string): string {
  const title = titleFromPrompt(prompt);
  return title.length > 48 ? `${title.slice(0, 45)}...` : title;
}
