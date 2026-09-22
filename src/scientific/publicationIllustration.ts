import { normalizeScene } from "../core/sceneValidation.js";
import type { PathPoint, ScientificObject, ScientificRelationship, VectorElement, VectorScene, VectorStyle } from "../core/vectorScene.js";
import type { PresentationGrammar } from "../registry/publicationFigureRegistry.js";

interface BriefComponent { id: string; type: string; kind?: string; label: string; emphasis?: string; }
interface BriefRelationship { id: string; sourceId: string; targetId: string; type: string; label?: string; }
type FigureColorway = "balanced" | "cool" | "earth";
export interface FigureProgramParameters { detailLevel: number; strokeScale: number; colorway: FigureColorway; depthScale: number; }
interface FigureProgramScoreBreakdown { baseline: number; semanticCoverage: number; scientificRichness: number; learnedStructure: number; learnedPalette: number; requestedSpacing: number; learnedStroke: number; paletteDiscipline: number; elementEconomy: number; }
interface FigureProgramCandidate extends FigureProgramParameters { score: number; scoreBreakdown: FigureProgramScoreBreakdown; elementCount: number; objectCoverage: number; multipartRatio: number; paletteColorCount: number; }
export interface PublicationIllustrationSearch { scene?: VectorScene; audit: { mode: "reference_free_program_search.v2"; targetImageUsed: false; objective: "semantic_publication_fitness"; mutableProperties: ["vector_density", "stroke_hierarchy", "palette", "layer_depth"]; learningPriorUsed: boolean; learningSignals: Array<"mean_parts_per_object" | "palette" | "stroke_widths">; candidates: FigureProgramCandidate[]; selectedDetailLevel?: number; selectedProgram?: FigureProgramParameters; }; }

/** Bounded evolutionary search over editable program parameters, never pixels from a target image. */
export function searchPublicationIllustration(input: unknown, options: { prior?: PresentationGrammar } = {}): PublicationIllustrationSearch {
  const componentCount = asArray(asRecord(input).components).length;
  const programs: FigureProgramParameters[] = [
    { detailLevel: 1, strokeScale: 0.94, colorway: "balanced", depthScale: 0.85 },
    { detailLevel: 2, strokeScale: 1, colorway: "balanced", depthScale: 1 },
    { detailLevel: 3, strokeScale: 1.05, colorway: "balanced", depthScale: 1.15 },
    { detailLevel: 1, strokeScale: 1, colorway: "cool", depthScale: 1 },
    { detailLevel: 2, strokeScale: 0.94, colorway: "cool", depthScale: 1.15 },
    { detailLevel: 3, strokeScale: 1, colorway: "cool", depthScale: 0.85 },
    { detailLevel: 1, strokeScale: 1.05, colorway: "earth", depthScale: 1.15 },
    { detailLevel: 2, strokeScale: 1, colorway: "earth", depthScale: 0.85 },
    { detailLevel: 3, strokeScale: 0.94, colorway: "earth", depthScale: 1 }
  ];
  const requestedSpacing = string(asRecord(asRecord(input).brief).spacing, "normal");
  const preferredDetail = requestedSpacing === "compact" ? 2 : requestedSpacing === "open" ? 1 : 2;
  const candidates = programs.map((program) => {
    const scene = compilePublicationIllustration(input, program);
    const elementCount = scene?.elements.length ?? 0;
    const programObjects = scene?.semantics?.objects.filter((object) => object.properties?.compiler === "figure_program_v1").length ?? 0;
    const multiPartObjects = scene?.semantics?.objects.filter((object) => object.elementIds.length >= 4).length ?? 0;
    const coverage = componentCount ? programObjects / componentCount : 0;
    const richness = programObjects ? multiPartObjects / programObjects : 0;
    const expectedParts = options.prior?.meanPartsPerObject && options.prior.meanPartsPerObject > 0 ? options.prior.meanPartsPerObject : 24;
    const expectedElements = Math.max(45, componentCount * expectedParts + 70);
    const actualParts = programObjects ? (scene?.semantics?.objects.reduce((sum, object) => sum + object.elementIds.length, 0) ?? 0) / programObjects : 0;
    const learnedFit = options.prior?.meanPartsPerObject ? Math.max(0, 5 - Math.abs(actualParts - options.prior.meanPartsPerObject) * 0.25) : 0;
    const palette = scene ? scenePalette(scene) : [];
    const paletteFit = options.prior?.palette?.length ? paletteOverlap(palette, options.prior.palette) * 4 : program.colorway === "balanced" ? 1.25 : 0;
    const spacingFit = Math.max(0, 4 - Math.abs(program.detailLevel - preferredDetail) * 4);
    const strokeFit = scene && options.prior?.strokeWidths?.length ? Math.max(0, 2 - Math.abs(median(sceneStrokeWidths(scene)) - median(options.prior.strokeWidths))) : 1;
    const paletteComplexity = palette.length >= 5 && palette.length <= 18 ? 2 : -Math.abs(palette.length - 11) * 0.15;
    const scoreBreakdown: FigureProgramScoreBreakdown = {
      baseline: scene ? 48 : -1,
      semanticCoverage: Number((coverage * 22).toFixed(3)),
      scientificRichness: Number((richness * 14).toFixed(3)),
      learnedStructure: Number(learnedFit.toFixed(3)),
      learnedPalette: Number(paletteFit.toFixed(3)),
      requestedSpacing: Number(spacingFit.toFixed(3)),
      learnedStroke: Number(strokeFit.toFixed(3)),
      paletteDiscipline: Number(paletteComplexity.toFixed(3)),
      elementEconomy: Number((-Math.abs(elementCount - expectedElements) * 0.045).toFixed(3))
    };
    const score = scene ? Number(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0).toFixed(3)) : -1;
    return { ...program, score, scoreBreakdown, elementCount, objectCoverage: Number(coverage.toFixed(3)), multipartRatio: Number(richness.toFixed(3)), paletteColorCount: palette.length, scene };
  });
  const selected = candidates.filter((item) => item.scene).sort((a, b) => b.score - a.score || a.detailLevel - b.detailLevel || a.colorway.localeCompare(b.colorway))[0];
  const learningSignals: PublicationIllustrationSearch["audit"]["learningSignals"] = [];
  if (options.prior?.meanPartsPerObject) learningSignals.push("mean_parts_per_object");
  if (options.prior?.palette?.length) learningSignals.push("palette");
  if (options.prior?.strokeWidths?.length) learningSignals.push("stroke_widths");
  return { scene: selected?.scene, audit: { mode: "reference_free_program_search.v2", targetImageUsed: false, objective: "semantic_publication_fitness", mutableProperties: ["vector_density", "stroke_hierarchy", "palette", "layer_depth"], learningPriorUsed: learningSignals.length > 0, learningSignals, candidates: candidates.map(({ scene: _scene, ...item }) => item), ...(selected ? { selectedDetailLevel: selected.detailLevel, selectedProgram: { detailLevel: selected.detailLevel, strokeScale: selected.strokeScale, colorway: selected.colorway, depthScale: selected.depthScale } } : {}) } };
}

/**
 * Compile spatial/material mechanisms as coordinated scientific illustrations.
 * This is deliberately a depiction-operator path, not a catalog of domain icons.
 */
export function compilePublicationIllustration(input: unknown, options: Partial<FigureProgramParameters> = {}): VectorScene | undefined {
  const program: FigureProgramParameters = { detailLevel: options.detailLevel ?? 2, strokeScale: options.strokeScale ?? 1, colorway: options.colorway ?? "balanced", depthScale: options.depthScale ?? 1 };
  const scene = compileMaterialIllustration(input, program) ?? compileExperimentalIllustration(input, program) ?? compileContextualIllustration(input, program);
  return scene ? applyFigureProgram(scene, program) : undefined;
}

