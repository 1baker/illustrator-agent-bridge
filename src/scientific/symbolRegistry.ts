import { styleFor, vectorStyle, type ScientificTheme } from "../core/scientificTheme.js";
import type { PathPoint, VectorElement, VectorStyle } from "../core/vectorScene.js";

export type ScientificSymbolRecipeId =
  | "generic" | "cell" | "nucleus" | "receptor" | "molecule" | "protein" | "process"
  | "dna" | "rna" | "membrane" | "organelle" | "particle" | "apparatus"
  | "material" | "transformation" | "interface" | "surface" | "stimulus" | "inset";
export type SymbolShape = "rect" | "ellipse";
export type SymbolRole = "primary_object" | "secondary_object" | "compartment";

export interface SymbolRecipeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SymbolRecipeRequest {
  objectId: string;
  kind: string;
  box: SymbolRecipeBox;
  shape: SymbolShape;
  role: SymbolRole;
  recipe?: ScientificSymbolRecipeId;
  theme: ScientificTheme;
  zIndex?: number;
}

export interface RenderedScientificSymbol {
  recipeId: ScientificSymbolRecipeId;
  mainElementId: string;
  elements: VectorElement[];
}

type Recipe = (request: SymbolRecipeRequest) => RenderedScientificSymbol;

const RECIPES: Record<ScientificSymbolRecipeId, Recipe> = {
  generic: renderGeneric,
  cell: renderCell,
  nucleus: renderNucleus,
  receptor: renderReceptor,
  molecule: renderMolecule,
  protein: renderProtein,
  process: renderProcess,
  dna: renderDna,
  rna: renderRna,
  membrane: renderMembrane,
  organelle: renderOrganelle,
  particle: renderParticle,
  apparatus: renderApparatus,
  material: renderMaterial,
  transformation: renderTransformation,
  interface: renderInterface,
  surface: renderSurface,
  stimulus: renderStimulus,
  inset: renderInset
};

/** Select and expand a semantic scientific object into reusable vector parts. */
export function renderScientificSymbol(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const recipeId = request.recipe ?? inferScientificSymbolRecipe(request.kind);
  return RECIPES[recipeId](request);
}

export function inferScientificSymbolRecipe(kind: string): ScientificSymbolRecipeId {
  const terms = kind.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (hasAnyTerm(terms, "receptor", "channel", "transporter")) return "receptor";
  if (hasAnyTerm(terms, "nucleus", "nuclear")) return "nucleus";
  if (hasAnyTerm(terms, "dna", "chromosome", "plasmid")) return "dna";
  if (hasAnyTerm(terms, "rna", "mrna", "trna")) return "rna";
  if (hasAnyTerm(terms, "membrane", "bilayer")) return "membrane";
  if (hasAnyTerm(terms, "organelle", "mitochondrion", "mitochondria", "chloroplast")) return "organelle";
  if (hasAnyTerm(terms, "particle", "nanoparticle", "colloid")) return "particle";
  if (hasAnyTerm(terms, "apparatus", "flask", "beaker", "reactor", "instrument")) return "apparatus";
  if (hasAnyTerm(terms, "film", "polymer", "material", "matrix", "coating")) return "material";
  if (hasAnyTerm(terms, "gradient", "conversion", "deprotection", "transformation")) return "transformation";
  if (hasAnyTerm(terms, "interface", "interphase", "boundary")) return "interface";
  if (hasAnyTerm(terms, "surface", "substrate", "silica", "mineral")) return "surface";
  if (hasAnyTerm(terms, "stimulus", "acid", "light", "heat", "trigger")) return "stimulus";
  if (hasAnyTerm(terms, "inset", "zoom", "detail")) return "inset";
  if (hasAnyTerm(terms, "cell", "bacterium", "vesicle")) return "cell";
  if (hasAnyTerm(terms, "molecule", "ligand", "atom", "ion", "metabolite")) return "molecule";
  if (hasAnyTerm(terms, "protein", "enzyme", "kinase", "antibody")) return "protein";
  if (hasAnyTerm(terms, "process", "reaction", "expression", "transcription", "translation")) return "process";
  return "generic";
}

function hasAnyTerm(terms: string[], ...candidates: string[]): boolean {
  return candidates.some((candidate) => terms.includes(candidate));
}

function renderGeneric(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const id = `${request.objectId}.body`;
  const style = vectorStyle(styleFor(request.theme, request.role));
  const element = request.shape === "ellipse"
    ? ellipse(id, request.box, style, z(request))
    : rect(id, request.box, style, z(request));
  return { recipeId: "generic", mainElementId: id, elements: [element] };
}

