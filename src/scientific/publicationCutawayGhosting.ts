import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import type { VectorPaint } from "../core/vectorScene.js";
import {continuousCutawayField} from "./continuousCutawayField.js";

/** Selective illustrative ghosting, never a change to chemistry or geometry.
 * Only the polymer envelope is softened. Molecular features and the solid
 * substrate stay byte-identical. Clone shared paints before changing colors.
 */
export function ghostPolymerCutaway(input:unknown, strength=0.42, openSides=false) {
  if(!Number.isFinite(strength)||strength<0.2||strength>1) throw new ValidationError("Cutaway material strength must be 0.2–1.");
  const source=normalizeScene(input), scene=structuredClone(source);
  const object=scene.semantics?.objects.find(o=>o.properties?.materialRealismRole==="buried_interphase");
  if(!object) throw new ValidationError("Ghosted cutaway requires a polymer interphase.");
  if(!scene.groups?.some(g=>g.id==="hero.crop")) throw new ValidationError("Ghosting requires the explicit hero crop.");
  if(scene.paints?.some(p=>p.id.startsWith("cutaway-ghost."))) throw new ValidationError("Cutaway ghosting cannot be applied twice.");
  const owned=new Set(object.elementIds),paintMap=new Map<string,string>(),paints:VectorPaint[]=[];
  const changedElementIds:string[]=[];
  const blend=(color:string,amount:number)=> {
    if(!/^#[0-9a-f]{6}$/i.test(color)) throw new ValidationError("Cutaway ghosting requires explicit RGB colors.");
    return `#${[1,3,5].map(i=>Math.round(255+(parseInt(color.slice(i,i+2),16)-255)*amount).toString(16).padStart(2,"0")).join("")}`;
  };
  for(const e of scene.elements) {
    if(!e.id||!e.id.startsWith(`${object.id}.`)||!owned.has(e.id)||e.groupId!=="hero.crop"||e.type==="text"||!e.style) continue;
    // Explicit depiction roles, not all members of a scientific object. The
    // latter would wash out the very molecules that explain the mechanism.
    const suffix=e.id.slice(object.id.length+1);
    if(!/^(?:film(?:$|-)|zone(?:$|\.)|assembly-shadow|top-face-|side-face-|cut-edge-|subsurface-|area-light-|edge-rolloff-|refractive-depth-|surface-sheen|inner-depth-|right-edge-|bottom-occlusion|edge-rim-|bulk-optics\.|surface-light)/.test(suffix)) continue;
    if(strength===1) continue;
    const style={...e.style};
    if(style.fillPaint) {
      const old=style.fillPaint;
      if(!paintMap.has(old)) {
        const paint=source.paints?.find(p=>p.id===old);
        if(!paint) throw new ValidationError(`Missing cutaway paint ${old}`);
        const id=`cutaway-ghost.${old}`;
        if(source.paints?.some(p=>p.id===id)) throw new ValidationError("Cutaway ghosting cannot be applied twice.");
        paints.push({...paint,id,stops:paint.stops.map(s=>({...s,color:blend(s.color,strength)}))});
        paintMap.set(old,id);
      }
      style.fillPaint=paintMap.get(old)!;
    }
    if(style.fill) style.fill=blend(style.fill,strength);
    if(style.stroke) style.stroke=blend(style.stroke,strength);
    // Domain crests are not solid second-phase islands or a measured profile.
    // Reduce their distracting boundary contrast without removing their shape.
    if(/^zone\.adhesion-lobe/.test(suffix)) style.opacity=(style.opacity??100)*0.45;
    // An open illustrative section should not resemble a glass display box.
    // Keep its material field, but demote the side-wall optical assembly.
    if(openSides) {
      // Broad decorative domain crests can read as faceted second-phase islands
      // after the continuous material field is opened. They are not measured
      // interfaces: retain their editable geometry but subordinate their ink.
      if(/^zone\.adhesion-lobe/.test(suffix))style.opacity=(style.opacity??100)*.2;
      if(/^(?:film-side-face|zone\.connected-side|side-face-|right-edge-|cut-edge-)/.test(suffix))
        style.opacity=(style.opacity??100)*.18;
      if(suffix==="film"||suffix==="film-top-face") style.stroke=null;
      if(/^(?:edge-rolloff-|bottom-occlusion$|bulk-optics\.edge-absorption-bottom$)/.test(suffix))
        style.opacity=0;
    }
    e.style=style;
    changedElementIds.push(e.id);
  }
  const used=new Set(scene.elements.map(e=>e.style?.fillPaint).filter(Boolean));
  if(strength!==1) scene.paints=[...(scene.paints??[]),...paints].filter(p=>used.has(p.id));
  const continuousField=openSides&&strength!==1?continuousCutawayField(scene,object.id):null;
  return {scene:normalizeScene(scene),treatment:{version:"polymer-cutaway-ghosting.v5",strength,openSides,continuousField,
    changedElementIds,paintBindings:Object.fromEntries(paintMap),
    interpretation:"illustrative_cutaway_not_measured_transparency"}};
}