function compileMaterialIllustration(input: unknown, options: { detailLevel?: number } = {}): VectorScene | undefined {
  const value = asRecord(input);
  const brief = asRecord(value.brief);
  const components = asArray(value.components).map(component);
  const relationships = asArray(value.relationships ?? []).map(relationship);
  const detailLevel = Math.max(1, Math.min(3, Math.round(options.detailLevel ?? 2)));
  const material = findBestRole(components, ["material", "film", "polymer", "matrix", "coating", "membrane"]);
  const transform = findBestRole(components, ["transformation", "gradient", "conversion", "deprotection", "process"]);
  const interphase = findBestRole(components, ["interphase", "interface", "boundary"]);
  const surface = findBestRole(components, ["surface", "silica", "substrate", "mineral", "apparatus"]);
  if (!material || !transform || !interphase || !surface) return undefined;

  const width = number(brief.width, 1240);
  const height = number(brief.height, 759);
  const elements: VectorElement[] = [];
  const objects: ScientificObject[] = [];
  const semanticRelationships: ScientificRelationship[] = [];
  const margin = 42;
  const gap = 30;
  const stageY = 116;
  const stageH = height - stageY - 86;
  const stageW = (width - margin * 2 - gap * 2) / 3;
  const xs = [margin, margin + stageW + gap, margin + (stageW + gap) * 2];

  elements.push(rect("figure.background", 0, 0, width, height, { fill: "#FFFFFF", stroke: null }, -100));
  elements.push(text("figure.title", margin, 18, string(brief.title, "Scientific mechanism"), 25, { fill: "#172033", stroke: null }, 100));
  if (typeof brief.subtitle === "string" && brief.subtitle.trim()) elements.push(text("figure.subtitle", margin, 57, brief.subtitle, 15, { fill: "#64748B", stroke: null }, 100));

  const stageTitles = ["1  Initial material", "2  One-sided activation", "3  Persistent interphase"];
  xs.forEach((x, index) => {
    elements.push(rect(`program.stage-${index + 1}.shadow`, x + 5, stageY + 6, stageW, stageH, { fill: "#0F172A", stroke: null, opacity: 7 }, -2));
    elements.push(rect(`program.stage-${index + 1}.frame`, x, stageY, stageW, stageH, { fill: "#FFFFFF", stroke: "#64748B", strokeWidth: 1.25 }, 0));
    elements.push(rect(`program.stage-${index + 1}.header`, x, stageY, stageW, 43, { fillPaint: `stage-wash-${index + 1}`, stroke: null }, 1));
    elements.push(rect(`program.stage-${index + 1}.accent`, x, stageY, 6, 43, { fill: ["#2563EB", "#EA580C", "#0F766E"][index]!, stroke: null }, 2));
    elements.push(text(`program.stage-${index + 1}.title`, x + 18, stageY + 11, stageTitles[index]!, 17, { fill: "#172033", stroke: null }, 80));
  });

  const first = drawInitialMaterial(elements, xs[0]!, stageY + 57, stageW, stageH - 72, material.id, detailLevel);
  const second = drawActivationStage(elements, xs[1]!, stageY + 57, stageW, stageH - 72, transform.id, detailLevel);
  const third = drawInterphaseStage(elements, xs[2]!, stageY + 57, stageW, stageH - 72, interphase.id, surface.id, detailLevel);
  const primaryIds = new Set([material.id, transform.id, interphase.id, surface.id]);
  const expandedSemantics = components.some((item) => !primaryIds.has(item.id)) || relationships.some((item) => !primaryIds.has(item.sourceId) || !primaryIds.has(item.targetId));
  if (!expandedSemantics) {
    objects.push(scientificObject(material, first, "material_cross_section"));
    objects.push(scientificObject(transform, second, "depth_dependent_transformation"));
    objects.push(scientificObject(interphase, third.interphase, "functional_interphase"));
    objects.push(scientificObject(surface, third.surface, "ordered_surface"));
    relationships.forEach((item, index) => {
      const ids = index < 2
        ? drawTransition(elements, item.id, xs[index]! + stageW + 5, stageY + stageH * 0.5, gap - 10, item.label)
        : third.interphase.filter((id) => id.includes(".association-"));
      semanticRelationships.push({ id: item.id, sourceObjectId: item.sourceId, predicate: item.type, targetObjectId: item.targetId, visualElementIds: ids, properties: { compiler: "figure_program_v1", role: item.type } });
    });
  } else {
    const stageVisuals = [first, second, [...third.interphase, ...third.surface]];
    const transitionVisuals = [
      drawTransition(elements, "program.stage-flow-1", xs[0]! + stageW + 5, stageY + stageH * 0.5, gap - 10, "activation"),
      drawTransition(elements, "program.stage-flow-2", xs[1]! + stageW + 5, stageY + stageH * 0.5, gap - 10, "neutralize / contact")
    ];
    const stageById = new Map(components.map((item) => [item.id, materialStage(item)]));
    for (const item of components) {
      const stage = stageById.get(item.id) ?? 1;
      const ids = item.id === material.id ? first : item.id === transform.id ? second : item.id === interphase.id ? third.interphase : item.id === surface.id ? third.surface : stageVisuals[stage]!;
      const operator = item.id === material.id ? "material_cross_section" : item.id === transform.id ? "depth_dependent_transformation" : item.id === interphase.id ? "functional_interphase" : item.id === surface.id ? "ordered_surface" : ["initial_material_semantic_layer", "activation_semantic_layer", "interphase_semantic_layer"][stage]!;
      objects.push(scientificObject(item, ids, operator));
    }
    for (const item of relationships) {
      const sourceStage = stageById.get(item.sourceId) ?? 1, targetStage = stageById.get(item.targetId) ?? 1;
      const low = Math.min(sourceStage, targetStage), high = Math.max(sourceStage, targetStage);
      const ids = low !== high
        ? (low === 0 && high === 2 ? [...transitionVisuals[0]!, ...transitionVisuals[1]!] : transitionVisuals[Math.min(low, 1)]!)
        : relationshipStageVisuals(item, sourceStage, stageVisuals, third.interphase);
      semanticRelationships.push({ id: item.id, sourceObjectId: item.sourceId, predicate: item.type, targetObjectId: item.targetId, visualElementIds: ids, properties: { compiler: "figure_program_v1", role: item.type, aggregateVisual: true } });
    }
  }

  const legendY = height - 53;
  elements.push(text("program.legend.heading", margin, legendY, "Visual key", 15, { fill: "#172033", stroke: null }, 90));
  elements.push(polygon("program.legend.protected", regularPolygon(margin + 116, legendY + 9, 10, 5, -Math.PI / 2), { fill: "#FEF3C7", stroke: "#92400E", strokeWidth: 2 }, 90));
  elements.push(text("program.legend.protected-label", margin + 134, legendY, "protected group", 14, { fill: "#334155", stroke: null }, 90));
  elements.push(line("program.legend.diol-cc", margin + 330, legendY + 13, margin + 346, legendY + 13, { fill: null, stroke: "#0F766E", strokeWidth: 2 }, 90));
  elements.push(line("program.legend.diol-bond-a", margin + 333, legendY + 12, margin + 326, legendY + 3, { fill: null, stroke: "#0F766E", strokeWidth: 2 }, 90));
  elements.push(line("program.legend.diol-bond-b", margin + 343, legendY + 12, margin + 350, legendY + 3, { fill: null, stroke: "#0F766E", strokeWidth: 2 }, 90));
  elements.push(text("program.legend.diol-oh-a", margin + 306, legendY - 9, "HO", 10, { fill: "#0F766E", stroke: null }, 91));
  elements.push(text("program.legend.diol-oh-b", margin + 350, legendY - 9, "OH", 10, { fill: "#0F766E", stroke: null }, 91));
  elements.push(text("program.legend.diol-label", margin + 376, legendY, "vicinal diol", 14, { fill: "#334155", stroke: null }, 90));
  elements.push(line("program.legend.hbond", margin + 516, legendY + 9, margin + 558, legendY + 9, { fill: null, stroke: "#6D28D9", strokeWidth: 3, dashArray: [5, 5] }, 90));
  elements.push(text("program.legend.hbond-label", margin + 568, legendY, "proposed association", 14, { fill: "#334155", stroke: null }, 90));
  elements.push(text("program.hypothesis-note", width - 380, legendY, "Hypothesis • not measured data", 14, { fill: "#7C2D12", stroke: null }, 90));

  return normalizeScene({
    document: { title: string(brief.title, "Scientific mechanism"), width, height, colorMode: "RGB" },
    paints: [
      gradient("stage-wash-1", "#E8F2FA", "#F8FBFD"),
      gradient("stage-wash-2", "#FFF0E1", "#FFF9F2"),
      gradient("stage-wash-3", "#E6F7F3", "#F7FCFB"),
      gradient("initial-film-field", "#DBEAFE", "#F8FAFC"),
      gradient("activation-atmosphere", "#FFEDD5", "#FFFFFF"),
      gradient("acid-depth-field", "#F97316", "#FFEDD5"),
      gradient("persistent-film-field", "#D1FAE5", "#F8FAFC"),
      gradient("interphase-field", "#0F766E", "#CCFBF1"),
      gradient("silica-field", "#CBD5E1", "#F8FAFC")
    ],
    elements,
    semantics: { objects, relationships: semanticRelationships }
  });
}