function renderCell(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const membraneId = `${request.objectId}.membrane`;
  const bodyStyle = vectorStyle(styleFor(request.theme, request.role));
  const membraneToken = styleFor(request.theme, "compartment");
  const membraneStyle: VectorStyle = { fill: null, stroke: membraneToken.stroke, strokeWidth: membraneToken.strokeWidth };
  const inset = Math.max(5, Math.min(request.box.width, request.box.height) * 0.055);
  return {
    recipeId: "cell",
    mainElementId: bodyId,
    elements: [
      ellipse(bodyId, request.box, bodyStyle, z(request)),
      ellipse(membraneId, insetBox(request.box, inset), membraneStyle, z(request) + 1)
    ]
  };
}

function renderNucleus(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const bodyStyle = vectorStyle(styleFor(request.theme, request.role));
  const chromatin = styleFor(request.theme, "secondary_object");
  const stroke: VectorStyle = { fill: null, stroke: chromatin.stroke, strokeWidth: Math.max(2, (chromatin.strokeWidth ?? 4) * 0.65), opacity: 72 };
  const { x, y, width: w, height: h } = request.box;
  return {
    recipeId: "nucleus",
    mainElementId: bodyId,
    elements: [
      ellipse(bodyId, request.box, bodyStyle, z(request)),
      curve(`${request.objectId}.chromatin-1`, [
        { x: x + w * 0.22, y: y + h * 0.38, rightX: x + w * 0.38, rightY: y + h * 0.16 },
        { x: x + w * 0.55, y: y + h * 0.42, leftX: x + w * 0.43, leftY: y + h * 0.6, rightX: x + w * 0.7, rightY: y + h * 0.23 },
        { x: x + w * 0.8, y: y + h * 0.36, leftX: x + w * 0.7, leftY: y + h * 0.5 }
      ], stroke, z(request) + 1),
      curve(`${request.objectId}.chromatin-2`, [
        { x: x + w * 0.25, y: y + h * 0.63, rightX: x + w * 0.4, rightY: y + h * 0.45 },
        { x: x + w * 0.76, y: y + h * 0.66, leftX: x + w * 0.58, leftY: y + h * 0.83 }
      ], stroke, z(request) + 1)
    ]
  };
}

function renderReceptor(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const stemId = `${request.objectId}.stem`;
  const membraneId = `${request.objectId}.membrane-segment`;
  const token = styleFor(request.theme, request.role);
  const stroke: VectorStyle = { fill: null, stroke: token.stroke, strokeWidth: Math.max(5, token.strokeWidth ?? 4) };
  const { x, y, width: w, height: h } = request.box;
  return {
    recipeId: "receptor",
    mainElementId: bodyId,
    elements: [
      line(membraneId, x + w * 0.08, y + h * 0.78, x + w * 0.92, y + h * 0.78, { ...stroke, strokeWidth: 3, opacity: 70 }, z(request)),
      line(stemId, x + w * 0.5, y + h * 0.78, x + w * 0.5, y + h * 0.44, stroke, z(request) + 1),
      {
        id: bodyId,
        type: "path",
        name: bodyId,
        x: 0,
        y: 0,
        points: [
          { x: x + w * 0.18, y: y + h * 0.18 },
          { x: x + w * 0.5, y: y + h * 0.44 },
          { x: x + w * 0.82, y: y + h * 0.18 }
        ],
        closed: false,
        style: stroke,
        zIndex: z(request) + 2
      }
    ]
  };
}

function renderMolecule(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const leftId = `${request.objectId}.atom-left`;
  const rightId = `${request.objectId}.atom-right`;
  const primary = vectorStyle(styleFor(request.theme, request.role));
  const secondary = vectorStyle(styleFor(request.theme, "secondary_object"));
  const border = styleFor(request.theme, request.role);
  const { x, y, width: w, height: h } = request.box;
  const diameter = Math.max(12, Math.min(w, h) * 0.36);
  const cy = y + h / 2;
  const centers = [x + w * 0.22, x + w * 0.5, x + w * 0.78];
  return {
    recipeId: "molecule",
    mainElementId: bodyId,
    elements: [
      line(`${request.objectId}.bond-left`, centers[0]!, cy, centers[1]!, cy, { fill: null, stroke: border.stroke, strokeWidth: 4 }, z(request)),
      line(`${request.objectId}.bond-right`, centers[1]!, cy, centers[2]!, cy, { fill: null, stroke: border.stroke, strokeWidth: 4 }, z(request)),
      circle(leftId, centers[0]!, cy, diameter, secondary, z(request) + 1),
      circle(bodyId, centers[1]!, cy, diameter * 1.08, primary, z(request) + 2),
      circle(rightId, centers[2]!, cy, diameter, secondary, z(request) + 1)
    ]
  };
}

