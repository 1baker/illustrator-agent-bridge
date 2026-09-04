import { createHash } from "node:crypto";
import { normalizeScene } from "../core/sceneValidation.js";
import type { PathPoint, Point, ScientificObject, VectorElement, VectorScene, VectorStyle } from "../core/vectorScene.js";
import { canonicalJson } from "./figureProject.js";

export type BenchmarkColorway = "ocean" | "mineral" | "plum";

export interface ShapeBuiltObjectProgram {
  id: string;
  seed: number;
  lamellaCount: number;
  amorphousChainCount: number;
  tieChainCount: number;
  lamellaTiltDegrees: number;
  strokeScale: number;
  depthScale: number;
  chainAmplitudeScale: number;
  filmFillOpacity: number;
  lamellaFillOpacity: number;
  amorphousOpacity: number;
  tieOpacity: number;
  colorway: BenchmarkColorway;
}

export interface ShapeBuiltObjectCandidate {
  program: ShapeBuiltObjectProgram;
  scene: VectorScene;
  score: number;
  scoreBreakdown: {
    semanticCompleteness: number;
    morphologyLegibility: number;
    topologyRichness: number;
    labelRestraint: number;
    paletteDiscipline: number;
    densityBalance: number;
    depthSeparation: number;
  };
}

export interface ShapeBuiltDirectionApproval {
  schemaVersion: "ShapeBuiltDirectionApproval.v1";
  candidateId: string;
  programDigest: string;
  reviewer: string;
  reviewedAt: string;
  scope: "visual_direction_only";
}

export interface ShapeBuiltOptimizationStep {
  generation: number;
  parentProgramDigest: string;
  evaluated: Array<{ mutation: string; program: ShapeBuiltObjectProgram; programDigest: string; score: number; accepted: boolean }>;
  acceptedMutation: string | null;
  winner: ShapeBuiltObjectCandidate;
}

export interface ShapeBuiltOptimizationRun {
  schemaVersion: "ShapeBuiltAutonomousOptimization.v1";
  approval: ShapeBuiltDirectionApproval;
  objective: "semantic_vector_fitness";
  baseline: ShapeBuiltObjectCandidate;
  steps: ShapeBuiltOptimizationStep[];
  final: ShapeBuiltObjectCandidate;
  finalApproval: { status: "pending"; nextGate: "human_visual_review" };
}

export interface LifelikeVectorControls {
  perspectiveDepth: number;
  lamellaExtrusionDepth: number;
  faceContrast: number;
  contactShadowOpacity: number;
  highlightOpacity: number;
  rimLightOpacity: number;
  microtextureOpacity: number;
}

export interface ShapeBuiltLifelikeProgram {
  id: string;
  baseProgram: ShapeBuiltObjectProgram;
  controls: LifelikeVectorControls;
}

export interface ShapeBuiltLifelikeApproval {
  schemaVersion: "ShapeBuiltLifelikeApproval.v1";
  baselineId: string;
  baselineProgramDigest: string;
  reviewer: string;
  reviewedAt: string;
  scope: "lifelike_vector_refinement";
}

export interface ShapeBuiltLifelikeCandidate {
  program: ShapeBuiltLifelikeProgram;
  scene: VectorScene;
  score: number;
  scoreBreakdown: {
    semanticVectorFitness: number;
    slabDimensionality: number;
    lamellaDimensionality: number;
    lightModel: number;
    surfaceFinish: number;
    editableConstruction: number;
  };
}

export interface ShapeBuiltLifelikeOptimizationStep {
  generation: number;
  parentProgramDigest: string;
  evaluated: Array<{ mutation: string; program: ShapeBuiltLifelikeProgram; programDigest: string; score: number; accepted: boolean }>;
  acceptedMutation: string | null;
  winner: ShapeBuiltLifelikeCandidate;
}

export interface ShapeBuiltLifelikeOptimizationRun {
  schemaVersion: "ShapeBuiltLifelikeOptimization.v1";
  approval: ShapeBuiltLifelikeApproval;
  referencePolicy: "public_examples_general_traits_only_no_tracing";
  objective: "dimensional_semantic_vector_fitness";
  baseline: ShapeBuiltLifelikeCandidate;
  steps: ShapeBuiltLifelikeOptimizationStep[];
  final: ShapeBuiltLifelikeCandidate;
  finalApproval: { status: "pending"; nextGate: "human_visual_review" };
}

export interface ShapeBuiltObjectBenchmark {
  schemaVersion: "ShapeBuiltScientificObjectBenchmark.v1";
  prompt: string;
  targetImageUsed: false;
  objective: "semantic_vector_fitness";
  constructionRules: string[];
  candidates: ShapeBuiltObjectCandidate[];
  selectedCandidateId: string;
  approval: { status: "pending"; nextGate: "human_visual_review" };
}

const DEFAULT_PROMPT = "Construct a publication-quality cutaway of a semicrystalline polymer film using only editable vector geometry. Show crystalline lamellae, amorphous entanglement, tie molecules, and protected pendant groups without using generic diagram cards or icon stand-ins.";

const PROGRAMS: ShapeBuiltObjectProgram[] = [
  { id: "candidate-a-balanced", seed: 11, lamellaCount: 4, amorphousChainCount: 9, tieChainCount: 4, lamellaTiltDegrees: -4, strokeScale: 1, depthScale: 0.78, chainAmplitudeScale: 1, filmFillOpacity: 98, lamellaFillOpacity: 84, amorphousOpacity: 66, tieOpacity: 94, colorway: "ocean" },
  { id: "candidate-b-ordered", seed: 23, lamellaCount: 4, amorphousChainCount: 10, tieChainCount: 5, lamellaTiltDegrees: 3, strokeScale: 0.92, depthScale: 0.62, chainAmplitudeScale: 0.96, filmFillOpacity: 100, lamellaFillOpacity: 84, amorphousOpacity: 68, tieOpacity: 95, colorway: "mineral" },
  { id: "candidate-c-dense", seed: 37, lamellaCount: 5, amorphousChainCount: 13, tieChainCount: 5, lamellaTiltDegrees: -7, strokeScale: 0.88, depthScale: 0.72, chainAmplitudeScale: 1.16, filmFillOpacity: 98, lamellaFillOpacity: 86, amorphousOpacity: 72, tieOpacity: 92, colorway: "ocean" },
  { id: "candidate-d-chemistry", seed: 41, lamellaCount: 3, amorphousChainCount: 10, tieChainCount: 4, lamellaTiltDegrees: 6, strokeScale: 1.04, depthScale: 0.68, chainAmplitudeScale: 1.08, filmFillOpacity: 96, lamellaFillOpacity: 82, amorphousOpacity: 68, tieOpacity: 94, colorway: "plum" },
  { id: "candidate-e-minimal", seed: 53, lamellaCount: 3, amorphousChainCount: 7, tieChainCount: 3, lamellaTiltDegrees: -2, strokeScale: 1.08, depthScale: 0.42, chainAmplitudeScale: 0.82, filmFillOpacity: 100, lamellaFillOpacity: 88, amorphousOpacity: 62, tieOpacity: 96, colorway: "mineral" },
  { id: "candidate-f-layered", seed: 71, lamellaCount: 4, amorphousChainCount: 11, tieChainCount: 6, lamellaTiltDegrees: 8, strokeScale: 0.96, depthScale: 0.9, chainAmplitudeScale: 1.2, filmFillOpacity: 94, lamellaFillOpacity: 78, amorphousOpacity: 72, tieOpacity: 90, colorway: "plum" }
];