function compileExperimentalIllustration(input: unknown, options: { detailLevel?: number } = {}): VectorScene | undefined {
  const value = asRecord(input), brief = asRecord(value.brief);
  const components = asArray(value.components).map(component), relationships = asArray(value.relationships ?? []).map(relationship);
  const stimulus = findTokenRole(components, ["stimulus", "light", "heat", "field"]);
  const apparatus = findTokenRole(components, ["apparatus", "instrument", "reactor", "chamber"]);
  const surface = findTokenRole(components, ["surface", "substrate", "sensor"]);
  const analyte = findTokenRole(components, ["analyte", "particle", "molecule"]);
  if (!stimulus || !apparatus || !surface || !analyte) return undefined;
  const detail = Math.max(1, Math.min(3, Math.round(options.detailLevel ?? 2)));
  const width = number(brief.width, 1240), height = number(brief.height, 759), elements: VectorElement[] = [], objects: ScientificObject[] = [], semanticRelationships: ScientificRelationship[] = [];
  const chamber = { x: 270, y: 190, width: width - 380, height: 390 };
  elements.push(rect("figure.background", 0, 0, width, height, { fill: "#FFFFFF", stroke: null }, -100));
  elements.push(text("figure.title", 42, 24, string(brief.title, "Experimental system"), 29, { fill: "#172033", stroke: null }, 100));
  if (typeof brief.subtitle === "string" && brief.subtitle.trim()) elements.push(text("figure.subtitle", 42, 68, brief.subtitle, 17, { fill: "#475569", stroke: null }, 100));

  const apparatusIds = [
    add(elements, rect(`${apparatus.id}.body`, chamber.x, chamber.y, chamber.width, chamber.height, { fill: "#F8FAFC", stroke: "#1E3A8A", strokeWidth: 4 }, 10)),
    add(elements, rect(`${apparatus.id}.fluid-window`, chamber.x + 35, chamber.y + 70, chamber.width - 70, 185, { fillPaint: "experiment-fluid", stroke: "#0369A1", strokeWidth: 3 }, 12)),
    add(elements, line(`${apparatus.id}.inlet`, chamber.x - 90, chamber.y + 160, chamber.x + 35, chamber.y + 160, { fill: null, stroke: "#1E3A8A", strokeWidth: 12, lineCap: "round" }, 11)),
    add(elements, line(`${apparatus.id}.outlet`, chamber.x + chamber.width - 35, chamber.y + 160, chamber.x + chamber.width + 90, chamber.y + 160, { fill: null, stroke: "#1E3A8A", strokeWidth: 12, lineCap: "round" }, 11)),
    add(elements, rect(`${apparatus.id}.transparent-lid`, chamber.x + 125, chamber.y - 17, chamber.width - 250, 34, { fill: "#DBEAFE", stroke: "#1D4ED8", strokeWidth: 2, opacity: 62 }, 15))
  ];
  elements.push(text(`${apparatus.id}.label`, chamber.x + chamber.width - 175, chamber.y + chamber.height + 18, apparatus.label, 15, { fill: "#172033", stroke: null }, 80));

  const stimulusIds: string[] = [add(elements, circle(`${stimulus.id}.source`, 145, 215, 62, { fill: "#FDBA74", stroke: "#9A3412", strokeWidth: 3 }, 22))];
  for (let i = 0; i < 5 + detail; i += 1) { const x = 105 + i * 18; stimulusIds.push(add(elements, line(`${stimulus.id}.ray-${i}`, x, 255, chamber.x + 155 + i * 42, chamber.y + 3, { fill: null, stroke: "#C2410C", strokeWidth: 3, lineCap: "round" }, 20))); }
  elements.push(text(`${stimulus.id}.label`, 72, 285, stimulus.label, 15, { fill: "#7C2D12", stroke: null }, 80));

  const surfaceIds = [add(elements, rect(`${surface.id}.slab`, chamber.x + 165, chamber.y + 285, chamber.width - 330, 68, { fill: "#E2E8F0", stroke: "#334155", strokeWidth: 3 }, 20))];
  const sites = 6 + detail;
  for (let i = 0; i < sites; i += 1) { const x = chamber.x + 195 + i * ((chamber.width - 390) / Math.max(1, sites - 1)); surfaceIds.push(add(elements, polygon(`${surface.id}.lattice-${i}`, hexagon(x, chamber.y + 321, 15), { fill: "#FFFFFF", stroke: "#475569", strokeWidth: 2 }, 22))); surfaceIds.push(add(elements, line(`${surface.id}.site-stem-${i}`, x, chamber.y + 285, x, chamber.y + 262, { fill: null, stroke: "#0F766E", strokeWidth: 2 }, 24))); surfaceIds.push(add(elements, circle(`${surface.id}.site-${i}`, x, chamber.y + 252, 13, { fill: "#2DD4BF", stroke: "#115E59", strokeWidth: 2 }, 25))); }
  elements.push(text(`${surface.id}.label`, chamber.x + 175, chamber.y + chamber.height + 18, surface.label, 15, { fill: "#172033", stroke: null }, 80));

  const analyteIds: string[] = [];
  const analyteCount = 5 + detail * 2;
  for (let i = 0; i < analyteCount; i += 1) { const x = chamber.x + 85 + i * ((chamber.width - 170) / Math.max(1, analyteCount - 1)); const y = chamber.y + 120 + (i % 3) * 35; analyteIds.push(add(elements, circle(`${analyte.id}.flowing-${i}`, x, y, 17, { fill: "#F59E0B", stroke: "#92400E", strokeWidth: 2 }, 25))); }
  const captureIds: string[] = [];
  for (let i = 1; i < sites; i += 2) { const x = chamber.x + 195 + i * ((chamber.width - 390) / Math.max(1, sites - 1)); analyteIds.push(add(elements, circle(`${analyte.id}.captured-${i}`, x, chamber.y + 225, 18, { fill: "#F59E0B", stroke: "#92400E", strokeWidth: 2 }, 27))); captureIds.push(add(elements, line(`${analyte.id}.capture-bond-${i}`, x, chamber.y + 234, x, chamber.y + 246, { fill: null, stroke: "#6D28D9", strokeWidth: 2, dashArray: [4, 4] }, 26))); }
  elements.push(text(`${analyte.id}.label`, chamber.x + 50, chamber.y + 90, analyte.label, 15, { fill: "#7C2D12", stroke: null }, 80));

  objects.push(scientificObject(stimulus, stimulusIds, "external_stimulus_field"), scientificObject(apparatus, apparatusIds, "instrument_cross_section"), scientificObject(surface, surfaceIds, "functional_surface_lattice"), scientificObject(analyte, analyteIds, "distributed_analyte_population"));
  const relationVisuals = new Map<string, string[]>([["illuminates", stimulusIds.filter((id) => id.includes(".ray-"))], ["contains", [apparatusIds[1]!]], ["captures", captureIds]]);
  for (const item of relationships) semanticRelationships.push({ id: item.id, sourceObjectId: item.sourceId, predicate: item.type, targetObjectId: item.targetId, visualElementIds: relationVisuals.get(item.type) ?? [], properties: { compiler: "figure_program_v1", role: item.type } });
  elements.push(text("program.experiment-note", 42, height - 54, "Conceptual cross-section • geometry and performance are unspecified", 14, { fill: "#475569", stroke: null }, 90));
  return normalizeScene({ document: { title: string(brief.title, "Experimental system"), width, height, colorMode: "RGB" }, paints: [gradient("experiment-fluid", "#BAE6FD", "#F0F9FF")], elements, semantics: { objects, relationships: semanticRelationships } });
}

