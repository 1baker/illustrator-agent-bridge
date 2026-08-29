import type { VectorScene } from "../core/vectorScene.js";

export type {
  BaseElement,
  EllipseElement,
  CompoundPathElement,
  CompoundSubpath,
  LineElement,
  PathElement,
  PathPoint,
  Point,
  PolygonElement,
  RectElement,
  ScientificObject,
  ScientificRelationship,
  SceneSemantics,
  SemanticScalar,
  TextElement,
  VectorDocument,
  VectorElement,
  VectorGroup,
  VectorClip,
  VectorPaint,
  LinearGradientPaint,
  RadialGradientPaint,
  GradientStop,
  GradientUnits,
  GradientSpread,
  VectorScene,
  VectorStyle
} from "../core/vectorScene.js";

// Compatibility aliases for the existing Illustrator adapter and planners.
export type CartoonScene = import("../core/vectorScene.js").VectorScene;
export type SceneDocument = import("../core/vectorScene.js").VectorDocument;
export type SceneElement = import("../core/vectorScene.js").VectorElement;
export type ElementStyle = import("../core/vectorScene.js").VectorStyle;

export type BridgeCommand = PingCommand | CartoonSceneCommand | ExportCommand | PlaceFileReferenceCommand;

export interface PingCommand {
  kind: "ping";
  message?: string;
}

export interface CartoonSceneCommand {
  kind: "cartoon_scene";
  scene: CartoonScene;
}

export interface ExportCommand {
  kind: "export";
  format: ExportFormat;
  outputPath: string;
}

export interface PlaceFileReferenceCommand {
  kind: "place_file_reference" | "place_image_reference";
  inputPath: string;
  layerName?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  opacity?: number;
  locked?: boolean;
  embed?: boolean;
}

export type ExportFormat = "pdf" | "svg" | "png" | "jpg";

export interface GeneratedJob {
  id: string;
  jobPath: string;
  resultPath: string;
  illustratorJobPath: string;
  illustratorResultPath: string;
  jsx: string;
}