/** Build a bounded set of vector programs and rank them without a target image. */
export function generateShapeBuiltScientificObjectBenchmark(prompt = DEFAULT_PROMPT): ShapeBuiltObjectBenchmark {
  const candidates = PROGRAMS.map((program) => scoreCandidate(program, composeSemicrystallineFilmScene(program)));
  const selected = [...candidates].sort((left, right) => right.score - left.score || left.program.id.localeCompare(right.program.id))[0]!;
  return {
    schemaVersion: "ShapeBuiltScientificObjectBenchmark.v1",
    prompt,
    targetImageUsed: false,
    objective: "semantic_vector_fitness",
    constructionRules: [
      "geometry, topology, and appearance remain separate editable state",
      "scientific meaning is carried by morphology rather than cards or icon stand-ins",
      "all candidates use deterministic paths, polygons, lines, fills, clipping, and gradients",
      "candidate scoring measures semantic and construction properties, never similarity to a target image",
      "the selected candidate remains unapproved until human visual review"
    ],
    candidates,
    selectedCandidateId: selected.program.id,
    approval: { status: "pending", nextGate: "human_visual_review" }
  };
}

export function shapeBuiltProgramDigest(program: ShapeBuiltObjectProgram): string {
  validateProgram(program);
  return createHash("sha256").update(canonicalJson(program)).digest("hex");
}

export function approveShapeBuiltDirection(candidateId: string, reviewer: string, reviewedAt: string): ShapeBuiltDirectionApproval {
  const program = PROGRAMS.find((item) => item.id === candidateId);
  if (!program) throw new Error(`unknown shape-built direction candidate: ${candidateId}`);
  if (!reviewer.trim()) throw new Error("shape-built direction approval requires a reviewer");
  if (!Number.isFinite(Date.parse(reviewedAt))) throw new Error("shape-built direction approval requires an ISO timestamp");
  return {
    schemaVersion: "ShapeBuiltDirectionApproval.v1",
    candidateId,
    programDigest: shapeBuiltProgramDigest(program),
    reviewer: reviewer.trim(),
    reviewedAt: new Date(reviewedAt).toISOString(),
    scope: "visual_direction_only"
  };
}

/**
 * Run a bounded hill-climb around an approved vector program. A generation can
 * change only declared program state and is accepted only when fitness rises.
 */
export function optimizeShapeBuiltScientificObject(approval: ShapeBuiltDirectionApproval, generations = 3): ShapeBuiltOptimizationRun {
  if (!Number.isInteger(generations) || generations < 1 || generations > 12) throw new Error("shape-built optimization generations must be between 1 and 12");
  const approved = PROGRAMS.find((item) => item.id === approval.candidateId);
  if (!approved) throw new Error(`approved shape-built direction does not exist: ${approval.candidateId}`);
  if (shapeBuiltProgramDigest(approved) !== approval.programDigest) throw new Error("shape-built direction approval digest is stale");
  const baseline = scoreCandidate(approved, composeSemicrystallineFilmScene(approved));
  let winner = baseline;
  const steps: ShapeBuiltOptimizationStep[] = [];
  for (let generation = 1; generation <= generations; generation += 1) {
    const parentDigest = shapeBuiltProgramDigest(winner.program);
    const evaluatedCandidates = mutationsFor(winner.program, generation).map(({ mutation, program }) => ({ mutation, candidate: scoreCandidate(program, composeSemicrystallineFilmScene(program)) }));
    const best = [...evaluatedCandidates].sort((left, right) => right.candidate.score - left.candidate.score || left.mutation.localeCompare(right.mutation))[0]!;
    const accepted = best.candidate.score > winner.score;
    if (accepted) winner = best.candidate;
    steps.push({
      generation,
      parentProgramDigest: parentDigest,
      evaluated: evaluatedCandidates.map(({ mutation, candidate }) => ({ mutation, program: candidate.program, programDigest: shapeBuiltProgramDigest(candidate.program), score: candidate.score, accepted: accepted && mutation === best.mutation })),
      acceptedMutation: accepted ? best.mutation : null,
      winner
    });
  }
  return {
    schemaVersion: "ShapeBuiltAutonomousOptimization.v1",
    approval,
    objective: "semantic_vector_fitness",
    baseline,
    steps,
    final: winner,
    finalApproval: { status: "pending", nextGate: "human_visual_review" }
  };
}

const FLAT_LIFELIKE_CONTROLS: LifelikeVectorControls = {
  perspectiveDepth: 0,
  lamellaExtrusionDepth: 0,
  faceContrast: 0,
  contactShadowOpacity: 0,
  highlightOpacity: 0,
  rimLightOpacity: 0,
  microtextureOpacity: 0
};

/** Bind the user's approval to the exact third-generation Candidate B program. */
export function approveCandidateBLifelikeRefinement(reviewer: string, reviewedAt: string): ShapeBuiltLifelikeApproval {
  if (!reviewer.trim()) throw new Error("lifelike refinement approval requires a reviewer");
  if (!Number.isFinite(Date.parse(reviewedAt))) throw new Error("lifelike refinement approval requires an ISO timestamp");
  const baseline = candidateBGenerationThreeProgram();
  return {
    schemaVersion: "ShapeBuiltLifelikeApproval.v1",
    baselineId: baseline.id,
    baselineProgramDigest: shapeBuiltProgramDigest(baseline),
    reviewer: reviewer.trim(),
    reviewedAt: new Date(reviewedAt).toISOString(),
    scope: "lifelike_vector_refinement"
  };
}