/** General-purpose contextual composition for non-material prompts. */
function compileContextualIllustration(input: unknown, options: { detailLevel?: number } = {}): VectorScene | undefined {
  const value = asRecord(input);
  const brief = asRecord(value.brief);
  const components = asArray(value.components).map(component);
  const relationships = asArray(value.relationships ?? []).map(relationship);
  if (!components.length || components.length > 12) return undefined;
  const detailLevel = Math.max(1, Math.min(3, Math.round(options.detailLevel ?? 2)));
  const width = number(brief.width, 1240), height = number(brief.height, 759);
  const elements: VectorElement[] = [];
  const objects: ScientificObject[] = [];
  const semanticRelationships: ScientificRelationship[] = [];
  const margin = 42, top = 132, bottom = height - 92;
  const archetype = inferArchetype(components);
  const positions = contextualPositions(components.length, archetype, width, top, bottom);

  elements.push(rect("figure.background", 0, 0, width, height, { fill: "#FFFFFF", stroke: null }, -100));
  elements.push(rect("program.context-field", margin, top - 18, width - margin * 2, bottom - top + 36, { fillPaint: archetype === "cellular_cutaway" ? "context-cell" : archetype === "experimental_system" ? "context-experiment" : "context-mechanism", stroke: "#64748B", strokeWidth: 1.5 }, -20));
  drawArchetypeContext(elements, archetype, width, top, bottom);
  elements.push(text("figure.title", margin, 24, string(brief.title, "Scientific mechanism"), 29, { fill: "#172033", stroke: null }, 100));
  if (typeof brief.subtitle === "string" && brief.subtitle.trim()) elements.push(text("figure.subtitle", margin, 68, brief.subtitle, 17, { fill: "#475569", stroke: null }, 100));
  elements.push(text("program.archetype", width - 265, 82, archetype.replaceAll("_", " "), 14, { fill: "#475569", stroke: null }, 90));

  const positionById = new Map(components.map((item, index) => [item.id, positions[index]!]));
  relationships.forEach((item) => {
    const source = positionById.get(item.sourceId), target = positionById.get(item.targetId);
    if (!source || !target) return;
    const ids = drawSemanticArrow(elements, item.id, source, target);
    semanticRelationships.push({ id: item.id, sourceObjectId: item.sourceId, predicate: item.type, targetObjectId: item.targetId, visualElementIds: ids, properties: { compiler: "figure_program_v1", role: item.type } });
  });
  components.forEach((item, index) => {
    const position = positions[index]!;
    const depiction = drawContextualObject(elements, item, position.x, position.y, detailLevel);
    objects.push(scientificObject(item, depiction.ids, depiction.operator));
    const lowerHalf = position.y > (top + bottom) / 2;
    const labelY = archetype === "experimental_system" ? position.y + 94 : lowerHalf ? position.y - 112 : position.y + 94;
    elements.push(text(`${item.id}.context-label`, position.x - Math.min(90, item.label.length * 4.2), labelY, item.label, 15, { fill: "#172033", stroke: null }, 80));
  });
  elements.push(text("program.review-note", margin, height - 54, "Prompt-derived semantic illustration • verify scientific meaning before approval", 14, { fill: "#475569", stroke: null }, 90));

  return normalizeScene({
    document: { title: string(brief.title, "Scientific mechanism"), width, height, colorMode: "RGB" },
    paints: [
      gradient("context-cell", "#EEF9F6", "#F8FBFF"),
      gradient("context-experiment", "#EFF6FF", "#F8FAFC"),
      gradient("context-mechanism", "#F5F3FF", "#F8FAFC"),
      gradient("context-object-blue", "#2563EB", "#BFDBFE"),
      gradient("context-object-teal", "#0F766E", "#99F6E4")
    ],
    elements,
    semantics: { objects, relationships: semanticRelationships }
  });
}

type ContextPosition = { x: number; y: number };
function contextualPositions(count: number, archetype: "cellular_cutaway" | "experimental_system" | "mechanism_landscape", width: number, top: number, bottom: number): ContextPosition[] {
  if (count <= 4) {
    const fractions = count === 1 ? [0.5] : count === 2 ? [0.25, 0.75] : count === 3 ? [0.15, 0.5, 0.85] : [0.12, 0.38, 0.64, 0.88];
    const cellularY = count === 4 ? [top + 100, top + 220, bottom - 105, bottom - 105] : fractions.map((_, index) => top + 120 + index * ((bottom - top - 240) / Math.max(1, count - 1)));
    const experimentY = count === 4 ? [top + 130, top + 205, top + 285, top + 205] : fractions.map((_, index) => top + 155 + (index % 2) * 115);
    const mechanismY = fractions.map((_, index) => top + 145 + (index % 2) * 115);
    const ys = archetype === "cellular_cutaway" ? cellularY : archetype === "experimental_system" ? experimentY : mechanismY;
    return fractions.map((fraction, index) => ({ x: width * fraction, y: ys[index]! }));
  }
  const columns = Math.ceil(count / 2), step = (width - 300) / Math.max(1, columns - 1);
  return Array.from({ length: count }, (_, index) => ({ x: 150 + (index % columns) * step, y: index < columns ? top + 112 : bottom - 112 }));
}

function drawArchetypeContext(target: VectorElement[], archetype: "cellular_cutaway" | "experimental_system" | "mechanism_landscape", width: number, top: number, bottom: number): void {
  if (archetype === "cellular_cutaway") {
    const membraneY = top + 235;
    target.push(rect("program.extracellular-field", 44, top - 16, width - 88, membraneY - top + 9, { fill: "#F0FDFA", stroke: null, opacity: 58 }, -18));
    target.push(rect("program.cytoplasm-field", 44, membraneY + 26, width - 88, bottom - membraneY - 8, { fill: "#EEF2FF", stroke: null, opacity: 55 }, -18));
    target.push(line("program.membrane-outer", 68, membraneY, width - 68, membraneY, { fill: null, stroke: "#0F766E", strokeWidth: 4 }, -4));
    target.push(line("program.membrane-inner", 68, membraneY + 26, width - 68, membraneY + 26, { fill: null, stroke: "#0F766E", strokeWidth: 4 }, -4));
    for (let x = 82; x < width - 75; x += 34) { target.push(circle(`program.membrane-head-a-${x}`, x, membraneY, 10, { fill: "#5EEAD4", stroke: "#115E59", strokeWidth: 1.5 }, -3)); target.push(circle(`program.membrane-head-b-${x}`, x, membraneY + 26, 10, { fill: "#5EEAD4", stroke: "#115E59", strokeWidth: 1.5 }, -3)); }
    target.push(text("program.extracellular-label", 72, top + 9, "extracellular", 13, { fill: "#475569", stroke: null }, 70));
    target.push(text("program.cytoplasm-label", 72, membraneY + 43, "cytoplasm", 13, { fill: "#475569", stroke: null }, 70));
  } else if (archetype === "experimental_system") {
    const channelY = top + 215;
    target.push(rect("program.flow-path", 75, channelY - 92, width - 150, 184, { fill: "#E0F2FE", stroke: "#0369A1", strokeWidth: 3 }, -6));
    for (let x = 110; x < width - 105; x += 105) { target.push(line(`program.flow-vector-${x}`, x, channelY, x + 52, channelY, { fill: null, stroke: "#0284C7", strokeWidth: 3, lineCap: "round" }, -5)); target.push(polygon(`program.flow-head-${x}`, [{ x: x + 58, y: channelY }, { x: x + 46, y: channelY - 7 }, { x: x + 46, y: channelY + 7 }], { fill: "#0284C7", stroke: null }, -4)); }
    target.push(text("program.flow-label", width - 330, channelY - 70, "controlled experimental path", 13, { fill: "#475569", stroke: null }, 70));
  } else {
    target.push(path("program.mechanism-sweep", [{ x: 82, y: top + 175 }, { x: width * 0.35, y: top + 80, pointType: "smooth", leftX: width * 0.22, leftY: top + 150, rightX: width * 0.46, rightY: top + 115 }, { x: width * 0.65, y: bottom - 85, pointType: "smooth", leftX: width * 0.54, leftY: bottom - 155, rightX: width * 0.76, rightY: bottom - 120 }, { x: width - 82, y: bottom - 165 }], { fill: null, stroke: "#C4B5FD", strokeWidth: 24, opacity: 28, lineCap: "round" }, -8));
  }
}

function inferArchetype(items: BriefComponent[]): "cellular_cutaway" | "experimental_system" | "mechanism_landscape" {
  const words = tokens(items.map((item) => `${item.type} ${item.kind ?? ""} ${item.label}`).join(" "));
  if (hasAny(words, ["cell", "cellular", "nucleus", "membrane", "transmembrane", "receptor", "organelle", "dna", "rna", "gene"])) return "cellular_cutaway";
  if (hasAny(words, ["apparatus", "instrument", "reactor", "chamber", "surface", "substrate", "stimulus", "particle", "sensor"])) return "experimental_system";
  return "mechanism_landscape";
}

function drawContextualObject(target: VectorElement[], item: BriefComponent, cx: number, cy: number, detailLevel: number): { ids: string[]; operator: string } {
  const words = tokens(`${item.type} ${item.kind ?? ""} ${item.label}`);
  if (hasAny(words, ["cell"])) return drawCellGlyph(target, item.id, cx, cy, detailLevel);
  if (hasAny(words, ["nucleus", "dna", "rna", "gene"])) return drawNucleicGlyph(target, item.id, cx, cy, detailLevel);
  if (hasAny(words, ["receptor"])) return drawReceptorGlyph(target, item.id, cx, cy, detailLevel);
  if (hasAny(words, ["membrane", "bilayer"])) return drawMembraneGlyph(target, item.id, cx, cy, detailLevel);
  if (hasAny(words, ["surface", "substrate", "mineral", "silica"])) return drawSurfaceGlyph(target, item.id, cx, cy, detailLevel);
  if (hasAny(words, ["apparatus", "instrument", "reactor", "chamber", "sensor"])) return drawApparatusGlyph(target, item.id, cx, cy, detailLevel);
  if (hasAny(words, ["stimulus", "light", "heat", "acid", "trigger", "field"])) return drawStimulusGlyph(target, item.id, cx, cy, detailLevel);
  if (hasAny(words, ["protein", "enzyme", "kinase"])) return drawProteinGlyph(target, item.id, cx, cy, detailLevel);
  return drawMolecularGlyph(target, item.id, cx, cy, detailLevel);
}

