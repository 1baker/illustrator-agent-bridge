import { createHash } from "node:crypto";
import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import { transformGeometryElement } from "../core/affineTransform.js";
import type { VectorElement, VectorScene } from "../core/vectorScene.js";

/** Derive a qualitative enlarged view from existing geometry without adding chemistry. */
export function createMaterialFocusStudy(input: unknown, options: { framing?: "material" | "mechanism" } = {}): { scene: VectorScene; provenance: Record<string, unknown> } {
  if(options.framing!==undefined && !["material","mechanism"].includes(options.framing)) throw new ValidationError("Unsupported focus framing.");
  const source = normalizeScene(input);
  const interphase = source.semantics?.objects.find(o => o.properties?.materialRealismRole === "buried_interphase");
  const surface = source.semantics?.objects.find(o => o.properties?.materialRealismRole === "polished_substrate");
  if (!interphase || !surface) throw new ValidationError("Focus study requires an interphase and its substrate.");
  if (source.groups?.length || source.paints?.some(p => p.units === "user_space" || p.transform)) throw new ValidationError("Focus study currently requires ungrouped geometry and object-relative paints.");
  const film = source.elements.find(e => e.id === `${interphase.id}.film`);
  if (film?.type !== "path") throw new ValidationError("Focus study requires an authoritative film boundary.");
  const ids = new Set([...interphase.elementIds, ...surface.elementIds]);
  const selected = source.elements.filter(e => e.id && ids.has(e.id) && e.type !== "text" && !/\.label-(?:leader|rule)$/.test(e.id));
  const anchors = (e: VectorElement): Array<{x:number;y:number}> => e.type === "path" || e.type === "polygon" ? e.points : e.type === "line" ? [{x:e.x,y:e.y},{x:e.x2,y:e.y2}] : e.type === "compound_path" ? e.subpaths.flatMap(s=>s.points) : [{x:e.x,y:e.y},{x:e.x + ("width" in e ? e.width : 0), y:e.y + ("height" in e ? e.height : 0)}];
  const points = selected.flatMap(anchors);
  const left = Math.min(...points.map(p=>p.x)) - 4;
  const right = Math.max(...points.map(p=>p.x)) + 4;
  const filmBottom = Math.max(...film.points.map(p=>p.y));
  let top = filmBottom - 110;
  let bottom = Math.max(...points.map(p=>p.y)) + 8;
  const framingChainIds: string[] = [];
  const framingSiteElementIds: string[] = [];
  if(options.framing === "mechanism") {
    const lowerSites=selected.filter(e=>e.id?.startsWith(`${interphase.id}.`) && /\.(?:diol-site-[34](?:\.|$)|transformed-site-[a-z-]+-[34]$)/.test(e.id));
    const surfaceSites=selected.filter(e=>e.id?.startsWith(`${surface.id}.`) && /\.(?:silanol-site|siloxane-bridge|surface-site|surface-bridge)/.test(e.id));
    if(!lowerSites.length || !surfaceSites.length) throw new ValidationError("Mechanism framing requires explicit lower polymer and surface sites.");
    // Keep whole explanatory glyphs and their attachment geometry, not arbitrary
    // percentages of specimen fill. The unmodified source remains in the scene.
    top=Math.min(filmBottom-12,...lowerSites.flatMap(anchors).map(p=>p.y))-8;
    bottom=Math.max(...surfaceSites.flatMap(anchors).map(p=>p.y))+12;
    // Select once against the molecular-detail window. Expanding recursively
    // would pull in unrelated bulk chains until this became a whole-film view.
    // A cubic lies inside its control hull, so include handles, not only anchors.
    const hull = (e: VectorElement) => e.type === "path" ? e.points.flatMap(p=>[
      {x:p.x+e.x,y:p.y+e.y},
      ...(p.leftY===undefined?[]:[{x:p.leftX!+e.x,y:p.leftY+e.y}]),
      ...(p.rightY===undefined?[]:[{x:p.rightX!+e.x,y:p.rightY+e.y}])
    ]) : anchors(e);
    const chains=selected.filter(e=>e.id?.startsWith(`${interphase.id}.chain-`) && /\.chain-\d+$/.test(e.id) && e.type==="path");
    const visibleChains=chains.filter(e=>{
      const ys=hull(e).map(p=>p.y);
      return Math.max(...ys)>=top && Math.min(...ys)<=bottom;
    });
    for(const chain of visibleChains) {
      framingChainIds.push(chain.id!);
      const suffix=chain.id!.slice(chain.id!.lastIndexOf("-")+1);
      const assembly=selected.filter(e=>e.id===chain.id || (e.id?.startsWith(`${interphase.id}.chain-`) && e.id.endsWith(`-${suffix}`)));
      const ys=assembly.flatMap(hull).map(p=>p.y);
      top=Math.min(top,Math.min(...ys)-8);
      bottom=Math.max(bottom,Math.max(...ys)+8);
    }
    // A changed chain pose can bring only a pendant stem into this window.
    // Frame its complete authored motif rather than cutting it or letting the
    // edge feather conceal the remnant. Select once, without pulling in every
    // unrelated chain recursively.
    const siteGroups=new Map<string,VectorElement[]>();
    for(const e of selected) {
      if(!e.id?.startsWith(`${interphase.id}.`))continue;
      const match=e.id.match(/\.(diol-site|protected-site)-(\d+)(?:\.|$)/)
        ??e.id.match(/\.(transformed-site|initial-site)-[a-z-]+-(\d+)$/);
      if(!match)continue;
      const key=`${match[1]}-${match[2]}`;
      siteGroups.set(key,[...(siteGroups.get(key)??[]),e]);
    }
    const visibleSites=[...siteGroups.values()].filter(parts=>{
      const ys=parts.flatMap(hull).map(p=>p.y);
      return Math.max(...ys)>=top && Math.min(...ys)<=bottom;
    });
    for(const parts of visibleSites) {
      const ys=parts.flatMap(hull).map(p=>p.y);
      framingSiteElementIds.push(...parts.map(e=>e.id!));
      top=Math.min(top,Math.min(...ys)-8);
      bottom=Math.max(bottom,Math.max(...ys)+8);
    }
  }
  const scale = 1120 / (right-left);
  const viewHeight = (bottom-top)*scale;
  const transform = {a:scale,b:0,c:0,d:scale,e:60-left*scale,f:110-top*scale};
  const elements: VectorElement[] = selected.map(element => {
    const moved = element.type === "ellipse" || element.type === "rect"
      ? {...element,x:element.x*scale+transform.e,y:element.y*scale+transform.f,width:element.width*scale,height:element.height*scale}
      : element.type === "text" ? element : transformGeometryElement(element,transform);
    return {...moved,groupId:"focus.crop",style:{...element.style,
      ...(element.style?.strokeWidth === undefined ? {} : {strokeWidth:element.style.strokeWidth*scale}),
      ...(element.style?.dashArray === undefined ? {} : {dashArray:element.style.dashArray.map(n=>n*scale)}),
      ...(element.style?.dashOffset === undefined ? {} : {dashOffset:element.style.dashOffset*scale})}};
  });
  const height = Math.ceil(viewHeight+205);
  elements.push({id:"focus.title",type:"text",x:60,y:26,text:interphase.label ?? "Proposed interface",size:30,font:"Arial",style:{fill:"#172033"},zIndex:100});
  elements.push({id:"focus.qualifier",type:"text",x:60,y:68,text:"Enlarged conceptual detail • no physical scale",size:21,font:"Arial",style:{fill:"#475569"},zIndex:100});
  elements.push({id:"focus.caption",type:"text",x:60,y:height-65,text:"Proposed surface association • hypothesis, not measured data",size:21,font:"Arial",style:{fill:"#475569"},zIndex:100});
  const retained = new Set(elements.map(e=>e.id));
  const objects = [interphase,surface].map(o=>({...o,elementIds:o.elementIds.filter(id=>retained.has(id))}));
  const objectIds = new Set(objects.map(o=>o.id));
  const relationships = source.semantics?.relationships?.filter(r=>objectIds.has(r.sourceObjectId)&&objectIds.has(r.targetObjectId)).map(r=>({...r,visualElementIds:r.visualElementIds?.filter(id=>retained.has(id))}));
  const scene = normalizeScene({document:{width:1240,height,title:"Interface focus study",colorMode:"RGB"},elements,paints:source.paints,groups:[{id:"focus.crop",clip:{type:"rect",x:60,y:110,width:1120,height:viewHeight}}],semantics:{objects,relationships}});
  return {scene,provenance:{schemaVersion:"MaterialFocusStudy.v1",framing:options.framing ?? "material",framingChainIds,framingSiteElementIds,sourceSceneSha256:createHash("sha256").update(JSON.stringify(source)).digest("hex"),sourceObjectIds:[interphase.id,surface.id],crop:{left,top,right,bottom},displayScale:scale,physicalCalibration:false,approval:"candidate_only",operations:["select_existing_interface_geometry","uniform_display_scaling","explicit_crop",...(framingChainIds.length?["retain_intersecting_primary_chain_control_hulls"]:[]),...(framingSiteElementIds.length?["retain_complete_intersecting_site_motifs"]:[])]}};
}
