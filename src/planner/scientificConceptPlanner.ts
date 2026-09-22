import type { CartoonScene, PathPoint, SceneElement } from "../bridge/types.js";
import { searchCorpus } from "../semantic/search.js";
import type { SemanticItem, SemanticSearchResult } from "../semantic/types.js";
import { qaCartoonScene, recommendedExportFormats, type SceneQaReport } from "./sceneQa.js";

export interface ScientificConceptPlanOptions {
  width?: number;
  height?: number;
  title?: string;
  evidenceLimit?: number;
}

export interface ScientificConceptPlan {
  prompt: string;
  planner: "scientific-deterministic";
  conceptQueries: string[];
  evidence: SemanticSearchResult[];
  scene: CartoonScene;
  qa: SceneQaReport;
  recommendedExports: string[];
  notes: string[];
}

interface ScientificFeature {
  id: string;
  label: string;
  query: string;
  pattern: RegExp;
}

const FEATURES: ScientificFeature[] = [
  {
    id: "core-shell-emulsion",
    label: "core-shell emulsion polymerization",
    query: "core shell emulsion polymerization seeded latex surfactant micelle initiator radical shell monomer feed",
    pattern: /\b(core[- ]?shell|emulsion|latex|micelle|surfactant|initiator|seed(?:ed)?|shell monomer)\b/i
  },
  {
    id: "molecular-assembly",
    label: "molecular assembly",
    query: "molecular self assembly polymer supramolecular network monomer",
    pattern: /\b(molecular|molecule|polymer|monomer|supramolecular|assembly|self[- ]?assembly|network)\b/i
  },
  {
    id: "catalysis",
    label: "catalytic mechanism",
    query: "catalytic reaction cycle catalyst active site surface energy barrier",
    pattern: /\b(catalyst|catalytic|catalysis|reaction|active site|surface|enzyme)\b/i
  },
  {
    id: "membrane-transport",
    label: "membrane transport",
    query: "cell membrane transport bilayer protein channel gradient",
    pattern: /\b(cell|membrane|bilayer|protein|transport|gradient|channel)\b/i
  },
  {
    id: "electron-transfer",
    label: "electron transfer",
    query: "electron transfer charge flow redox donor acceptor energy",
    pattern: /\b(electron|charge|redox|oxidation|reduction|donor|acceptor|energy)\b/i
  },
  {
    id: "phase-separation",
    label: "phase separation",
    query: "phase separation droplet domain condensate interface",
    pattern: /\b(phase|droplet|domain|condensate|separation|interface)\b/i
  },
  {
    id: "biobased-cycle",
    label: "biobased material cycle",
    query: "sustainability biomass lignin soy feedstock polymer circular material",
    pattern: /\b(sustainability|biomass|biobased|bio-based|lignin|soy|feedstock|circular|renewable)\b/i
  }
];

export function planScientificConceptScene(
  prompt: string,
  corpus: SemanticItem[],
  options: ScientificConceptPlanOptions = {}
): ScientificConceptPlan {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required to plan a scientific concept scene.");
  }

  const conceptPrompt = baseScientificPrompt(trimmedPrompt);
  const features = inferFeatures(conceptPrompt);
  const conceptQueries = buildConceptQueries(conceptPrompt, features);
  const evidence = collectEvidence(conceptQueries, corpus, options.evidenceLimit ?? 12);
  const scene = buildScientificScene(conceptPrompt, features, evidence, options);
  const qa = qaCartoonScene(scene);

  return {
    prompt: trimmedPrompt,
    planner: "scientific-deterministic",
    conceptQueries,
    evidence,
    scene,
    qa,
    recommendedExports: recommendedExportFormats(scene),
    notes: [
      `Retrieved ${evidence.length} semantic evidence item(s) across ${conceptQueries.length} query angle(s).`,
      `Activated concept modules: ${features.map((feature) => feature.label).join(", ")}.`,
      "The scene is a deterministic first-pass scientific concept map; inspect exported artwork before publication use."
    ]
  };
}

function inferFeatures(prompt: string): ScientificFeature[] {
  const matched = FEATURES.filter((feature) => feature.pattern.test(prompt));
  if (matched.length > 0) {
    return matched.slice(0, 4);
  }

  return [FEATURES[0], FEATURES[2], FEATURES[3]];
}

function buildConceptQueries(prompt: string, features: ScientificFeature[]): string[] {
  return uniqueStrings([
    prompt,
    "scientific concept mechanism visual metaphor publication",
    "scientific concept figure legibility mechanism",
    ...features.map((feature) => feature.query)
  ]);
}