function tokens(value: string): Set<string> { return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)); }
function hasAny(values: Set<string>, expected: string[]): boolean { return expected.some((value) => values.has(value)); }

function drawCellGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const ids = [add(target, circle(`${id}.cell-boundary`, cx, cy, 142, { fill: "#ECFDF5", stroke: "#0F766E", strokeWidth: 4 }, 20)), add(target, circle(`${id}.nucleus`, cx + 8, cy + 3, 58, { fill: "#C4B5FD", stroke: "#5B21B6", strokeWidth: 3 }, 24))];
  for (let i = 0; i < 2 + detail; i += 1) ids.push(add(target, { id: `${id}.organelle-${i + 1}`, name: `${id}.organelle-${i + 1}`, type: "ellipse", x: cx - 50 + i * 28, y: cy + (i % 2 ? 31 : -48), width: 28, height: 13, style: { fill: "#FDBA74", stroke: "#9A3412", strokeWidth: 2 }, zIndex: 25 }));
  return { ids, operator: "cellular_cutaway" };
}

function drawNucleicGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const ids = [add(target, circle(`${id}.envelope`, cx, cy, 132, { fill: "#F5F3FF", stroke: "#6D28D9", strokeWidth: 3 }, 20)), add(target, circle(`${id}.inner-envelope`, cx, cy, 116, { fill: null, stroke: "#7C3AED", strokeWidth: 2 }, 21))];
  const turns = 4 + detail;
  for (let i = 0; i < turns; i += 1) { const y = cy - 45 + i * (90 / Math.max(1, turns - 1)); ids.push(add(target, line(`${id}.helix-a-${i}`, cx - 32, y, cx + 32, y + 12, { fill: null, stroke: "#2563EB", strokeWidth: 3 }, 25))); ids.push(add(target, line(`${id}.helix-b-${i}`, cx + 32, y, cx - 32, y + 12, { fill: null, stroke: "#DB2777", strokeWidth: 3 }, 25))); }
  return { ids, operator: "nucleic_acid_compartment" };
}

function drawMembraneGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const ids: string[] = []; const count = 5 + detail;
  ids.push(add(target, rect(`${id}.field`, cx - 78, cy - 54, 156, 108, { fill: "#EFF6FF", stroke: "#1D4ED8", strokeWidth: 2 }, 18)));
  for (let i = 0; i < count; i += 1) { const x = cx - 61 + i * (122 / Math.max(1, count - 1)); ids.push(add(target, circle(`${id}.outer-head-${i}`, x, cy - 21, 14, { fill: "#38BDF8", stroke: "#075985", strokeWidth: 2 }, 24))); ids.push(add(target, circle(`${id}.inner-head-${i}`, x, cy + 21, 14, { fill: "#38BDF8", stroke: "#075985", strokeWidth: 2 }, 24))); ids.push(add(target, line(`${id}.tail-${i}`, x, cy - 14, x, cy + 14, { fill: null, stroke: "#075985", strokeWidth: 2 }, 23))); }
  return { ids, operator: "lipid_bilayer_cross_section" };
}

function drawReceptorGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const ids = [add(target, rect(`${id}.membrane`, cx - 80, cy + 15, 160, 30, { fill: "#DBEAFE", stroke: "#1D4ED8", strokeWidth: 2 }, 18)), add(target, line(`${id}.stem-a`, cx - 11, cy - 22, cx - 11, cy + 62, { fill: null, stroke: "#0F766E", strokeWidth: 6, lineCap: "round" }, 24)), add(target, line(`${id}.stem-b`, cx + 11, cy - 22, cx + 11, cy + 62, { fill: null, stroke: "#0F766E", strokeWidth: 6, lineCap: "round" }, 24)), add(target, line(`${id}.arm-a`, cx - 11, cy - 22, cx - 42, cy - 56, { fill: null, stroke: "#0F766E", strokeWidth: 6, lineCap: "round" }, 24)), add(target, line(`${id}.arm-b`, cx + 11, cy - 22, cx + 42, cy - 56, { fill: null, stroke: "#0F766E", strokeWidth: 6, lineCap: "round" }, 24))];
  for (let i = 0; i < detail; i += 1) ids.push(add(target, circle(`${id}.site-${i}`, cx + (i ? 34 : -34), cy - 61, 16, { fill: "#F59E0B", stroke: "#92400E", strokeWidth: 2 }, 26)));
  return { ids, operator: "transmembrane_receptor" };
}

function drawApparatusGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const ids = [add(target, rect(`${id}.chamber`, cx - 68, cy - 54, 136, 108, { fillPaint: "context-object-blue", stroke: "#1E3A8A", strokeWidth: 3 }, 20)), add(target, rect(`${id}.window`, cx - 35, cy - 25, 70, 50, { fill: "#FFFFFF", stroke: "#1E40AF", strokeWidth: 2 }, 23)), add(target, line(`${id}.inlet`, cx - 96, cy - 20, cx - 68, cy - 20, { fill: null, stroke: "#1E3A8A", strokeWidth: 5 }, 22)), add(target, line(`${id}.outlet`, cx + 68, cy + 20, cx + 96, cy + 20, { fill: null, stroke: "#1E3A8A", strokeWidth: 5 }, 22)), add(target, circle(`${id}.gauge`, cx, cy - 75, 30, { fill: "#FFFFFF", stroke: "#1E3A8A", strokeWidth: 3 }, 24))];
  for (let i = 0; i < detail; i += 1) ids.push(add(target, circle(`${id}.sample-${i}`, cx - 20 + i * 20, cy, 12, { fill: "#14B8A6", stroke: "#115E59", strokeWidth: 2 }, 25)));
  return { ids, operator: "instrument_cross_section" };
}

function drawSurfaceGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const ids = [add(target, rect(`${id}.slab`, cx - 83, cy - 12, 166, 66, { fill: "#E2E8F0", stroke: "#334155", strokeWidth: 3 }, 20))];
  const count = 4 + detail; for (let i = 0; i < count; i += 1) { const x = cx - 65 + i * (130 / Math.max(1, count - 1)); ids.push(add(target, polygon(`${id}.lattice-${i}`, hexagon(x, cy + 20, 13), { fill: "#FFFFFF", stroke: "#475569", strokeWidth: 2 }, 23))); ids.push(add(target, line(`${id}.site-bond-${i}`, x, cy - 12, x, cy - 39, { fill: null, stroke: "#0F766E", strokeWidth: 2 }, 24))); ids.push(add(target, circle(`${id}.site-${i}`, x, cy - 47, 12, { fill: "#2DD4BF", stroke: "#115E59", strokeWidth: 2 }, 25))); }
  return { ids, operator: "functional_surface_lattice" };
}

function drawStimulusGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const ids = [add(target, circle(`${id}.core`, cx, cy, 54, { fill: "#FDBA74", stroke: "#9A3412", strokeWidth: 3 }, 23))];
  const rays = 6 + detail * 2; for (let i = 0; i < rays; i += 1) { const a = i / rays * Math.PI * 2; ids.push(add(target, line(`${id}.ray-${i}`, cx + Math.cos(a) * 36, cy + Math.sin(a) * 36, cx + Math.cos(a) * 70, cy + Math.sin(a) * 70, { fill: null, stroke: "#C2410C", strokeWidth: 3, lineCap: "round" }, 22))); }
  return { ids, operator: "external_stimulus_field" };
}

function drawProteinGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const points = Array.from({ length: 10 + detail * 2 }, (_, i) => { const a = i / (10 + detail * 2) * Math.PI * 2; const r = i % 2 ? 55 : 72; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });
  const ids = [add(target, polygon(`${id}.fold`, points, { fill: "#DDD6FE", stroke: "#5B21B6", strokeWidth: 3 }, 22)), add(target, circle(`${id}.active-site`, cx + 18, cy - 8, 25, { fill: "#FFFFFF", stroke: "#7C3AED", strokeWidth: 2 }, 24)), add(target, line(`${id}.domain-a`, cx - 34, cy - 24, cx + 5, cy + 30, { fill: null, stroke: "#7C3AED", strokeWidth: 3 }, 24)), add(target, line(`${id}.domain-b`, cx + 5, cy + 30, cx + 42, cy + 10, { fill: null, stroke: "#DB2777", strokeWidth: 3 }, 24))];
  return { ids, operator: "protein_domain_cartoon" };
}