function renderProtein(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const { x, y, width: w, height: h } = request.box;
  const points: PathPoint[] = [
    { x: x + w * 0.5, y: y + h * 0.08, leftX: x + w * 0.32, leftY: y + h * 0.05, rightX: x + w * 0.72, rightY: y + h * 0.1, pointType: "smooth" },
    { x: x + w * 0.9, y: y + h * 0.34, leftX: x + w * 0.82, leftY: y + h * 0.18, rightX: x + w * 0.96, rightY: y + h * 0.52, pointType: "smooth" },
    { x: x + w * 0.72, y: y + h * 0.88, leftX: x + w * 0.9, leftY: y + h * 0.72, rightX: x + w * 0.55, rightY: y + h * 0.97, pointType: "smooth" },
    { x: x + w * 0.25, y: y + h * 0.82, leftX: x + w * 0.42, leftY: y + h * 0.94, rightX: x + w * 0.08, rightY: y + h * 0.66, pointType: "smooth" },
    { x: x + w * 0.13, y: y + h * 0.32, leftX: x + w * 0.06, leftY: y + h * 0.51, rightX: x + w * 0.27, rightY: y + h * 0.12, pointType: "smooth" }
  ];
  return {
    recipeId: "protein",
    mainElementId: bodyId,
    elements: [{ id: bodyId, type: "path", name: bodyId, x: 0, y: 0, points, closed: true, style: vectorStyle(styleFor(request.theme, request.role)), zIndex: z(request) }]
  };
}

function renderProcess(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const { x, y, width: w, height: h } = request.box;
  return {
    recipeId: "process",
    mainElementId: bodyId,
    elements: [{
      id: bodyId,
      type: "polygon",
      name: bodyId,
      x: 0,
      y: 0,
      points: [
        { x: x + w * 0.16, y }, { x: x + w * 0.84, y }, { x: x + w, y: y + h / 2 },
        { x: x + w * 0.84, y: y + h }, { x: x + w * 0.16, y: y + h }, { x, y: y + h / 2 }
      ],
      style: vectorStyle(styleFor(request.theme, request.role)),
      zIndex: z(request)
    }]
  };
}

function renderDna(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.strand-a`;
  const token = styleFor(request.theme, request.role);
  const secondary = styleFor(request.theme, "secondary_object");
  const primaryStroke: VectorStyle = { fill: null, stroke: token.stroke, strokeWidth: Math.max(4, token.strokeWidth ?? 4) };
  const secondaryStroke: VectorStyle = { fill: null, stroke: secondary.stroke, strokeWidth: Math.max(4, secondary.strokeWidth ?? 4) };
  const rungStyle: VectorStyle = { fill: null, stroke: "#64748B", strokeWidth: 2, opacity: 82 };
  const { x, y, width: w, height: h } = request.box;
  const fractions = [0.1, 0.3, 0.5, 0.7, 0.9];
  const strandA = [0.28, 0.72, 0.28, 0.72, 0.28];
  const strandB = strandA.map((value) => 1 - value);
  return {
    recipeId: "dna",
    mainElementId: bodyId,
    elements: [
      curve(bodyId, wavePoints(x, y, w, h, fractions, strandA), primaryStroke, z(request) + 1),
      curve(`${request.objectId}.strand-b`, wavePoints(x, y, w, h, fractions, strandB), secondaryStroke, z(request) + 1),
      ...fractions.map((fraction, index) => line(`${request.objectId}.base-pair-${index + 1}`, x + w * fraction, y + h * strandA[index]!, x + w * fraction, y + h * strandB[index]!, rungStyle, z(request)))
    ]
  };
}

function renderRna(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.strand`;
  const token = styleFor(request.theme, request.role);
  const strandStyle: VectorStyle = { fill: null, stroke: token.stroke, strokeWidth: Math.max(4, token.strokeWidth ?? 4) };
  const nucleotideStyle = vectorStyle(styleFor(request.theme, "secondary_object"));
  const { x, y, width: w, height: h } = request.box;
  const fractions = [0.08, 0.28, 0.5, 0.72, 0.92];
  const heights = [0.32, 0.68, 0.38, 0.72, 0.3];
  const diameter = Math.max(8, Math.min(14, h * 0.14));
  return {
    recipeId: "rna",
    mainElementId: bodyId,
    elements: [
      curve(bodyId, wavePoints(x, y, w, h, fractions, heights), strandStyle, z(request)),
      ...fractions.map((fraction, index) => circle(`${request.objectId}.nucleotide-${index + 1}`, x + w * fraction, y + h * heights[index]!, diameter, nucleotideStyle, z(request) + 1))
    ]
  };
}