/** Run a target-free hill climb over declared dimensional vector controls. */
export function optimizeCandidateBLifelikeRefinement(approval: ShapeBuiltLifelikeApproval, generations = 7): ShapeBuiltLifelikeOptimizationRun {
  if (!Number.isInteger(generations) || generations < 1 || generations > 10) throw new Error("lifelike optimization generations must be between 1 and 10");
  const approvedBase = candidateBGenerationThreeProgram();
  if (approval.baselineId !== approvedBase.id || approval.baselineProgramDigest !== shapeBuiltProgramDigest(approvedBase)) throw new Error("lifelike refinement approval digest is stale");
  const initialProgram: ShapeBuiltLifelikeProgram = { id: `${approvedBase.id}.lifelike-flat`, baseProgram: approvedBase, controls: { ...FLAT_LIFELIKE_CONTROLS } };
  const baseline = scoreLifelikeCandidate(initialProgram);
  let winner = baseline;
  const steps: ShapeBuiltLifelikeOptimizationStep[] = [];
  for (let generation = 1; generation <= generations; generation += 1) {
    const parentDigest = shapeBuiltLifelikeProgramDigest(winner.program);
    const evaluatedCandidates = lifelikeMutationsFor(winner.program, generation).map(({ mutation, program }) => ({ mutation, candidate: scoreLifelikeCandidate(program) }));
    const best = [...evaluatedCandidates].sort((left, right) => right.candidate.score - left.candidate.score || left.mutation.localeCompare(right.mutation))[0]!;
    const accepted = best.candidate.score > winner.score;
    if (accepted) winner = best.candidate;
    steps.push({
      generation,
      parentProgramDigest: parentDigest,
      evaluated: evaluatedCandidates.map(({ mutation, candidate }) => ({ mutation, program: candidate.program, programDigest: shapeBuiltLifelikeProgramDigest(candidate.program), score: candidate.score, accepted: accepted && mutation === best.mutation })),
      acceptedMutation: accepted ? best.mutation : null,
      winner
    });
  }
  return {
    schemaVersion: "ShapeBuiltLifelikeOptimization.v1",
    approval,
    referencePolicy: "public_examples_general_traits_only_no_tracing",
    objective: "dimensional_semantic_vector_fitness",
    baseline,
    steps,
    final: winner,
    finalApproval: { status: "pending", nextGate: "human_visual_review" }
  };
}

export function shapeBuiltLifelikeProgramDigest(program: ShapeBuiltLifelikeProgram): string {
  validateLifelikeControls(program.controls);
  validateProgram(program.baseProgram);
  return createHash("sha256").update(canonicalJson(program)).digest("hex");
}

function candidateBGenerationThreeProgram(): ShapeBuiltObjectProgram {
  const approval = approveShapeBuiltDirection("candidate-b-ordered", "approved-direction", "2026-09-03T00:00:00.000Z");
  return optimizeShapeBuiltScientificObject(approval, 3).final.program;
}