function collectEvidence(queries: string[], corpus: SemanticItem[], limit: number): SemanticSearchResult[] {
  const byId = new Map<string, SemanticSearchResult>();
  for (const query of queries) {
    for (const result of searchCorpus(query, corpus, { limit: 8 })) {
      const existing = byId.get(result.item.id);
      if (!existing || result.score > existing.score) {
        byId.set(result.item.id, result);
      }
    }
  }

  return [...byId.values()]
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    .slice(0, Math.max(1, Math.min(limit, 25)));
}

function buildScientificScene(
  prompt: string,
  features: ScientificFeature[],
  evidence: SemanticSearchResult[],
  options: ScientificConceptPlanOptions
): CartoonScene {
  if (features.some((feature) => feature.id === "core-shell-emulsion")) {
    return buildCoreShellEmulsionScene(prompt, evidence, options);
  }

  const width = options.width ?? 960;
  const height = options.height ?? 640;
  const title = options.title ?? titleFromPrompt(prompt);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F7FAFC", null, 0),
    rect("concept map header", 32, 28, width - 64, 78, "#FFFFFF", "#1F2937", 3),
    text("concept title", 54, 58, title, 24, "#111827"),
    text("semantic evidence summary", 54, 88, evidenceSummary(evidence), 15, "#475569"),
    ...contextMechanismOutcomeFrame(width, height),
    ...evidenceBadges(evidence, width)
  ];

  const moduleSlots = moduleLayout(features.length, width, height);
  features.forEach((feature, index) => {
    const slot = moduleSlots[index];
    if (!slot) {
      return;
    }

    elements.push(...drawModule(feature, slot.x, slot.y, slot.width, slot.height));
  });

  elements.push(
    ...systemFlowArrows(width, height),
    text("visual grammar note", 50, height - 42, "Semantic search -> concept modules -> validated Illustrator vectors", 16, "#334155")
  );

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

