/** Renderer-independent vector scene model used by the scientific generator. */
export interface VectorScene {
  document?: VectorDocument;
  elements: VectorElement[];
  groups?: VectorGroup[];
  paints?: VectorPaint[];
  semantics?: SceneSemantics;
}

export type VectorPaint = LinearGradientPaint | RadialGradientPaint;
export type GradientUnits = "object_bounding_box" | "user_space";
export type GradientSpread = "pad" | "reflect" | "repeat";

export interface GradientStop {
  offset: number;
  color: string;
  opacity?: number;
}

interface BaseGradientPaint {
  id: string;
  name?: string;
  units?: GradientUnits;
  spread?: GradientSpread;
  stops: GradientStop[];
  transform?: [number, number, number, number, number, number];
}

export interface LinearGradientPaint extends BaseGradientPaint {
  type: "linear_gradient";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RadialGradientPaint extends BaseGradientPaint {
  type: "radial_gradient";
  cx: number;
  cy: number;
  r: number;
  fx?: number;
  fy?: number;
}

export interface VectorDocument {
  title?: string;
  width?: number;
  height?: number;
  colorMode?: "RGB" | "CMYK";
}

export type VectorElement = RectElement | EllipseElement | TextElement | LineElement | PolygonElement | PathElement | CompoundPathElement;

export interface BaseElement {
  id?: string;
  name?: string;
  x: number;
  y: number;
  groupId?: string;
  zIndex?: number;
  visible?: boolean;
  style?: VectorStyle;
}

export interface VectorGroup {
  id: string;
  name?: string;
  parentId?: string;
  zIndex?: number;
  opacity?: number;
  visible?: boolean;
  clip?: VectorClip;
}

export type VectorClip = ClipRect | ClipEllipse | ClipPolygon | ClipPath;

export interface ClipRect {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClipEllipse {
  type: "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClipPolygon {
  type: "polygon";
  x: number;
  y: number;
  points: Point[];
}

export interface ClipPath {
  type: "path";
  x: number;
  y: number;
  points: PathPoint[];
  closed?: true;
}

export interface SceneSemantics {
  objects: ScientificObject[];
  relationships?: ScientificRelationship[];
}

export interface ScientificObject {
  id: string;
  kind: string;
  label?: string;
  elementIds: string[];
  properties?: Record<string, SemanticScalar>;
}

export interface ScientificRelationship {
  id: string;
  sourceObjectId: string;
  predicate: string;
  targetObjectId: string;
  visualElementIds?: string[];
  properties?: Record<string, SemanticScalar>;
}

export type SemanticScalar = string | number | boolean;

export interface RectElement extends BaseElement {
  type: "rect";
  width: number;
  height: number;
}

export interface EllipseElement extends BaseElement {
  type: "ellipse";
  width: number;
  height: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  size?: number;
  font?: string;
}

export interface LineElement extends BaseElement {
  type: "line";
  x2: number;
  y2: number;
}

export interface PolygonElement extends BaseElement {
  type: "polygon";
  points: Point[];
}

export interface PathElement extends BaseElement {
  type: "path";
  points: PathPoint[];
  closed?: boolean;
}

export interface CompoundPathElement extends BaseElement {
  type: "compound_path";
  subpaths: CompoundSubpath[];
  fillRule?: "nonzero" | "evenodd";
}

export interface CompoundSubpath {
  points: PathPoint[];
  closed?: true;
}

export interface Point {
  x: number;
  y: number;
}

export interface PathPoint extends Point {
  leftX?: number;
  leftY?: number;
  rightX?: number;
  rightY?: number;
  pointType?: "corner" | "smooth";
}

export interface VectorStyle {
  fill?: string | null;
  fillPaint?: string;
  stroke?: string | null;
  strokePaint?: string;
  strokeWidth?: number;
  opacity?: number;
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  dashArray?: number[];
  dashOffset?: number;
  miterLimit?: number;
}