function renderMembrane(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const token = styleFor(request.theme, request.role);
  const secondary = styleFor(request.theme, "secondary_object");
  const { x, y, width: w, height: h } = request.box;
  const headDiameter = Math.max(9, Math.min(16, h * 0.16));
  const count = 7;
  const topY = y + h * 0.27;
  const bottomY = y + h * 0.73;
  const elements: VectorElement[] = [rect(bodyId, { x: x + w * 0.04, y: y + h * 0.22, width: w * 0.92, height: h * 0.56 }, { fill: token.fill, stroke: token.stroke, strokeWidth: 2, opacity: 34 }, z(request))];
  for (let index = 0; index < count; index += 1) {
    const cx = x + w * (0.1 + index * (0.8 / (count - 1)));
    elements.push(line(`${request.objectId}.top-tail-${index + 1}`, cx, topY + headDiameter / 2, cx, y + h * 0.49, { fill: null, stroke: secondary.stroke, strokeWidth: 2 }, z(request) + 1));
    elements.push(line(`${request.objectId}.bottom-tail-${index + 1}`, cx, bottomY - headDiameter / 2, cx, y + h * 0.51, { fill: null, stroke: secondary.stroke, strokeWidth: 2 }, z(request) + 1));
    elements.push(circle(`${request.objectId}.top-head-${index + 1}`, cx, topY, headDiameter, vectorStyle(secondary), z(request) + 2));
    elements.push(circle(`${request.objectId}.bottom-head-${index + 1}`, cx, bottomY, headDiameter, vectorStyle(secondary), z(request) + 2));
  }
  return { recipeId: "membrane", mainElementId: bodyId, elements };
}

function renderOrganelle(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const bodyStyle = vectorStyle(styleFor(request.theme, request.role));
  const innerToken = styleFor(request.theme, "secondary_object");
  const innerStyle: VectorStyle = { fill: null, stroke: innerToken.stroke, strokeWidth: 3 };
  const { x, y, width: w, height: h } = request.box;
  return {
    recipeId: "organelle",
    mainElementId: bodyId,
    elements: [
      ellipse(bodyId, request.box, bodyStyle, z(request)),
      ellipse(`${request.objectId}.inner-membrane`, { x: x + w * 0.08, y: y + h * 0.12, width: w * 0.84, height: h * 0.76 }, innerStyle, z(request) + 1),
      ...[0.34, 0.5, 0.66].map((fraction, index) => curve(`${request.objectId}.fold-${index + 1}`, [
        { x: x + w * 0.2, y: y + h * fraction, rightX: x + w * 0.34, rightY: y + h * (fraction - 0.18) },
        { x: x + w * 0.52, y: y + h * fraction, leftX: x + w * 0.4, leftY: y + h * (fraction + 0.18), rightX: x + w * 0.64, rightY: y + h * (fraction - 0.18) },
        { x: x + w * 0.8, y: y + h * fraction, leftX: x + w * 0.68, leftY: y + h * (fraction + 0.18) }
      ], innerStyle, z(request) + 2))
    ]
  };
}

function renderParticle(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const bodyStyle = vectorStyle(styleFor(request.theme, request.role));
  const coreStyle = vectorStyle(styleFor(request.theme, "secondary_object"));
  const { x, y, width: w, height: h } = request.box;
  const diameter = Math.min(w, h) * 0.15;
  const centers = [[0.5, 0.1], [0.88, 0.5], [0.5, 0.9], [0.12, 0.5]];
  return {
    recipeId: "particle",
    mainElementId: bodyId,
    elements: [
      ellipse(bodyId, request.box, bodyStyle, z(request)),
      ellipse(`${request.objectId}.core`, { x: x + w * 0.27, y: y + h * 0.27, width: w * 0.46, height: h * 0.46 }, coreStyle, z(request) + 1),
      ...centers.map(([cx, cy], index) => circle(`${request.objectId}.surface-site-${index + 1}`, x + w * cx!, y + h * cy!, diameter, coreStyle, z(request) + 2))
    ]
  };
}