function buildCoreShellEmulsionScene(
  prompt: string,
  _evidence: SemanticSearchResult[],
  options: ScientificConceptPlanOptions
): CartoonScene {
  const width = options.width ?? 1400;
  const height = options.height ?? 900;
  const title = options.title ?? titleFromPrompt(prompt);
  const stageTop = 170;
  const stageWidth = 300;
  const stageHeight = 390;
  const stageGap = 34;
  const stage1X = 54;
  const stage2X = stage1X + stageWidth + stageGap;
  const stage3X = stage2X + stageWidth + stageGap;
  const finalX = stage3X + stageWidth + 42;
  const finalWidth = Math.max(270, width - finalX - 54);
  const elements: SceneElement[] = [
    rect("background", 0, 0, width, height, "#F7FAFC", null, 0),
    rect("title band", 32, 24, width - 64, 100, "#FFFFFF", "#0F172A", 3),
    text("concept title", 54, 62, title, 28, "#0F172A"),
    text("concept subtitle", 54, 96, "Two-stage seeded emulsion polymerization creates a polymer core, then grows a chemically distinct shell.", 16, "#475569"),
    ...stagePanel("stage 1 panel", stage1X, stageTop, stageWidth, stageHeight, "1. Seed latex + pre-emulsion", "#DBEAFE"),
    ...stagePanel("stage 2 panel", stage2X, stageTop, stageWidth, stageHeight, "2. Core polymerization", "#DCFCE7"),
    ...stagePanel("stage 3 panel", stage3X, stageTop, stageWidth, stageHeight, "3. Shell monomer feed", "#FEF3C7"),
    ...arrow("stage 1 to stage 2 arrow", stage1X + stageWidth + 10, stageTop + 190, stage2X - 12, stageTop + 190, "#0F172A"),
    ...arrow("stage 2 to stage 3 arrow", stage2X + stageWidth + 10, stageTop + 190, stage3X - 12, stageTop + 190, "#0F172A"),
    ...arrow("stage 3 to final arrow", stage3X + stageWidth + 8, stageTop + 190, finalX - 18, stageTop + 190, "#0F172A"),
    ...seedLatexStage(stage1X, stageTop, stageWidth, stageHeight),
    ...coreGrowthStage(stage2X, stageTop, stageWidth, stageHeight),
    ...shellFeedStage(stage3X, stageTop, stageWidth, stageHeight),
    ...finalCoreShellParticle(finalX, stageTop, finalWidth, stageHeight),
    ...processControlsBand(54, stageTop + stageHeight + 42, width - 108),
    ...legendBand(54, height - 132, width - 108)
  ];

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

function stagePanel(name: string, x: number, y: number, width: number, height: number, label: string, fill: string): SceneElement[] {
  return [
    rect(name, x, y, width, height, fill, "#0F172A", 3, 72),
    rect(`${name} header`, x, y, width, 48, "#FFFFFF", "#0F172A", 2, 96),
    text(`${name} title`, x + 18, y + 31, label, 16, "#0F172A")
  ];
}

function seedLatexStage(x: number, y: number, width: number, height: number): SceneElement[] {
  const waterY = y + 72;
  const elements: SceneElement[] = [
    rect("stage 1 aqueous phase", x + 22, waterY, width - 44, height - 102, "#BAE6FD", "#0284C7", 2, 58),
    text("water phase label", x + 42, waterY + 34, "water phase", 14, "#075985"),
    ellipse("monomer droplet A", x + 42, waterY + 146, 92, 76, "#FDE68A", "#92400E", 3, 82),
    ellipse("monomer droplet B", x + 176, waterY + 138, 82, 68, "#FED7AA", "#9A3412", 3, 82),
    ellipse("seed latex particle 1", x + 104, waterY + 222, 54, 54, "#93C5FD", "#1E40AF", 3),
    ellipse("seed latex particle 2", x + 202, waterY + 232, 44, 44, "#93C5FD", "#1E40AF", 3),
    ellipse("initiator radical source", x + width - 78, waterY + 54, 34, 34, "#F87171", "#991B1B", 3),
    text("radical label", x + width - 84, waterY + 49, "I*", 14, "#991B1B")
  ];

  elements.push(...surfactantMicelle("surfactant micelle cluster 1", x + 78, waterY + 86, 28));
  elements.push(...surfactantMicelle("surfactant micelle cluster 2", x + 150, waterY + 78, 26));
  elements.push(...surfactantCorona("droplet A surfactant", x + 88, waterY + 184, 54, 8, "#0E7490"));
  elements.push(...surfactantCorona("droplet B surfactant", x + 217, waterY + 172, 48, 7, "#0E7490"));
  elements.push(line("surfactant micelles label leader", x + 244, waterY + 34, x + 174, waterY + 55, "#0E7490", 2));
  elements.push(line("monomer droplet label leader", x + 62, y + height - 39, x + 68, waterY + 219, "#78350F", 2));
  elements.push(line("seed latex label leader 1", x + 160, y + height - 32, x + 132, waterY + 248, "#1E3A8A", 2));
  elements.push(line("seed latex label leader 2", x + 230, y + height - 32, x + 224, waterY + 252, "#1E3A8A", 2));
  elements.push(text("surfactant micelles label", x + 154, waterY + 8, "surfactant micelles", 14, "#0E7490"));
  elements.push(text("monomer droplet label", x + 42, y + height - 34, "monomer droplets", 14, "#78350F"));
  elements.push(text("seed latex label", x + 98, y + height - 15, "seed latex particles", 14, "#1E3A8A"));
  return elements;
}

function coreGrowthStage(x: number, y: number, width: number, height: number): SceneElement[] {
  const cy = y + height * 0.52;
  const cx = x + width * 0.5;
  return [
    ellipse("growing core particle outer water boundary", cx - 112, cy - 112, 224, 224, "#D1FAE5", "#047857", 4, 72),
    ellipse("polymer core growing particle", cx - 74, cy - 74, 148, 148, "#2563EB", "#1E3A8A", 5, 92),
    path("core polymer chain 1", [
      { x: cx - 48, y: cy - 8, rightX: cx - 18, rightY: cy - 54, pointType: "smooth" },
      { x: cx + 28, y: cy - 4, leftX: cx - 4, leftY: cy + 42, rightX: cx + 60, rightY: cy - 46, pointType: "smooth" }
    ], null, "#FFFFFF", 5, false),
    path("core polymer chain 2", [
      { x: cx - 42, y: cy + 34, rightX: cx - 8, rightY: cy - 8, pointType: "smooth" },
      { x: cx + 48, y: cy + 28, leftX: cx + 4, leftY: cy + 74, pointType: "smooth" }
    ], null, "#DBEAFE", 4, false),
    text("core growth label", x + 34, y + height - 50, "radicals + monomer diffuse into seed", 14, "#065F46"),
    ...surfactantCorona("core particle surfactant", cx, cy, 124, 14, "#0E7490"),
    ...nodeRow("monomer entering core", x + 34, y + 92, 5, 44, "#FDE68A", "#92400E"),
    ...arrow("monomer into core arrow", x + 130, y + 112, cx - 74, cy - 16, "#92400E"),
    ...arrow("radical into core arrow", x + width - 70, y + 94, cx + 62, cy - 44, "#991B1B"),
    ellipse("core radical marker", x + width - 86, y + 78, 30, 30, "#FCA5A5", "#991B1B", 3),
    text("core radical label", x + width - 82, y + 72, "I*", 14, "#991B1B")
  ];
}

function shellFeedStage(x: number, y: number, width: number, height: number): SceneElement[] {
  const cx = x + width * 0.5;
  const cy = y + height * 0.62;
  return [
    rect("shell monomer feed reservoir", x + 48, y + 64, width - 96, 42, "#FFF7ED", "#9A3412", 3),
    text("shell monomer feed label", x + 68, y + 91, "shell monomer feed", 14, "#9A3412"),
    ...nodeRow("shell feed monomer", x + 212, y + 74, 2, 28, "#FDBA74", "#9A3412"),
    ...arrow("semi batch feed arrow", x + width * 0.55, y + 112, cx + 34, cy - 94, "#9A3412"),
    ellipse("forming shell layer", cx - 104, cy - 104, 208, 208, "#FDBA74", "#9A3412", 8, 82),
    ellipse("seed core before shell", cx - 68, cy - 68, 136, 136, "#2563EB", "#1E3A8A", 5, 92),
    ...surfactantCorona("shell surface surfactant", cx, cy, 116, 14, "#0E7490"),
    text("shell growth label", x + 42, y + height - 24, "shell polymerizes at particle surface", 14, "#7C2D12")
  ];
}

function finalCoreShellParticle(x: number, y: number, width: number, height: number): SceneElement[] {
  const cx = x + width / 2;
  const cy = y + height * 0.5;
  const shellDiameter = Math.min(width - 18, 255);
  const coreDiameter = shellDiameter * 0.56;
  return [
    text("final particle title", x + 4, y + 31, "Final latex particle", 16, "#0F172A"),
    rect("final particle panel", x - 12, y + 48, width + 24, height - 48, "#FFF7ED", "#0F172A", 3, 54),
    ellipse("final core shell particle shell", cx - shellDiameter / 2, cy - shellDiameter / 2, shellDiameter, shellDiameter, "#FDBA74", "#9A3412", 6, 82),
    ellipse("final core shell particle core", cx - coreDiameter / 2, cy - coreDiameter / 2, coreDiameter, coreDiameter, "#2563EB", "#1E3A8A", 5, 95),
    path("final core polymer chain", [
      { x: cx - 46, y: cy - 12, rightX: cx - 16, rightY: cy - 62, pointType: "smooth" },
      { x: cx + 44, y: cy - 8, leftX: cx - 2, leftY: cy + 52, pointType: "smooth" }
    ], null, "#FFFFFF", 5, false),
    ...surfactantCorona("final particle surfactant corona", cx, cy, shellDiameter / 2 + 14, 18, "#0E7490"),
    line("shell callout line", cx + shellDiameter * 0.34, cy - shellDiameter * 0.3, cx + shellDiameter * 0.23, cy - shellDiameter * 0.36, "#9A3412", 3),
    text("shell callout label", cx + shellDiameter * 0.1, cy - shellDiameter * 0.39, "shell", 14, "#9A3412"),
    line("core callout line", cx - coreDiameter * 0.5, cy + 4, x + 58, cy - 4, "#1E3A8A", 3),
    text("core callout label", x + 22, cy - 10, "core", 14, "#1E3A8A"),
    text("latex stability label", x + 26, y + height - 38, "surfactant-stabilized dispersion", 14, "#0E7490")
  ];
}

function processControlsBand(x: number, y: number, width: number): SceneElement[] {
  const controls = [
    ["seed count controls final particle number", "#DBEAFE", "#1E40AF"],
    ["feed rate affects shell uniformity", "#FED7AA", "#9A3412"],
    ["surfactant prevents coagulation", "#CCFBF1", "#0F766E"],
    ["radical flux limits secondary nucleation", "#FEE2E2", "#991B1B"]
  ] as const;

  const cardWidth = Math.floor((width - 54) / controls.length);
  return [
    text("process controls heading", x, y - 18, "Process controls to preserve core-shell morphology", 16, "#0F172A"),
    ...controls.flatMap(([label, fill, stroke], index) => {
      const cardX = x + index * (cardWidth + 18);
      return [
        rect(`process control card ${index + 1}`, cardX, y, cardWidth, 74, fill, stroke, 2, 76),
        text(`process control label ${index + 1}`, cardX + 14, y + 31, label, 14, stroke)
      ];
    })
  ];
}

function legendBand(x: number, y: number, width: number): SceneElement[] {
  return [
    rect("legend band", x, y, width, 84, "#FFFFFF", "#334155", 2, 96),
    text("legend title", x + 18, y + 30, "Legend", 16, "#0F172A"),
    ellipse("legend core swatch", x + 104, y + 19, 24, 24, "#2563EB", "#1E3A8A", 2),
    text("legend core text", x + 136, y + 38, "core polymer", 14, "#1E3A8A"),
    ellipse("legend shell swatch", x + 258, y + 19, 24, 24, "#FDBA74", "#9A3412", 2),
    text("legend shell text", x + 290, y + 38, "shell polymer", 14, "#9A3412"),
    ellipse("legend monomer swatch", x + 426, y + 19, 24, 24, "#FDE68A", "#92400E", 2),
    text("legend monomer text", x + 458, y + 38, "monomer", 14, "#78350F"),
    ellipse("legend radical swatch", x + 566, y + 19, 24, 24, "#FCA5A5", "#991B1B", 2),
    text("legend radical text", x + 598, y + 38, "initiator radical", 14, "#991B1B"),
    line("legend surfactant tail", x + 748, y + 31, x + 770, y + 45, "#0E7490", 2),
    ellipse("legend surfactant head", x + 738, y + 22, 16, 16, "#67E8F9", "#0E7490", 2),
    text("legend surfactant text", x + 782, y + 38, "surfactant", 14, "#0E7490")
  ];
}

function surfactantMicelle(name: string, cx: number, cy: number, radius: number): SceneElement[] {
  const coreRadius = radius * 0.48;
  return [
    ellipse(`${name} monomer core`, cx - coreRadius, cy - coreRadius, coreRadius * 2, coreRadius * 2, "#FDE68A", "#92400E", 2, 78),
    ...surfactantCorona(name, cx, cy, radius, 8, "#0E7490")
  ];
}

function surfactantCorona(name: string, cx: number, cy: number, radius: number, count: number, stroke: string): SceneElement[] {
  const elements: SceneElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (-Math.PI / 2) + (index * 2 * Math.PI) / count;
    const headX = cx + Math.cos(angle) * radius;
    const headY = cy + Math.sin(angle) * radius;
    const tailX = cx + Math.cos(angle) * (radius - 18);
    const tailY = cy + Math.sin(angle) * (radius - 18);
    elements.push(line(`${name} tail ${index + 1}`, headX, headY, tailX, tailY, stroke, 2));
    elements.push(ellipse(`${name} head ${index + 1}`, headX - 5, headY - 5, 10, 10, "#67E8F9", stroke, 2));
  }

  return elements;
}