/** Compile one editable morphology program into a semantic vector scene. */
export function composeSemicrystallineFilmScene(program: ShapeBuiltObjectProgram): VectorScene {
  validateProgram(program);
  const palette = palettes[program.colorway];
  const elements: VectorElement[] = [];
  const objects: ScientificObject[] = [];
  const rng = mulberry32(program.seed);
  const film = filmBoundary();
  const clipGroup = "film-interior-clip";
  const scaled = (value: number) => Number((value * program.strokeScale).toFixed(3));

  elements.push(rect("background", 0, 0, 1200, 760, { fill: "#FCFDFE", stroke: null }, -100));
  elements.push(text("title", 82, 50, "Semicrystalline polymer morphology", 30, "#152337", 100));
  elements.push(text("subtitle", 84, 94, "One scientific object assembled from explicit, editable vector primitives", 16, "#5C6B7A", 100));
  elements.push(path("film-shadow", offsetPath(film, 0, 13), true, { fill: "#132238", stroke: null, opacity: Math.round(10 * program.depthScale) }, -10));
  elements.push(path("film-body", film, true, { fillPaint: "film-depth", stroke: palette.boundary, strokeWidth: scaled(3.2), opacity: program.filmFillOpacity, lineJoin: "round" }, 0));

  const amorphousIds: string[] = [];
  for (let index = 0; index < program.amorphousChainCount; index += 1) {
    const y = 205 + index * (315 / Math.max(1, program.amorphousChainCount - 1));
    const points = wanderingChain(142 + rng() * 38, y, 900 - rng() * 45, rng, 7, (29 + rng() * 24) * program.chainAmplitudeScale);
    const id = `amorphous.chain-${index + 1}`;
    elements.push(path(id, points, false, { fill: null, stroke: palette.amorphous, strokeWidth: scaled(index % 3 === 0 ? 3.1 : 2.35), opacity: Math.min(100, program.amorphousOpacity + (index % 3 === 0 ? 14 : 0)), lineCap: "round", lineJoin: "round" }, 12, clipGroup));
    amorphousIds.push(id);
  }

  const lamellaIds: string[] = [];
  const lamellaCenters = lamellaPositions(program.lamellaCount);
  lamellaCenters.forEach((center, index) => {
    const angle = (program.lamellaTiltDegrees + (index % 2 === 0 ? -2.5 : 2.5)) * Math.PI / 180;
    const width = index % 2 === 0 ? 225 : 195;
    const height = 76;
    const plate = rotatedRect(center.x, center.y, width + 24, height + 20, angle);
    const plateId = `lamella-${index + 1}.plate`;
    elements.push(polygon(plateId, plate, { fillPaint: "lamella-depth", stroke: palette.lamellaDark, strokeWidth: scaled(1.5), opacity: program.lamellaFillOpacity }, 18, clipGroup));
    lamellaIds.push(plateId);
    const chainCount = 7;
    for (let row = 0; row < chainCount; row += 1) {
      const localY = -height / 2 + 9 + row * ((height - 18) / (chainCount - 1));
      const chainPoints = zigzagLine(center, width, localY, angle, 16);
      const chainId = `lamella-${index + 1}.folded-chain-${row + 1}`;
      elements.push(polyline(chainId, chainPoints, { fill: null, stroke: row % 2 === 0 ? palette.lamellaDark : palette.lamella, strokeWidth: scaled(2), opacity: 92, lineCap: "round", lineJoin: "round" }, 22, clipGroup));
      lamellaIds.push(chainId);
    }
    for (const side of [-1, 1]) {
      const foldPoints = foldedEdge(center, width, height, angle, side);
      const foldId = `lamella-${index + 1}.chain-fold-${side < 0 ? "left" : "right"}`;
      elements.push(polyline(foldId, foldPoints, { fill: null, stroke: palette.lamellaDark, strokeWidth: scaled(1.7), opacity: 84, lineCap: "round", lineJoin: "round" }, 23, clipGroup));
      lamellaIds.push(foldId);
    }
  });

  const tieIds: string[] = [];
  for (let index = 0; index < program.tieChainCount; index += 1) {
    const start = lamellaCenters[index % lamellaCenters.length]!;
    const end = lamellaCenters[(index + 1) % lamellaCenters.length]!;
    const bend = (index % 2 === 0 ? -1 : 1) * (42 + rng() * 30);
    const id = `tie-molecule-${index + 1}`;
    elements.push(path(id, [
      { x: start.x + 38, y: start.y, rightX: start.x + 92, rightY: start.y + bend },
      { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 + bend, leftX: (start.x + end.x) / 2 - 45, leftY: (start.y + end.y) / 2 + bend, rightX: (start.x + end.x) / 2 + 45, rightY: (start.y + end.y) / 2 + bend },
      { x: end.x - 38, y: end.y, leftX: end.x - 92, leftY: end.y + bend }
    ], false, { fill: null, stroke: palette.tie, strokeWidth: scaled(4.1), lineCap: "round", opacity: program.tieOpacity }, 30, clipGroup));
    tieIds.push(id);
  }

  const protectedIds: string[] = [];
  const sites = [
    { x: 254, y: 246, angle: -0.4 }, { x: 470, y: 504, angle: 0.34 }, { x: 696, y: 250, angle: -0.18 },
    { x: 860, y: 470, angle: 0.48 }, { x: 975, y: 315, angle: -0.24 }
  ];
  sites.forEach((site, index) => {
    const stemId = `protected-group-${index + 1}.stem`;
    const ringId = `protected-group-${index + 1}.acetal-ring`;
    const ringCenter = { x: site.x + Math.cos(site.angle) * 25, y: site.y + Math.sin(site.angle) * 25 };
    elements.push(line(stemId, site.x, site.y, ringCenter.x, ringCenter.y, { fill: null, stroke: palette.chemistry, strokeWidth: scaled(2.1), lineCap: "round" }, 35, clipGroup));
    elements.push(polygon(ringId, regularPolygon(ringCenter.x, ringCenter.y, 16, 5, site.angle - Math.PI / 2), { fill: "#FFF8E8", stroke: palette.chemistry, strokeWidth: scaled(2), lineJoin: "round" }, 36, clipGroup));
    const o1 = `protected-group-${index + 1}.oxygen-a`;
    const o2 = `protected-group-${index + 1}.oxygen-b`;
    elements.push(text(o1, ringCenter.x - 18, ringCenter.y - 21, "O", 10, palette.chemistry, 38, clipGroup));
    elements.push(text(o2, ringCenter.x + 10, ringCenter.y - 17, "O", 10, palette.chemistry, 38, clipGroup));
    protectedIds.push(stemId, ringId, o1, o2);
  });

  elements.push(path("film-highlight", film.slice(0, 4), false, { fill: null, stroke: "#FFFFFF", strokeWidth: scaled(2.2), opacity: 62, lineCap: "round" }, 45));
  elements.push(...callout("callout.crystalline", 800, 147, 827, 238, "folded-chain lamella", palette.lamellaDark));
  elements.push(...callout("callout.amorphous", 144, 636, 306, 521, "amorphous entanglement", palette.amorphous));
  elements.push(...callout("callout.tie", 780, 640, 717, 485, "tie molecule", palette.tie));
  elements.push(...callout("callout.protected", 900, 112, 981, 296, "protected pendant group", palette.chemistry));
  elements.push(text("object-label", 152, 610, "semicrystalline polymer film • conceptual morphology • not to scale", 14, "#536273", 80));

  objects.push(
    { id: "polymer-film", kind: "semicrystalline_polymer_film", label: "Semicrystalline polymer film", elementIds: ["film-body", "film-highlight"], properties: { compiler: "shape_built_object_v1", representation: "conceptual_not_to_scale" } },
    { id: "crystalline-lamellae", kind: "crystalline_lamellae", label: "Folded-chain lamellae", elementIds: lamellaIds, properties: { compiler: "shape_built_object_v1", count: program.lamellaCount } },
    { id: "amorphous-network", kind: "amorphous_polymer_network", label: "Amorphous entanglement", elementIds: amorphousIds, properties: { compiler: "shape_built_object_v1", chainCount: program.amorphousChainCount } },
    { id: "tie-molecules", kind: "interlamellar_tie_molecules", label: "Tie molecules", elementIds: tieIds, properties: { compiler: "shape_built_object_v1", count: program.tieChainCount } },
    { id: "protected-pendant-groups", kind: "protected_pendant_groups", label: "Protected pendant groups", elementIds: protectedIds, properties: { compiler: "shape_built_object_v1", chemistry: "schematic_acetal" } }
  );

  return normalizeScene({
    document: { title: `Shape-built scientific object: ${program.id}`, width: 1200, height: 760, colorMode: "RGB" },
    paints: [
      { id: "film-depth", type: "linear_gradient", units: "object_bounding_box", x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: palette.filmLight }, { offset: 52, color: palette.film }, { offset: 100, color: palette.filmDark }] },
      { id: "lamella-depth", type: "linear_gradient", x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: "#FFFFFF" }, { offset: 38, color: palette.lamellaLight }, { offset: 100, color: palette.lamella }] }
    ],
    groups: [{ id: clipGroup, name: "Film interior clipping boundary", clip: { type: "path", x: 0, y: 0, points: film, closed: true } }],
    elements,
    semantics: {
      objects,
      relationships: [
        { id: "film-contains-lamellae", sourceObjectId: "polymer-film", predicate: "contains", targetObjectId: "crystalline-lamellae", visualElementIds: lamellaIds.slice(0, 4) },
        { id: "film-contains-amorphous", sourceObjectId: "polymer-film", predicate: "contains", targetObjectId: "amorphous-network", visualElementIds: amorphousIds.slice(0, 4) },
        { id: "tie-connects-lamellae", sourceObjectId: "tie-molecules", predicate: "connects", targetObjectId: "crystalline-lamellae", visualElementIds: tieIds },
        { id: "groups-pendant-from-network", sourceObjectId: "protected-pendant-groups", predicate: "pendant_from", targetObjectId: "amorphous-network", visualElementIds: protectedIds.filter((id) => id.endsWith(".stem")) }
      ]
    }
  });
}

