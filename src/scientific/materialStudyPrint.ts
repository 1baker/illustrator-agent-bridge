import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import { renderSceneToSvg } from "../render/svgRenderer.js";
import { renderSceneToTikz } from "../render/tikzRenderer.js";

function physicalTikz(latex: string, scale: number): string {
  return latex.replace("\\begin{tikzpicture}[x=1pt,y=-1pt]", `\\begin{tikzpicture}[x=1pt,y=-1pt,scale=${Number(scale.toFixed(8))},transform shape]`);
}

/** Physical presentation export; does not calibrate depicted scientific objects. */
export function materialStudyPrint(input: unknown, widthMm: number, options: {compact?: boolean} = {}) {
  if (!Number.isFinite(widthMm) || widthMm < 40 || widthMm > 500) throw new ValidationError("Study print width must be between 40 and 500 mm.");
  const scene = normalizeScene(input);
  const width = scene.document!.width!, height = scene.document!.height!;
  const heightMm = widthMm * height / width;
  const scale = widthMm / 25.4 * 72.27 / width;
  const sizes = scene.elements.filter(e=>e.type === "text" && e.visible !== false).map(e=>e.type === "text" ? (e.size ?? 12) * scale * 72 / 72.27 : 0);
  return {
    svg: renderSceneToSvg(scene).replace(/(<svg[^>]*\bwidth=")[^"]+(" height=")[^"]+"/, `$1${widthMm}mm$2${heightMm}mm"`),
    latex: physicalTikz(renderSceneToTikz(scene).latex, scale),
    manifest: {schemaVersion:"MaterialStudyPrint.v1",size:{widthMm,heightMm},minimumPredictedPdfFontPt:Math.min(...sizes),calibratedScientificScale:false,approval:"candidate_only"}
  };
}