function renderApparatus(request: SymbolRecipeRequest): RenderedScientificSymbol {
  const bodyId = `${request.objectId}.body`;
  const bodyStyle = vectorStyle(styleFor(request.theme, request.role));
  const liquidStyle = vectorStyle(styleFor(request.theme, "primary_object"));
  const { x, y, width: w, height: h } = request.box;
  return {
    recipeId: "apparatus",
    mainElementId: bodyId,
    elements: [
      {
        id: bodyId, type: "path", name: bodyId, x: 0, y: 0, closed: true, zIndex: z(request), style: bodyStyle,
        points: [
          { x: x + w * 0.38, y: y + h * 0.08 }, { x: x + w * 0.62, y: y + h * 0.08 },
          { x: x + w * 0.62, y: y + h * 0.35 }, { x: x + w * 0.88, y: y + h * 0.87 },
          { x: x + w * 0.82, y: y + h * 0.94 }, { x: x + w * 0.18, y: y + h * 0.94 },
          { x: x + w * 0.12, y: y + h * 0.87 }, { x: x + w * 0.38, y: y + h * 0.35 }
        ]
      },
      {
        id: `${request.objectId}.liquid`, type: "polygon", name: `${request.objectId}.liquid`, x: 0, y: 0, zIndex: z(request) + 1, style: liquidStyle,
        points: [
          { x: x + w * 0.24, y: y + h * 0.7 }, { x: x + w * 0.76, y: y + h * 0.7 },
          { x: x + w * 0.86, y: y + h * 0.88 }, { x: x + w * 0.8, y: y + h * 0.91 },
          { x: x + w * 0.2, y: y + h * 0.91 }, { x: x + w * 0.14, y: y + h * 0.88 }
        ]
      },
      line(`${request.objectId}.rim`, x + w * 0.36, y + h * 0.08, x + w * 0.64, y + h * 0.08, { fill: null, stroke: bodyStyle.stroke, strokeWidth: 5 }, z(request) + 2)
    ]
  };
}

function renderMaterial(request: SymbolRecipeRequest): RenderedScientificSymbol { return relabelRecipe(renderGeneric(request), "material"); }
function renderTransformation(request: SymbolRecipeRequest): RenderedScientificSymbol { return relabelRecipe(renderProcess(request), "transformation"); }
function renderInterface(request: SymbolRecipeRequest): RenderedScientificSymbol { return relabelRecipe(renderMembrane(request), "interface"); }
function renderSurface(request: SymbolRecipeRequest): RenderedScientificSymbol { return relabelRecipe(renderParticle(request), "surface"); }
function renderStimulus(request: SymbolRecipeRequest): RenderedScientificSymbol { return relabelRecipe(renderMolecule(request), "stimulus"); }
function renderInset(request: SymbolRecipeRequest): RenderedScientificSymbol { return relabelRecipe(renderCell(request), "inset"); }
function relabelRecipe(result: RenderedScientificSymbol, recipeId: ScientificSymbolRecipeId): RenderedScientificSymbol { return { ...result, recipeId }; }

function wavePoints(x: number, y: number, width: number, height: number, fractions: number[], heights: number[]): PathPoint[] {
  return fractions.map((fraction, index) => ({
    x: x + width * fraction,
    y: y + height * heights[index]!,
    ...(index === 0 ? {} : { leftX: x + width * (fraction - 0.07), leftY: y + height * heights[index]! }),
    ...(index === fractions.length - 1 ? {} : { rightX: x + width * (fraction + 0.07), rightY: y + height * heights[index]! }),
    pointType: "smooth"
  }));
}

function z(request: SymbolRecipeRequest): number { return request.zIndex ?? 20; }
function insetBox(box: SymbolRecipeBox, amount: number): SymbolRecipeBox { return { x: box.x + amount, y: box.y + amount, width: box.width - amount * 2, height: box.height - amount * 2 }; }
function rect(id: string, box: SymbolRecipeBox, style: VectorStyle, zIndex: number): VectorElement { return { id, type: "rect", name: id, ...box, style, zIndex }; }
function ellipse(id: string, box: SymbolRecipeBox, style: VectorStyle, zIndex: number): VectorElement { return { id, type: "ellipse", name: id, ...box, style, zIndex }; }
function circle(id: string, centerX: number, centerY: number, diameter: number, style: VectorStyle, zIndex: number): VectorElement { return ellipse(id, { x: centerX - diameter / 2, y: centerY - diameter / 2, width: diameter, height: diameter }, style, zIndex); }
function line(id: string, x: number, y: number, x2: number, y2: number, style: VectorStyle, zIndex: number): VectorElement { return { id, type: "line", name: id, x, y, x2, y2, style, zIndex }; }
function curve(id: string, points: PathPoint[], style: VectorStyle, zIndex: number): VectorElement { return { id, type: "path", name: id, x: 0, y: 0, points, closed: false, style, zIndex }; }