/** Add editable 2.5D faces, occlusion, lighting, and surface cues to Candidate B. */
export function composeLifelikeSemicrystallineFilmScene(program: ShapeBuiltLifelikeProgram): VectorScene {
  validateProgram(program.baseProgram);
  validateLifelikeControls(program.controls);
  const base = composeSemicrystallineFilmScene(program.baseProgram);
  const palette = palettes[program.baseProgram.colorway];
  const controls = program.controls;
  const film = filmBoundary();
  const dx = controls.perspectiveDepth * 0.56;
  const dy = controls.perspectiveDepth;
  const cueIds: string[] = [];
  const added: VectorElement[] = [];
  const opacity = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

  if (controls.perspectiveDepth > 0) {
    const rightFace = faceBetween(film.slice(2, 5), dx, dy);
    const frontFace = faceBetween(film.slice(4, 7), dx, dy);
    added.push(path("film-extrusion.right-face", rightFace, true, { fillPaint: "film-side-depth", stroke: palette.boundary, strokeWidth: 1.6, opacity: opacity(72 + controls.faceContrast * 22), lineJoin: "round" }, -3));
    added.push(path("film-extrusion.front-face", frontFace, true, { fillPaint: "film-front-depth", stroke: palette.boundary, strokeWidth: 1.6, opacity: opacity(76 + controls.faceContrast * 19), lineJoin: "round" }, -2));
    cueIds.push("film-extrusion.right-face", "film-extrusion.front-face");
  }

  const lamellaCenters = lamellaPositions(program.baseProgram.lamellaCount);
  lamellaCenters.forEach((center, index) => {
    const angle = (program.baseProgram.lamellaTiltDegrees + (index % 2 === 0 ? -2.5 : 2.5)) * Math.PI / 180;
    const width = (index % 2 === 0 ? 225 : 195) + 24;
    const height = 96;
    const plate = rotatedRect(center.x, center.y, width, height, angle);
    const extrusion = controls.lamellaExtrusionDepth;
    if (controls.contactShadowOpacity > 0) {
      const shadow = plate.map((point) => ({ x: point.x + extrusion * 0.55 + 2, y: point.y + extrusion + 5 }));
      const id = `lamella-${index + 1}.contact-shadow`;
      added.push(polygon(id, shadow, { fill: "#243140", stroke: null, opacity: controls.contactShadowOpacity }, 15, "film-interior-clip"));
      cueIds.push(id);
    }
    if (extrusion > 0) {
      const lower = [plate[3]!, plate[2]!, { x: plate[2]!.x + extrusion * 0.55, y: plate[2]!.y + extrusion }, { x: plate[3]!.x + extrusion * 0.55, y: plate[3]!.y + extrusion }];
      const side = [plate[1]!, plate[2]!, { x: plate[2]!.x + extrusion * 0.55, y: plate[2]!.y + extrusion }, { x: plate[1]!.x + extrusion * 0.55, y: plate[1]!.y + extrusion }];
      const lowerId = `lamella-${index + 1}.extrusion-front`;
      const sideId = `lamella-${index + 1}.extrusion-side`;
      added.push(polygon(lowerId, lower, { fillPaint: "lamella-front-depth", stroke: palette.lamellaDark, strokeWidth: 1.1, opacity: 90, lineJoin: "round" }, 16, "film-interior-clip"));
      added.push(polygon(sideId, side, { fillPaint: "lamella-side-depth", stroke: palette.lamellaDark, strokeWidth: 1.1, opacity: 88, lineJoin: "round" }, 17, "film-interior-clip"));
      cueIds.push(lowerId, sideId);
    }
  });

  if (controls.microtextureOpacity > 0) {
    const textureRng = mulberry32(program.baseProgram.seed + 911);
    for (let index = 0; index < 18; index += 1) {
      const x = 170 + textureRng() * 800;
      const y = 215 + textureRng() * 320;
      const length = 28 + textureRng() * 54;
      const id = `surface-microtexture-${index + 1}`;
      added.push(path(id, [
        { x, y, rightX: x + length * 0.28, rightY: y - 5, pointType: "smooth" },
        { x: x + length, y: y + (textureRng() - 0.5) * 13, leftX: x + length * 0.7, leftY: y + 7, pointType: "smooth" }
      ], false, { fill: null, stroke: index % 3 === 0 ? "#FFFFFF" : palette.boundary, strokeWidth: 1.2, opacity: controls.microtextureOpacity, lineCap: "round" }, 8, "film-interior-clip"));
      cueIds.push(id);
    }
  }

  if (controls.highlightOpacity > 0) {
    added.push(path("specular-highlight.primary", [
      { x: 194, y: 207, rightX: 345, rightY: 173, pointType: "smooth" },
      { x: 548, y: 193, leftX: 410, leftY: 172, rightX: 650, rightY: 204, pointType: "smooth" },
      { x: 786, y: 210, leftX: 697, leftY: 195, pointType: "smooth" }
    ], false, { fill: null, stroke: "#FFFFFF", strokeWidth: 8.5, opacity: controls.highlightOpacity, lineCap: "round" }, 44, "film-interior-clip"));
    added.push(path("specular-highlight.secondary", [
      { x: 181, y: 229, rightX: 282, rightY: 204, pointType: "smooth" },
      { x: 435, y: 211, leftX: 343, leftY: 205, pointType: "smooth" }
    ], false, { fill: null, stroke: "#FFFFFF", strokeWidth: 2.4, opacity: opacity(controls.highlightOpacity * 0.76), lineCap: "round" }, 45, "film-interior-clip"));
    cueIds.push("specular-highlight.primary", "specular-highlight.secondary");
  }

  if (controls.rimLightOpacity > 0) {
    const rim = [film[6]!, film[7]!, film[0]!, film[1]!];
    added.push(path("film-rim-light", rim, false, { fill: null, stroke: "#FFFFFF", strokeWidth: 3.1, opacity: controls.rimLightOpacity, lineCap: "round" }, 46));
    cueIds.push("film-rim-light");
  }

  const elements = [...base.elements.map((element) => {
    if (element.id === "film-body") return { ...element, style: { ...element.style, fillPaint: "film-top-depth" } };
    if (element.type === "text" && element.id === "title") return { ...element, text: "Lamellar organization within a polymer film" };
    if (element.type === "text" && element.id === "subtitle") return { ...element, text: "Editable cutaway showing ordered and entangled chain domains" };
    if (element.type === "text" && element.id === "object-label") return { ...element, y: 665, text: "conceptual morphology • not to scale" };
    if (element.type === "text" && element.id === "callout.amorphous.text") return { ...element, y: 692 };
    if (element.type === "path" && element.id === "callout.amorphous.leader") return { ...element, points: [{ x: 144, y: 714 }, { x: 249, y: 714 }, { x: 306, y: 521 }] };
    if (element.type === "text" && element.id === "callout.tie.text") return { ...element, y: 692 };
    if (element.type === "path" && element.id === "callout.tie.leader") return { ...element, points: [{ x: 780, y: 714 }, { x: 766, y: 714 }, { x: 717, y: 485 }] };
    return element;
  }), ...added];
  const semantics = base.semantics === undefined ? undefined : {
    objects: cueIds.length === 0 ? base.semantics.objects : [
      ...base.semantics.objects,
      { id: "dimensional-vector-cues", kind: "editable_dimensional_cues", label: "Editable lighting and extrusion cues", elementIds: cueIds, properties: { referencePolicy: "general_visual_traits_only", rasterEffects: false } }
    ],
    relationships: cueIds.length === 0 ? (base.semantics.relationships ?? []) : [
      ...(base.semantics.relationships ?? []),
      { id: "dimensional-cues-describe-film", sourceObjectId: "dimensional-vector-cues", predicate: "describes_volume_of", targetObjectId: "polymer-film", visualElementIds: cueIds.slice(0, 12) }
    ]
  };
  return normalizeScene({
    ...base,
    document: { ...base.document, title: "Lifelike mutable-vector polymer morphology" },
    paints: [
      ...(base.paints ?? []),
      { id: "film-top-depth", type: "linear_gradient", units: "object_bounding_box", x1: 0, y1: 0, x2: 0, y2: 1, stops: [
        { offset: 0, color: "#FFFFFF" }, { offset: 23, color: palette.filmLight }, { offset: 68, color: palette.film }, { offset: 100, color: palette.filmDark }
      ] },
      { id: "film-front-depth", type: "linear_gradient", units: "object_bounding_box", x1: 0, y1: 0, x2: 0, y2: 1, stops: [
        { offset: 0, color: palette.film }, { offset: 100, color: darkenHex(palette.filmDark, 0.18 + controls.faceContrast * 0.18) }
      ] },
      { id: "film-side-depth", type: "linear_gradient", units: "object_bounding_box", x1: 0, y1: 0, x2: 1, y2: 0, stops: [
        { offset: 0, color: palette.filmDark }, { offset: 100, color: darkenHex(palette.filmDark, 0.26 + controls.faceContrast * 0.22) }
      ] },
      { id: "lamella-front-depth", type: "linear_gradient", units: "object_bounding_box", x1: 0, y1: 0, x2: 0, y2: 1, stops: [
        { offset: 0, color: palette.lamella }, { offset: 100, color: darkenHex(palette.lamellaDark, 0.14) }
      ] },
      { id: "lamella-side-depth", type: "linear_gradient", units: "object_bounding_box", x1: 0, y1: 0, x2: 1, y2: 0, stops: [
        { offset: 0, color: palette.lamellaLight }, { offset: 100, color: palette.lamellaDark }
      ] }
    ],
    elements,
    semantics
  });
}