function contextMechanismOutcomeFrame(width: number, height: number): SceneElement[] {
  const top = 132;
  const panelHeight = height - 214;
  const gap = 22;
  const panelWidth = Math.round((width - 100 - gap * 2) / 3);
  return [
    rect("context panel", 50, top, panelWidth, panelHeight, "#E0F2FE", "#0F172A", 3, 55),
    rect("mechanism panel", 50 + panelWidth + gap, top, panelWidth, panelHeight, "#ECFDF5", "#0F172A", 3, 55),
    rect("outcome panel", 50 + (panelWidth + gap) * 2, top, panelWidth, panelHeight, "#FEF3C7", "#0F172A", 3, 55),
    text("context", 70, top + 30, "context", 17, "#0F172A"),
    text("mechanism", 70 + panelWidth + gap, top + 30, "mechanism", 17, "#0F172A"),
    text("outcome", 70 + (panelWidth + gap) * 2, top + 30, "outcome", 17, "#0F172A")
  ];
}

function evidenceBadges(evidence: SemanticSearchResult[], width: number): SceneElement[] {
  const shown = evidence.slice(0, 4);
  const badgeWidth = Math.max(140, Math.floor((width - 100) / Math.max(1, shown.length)) - 10);
  return shown.flatMap((result, index) => {
    const x = 52 + index * (badgeWidth + 10);
    const label = result.item.title.length > 24 ? `${result.item.title.slice(0, 21)}...` : result.item.title;
    return [
      rect(`evidence badge ${index + 1}`, x, 112, badgeWidth, 30, "#FFFFFF", "#64748B", 2, 94),
      text(`evidence label ${index + 1}`, x + 10, 133, label, 14, "#334155")
    ];
  });
}