function drawMolecularGlyph(target: VectorElement[], id: string, cx: number, cy: number, detail: number) {
  const ringCount = 2 + detail; const ids: string[] = [];
  for (let i = 0; i < ringCount; i += 1) { const x = cx + (i - (ringCount - 1) / 2) * 38; ids.push(add(target, polygon(`${id}.ring-${i}`, hexagon(x, cy, 26), { fill: i % 2 ? "#CCFBF1" : "#FEF3C7", stroke: i % 2 ? "#0F766E" : "#92400E", strokeWidth: 3 }, 23))); if (i) ids.push(add(target, line(`${id}.bond-${i}`, x - 38 + 26, cy, x - 26, cy, { fill: null, stroke: "#334155", strokeWidth: 3 }, 22))); ids.push(add(target, circle(`${id}.heteroatom-${i}`, x, cy - 26, 11, { fill: "#F8FAFC", stroke: "#1E3A8A", strokeWidth: 2 }, 24))); }
  return { ids, operator: "molecular_scaffold" };
}

function drawSemanticArrow(target: VectorElement[], id: string, source: ContextPosition, destination: ContextPosition): string[] {
  const dx = destination.x - source.x, dy = destination.y - source.y, length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length;
  const start = { x: source.x + ux * 92, y: source.y + uy * 72 }, end = { x: destination.x - ux * 92, y: destination.y - uy * 72 };
  return [add(target, line(`${id}.semantic-arrow`, start.x, start.y, end.x, end.y, { fill: null, stroke: "#475569", strokeWidth: 4, lineCap: "round" }, 5)), add(target, polygon(`${id}.semantic-arrowhead`, [{ x: end.x, y: end.y }, { x: end.x - ux * 16 + uy * 8, y: end.y - uy * 16 - ux * 8 }, { x: end.x - ux * 16 - uy * 8, y: end.y - uy * 16 + ux * 8 }], { fill: "#475569", stroke: null }, 6))];
}

function drawInitialMaterial(target: VectorElement[], x: number, y: number, w: number, h: number, prefix: string, detailLevel: number): string[] {
  const ids: string[] = [];
  ids.push(add(target, rect(`${prefix}.film-shadow`, x + 31, y + 55, w - 54, h - 92, { fill: "#172554", stroke: null, opacity: 8 }, 8)));
  ids.push(add(target, rect(`${prefix}.film`, x + 25, y + 49, w - 54, h - 92, { fillPaint: "initial-film-field", stroke: "#2563EB", strokeWidth: 2 }, 10)));
  ids.push(add(target, line(`${prefix}.free-surface`, x + 25, y + 49, x + w - 29, y + 49, { fill: null, stroke: "#1D4ED8", strokeWidth: 4, lineCap: "round" }, 14)));
  ids.push(...drawPolymerNetwork(target, prefix, x + 40, y + 72, w - 84, h - 137, "protected", detailLevel));
  const lamellaRows = detailLevel + 1;
  for (let row = 0; row < lamellaRows; row += 1) for (let col = 0; col < 4; col += 1) {
    const lx = x + 58 + col * ((w - 116) / 3);
    const ly = y + 105 + row * ((h - 174) / Math.max(1, lamellaRows - 1));
    ids.push(add(target, line(`${prefix}.lamella-${row + 1}-${col + 1}`, lx - 17, ly, lx + 17, ly - 10, { fill: null, stroke: "#475569", strokeWidth: 4, lineCap: "round" }, 25)));
  }
  target.push(text(`${prefix}.morphology-label`, x + 27, y + 4, "protected semicrystalline film", 14, { fill: "#334155", stroke: null }, 70));
  target.push(line(`${prefix}.depth-bracket`, x + 15, y + 56, x + 15, y + h - 48, { fill: null, stroke: "#64748B", strokeWidth: 1.5 }, 60));
  target.push(polygon(`${prefix}.depth-head`, [{ x: x + 10, y: y + h - 52 }, { x: x + 20, y: y + h - 52 }, { x: x + 15, y: y + h - 42 }], { fill: "#64748B", stroke: null }, 61));
  target.push(text(`${prefix}.depth-label`, x + 4, y + h - 31, "depth", 12, { fill: "#64748B", stroke: null }, 70));
  return ids;
}

function drawActivationStage(target: VectorElement[], x: number, y: number, w: number, h: number, prefix: string, detailLevel: number): string[] {
  const ids: string[] = [];
  ids.push(add(target, rect(`${prefix}.vapor-field`, x + 24, y + 4, w - 48, 62, { fillPaint: "activation-atmosphere", stroke: null, opacity: 65 }, 5)));
  for (let i = 0; i < 4; i += 1) {
    const dx = x + w * (0.27 + i * 0.15);
    ids.push(add(target, droplet(`${prefix}.acid-${i + 1}`, dx, y + 39 + (i % 2) * 5, 13, { fill: "#F97316", stroke: "#9A3412", strokeWidth: 2 }, 35)));
    ids.push(add(target, line(`${prefix}.flux-${i + 1}`, dx, y + 59, dx, y + 91 + i * 5, { fill: null, stroke: "#C2410C", strokeWidth: 3, lineCap: "round" }, 30)));
    ids.push(add(target, polygon(`${prefix}.flux-head-${i + 1}`, [{ x: dx - 5, y: y + 85 + i * 5 }, { x: dx + 5, y: y + 85 + i * 5 }, { x: dx, y: y + 95 + i * 5 }], { fill: "#C2410C", stroke: null }, 31)));
  }
  ids.push(add(target, rect(`${prefix}.film-shadow`, x + 31, y + 100, w - 54, h - 131, { fill: "#7C2D12", stroke: null, opacity: 8 }, 8)));
  ids.push(add(target, rect(`${prefix}.film`, x + 25, y + 94, w - 54, h - 131, { fillPaint: "acid-depth-field", stroke: "#C2410C", strokeWidth: 2, opacity: 58 }, 10)));
  ids.push(add(target, line(`${prefix}.exposed-surface`, x + 25, y + 94, x + w - 29, y + 94, { fill: null, stroke: "#EA580C", strokeWidth: 4, lineCap: "round" }, 14)));
  ids.push(...drawPolymerNetwork(target, prefix, x + 40, y + 113, w - 84, h - 170, "gradient", detailLevel));
  for (let i = 0; i < 3; i += 1) ids.push(add(target, path(`${prefix}.diffusion-front-${i + 1}`, [{ x: x + 34, y: y + 133 + i * 31 }, { x: x + w * 0.5, y: y + 146 + i * 31, leftX: x + w * 0.35, leftY: y + 123 + i * 31, rightX: x + w * 0.65, rightY: y + 167 + i * 31 }, { x: x + w - 38, y: y + 135 + i * 31 }], { fill: null, stroke: "#9A3412", strokeWidth: 1.5, opacity: 52, dashArray: [4, 5] }, 18)));
  target.push(text(`${prefix}.acid-label`, x + 27, y + 4, "acid at exposed surface", 14, { fill: "#9A3412", stroke: null }, 70));
  target.push(text(`${prefix}.gradient-label`, x + 27, y + h - 25, "qualitative conversion gradient", 13, { fill: "#7C2D12", stroke: null }, 70));
  return ids;
}

