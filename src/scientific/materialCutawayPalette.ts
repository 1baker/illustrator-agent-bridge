import { normalizeScene, ValidationError } from "../core/sceneValidation.js";

/** Presentation-only host tint. Reaction/transport/site encodings stay authored. */
export function materialCutawayPalette(input: unknown) {
  const scene = normalizeScene(input);
  const owner = scene.semantics?.objects.find(o => o.properties?.materialRealismRole === "capillary_activation");
  if (!owner) throw new ValidationError("Cutaway palette requires an activation material.");
  const suffixes = ["film", "film-side-face", "film-top-face", "film-shadow", "side-face-absorption",
    "cut-edge-outer-rim", "cut-edge-striation-1", "cut-edge-striation-2", "cut-edge-striation-3",
    "bulk-optics.volume-glow", "bulk-optics.subsurface-haze", "bulk-optics.edge-absorption-bottom",
    "bulk-optics.edge-absorption-right", "exposed-surface"];
  const selected = suffixes.map(suffix => {
    const e = scene.elements.find(e => e.id === `${owner.id}.${suffix}`);
    if (!e || e.type !== "path" || !owner.elementIds.includes(e.id!) ||
      scene.semantics!.objects.some(o => o.id !== owner.id && o.elementIds.includes(e.id!)) ||
      scene.semantics!.relationships?.some(r => r.visualElementIds?.includes(e.id!)))
      throw new ValidationError("Cutaway palette requires exclusively owned host surfaces.");
    return e;
  });
  // Match the cool overview host while retaining the authored light/dark order.
  // This luminance proxy is illustrative shading, not measured colorimetry.
  const tint = (color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new ValidationError("Cutaway palette requires RGB host colors.");
    const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16));
    const value = (.2126*rgb[0]! + .7152*rgb[1]! + .0722*rgb[2]!)/255;
    return "#" + [43,78,79].map((dark,i) => Math.round(dark+([235,245,240][i]!-dark)*value).toString(16).padStart(2,"0")).join("").toUpperCase();
  };
  const paints = [];
  const styles = [];
  for (const e of selected) {
    const originalStyle = structuredClone(e.style);
    const style = {...e.style};
    for (const key of ["fill", "stroke"] as const) if (typeof style[key] === "string") style[key] = tint(style[key]!);
    if (style.fillPaint) {
      if (style.fillPaint.startsWith(`${owner.id}.host-palette.`)) throw new ValidationError("Cutaway palette is already applied.");
      const original = scene.paints?.find(p => p.id === style.fillPaint);
      if (!original) throw new ValidationError("Cutaway host paint is missing.");
      const id = `${owner.id}.host-palette.${original.id}`;
      if (scene.paints!.some(p => p.id === id)) throw new ValidationError("Cutaway palette is already applied or collides.");
      const display = {...structuredClone(original),id,stops:original.stops.map(s => ({...s,color:tint(s.color)}))};
      scene.paints!.push(display);
      paints.push({sourcePaint:structuredClone(original),displayPaint:structuredClone(display)});
      style.fillPaint = id;
    }
    e.style = style;
    styles.push({elementId:e.id!,originalStyle,displayStyle:structuredClone(style)});
  }
  const used = new Set(scene.elements.flatMap(e => [e.style?.fillPaint,e.style?.strokePaint]).filter(Boolean));
  const replaced = new Set(paints.map(p => p.sourcePaint.id));
  scene.paints = scene.paints!.filter(p => !replaced.has(p.id) || used.has(p.id));
  return {scene:normalizeScene(scene),provenance:{version:"shared-polymer-host-palette.v1",sourceObjectId:owner.id,
    styles,paints,interpretation:"illustrative_host_color_not_measured_optics",reactionOverlays:"unchanged"}};
}