function moduleLayout(count: number, width: number, height: number): Array<{ x: number; y: number; width: number; height: number }> {
  const top = 178;
  const moduleHeight = Math.min(280, height - 260);
  if (count <= 1) {
    return [{ x: Math.round(width * 0.28), y: top, width: Math.round(width * 0.44), height: moduleHeight }];
  }

  const slotWidth = Math.round((width - 132) / count);
  return Array.from({ length: count }, (_, index) => ({
    x: 58 + index * slotWidth,
    y: top + (index % 2) * 28,
    width: slotWidth - 18,
    height: moduleHeight - (index % 2) * 28
  }));
}

function drawModule(feature: ScientificFeature, x: number, y: number, width: number, height: number): SceneElement[] {
  if (feature.id === "molecular-assembly") {
    return molecularAssemblyModule(x, y, width, height);
  }

  if (feature.id === "catalysis") {
    return catalysisModule(x, y, width, height);
  }

  if (feature.id === "membrane-transport") {
    return membraneModule(x, y, width, height);
  }

  if (feature.id === "electron-transfer") {
    return electronTransferModule(x, y, width, height);
  }

  if (feature.id === "phase-separation") {
    return phaseSeparationModule(x, y, width, height);
  }

  return biobasedCycleModule(x, y, width, height);
}

function molecularAssemblyModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const cx = x + width / 2;
  const chainY = y + height * 0.52;
  return [
    text("molecular assembly label", x + 10, y + 24, "molecular assembly", 15, "#1E3A8A"),
    path("polymer curved backbone", [
      { x: x + 18, y: chainY, rightX: x + 70, rightY: y + 82, pointType: "smooth" },
      { x: cx, y: chainY - 16, leftX: cx - 60, leftY: chainY + 58, rightX: cx + 60, rightY: chainY - 86, pointType: "smooth" },
      { x: x + width - 18, y: chainY, leftX: x + width - 72, leftY: chainY + 70, pointType: "smooth" }
    ], null, "#2563EB", 6, false),
    ...nodeRow("assembly monomer", x + 32, chainY - 20, 5, 36, "#93C5FD", "#1E3A8A"),
    ...bondNetwork("ordered network", cx - 44, y + height - 96, "#A7F3D0", "#065F46")
  ];
}

function catalysisModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const slabY = y + height * 0.58;
  return [
    text("catalysis label", x + 10, y + 24, "catalytic cycle", 15, "#7C2D12"),
    rect("catalyst surface", x + 20, slabY, width - 40, 32, "#94A3B8", "#1F2937", 3),
    ellipse("active site", x + width * 0.45, slabY - 22, 42, 42, "#F97316", "#7C2D12", 4),
    ellipse("reactant molecule a", x + 26, y + 86, 34, 34, "#BFDBFE", "#1E3A8A", 3),
    ellipse("reactant molecule b", x + 72, y + 116, 28, 28, "#FDE68A", "#92400E", 3),
    ...arrow("reactants bind arrow", x + 102, y + 118, x + width * 0.45, slabY - 2, "#1F2937"),
    ...arrow("product release arrow", x + width * 0.58, slabY - 2, x + width - 44, y + 94, "#1F2937"),
    ellipse("product molecule", x + width - 52, y + 78, 38, 38, "#86EFAC", "#166534", 3),
    path("lower energy path", [
      { x: x + 24, y: y + height - 42, rightX: x + 70, rightY: y + height - 104, pointType: "smooth" },
      { x: x + width * 0.52, y: y + height - 86, leftX: x + width * 0.32, leftY: y + height - 22, rightX: x + width * 0.72, rightY: y + height - 138, pointType: "smooth" },
      { x: x + width - 20, y: y + height - 48, leftX: x + width - 72, leftY: y + height - 106, pointType: "smooth" }
    ], null, "#DC2626", 4, false)
  ];
}

function membraneModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const membraneY = y + height * 0.5;
  const lipids = Array.from({ length: 6 }, (_, index) => x + 22 + index * ((width - 44) / 5));
  return [
    text("membrane transport label", x + 10, y + 24, "selective transport", 15, "#065F46"),
    ...lipids.flatMap((lipidX, index) => [
      ellipse(`upper lipid head ${index + 1}`, lipidX, membraneY - 40, 20, 20, "#A7F3D0", "#065F46", 2),
      ellipse(`lower lipid head ${index + 1}`, lipidX, membraneY + 26, 20, 20, "#A7F3D0", "#065F46", 2),
      line(`lipid tail ${index + 1}a`, lipidX + 7, membraneY - 20, lipidX + 7, membraneY + 28, "#047857", 2),
      line(`lipid tail ${index + 1}b`, lipidX + 13, membraneY - 20, lipidX + 13, membraneY + 28, "#047857", 2)
    ]),
    rect("protein channel", x + width * 0.43, membraneY - 46, 38, 100, "#60A5FA", "#1E40AF", 4, 90),
    ...nodeRow("outside particle", x + 20, y + 70, 4, 34, "#FBBF24", "#92400E"),
    ...nodeRow("inside particle", x + width - 142, y + height - 68, 3, 34, "#FBBF24", "#92400E"),
    ...arrow("transport arrow", x + width * 0.5, y + 92, x + width * 0.5, y + height - 62, "#1D4ED8")
  ];
}

function electronTransferModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const donorX = x + 28;
  const acceptorX = x + width - 76;
  const centerY = y + height * 0.47;
  return [
    text("electron transfer label", x + 10, y + 24, "charge flow", 15, "#581C87"),
    ellipse("electron donor", donorX, centerY - 28, 58, 58, "#DDD6FE", "#581C87", 4),
    ellipse("electron acceptor", acceptorX, centerY - 28, 58, 58, "#FBCFE8", "#9D174D", 4),
    text("donor label", donorX + 10, centerY + 8, "D", 22, "#581C87"),
    text("acceptor label", acceptorX + 10, centerY + 8, "A", 22, "#9D174D"),
    path("curved electron transfer arrow", [
      { x: donorX + 58, y: centerY, rightX: x + width * 0.42, rightY: y + 70, pointType: "smooth" },
      { x: acceptorX, y: centerY, leftX: x + width * 0.58, leftY: y + 62, pointType: "smooth" }
    ], null, "#7C3AED", 5, false),
    ellipse("electron dot one", x + width * 0.45, y + 82, 14, 14, "#FDE68A", "#92400E", 2),
    ellipse("electron dot two", x + width * 0.57, y + 74, 14, 14, "#FDE68A", "#92400E", 2),
    line("energy level donor", x + 34, y + height - 58, x + width * 0.42, y + height - 58, "#581C87", 3),
    line("energy level acceptor", x + width * 0.58, y + height - 88, x + width - 24, y + height - 88, "#9D174D", 3)
  ];
}

function phaseSeparationModule(x: number, y: number, width: number, height: number): SceneElement[] {
  return [
    text("phase separation label", x + 10, y + 24, "phase domains", 15, "#075985"),
    ellipse("dense phase droplet", x + width * 0.42, y + height * 0.34, width * 0.38, height * 0.38, "#BAE6FD", "#0369A1", 4, 72),
    ellipse("secondary condensate", x + width * 0.2, y + height * 0.58, width * 0.24, height * 0.24, "#A7F3D0", "#047857", 3, 70),
    ...nodeRow("outside dilute particle", x + 24, y + 78, 4, 32, "#E0E7FF", "#3730A3"),
    ...nodeRow("inside dense particle", x + width * 0.48, y + height * 0.48, 3, 28, "#38BDF8", "#075985"),
    path("phase boundary highlight", [
      { x: x + width * 0.42, y: y + height * 0.53, rightX: x + width * 0.55, rightY: y + height * 0.42, pointType: "smooth" },
      { x: x + width * 0.74, y: y + height * 0.48, leftX: x + width * 0.62, leftY: y + height * 0.66, rightX: x + width * 0.78, rightY: y + height * 0.26, pointType: "smooth" }
    ], null, "#0284C7", 4, false)
  ];
}

function biobasedCycleModule(x: number, y: number, width: number, height: number): SceneElement[] {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return [
    text("biobased cycle label", x + 10, y + 24, "material cycle", 15, "#166534"),
    polygon("biomass leaf", [
      [x + 34, cy - 20],
      [x + 88, cy - 58],
      [x + 118, cy - 2],
      [x + 70, cy + 32]
    ], "#86EFAC", "#166534", 3),
    rect("functional material block", cx - 28, cy - 34, 58, 68, "#FDE68A", "#92400E", 3),
    ellipse("product use node", x + width - 84, cy - 26, 52, 52, "#BFDBFE", "#1E40AF", 3),
    path("circular material flow", [
      { x: x + 96, y: cy - 68, rightX: cx - 16, rightY: y + 44, pointType: "smooth" },
      { x: x + width - 76, y: cy - 54, leftX: cx + 44, leftY: y + 34, rightX: x + width - 28, rightY: cy + 18, pointType: "smooth" },
      { x: cx, y: cy + 88, leftX: x + width - 88, leftY: cy + 96, rightX: x + 106, rightY: cy + 96, pointType: "smooth" }
    ], null, "#16A34A", 5, false),
    ...arrow("processing arrow", x + 118, cy, cx - 32, cy, "#166534"),
    ...arrow("use arrow", cx + 34, cy, x + width - 86, cy, "#166534")
  ];
}

function systemFlowArrows(width: number, height: number): SceneElement[] {
  const y = Math.round(height * 0.52);
  return [
    ...arrow("context to mechanism arrow", Math.round(width * 0.32), y, Math.round(width * 0.39), y, "#0F172A"),
    ...arrow("mechanism to outcome arrow", Math.round(width * 0.63), y, Math.round(width * 0.7), y, "#0F172A")
  ];
}