function drawInterphaseStage(target: VectorElement[], x: number, y: number, w: number, h: number, interphaseId: string, surfaceId: string, detailLevel: number): { interphase: string[]; surface: string[] } {
  const interphase: string[] = [];
  const surface: string[] = [];
  const filmTop = y + 43;
  const filmHeight = h * 0.39;
  interphase.push(add(target, rect(`${interphaseId}.assembly-shadow`, x + 31, filmTop + 6, w - 54, h * 0.73, { fill: "#134E4A", stroke: null, opacity: 8 }, 8)));
  interphase.push(add(target, rect(`${interphaseId}.film`, x + 25, filmTop, w - 54, filmHeight, { fillPaint: "persistent-film-field", stroke: "#0F766E", strokeWidth: 2 }, 10)));
  interphase.push(...drawPolymerNetwork(target, interphaseId, x + 40, filmTop + 20, w - 84, filmHeight - 36, "diol", detailLevel));
  const zoneY = filmTop + filmHeight;
  interphase.push(add(target, rect(`${interphaseId}.zone`, x + 25, zoneY, w - 54, h * 0.19, { fillPaint: "interphase-field", stroke: "#0F766E", strokeWidth: 1.5, opacity: 72 }, 20)));
  surface.push(add(target, rect(`${surfaceId}.slab`, x + 25, zoneY + h * 0.19, w - 54, h * 0.19, { fillPaint: "silica-field", stroke: "#334155", strokeWidth: 2 }, 10)));
  const step = (w - 84) / 5;
  for (let i = 0; i < 6; i += 1) {
    const sx = x + 42 + step * i;
    surface.push(add(target, polygon(`${surfaceId}.siloxane-${i + 1}`, hexagon(sx, zoneY + h * 0.19 + 31, 15), { fill: "#FFFFFF", stroke: "#64748B", strokeWidth: 1.5 }, 24)));
    surface.push(add(target, line(`${surfaceId}.silanol-bond-${i + 1}`, sx, zoneY + h * 0.19, sx, zoneY + h * 0.19 - 17, { fill: null, stroke: "#334155", strokeWidth: 1.5 }, 28)));
    target.push(text(`${surfaceId}.silanol-${i + 1}`, sx - 9, zoneY + h * 0.19 - 37, "OH", 12, { fill: "#115E59", stroke: null }, 70));
    interphase.push(add(target, line(`${interphaseId}.association-${i + 1}`, sx, zoneY + 29, sx, zoneY + h * 0.19 - 20, { fill: null, stroke: "#6D28D9", strokeWidth: 2, dashArray: [5, 5] }, 27)));
  }
  target.push(text(`${interphaseId}.zone-label`, x + 34, zoneY + 5, "diol-rich interphase", 12, { fill: "#134E4A", stroke: null }, 70));
  target.push(text(`${surfaceId}.surface-label`, x + 27, y + h - 25, "hydroxylated silica (Si–OH)", 13, { fill: "#334155", stroke: null }, 70));
  target.push(text(`${interphaseId}.persistence-label`, x + 27, y + 4, "after neutralization", 14, { fill: "#0F766E", stroke: null }, 70));
  return { interphase, surface };
}

function drawPolymerNetwork(target: VectorElement[], prefix: string, x: number, y: number, w: number, h: number, state: "protected" | "gradient" | "diol", detailLevel: number): string[] {
  const ids: string[] = [];
  const color = state === "protected" ? "#1D4ED8" : state === "diol" ? "#0F766E" : "#7C3AED";
  const rows = 3 + detailLevel;
  for (let row = 0; row < rows; row += 1) {
    const yy = y + h * (0.08 + row * (0.84 / Math.max(1, rows - 1)));
    const points: PathPoint[] = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f, i) => ({ x: x + w * f, y: yy + ((i + row) % 2 ? 13 : -9), pointType: "smooth" as const, ...(i ? { leftX: x + w * (f - 0.07), leftY: yy } : {}), ...(i < 5 ? { rightX: x + w * (f + 0.07), rightY: yy } : {}) }));
    ids.push(add(target, path(`${prefix}.chain-${row + 1}`, points, { fill: null, stroke: color, strokeWidth: 3, lineCap: "round" }, 22)));
  }
  // Functional groups are explanatory anchors, not a literal repeat count. Keep
  // enough examples to communicate chemistry without turning atom labels into a
  // dense text texture at manuscript scale.
  const siteColumns = 2 + Math.min(detailLevel, 1);
  const siteCount = siteColumns * 2;
  for (let i = 0; i < siteCount; i += 1) {
    const cx = x + w * (0.08 + (i % siteColumns) * (0.84 / Math.max(1, siteColumns - 1)));
    const cy = y + h * (0.26 + Math.floor(i / siteColumns) * 0.48);
    const converted = state === "diol" || (state === "gradient" && i < Math.ceil(siteCount * 0.62));
    if (converted) {
      ids.push(add(target, line(`${prefix}.diol-stem-${i + 1}`, cx, cy, cx, cy - 11, { fill: null, stroke: "#115E59", strokeWidth: 1.7 }, 26)));
      ids.push(add(target, line(`${prefix}.diol-carbon-bond-${i + 1}`, cx - 7, cy - 12, cx + 7, cy - 12, { fill: null, stroke: "#115E59", strokeWidth: 1.8 }, 26)));
      ids.push(add(target, line(`${prefix}.diol-oh-bond-a-${i + 1}`, cx - 5, cy - 13, cx - 12, cy - 23, { fill: null, stroke: "#115E59", strokeWidth: 1.6 }, 26)));
      ids.push(add(target, line(`${prefix}.diol-oh-bond-b-${i + 1}`, cx + 5, cy - 13, cx + 12, cy - 23, { fill: null, stroke: "#115E59", strokeWidth: 1.6 }, 26)));
      ids.push(add(target, text(`${prefix}.diol-a-${i + 1}`, cx - 32, cy - 38, "HO", 9, { fill: "#0F766E", stroke: null }, 27)));
      ids.push(add(target, text(`${prefix}.diol-b-${i + 1}`, cx + 14, cy - 38, "OH", 9, { fill: "#0F766E", stroke: null }, 27)));
    } else {
      ids.push(...drawProtectedAcetal(target, prefix, cx, cy, i + 1));
    }
  }
  return ids;
}

function drawProtectedAcetal(target: VectorElement[], prefix: string, cx: number, attachmentY: number, index: number): string[] {
  const ids: string[] = [];
  const points = regularPolygon(cx, attachmentY - 17, 14, 5, -Math.PI / 2);
  const [top, oxygenRight, lowerRight, lowerLeft, oxygenLeft] = points;
  const style = { fill: null, stroke: "#92400E", strokeWidth: 1.8, lineCap: "round" as const };
  const toward = (from: { x: number; y: number }, to: { x: number; y: number }, fraction: number) => ({ x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction });
  const segments = [
    [top!, toward(top!, oxygenRight!, 0.62)], [toward(oxygenRight!, lowerRight!, 0.38), lowerRight!],
    [lowerRight!, lowerLeft!], [lowerLeft!, toward(lowerLeft!, oxygenLeft!, 0.62)], [toward(oxygenLeft!, top!, 0.38), top!]
  ] as const;
  ids.push(add(target, line(`${prefix}.protected-attachment-${index}`, cx, attachmentY, cx, (lowerLeft!.y + lowerRight!.y) / 2, style, 26)));
  segments.forEach(([start, end], segment) => ids.push(add(target, line(`${prefix}.protected-ring-bond-${index}-${segment + 1}`, start.x, start.y, end.x, end.y, style, 27))));
  ids.push(add(target, text(`${prefix}.protected-oxygen-a-${index}`, oxygenLeft!.x - 4.5, oxygenLeft!.y - 5, "O", 8, { fill: "#9A3412", stroke: null }, 28)));
  ids.push(add(target, text(`${prefix}.protected-oxygen-b-${index}`, oxygenRight!.x - 4.5, oxygenRight!.y - 5, "O", 8, { fill: "#9A3412", stroke: null }, 28)));
  return ids;
}

function drawTransition(target: VectorElement[], id: string, x: number, y: number, width: number, label?: string): string[] {
  const ids = [add(target, line(`${id}.program-arrow`, x, y, x + width, y, { fill: null, stroke: "#6D28D9", strokeWidth: 4, lineCap: "round" }, 60)), add(target, polygon(`${id}.program-arrowhead`, [{ x: x + width, y }, { x: x + width - 11, y: y - 7 }, { x: x + width - 11, y: y + 7 }], { fill: "#6D28D9", stroke: null }, 61))];
  if (label) target.push(text(`${id}.program-label`, x - 3, y - 30, label, 14, { fill: "#4C1D95", stroke: null }, 70));
  return ids;
}