function scoreLifelikeCandidate(program: ShapeBuiltLifelikeProgram): ShapeBuiltLifelikeCandidate {
  const scene = composeLifelikeSemicrystallineFilmScene(program);
  const base = scoreCandidate(program.baseProgram, composeSemicrystallineFilmScene(program.baseProgram));
  const c = program.controls;
  const targetScore = (value: number, target: number, points: number) => Math.max(0, points * (1 - Math.abs(value - target) / target));
  const scoreBreakdown = {
    semanticVectorFitness: base.score,
    slabDimensionality: targetScore(c.perspectiveDepth, 24, 20) + targetScore(c.faceContrast, 0.72, 10),
    lamellaDimensionality: targetScore(c.lamellaExtrusionDepth, 12, 16),
    lightModel: targetScore(c.contactShadowOpacity, 18, 12) + targetScore(c.highlightOpacity, 44, 12),
    surfaceFinish: targetScore(c.rimLightOpacity, 38, 8) + targetScore(c.microtextureOpacity, 9, 8),
    editableConstruction: 14
  };
  return { program, scene, scoreBreakdown, score: Number(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0).toFixed(3)) };
}

function lifelikeMutationsFor(parent: ShapeBuiltLifelikeProgram, generation: number): Array<{ mutation: string; program: ShapeBuiltLifelikeProgram }> {
  const mutate = (mutation: string, changes: Partial<LifelikeVectorControls>): { mutation: string; program: ShapeBuiltLifelikeProgram } => ({
    mutation,
    program: { ...parent, id: `${parent.id}.g${generation}-${mutation}`, controls: { ...parent.controls, ...changes } }
  });
  return [
    mutate("add-slab-perspective", { perspectiveDepth: 24 }),
    mutate("extrude-crystalline-lamellae", { lamellaExtrusionDepth: 12 }),
    mutate("add-contact-occlusion", { contactShadowOpacity: 18 }),
    mutate("add-specular-highlights", { highlightOpacity: 44 }),
    mutate("differentiate-material-faces", { faceContrast: 0.72 }),
    mutate("add-restrained-surface-texture", { microtextureOpacity: 9 }),
    mutate("add-rim-light", { rimLightOpacity: 38 })
  ];
}