function bondNetwork(name: string, x: number, y: number, fill: string, stroke: string): SceneElement[] {
  return [
    line(`${name} bond 1`, x + 18, y + 18, x + 60, y + 44, stroke, 3),
    line(`${name} bond 2`, x + 60, y + 44, x + 104, y + 22, stroke, 3),
    line(`${name} bond 3`, x + 60, y + 44, x + 90, y + 82, stroke, 3),
    ellipse(`${name} node 1`, x, y, 30, 30, fill, stroke, 3),
    ellipse(`${name} node 2`, x + 46, y + 30, 30, 30, fill, stroke, 3),
    ellipse(`${name} node 3`, x + 90, y + 8, 30, 30, fill, stroke, 3),
    ellipse(`${name} node 4`, x + 76, y + 68, 30, 30, fill, stroke, 3)
  ];
}

function nodeRow(name: string, x: number, y: number, count: number, gap: number, fill: string, stroke: string): SceneElement[] {
  return Array.from({ length: count }, (_, index) => ellipse(`${name} ${index + 1}`, x + index * gap, y, 22, 22, fill, stroke, 2));
}

function arrow(name: string, x1: number, y1: number, x2: number, y2: number, stroke: string): SceneElement[] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 12;
  const left = {
    x: x2 - size * Math.cos(angle - Math.PI / 6),
    y: y2 - size * Math.sin(angle - Math.PI / 6)
  };
  const right = {
    x: x2 - size * Math.cos(angle + Math.PI / 6),
    y: y2 - size * Math.sin(angle + Math.PI / 6)
  };

  return [
    line(name, x1, y1, x2, y2, stroke, 4),
    polygon(`${name} head`, [
      [x2, y2],
      [left.x, left.y],
      [right.x, right.y]
    ], stroke, stroke, 1)
  ];
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
  stroke: string,
  strokeWidth: number,
  opacity = 100
): SceneElement {
  return { type: "ellipse", name, x, y, width, height, style: { fill, stroke, strokeWidth, opacity } };
}

function line(name: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number): SceneElement {
  return { type: "line", name, x, y, x2, y2, style: { fill: null, stroke, strokeWidth } };
}

function polygon(name: string, points: number[][], fill: string, stroke: string, strokeWidth: number, opacity = 100): SceneElement {
  return {
    type: "polygon",
    name,
    x: 0,
    y: 0,
    points: points.map(([pointX, pointY]) => ({ x: Math.round(pointX), y: Math.round(pointY) })),
    style: { fill, stroke, strokeWidth, opacity }
  };
}

function path(name: string, points: PathPoint[], fill: string | null, stroke: string, strokeWidth: number, closed: boolean, opacity = 100): SceneElement {
  return {
    type: "path",
    name,
    x: 0,
    y: 0,
    points: points.map((point) => ({
      ...point,
      x: Math.round(point.x),
      y: Math.round(point.y),
      leftX: point.leftX === undefined ? undefined : Math.round(point.leftX),
      leftY: point.leftY === undefined ? undefined : Math.round(point.leftY),
      rightX: point.rightX === undefined ? undefined : Math.round(point.rightX),
      rightY: point.rightY === undefined ? undefined : Math.round(point.rightY)
    })),
    closed,
    style: { fill, stroke, strokeWidth, opacity }
  };
}

function text(name: string, x: number, y: number, content: string, size: number, fill: string): SceneElement {
  return {
    type: "text",
    name,
    x: Math.round(x),
    y: Math.round(y),
    text: content,
    size,
    style: { fill, stroke: null, strokeWidth: 0 }
  };
}

function evidenceSummary(evidence: SemanticSearchResult[]): string {
  if (evidence.length === 0) {
    return "No local semantic evidence matched; using generic scientific concept grammar.";
  }

  return evidence
    .slice(0, 3)
    .map((result) => result.item.title)
    .join(" | ");
}

function titleFromPrompt(prompt: string): string {
  const cleaned = baseScientificPrompt(prompt)
    .replace(/[^a-z0-9 -]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
  const title = cleaned.length > 0 ? cleaned : "Scientific concept scene";
  return title.length > 60 ? `${title.slice(0, 57)}...` : title;
}

function baseScientificPrompt(prompt: string): string {
  let current = prompt.trim();
  for (let depth = 0; depth < 6; depth += 1) {
    const firstLine = current.split(/\r?\n/, 1)[0]?.trim() ?? "";
    const match = firstLine.match(/^Revise the Illustrator artwork for:\s*(.+)$/i);
    if (!match) {
      return firstLine || current;
    }
    current = match[1].trim();
  }

  return current;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