function scientificObject(item: BriefComponent, elementIds: string[], operator: string): ScientificObject { return { id: item.id, kind: item.kind ?? item.type, label: item.label, elementIds, properties: { compiler: "figure_program_v1", depictionOperator: operator, emphasis: item.emphasis ?? "primary" } }; }
function findBestRole(items: BriefComponent[], terms: string[]): BriefComponent | undefined {
  return items.map((item, index) => {
    const values = tokens(`${item.type} ${item.kind ?? ""} ${item.label}`);
    const matches = terms.flatMap((term, priority) => values.has(term) ? [{ priority }] : []);
    const score = matches.reduce((sum, match) => sum + terms.length - match.priority, 0);
    return { item, index, score };
  }).filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score || left.index - right.index)[0]?.item;
}
function materialStage(item: BriefComponent): 0 | 1 | 2 {
  const values = tokens(`${item.id} ${item.type} ${item.kind ?? ""} ${item.label}`);
  if (hasAny(values, ["neutralization", "neutralized", "interphase", "interface", "silica", "surface", "silanol", "hydroxylated", "contact", "post"])) return 2;
  if (hasAny(values, ["acid", "stimulus", "exposed", "penetration", "diffusion", "gradient", "conversion", "deprotection", "converted", "treated", "diol", "transformation", "process"])) return 1;
  return 0;
}
function relationshipStageVisuals(item: BriefRelationship, stage: number, stageVisuals: string[][], interphaseVisuals: string[]): string[] {
  if (stage === 2 && hasAny(tokens(`${item.type} ${item.label ?? ""}`), ["associates", "association", "binds", "contact"])) {
    const association = interphaseVisuals.filter((id) => id.includes(".association-"));
    if (association.length) return association;
  }
  const preferred = stageVisuals[stage]!.filter((id) => stage === 1 ? /flux|diffusion|film|chain|diol/.test(id) : stage === 2 ? /zone|silanol|siloxane|association/.test(id) : /film|chain|lamella|protected/.test(id));
  return (preferred.length ? preferred : stageVisuals[stage]!).slice(0, 12);
}
function findTokenRole(items: BriefComponent[], expected: string[]): BriefComponent | undefined { return items.find((item) => hasAny(tokens(`${item.type} ${item.kind ?? ""} ${item.label}`), expected)); }
function component(input: unknown): BriefComponent { const v = asRecord(input); return { id: string(v.id, "component"), type: string(v.type, "generic"), ...(typeof v.kind === "string" ? { kind: v.kind } : {}), label: string(v.label, "component"), ...(typeof v.emphasis === "string" ? { emphasis: v.emphasis } : {}) }; }
function relationship(input: unknown): BriefRelationship { const v = asRecord(input); return { id: string(v.id, "relationship"), sourceId: string(v.sourceId, "source"), targetId: string(v.targetId, "target"), type: string(v.type, "relates_to"), ...(typeof v.label === "string" && v.label ? { label: v.label } : {}) }; }
function gradient(id: string, from: string, to: string) { return { id, type: "linear_gradient" as const, x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: from }, { offset: 100, color: to }] }; }
function add(target: VectorElement[], element: VectorElement): string { target.push(element); return element.id!; }
function rect(id: string, x: number, y: number, width: number, height: number, style: VectorStyle, zIndex: number): VectorElement { return { id, name: id, type: "rect", x, y, width, height, style, zIndex }; }
function circle(id: string, cx: number, cy: number, diameter: number, style: VectorStyle, zIndex: number): VectorElement { return { id, name: id, type: "ellipse", x: cx - diameter / 2, y: cy - diameter / 2, width: diameter, height: diameter, style, zIndex }; }
function line(id: string, x: number, y: number, x2: number, y2: number, style: VectorStyle, zIndex: number): VectorElement { return { id, name: id, type: "line", x, y, x2, y2, style, zIndex }; }
function polygon(id: string, points: Array<{ x: number; y: number }>, style: VectorStyle, zIndex: number): VectorElement { return { id, name: id, type: "polygon", x: 0, y: 0, points, style, zIndex }; }
function path(id: string, points: PathPoint[], style: VectorStyle, zIndex: number): VectorElement { return { id, name: id, type: "path", x: 0, y: 0, points, closed: false, style, zIndex }; }
function text(id: string, x: number, y: number, value: string, size: number, style: VectorStyle, zIndex: number): VectorElement { return { id, name: id, type: "text", x, y, text: value, size, font: "Arial", style, zIndex }; }
function droplet(id: string, cx: number, cy: number, size: number, style: VectorStyle, zIndex: number): VectorElement { return path(id, [{ x: cx, y: cy - size }, { x: cx + size * 0.68, y: cy + size * 0.25, leftX: cx + size * 0.7, leftY: cy - size * 0.3 }, { x: cx, y: cy + size * 0.65, leftX: cx + size * 0.42, leftY: cy + size * 0.72, rightX: cx - size * 0.42, rightY: cy + size * 0.72 }, { x: cx - size * 0.68, y: cy + size * 0.25, rightX: cx - size * 0.7, rightY: cy - size * 0.3 }], style, zIndex); }
function hexagon(cx: number, cy: number, r: number): Array<{ x: number; y: number }> { return Array.from({ length: 6 }, (_, i) => ({ x: cx + Math.cos(Math.PI / 3 * i) * r, y: cy + Math.sin(Math.PI / 3 * i) * r })); }
function regularPolygon(cx: number, cy: number, r: number, sides: number, rotation = 0): Array<{ x: number; y: number }> { return Array.from({ length: sides }, (_, i) => ({ x: cx + Math.cos(rotation + Math.PI * 2 * i / sides) * r, y: cy + Math.sin(rotation + Math.PI * 2 * i / sides) * r })); }

/** Apply bounded, reversible rendering mutations to the semantic vector program. */
function applyFigureProgram(input: VectorScene, program: FigureProgramParameters): VectorScene {
  const scene = structuredClone(input);
  const palette = colorwayMap(program.colorway);
  for (const element of scene.elements) {
    if (!element.style) continue;
    const style = { ...element.style };
    if (typeof style.strokeWidth === "number" && style.strokeWidth > 0) style.strokeWidth = Number(Math.max(0.75, style.strokeWidth * program.strokeScale).toFixed(3));
    if (typeof style.fill === "string") style.fill = palette.get(style.fill.toUpperCase()) ?? style.fill;
    if (typeof style.stroke === "string") style.stroke = palette.get(style.stroke.toUpperCase()) ?? style.stroke;
    if (element.id?.includes("shadow") && typeof style.opacity === "number") style.opacity = Math.max(3, Math.min(18, Math.round(style.opacity * program.depthScale)));
    element.style = style;
  }
  for (const paint of scene.paints ?? []) for (const stop of paint.stops) {
    const mapped = palette.get(stop.color.toUpperCase()) ?? stop.color;
    stop.color = adjustGradientDepth(mapped, stop.offset, program.depthScale);
  }
  return normalizeScene(scene);
}

function colorwayMap(colorway: FigureColorway): Map<string, string> {
  if (colorway === "cool") return new Map([
    ["#F97316", "#DB2777"], ["#EA580C", "#BE185D"], ["#C2410C", "#9D174D"], ["#9A3412", "#831843"], ["#FFEDD5", "#FCE7F3"], ["#FFF0E1", "#FDF2F8"], ["#FFF9F2", "#FFF7FB"]
  ]);
  if (colorway === "earth") return new Map([
    ["#2563EB", "#4F46E5"], ["#1D4ED8", "#4338CA"], ["#DBEAFE", "#E0E7FF"], ["#F97316", "#D97706"], ["#EA580C", "#B45309"], ["#C2410C", "#92400E"], ["#14B8A6", "#10B981"], ["#0F766E", "#047857"], ["#CCFBF1", "#D1FAE5"]
  ]);
  return new Map();
}

function scenePalette(scene: VectorScene): string[] {
  const colors = new Set<string>();
  for (const element of scene.elements) for (const value of [element.style?.fill, element.style?.stroke]) if (typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value)) colors.add(value.toUpperCase());
  for (const paint of scene.paints ?? []) for (const stop of paint.stops) if (/^#[0-9A-F]{6}$/i.test(stop.color)) colors.add(stop.color.toUpperCase());
  return [...colors].sort();
}

function sceneStrokeWidths(scene: VectorScene): number[] { return scene.elements.flatMap((element) => typeof element.style?.strokeWidth === "number" && element.style.strokeWidth > 0 ? [element.style.strokeWidth] : []); }
function median(values: number[]): number { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function paletteOverlap(candidate: string[], approved: string[]): number {
  if (!candidate.length || !approved.length) return 0;
  const rgb = (value: string) => [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const usable = candidate.filter((value) => /^#[0-9A-F]{6}$/i.test(value)).map(rgb);
  const expected = approved.filter((value) => /^#[0-9A-F]{6}$/i.test(value)).map(rgb);
  if (!usable.length || !expected.length) return 0;
  const maximumDistance = Math.sqrt(3 * 255 * 255);
  return expected.reduce((sum, target) => {
    const nearest = Math.min(...usable.map((color) => Math.hypot(color[0]! - target[0]!, color[1]! - target[1]!, color[2]! - target[2]!)));
    return sum + Math.max(0, 1 - nearest / maximumDistance) ** 4;
  }, 0) / expected.length;
}
function adjustGradientDepth(color: string, offset: number, scale: number): string {
  if (!/^#[0-9A-F]{6}$/i.test(color) || scale === 1) return color;
  const amount = Math.min(0.14, Math.abs(scale - 1) * 0.45) * (offset <= 50 ? 1 : 0.55);
  return blendHex(color, scale < 1 ? "#FFFFFF" : "#0F172A", amount);
}
function blendHex(left: string, right: string, amount: number): string {
  const channels = (value: string) => [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const a = channels(left), b = channels(right);
  return `#${a.map((value, index) => Math.round(value + (b[index]! - value) * amount).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown, fallback: string): string { return typeof value === "string" && value.trim() ? value : fallback; }
function number(value: unknown, fallback: number): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