function validateLifelikeControls(controls: LifelikeVectorControls): void {
  const ranges: Array<[keyof LifelikeVectorControls, number, number]> = [
    ["perspectiveDepth", 0, 36], ["lamellaExtrusionDepth", 0, 18], ["faceContrast", 0, 1],
    ["contactShadowOpacity", 0, 30], ["highlightOpacity", 0, 70], ["rimLightOpacity", 0, 60], ["microtextureOpacity", 0, 20]
  ];
  for (const [name, minimum, maximum] of ranges) {
    const value = controls[name];
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
}

function scoreCandidate(program: ShapeBuiltObjectProgram, scene: VectorScene): ShapeBuiltObjectCandidate {
  const objectCount = scene.semantics?.objects.length ?? 0;
  const relationshipCount = scene.semantics?.relationships?.length ?? 0;
  const paletteCount = new Set(scene.elements.flatMap((element) => [element.style?.fill, element.style?.stroke]).filter((value): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))).size;
  const scoreBreakdown = {
    semanticCompleteness: Math.min(25, objectCount * 5),
    morphologyLegibility: Math.min(24, program.lamellaCount * 4 + program.tieChainCount * 1.6),
    topologyRichness: Math.min(20, relationshipCount * 4 + program.tieChainCount * 0.8),
    labelRestraint: 12,
    paletteDiscipline: paletteCount >= 6 && paletteCount <= 12 ? 10 : Math.max(0, 10 - Math.abs(paletteCount - 9)),
    densityBalance: Math.max(0, 9 - Math.abs(program.amorphousChainCount - 10) * 1.5 - Math.abs(program.lamellaCount - 4)),
    depthSeparation: Math.max(0, 10
      - Math.abs(program.filmFillOpacity - 96) * 0.25
      - Math.abs(program.lamellaFillOpacity - 78) * 0.3
      - Math.abs(program.amorphousOpacity - 64) * 0.2
      - Math.abs(program.tieOpacity - 92) * 0.2
      - Math.abs(program.depthScale - 0.74) * 8
      - Math.abs(program.chainAmplitudeScale - 1.04) * 10)
  };
  return { program, scene, scoreBreakdown, score: Number(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0).toFixed(3)) };
}

function validateProgram(program: ShapeBuiltObjectProgram): void {
  if (!program.id || !Number.isInteger(program.seed)) throw new Error("shape-built object program requires a stable id and integer seed");
  if (program.lamellaCount < 3 || program.lamellaCount > 5) throw new Error("lamellaCount must be between 3 and 5");
  if (program.amorphousChainCount < 6 || program.amorphousChainCount > 16) throw new Error("amorphousChainCount must be between 6 and 16");
  if (program.tieChainCount < 3 || program.tieChainCount > 7) throw new Error("tieChainCount must be between 3 and 7");
  if (program.lamellaTiltDegrees < -15 || program.lamellaTiltDegrees > 15) throw new Error("lamellaTiltDegrees must be between -15 and 15");
  if (program.strokeScale < 0.7 || program.strokeScale > 1.3) throw new Error("strokeScale must be between 0.7 and 1.3");
  if (program.depthScale < 0.3 || program.depthScale > 1.2) throw new Error("depthScale must be between 0.3 and 1.2");
  if (program.chainAmplitudeScale < 0.7 || program.chainAmplitudeScale > 1.35) throw new Error("chainAmplitudeScale must be between 0.7 and 1.35");
  for (const [name, value] of [["filmFillOpacity", program.filmFillOpacity], ["lamellaFillOpacity", program.lamellaFillOpacity], ["amorphousOpacity", program.amorphousOpacity], ["tieOpacity", program.tieOpacity]] as const) {
    if (!Number.isFinite(value) || value < 45 || value > 100) throw new Error(`${name} must be between 45 and 100`);
  }
}

function mutationsFor(parent: ShapeBuiltObjectProgram, generation: number): Array<{ mutation: string; program: ShapeBuiltObjectProgram }> {
  const mutate = (mutation: string, changes: Partial<ShapeBuiltObjectProgram>): { mutation: string; program: ShapeBuiltObjectProgram } => ({
    mutation,
    program: { ...parent, ...changes, id: `${parent.id}.g${generation}-${mutation}` }
  });
  return [
    mutate("soften-lamella-fill", { lamellaFillOpacity: Math.max(45, parent.lamellaFillOpacity - 4) }),
    mutate("open-film-fill", { filmFillOpacity: Math.max(45, parent.filmFillOpacity - 4) }),
    mutate("increase-chain-curvature", { chainAmplitudeScale: Number(Math.min(1.35, parent.chainAmplitudeScale + 0.08).toFixed(2)) }),
    mutate("soften-amorphous-lines", { amorphousOpacity: Math.max(45, parent.amorphousOpacity - 4) }),
    mutate("soften-tie-lines", { tieOpacity: Math.max(45, parent.tieOpacity - 3) }),
    mutate("deepen-gradient", { depthScale: Number(Math.min(1.2, parent.depthScale + 0.08).toFixed(2)) }),
    mutate("reduce-stroke-weight", { strokeScale: Number(Math.max(0.7, parent.strokeScale - 0.04).toFixed(2)) })
  ];
}

const palettes: Record<BenchmarkColorway, { filmLight: string; film: string; filmDark: string; boundary: string; amorphous: string; lamellaLight: string; lamella: string; lamellaDark: string; tie: string; chemistry: string }> = {
  ocean: { filmLight: "#F0F8FA", film: "#D4E9EC", filmDark: "#B9D8DD", boundary: "#355C67", amorphous: "#477A86", lamellaLight: "#DDECF8", lamella: "#8DB8D8", lamellaDark: "#275D84", tie: "#D06B38", chemistry: "#92552B" },
  mineral: { filmLight: "#F7F6F1", film: "#E8E4D8", filmDark: "#D2CCBC", boundary: "#565D62", amorphous: "#6B7478", lamellaLight: "#E5EEF0", lamella: "#A4B9BE", lamellaDark: "#405E66", tie: "#A8543A", chemistry: "#84552D" },
  plum: { filmLight: "#F8F3F8", film: "#E9DDEA", filmDark: "#D7C5DA", boundary: "#604764", amorphous: "#75587A", lamellaLight: "#E7EEF7", lamella: "#AABDD7", lamellaDark: "#425E84", tie: "#B45A46", chemistry: "#8B542B" }
};

function filmBoundary(): PathPoint[] {
  return [
    { x: 142, y: 187, rightX: 318, rightY: 153, pointType: "smooth" },
    { x: 553, y: 171, leftX: 395, leftY: 151, rightX: 704, rightY: 190, pointType: "smooth" },
    { x: 1041, y: 184, leftX: 865, leftY: 157, rightX: 1072, rightY: 302, pointType: "smooth" },
    { x: 1054, y: 414, leftX: 1070, leftY: 315, rightX: 1068, rightY: 514, pointType: "smooth" },
    { x: 1018, y: 574, leftX: 1051, leftY: 528, rightX: 851, rightY: 600, pointType: "smooth" },
    { x: 564, y: 586, leftX: 735, leftY: 607, rightX: 383, rightY: 566, pointType: "smooth" },
    { x: 164, y: 602, leftX: 281, leftY: 580, rightX: 126, rightY: 496, pointType: "smooth" },
    { x: 132, y: 361, leftX: 120, leftY: 478, rightX: 119, rightY: 259, pointType: "smooth" }
  ];
}

function wanderingChain(startX: number, y: number, width: number, rng: () => number, segments: number, amplitude: number): PathPoint[] {
  return Array.from({ length: segments }, (_, index) => {
    const x = startX + width * index / (segments - 1);
    const yy = y + (rng() - 0.5) * amplitude * 2 + Math.sin(index * 1.37 + rng()) * amplitude * 0.5;
    const handle = width / (segments - 1) * 0.42;
    return { x, y: yy, ...(index > 0 ? { leftX: x - handle, leftY: yy + (rng() - 0.5) * amplitude } : {}), ...(index < segments - 1 ? { rightX: x + handle, rightY: yy + (rng() - 0.5) * amplitude } : {}), pointType: "smooth" as const };
  });
}

function lamellaPositions(count: number): Point[] {
  const positions = [{ x: 330, y: 300 }, { x: 620, y: 245 }, { x: 790, y: 445 }, { x: 430, y: 475 }, { x: 930, y: 310 }];
  return positions.slice(0, count);
}

function zigzagLine(center: Point, width: number, localY: number, angle: number, teeth: number): Point[] {
  return Array.from({ length: teeth + 1 }, (_, index) => rotatePoint({ x: center.x - width / 2 + width * index / teeth, y: center.y + localY + (index % 2 ? 2.4 : -2.4) }, center, angle));
}

function foldedEdge(center: Point, width: number, height: number, angle: number, side: number): Point[] {
  const x = center.x + side * width / 2;
  return [0, 0.25, 0.5, 0.75, 1].map((fraction, index) => rotatePoint({ x: x + side * (index % 2 ? 8 : 0), y: center.y - height / 2 + height * fraction }, center, angle));
}

function rotatedRect(cx: number, cy: number, width: number, height: number, angle: number): Point[] {
  const center = { x: cx, y: cy };
  return [{ x: cx - width / 2, y: cy - height / 2 }, { x: cx + width / 2, y: cy - height / 2 }, { x: cx + width / 2, y: cy + height / 2 }, { x: cx - width / 2, y: cy + height / 2 }].map((point) => rotatePoint(point, center, angle));
}

function rotatePoint(point: Point, center: Point, angle: number): Point {
  const dx = point.x - center.x, dy = point.y - center.y;
  return { x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
}

function regularPolygon(cx: number, cy: number, radius: number, sides: number, rotation: number): Point[] {
  return Array.from({ length: sides }, (_, index) => ({ x: cx + Math.cos(rotation + index * Math.PI * 2 / sides) * radius, y: cy + Math.sin(rotation + index * Math.PI * 2 / sides) * radius }));
}

function callout(id: string, textX: number, textY: number, targetX: number, targetY: number, label: string, color: string): VectorElement[] {
  const elbowX = textX < targetX ? textX + 105 : textX - 14;
  return [
    polyline(`${id}.leader`, [{ x: textX, y: textY + 22 }, { x: elbowX, y: textY + 22 }, { x: targetX, y: targetY }], { fill: null, stroke: color, strokeWidth: 1.45, lineCap: "round", lineJoin: "round" }, 70),
    text(`${id}.text`, textX, textY, label, 14, color, 72)
  ];
}

function offsetPath(points: PathPoint[], dx: number, dy: number): PathPoint[] {
  return points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy, ...(point.leftX === undefined ? {} : { leftX: point.leftX + dx }), ...(point.leftY === undefined ? {} : { leftY: point.leftY + dy }), ...(point.rightX === undefined ? {} : { rightX: point.rightX + dx }), ...(point.rightY === undefined ? {} : { rightY: point.rightY + dy }) }));
}

function faceBetween(points: PathPoint[], dx: number, dy: number): PathPoint[] {
  const top = points.map((point) => ({ ...point }));
  const shifted = offsetPath(points, dx, dy).reverse().map((point) => ({
    ...point,
    leftX: point.rightX,
    leftY: point.rightY,
    rightX: point.leftX,
    rightY: point.leftY
  }));
  delete top[0]!.leftX;
  delete top[0]!.leftY;
  delete top.at(-1)!.rightX;
  delete top.at(-1)!.rightY;
  delete shifted[0]!.leftX;
  delete shifted[0]!.leftY;
  delete shifted.at(-1)!.rightX;
  delete shifted.at(-1)!.rightY;
  return [...top, ...shifted];
}

function darkenHex(color: string, amount: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return color;
  const factor = Math.max(0, 1 - amount);
  const channel = (hex: string) => Math.round(Number.parseInt(hex, 16) * factor).toString(16).padStart(2, "0").toUpperCase();
  return `#${channel(match[1]!)}${channel(match[2]!)}${channel(match[3]!)}`;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}

function rect(id: string, x: number, y: number, width: number, height: number, style: VectorStyle, zIndex: number, groupId?: string): VectorElement { return { id, name: id, type: "rect", x, y, width, height, style, zIndex, ...(groupId ? { groupId } : {}) }; }
function line(id: string, x: number, y: number, x2: number, y2: number, style: VectorStyle, zIndex: number, groupId?: string): VectorElement { return { id, name: id, type: "line", x, y, x2, y2, style, zIndex, ...(groupId ? { groupId } : {}) }; }
function polygon(id: string, points: Point[], style: VectorStyle, zIndex: number, groupId?: string): VectorElement { return { id, name: id, type: "polygon", x: 0, y: 0, points, style, zIndex, ...(groupId ? { groupId } : {}) }; }
function polyline(id: string, points: Point[], style: VectorStyle, zIndex: number, groupId?: string): VectorElement { return path(id, points, false, style, zIndex, groupId); }
function path(id: string, points: PathPoint[], closed: boolean, style: VectorStyle, zIndex: number, groupId?: string): VectorElement { return { id, name: id, type: "path", x: 0, y: 0, points, closed, style, zIndex, ...(groupId ? { groupId } : {}) }; }
function text(id: string, x: number, y: number, value: string, size: number, fill: string, zIndex: number, groupId?: string): VectorElement { return { id, name: id, type: "text", x, y, text: value, size, font: "Arial", style: { fill, stroke: null }, zIndex, ...(groupId ? { groupId } : {}) }; }
