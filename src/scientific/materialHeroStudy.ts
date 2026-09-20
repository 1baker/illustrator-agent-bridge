import { createHash } from "node:crypto";
import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import { transformGeometryElement } from "../core/affineTransform.js";
import type { VectorElement } from "../core/vectorScene.js";
import { createMaterialFocusStudy } from "./materialFocusStudy.js";

/** Presentation experiment: retain the sequence, enlarge the existing interface. */
export function createMaterialHeroStudy(input: unknown, options: { layout?: "sidebar" | "interface_plate"; activationDetail?:boolean; softDetailEdge?:boolean } = {}) {
  if(options.layout!==undefined && !["sidebar","interface_plate"].includes(options.layout)) throw new ValidationError("Unsupported hero layout.");
  const source = normalizeScene(input);
  const plate=options.layout === "interface_plate";
  if(options.activationDetail&&!plate) throw new ValidationError("Activation detail requires interface plate layout.");
  const detailExtra=options.activationDetail?130:0;
  const focus = createMaterialFocusStudy(source, {framing:plate ? "mechanism" : "material"});
  const roles = ["polymer_material", "capillary_activation"];
  const supports = roles.map(role => source.semantics?.objects.find(o => o.properties?.materialRealismRole === role));
  if (supports.some(o => !o)) throw new ValidationError("Hero study requires initial and activation material roles.");
  const elements: VectorElement[] = [];
  const transforms: Record<string, unknown> = {};
  // At 171.5 mm width, 21 scene points render slightly above 8 PDF points.
  const addText = (id: string, x: number, y: number, value: string, size = 21) => elements.push({ id, type: "text", x, y, text: value, size: Math.max(21, size), font: "Arial", style: { fill: "#243548" }, zIndex: 100 });
  const sourceText = (id: string, fallback: string) => {
    const e = source.elements.find(e => e.id === id);
    return e?.type === "text" ? e.text : fallback;
  };
  addText("hero.title", 50, 25, sourceText("figure.title", source.document?.title ?? "Material mechanism"), 29);
  addText("hero.qualifier", 50, 69, "Conceptual mechanism • enlarged interface detail • not experimental data", 19);

  supports.forEach((object, index) => {
    const ids = new Set(object!.elementIds);
    const selected = source.elements.filter(e => e.id && ids.has(e.id) && e.type !== "text" && !/label|annotation|depth-arrow/.test(e.id));
    const points = selected.flatMap(elementPoints);
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
    const top = plate ? 160 : index === 0 ? 176 : 530;
    const blockX=plate ? (index===0 ? 130 : 770) : 70;
    const scale = Math.min(290 / (maxX-minX), (plate ? 170+(index===1?detailExtra:0) : 245) / (maxY-minY));
    const dx = blockX + (290-(maxX-minX)*scale)/2-minX*scale, dy = top-minY*scale;
    const moved=selected.map(e => move(e, scale, dx, dy)),transportStyles=[];
    if(index===1&&options.activationDetail)for(const number of [1,2,3]) {
      const prefix=`${object!.id}.transport-${number}`;
      for(const suffix of ["",".arrow",".shadow",".highlight"]) {
        const cue=moved.find(e=>e.id===prefix+suffix);
        if(!cue||(suffix===".arrow"?cue.type!=="polygon":cue.type!=="path")||
          source.semantics!.objects.some(o=>o.id!==object!.id&&o.elementIds.includes(cue.id!))||
          source.semantics!.relationships?.some(r=>r.visualElementIds?.includes(cue.id!)))
          throw new ValidationError("Activation detail requires exclusively owned transport cue assemblies.");
        const originalStyle=structuredClone(cue.style);
        // Transport is explanatory ink, not a physical illuminated filament.
        // Preserve the authored path and decreasing opacity order.
        cue.style={...cue.style,...(suffix===".shadow"||suffix===".highlight"?{opacity:0}:
          {opacity:50+.5*(cue.style?.opacity??100),...(suffix===".arrow"?{fill:"#215F73"}:{stroke:"#215F73"})})};
        transportStyles.push({elementId:cue.id!,originalStyle,displayStyle:structuredClone(cue.style)});
      }
    }
    elements.push(...moved);
    transforms[object!.id] = { scale, dx, dy, crop: false,...(transportStyles.length?{transportDisplay:{version:"activation-transport-ink.v1",styles:transportStyles,interpretation:"qualitative_direction_not_measured_flux"}}:{}) };
    const labelX=plate ? (index===0 ? 70 : 730) : 60;
    addText(`hero.stage-${index}.title`, labelX, top-44, `${index === 0 ? "A" : "B"}  ${sourceText(`program.stage-${index+1}.title`, object!.label ?? object!.id)}`, 23);
    addText(`hero.stage-${index}.note`, labelX, top+(plate ? 187+detailExtra : 258), index === 0 ? sourceText(`${object!.id}.morphology-label`, "Initial polymer morphology") : sourceText(`${object!.id}.acid-label`, sourceText(`${object!.id}.treatment-label`, object!.label ?? "One-sided stimulus")), 17);
    if(index===1&&selected.some(e=>e.id?.startsWith(`${object!.id}.qualitative-profile.`))) {
      const qualifier=source.elements.find(e=>e.id===`${object!.id}.qualitative-profile.qualifier`&&ids.has(e.id!));
      if(qualifier?.type!=="text"||!qualifier.text.trim())throw new ValidationError("Retained conceptual profile requires its authored qualifier.");
      // Keep this qualification outside the scaled anatomy at print-legible size.
      // Its original ID preserves semantic ownership and lets sheet-only views
      // remove it together with the profile that they replace.
      addText(qualifier.id!,labelX,top+(plate?243+detailExtra:314),qualifier.text);
    }
  });

  const clip = focus.scene.groups![0]!.clip!;
  if (clip.type !== "rect") throw new ValidationError("Expected rectangular interface crop.");
  const mainX=plate ? 60 : 455,mainY=plate ? 464+detailExtra : 201;
  const scale = plate ? 1120/clip.width : Math.min(730/clip.width, 615/clip.height);
  const dx = mainX-clip.x*scale, dy = mainY-clip.y*scale;
  const heroElements = focus.scene.elements.filter(e => e.groupId === "focus.crop");
  elements.push(...heroElements.map(e => ({ ...move(e, scale, dx, dy), groupId: "hero.crop" })));
  addText("hero.stage-3.title", mainX, mainY-69, `C  ${sourceText("program.stage-3.title", "Interface detail")}`, 27);
  const focusObjects = focus.scene.semantics!.objects;
  const interphase = focusObjects[0]!, surface = focusObjects[1]!;
  addText("hero.stage-3.note", mainX, mainY-35, `${sourceText(`${interphase.id}.persistence-label`, "Interface detail")} • enlarged cutaway • no physical scale`, 17);
  const heroBottom = mainY+clip.height*scale;
  addText("hero.interface-label", mainX, heroBottom+28, interphase.label ?? interphase.id, 22);
  addText("hero.surface-label", mainX, heroBottom+63, sourceText(`${surface.id}.surface-label`, surface.label ?? surface.id), 19);
  transforms.interface = { scale, dx, dy, sourceCrop: focus.provenance.crop, framingChainIds: focus.provenance.framingChainIds };
  if(options.softDetailEdge) {
    const chainIds=focus.provenance.framingChainIds as string[];
    if(!plate||!chainIds.length)throw new ValidationError("Soft detail edge requires complete-chain mechanism framing.");
    const features=elements.filter(e=>e.groupId==="hero.crop" && (chainIds.includes(e.id??"")||/\.(?:diol-site-|protected-site-|transformed-site-|initial-site-)/.test(e.id??""))).map(e=>({id:e.id!,ys:e.type==="path"?e.points.flatMap(p=>[p.y,p.leftY??p.y,p.rightY??p.y]):elementPoints(e).map(p=>p.y)})).filter(e=>Math.max(...e.ys)>=mainY&&Math.min(...e.ys)<=heroBottom);
    const protectedPoints=features.flatMap(e=>e.ys);
    const height=Math.min(60,Math.min(...protectedPoints)-mainY-2);
    if(!Number.isFinite(height)||height<=0)throw new ValidationError("No clear margin above protected primary chains.");
    const levels=24,elementIds:string[]=[];
    // Nested white opacity layers feather the illustrative crop into the white
    // page in both SVG and TikZ, without raster masks or alpha-gradient support.
    // The entire fade ends before the first protected primary-chain control hull.
    const alpha=(t:number)=>Math.cos(t*Math.PI/2)**2;
    for(let i=1;i<=levels;i++) {
      const outer=alpha(i/levels),inner=alpha((i-1)/levels);
      const id=`hero.detail-edge-${i}`;
      elements.push({id,type:"rect",x:mainX,y:mainY,width:clip.width*scale,height:height*i/levels,groupId:"hero.crop",style:{fill:"#FFFFFF",stroke:null,opacity:100*(inner-outer)/(1-outer)},zIndex:99});
      elementIds.push(id);
    }
    transforms.detailEdge={version:"white-page-detail-feather.v1",height,levels,elementIds,protectedChainIds:chainIds,protectedElementIds:features.map(e=>e.id),interpretation:"presentation_only_not_material_boundary"};
  }

  const retained = new Set(elements.map(e => e.id));
  const relationships = source.semantics!.relationships?.map(r => {
    if (r.sourceObjectId === supports[0]!.id && r.targetObjectId === supports[1]!.id) {
      if(plate) {
        elements.push({id:`${r.id}.hero-arrow`,type:"line",x:460,y:245+detailExtra/2,x2:680,y2:245+detailExtra/2,style:{stroke:"#64748B",strokeWidth:2},zIndex:90},
          {id:`${r.id}.hero-head`,type:"polygon",x:0,y:0,points:[{x:677,y:238+detailExtra/2},{x:677,y:252+detailExtra/2},{x:688,y:245+detailExtra/2}],style:{fill:"#64748B",stroke:null},zIndex:90});
        return {...r,visualElementIds:[`${r.id}.hero-arrow`,`${r.id}.hero-head`]};
      }
      elements.push({ id: `${r.id}.hero-arrow`, type: "line", x: 218, y: 456, x2: 218, y2: 478, style: { stroke: "#64748B", strokeWidth: 2 }, zIndex: 90 },
        { id: `${r.id}.hero-head`, type: "polygon", x: 0, y: 0, points: [{x:211,y:474},{x:225,y:474},{x:218,y:484}], style:{fill:"#64748B",stroke:null},zIndex:90 });
      return { ...r, visualElementIds: [`${r.id}.hero-arrow`, `${r.id}.hero-head`] };
    }
    if (r.sourceObjectId === supports[1]!.id && r.targetObjectId === interphase.id) {
      if(plate) {
        elements.push({id:`${r.id}.hero-arrow`,type:"line",x:1130,y:365+detailExtra,x2:1130,y2:409+detailExtra,style:{stroke:"#64748B",strokeWidth:2},zIndex:90},
          {id:`${r.id}.hero-head`,type:"polygon",x:0,y:0,points:[{x:1123,y:406+detailExtra},{x:1137,y:406+detailExtra},{x:1130,y:417+detailExtra}],style:{fill:"#64748B",stroke:null},zIndex:90});
        return {...r,visualElementIds:[`${r.id}.hero-arrow`,`${r.id}.hero-head`]};
      }
      elements.push({ id: `${r.id}.hero-arrow`, type: "line", x: 362, y: 650, x2: 426, y2: 650, style: { stroke: "#64748B", strokeWidth: 2 }, zIndex: 90 },
        { id: `${r.id}.hero-head`, type: "polygon", x: 0, y: 0, points: [{x:422,y:643},{x:422,y:657},{x:433,y:650}], style:{fill:"#64748B",stroke:null},zIndex:90 });
      return { ...r, visualElementIds: [`${r.id}.hero-arrow`, `${r.id}.hero-head`] };
    }
    return { ...r, visualElementIds: r.visualElementIds?.filter(id => retained.has(id)) };
  });
  const legend = source.elements.filter(e => e.id?.startsWith("program.legend"));
  // Preserve authored visual keys and their captions at their original size.
  const legendTop = Math.min(...legend.flatMap(elementPoints).map(p => p.y));
  const legendY=plate ? heroBottom+115 : 885;
  elements.push(...legend.map(e => move(e, 1, 0, legendY-legendTop)));
  const footerY=plate ? legendY+85 : 970;
  addText("hero.footer", 50, footerY, "Hypothesis, not measured data • panel sizes are illustrative and not comparable physical scales", 17);
  const objects = source.semantics!.objects.map(o => ({ ...o, elementIds: o.elementIds.filter(id => retained.has(id)) }));
  const scene = normalizeScene({ document: { width: 1240, height: plate ? Math.ceil(footerY+50) : 1020, title: "Material mechanism hero study", colorMode: "RGB" }, elements, paints: source.paints,
    groups: [{ id: "hero.crop", clip: { type: "rect", x: mainX, y: mainY, width: clip.width*scale, height: clip.height*scale } }], semantics: { objects, relationships } });
  return { scene, provenance: { schemaVersion: "MaterialHeroStudy.v1",layout:options.layout ?? "sidebar", sourceSceneSha256: createHash("sha256").update(JSON.stringify(source)).digest("hex"), transforms, approval: "candidate_only", physicalCalibration: false, operations: ["retain_sequence", "uniform_support_scaling", "enlarge_existing_interface_crop", "retain_visual_key"] } };
}

function elementPoints(e: VectorElement): Array<{x:number;y:number}> {
  if (e.type === "path" || e.type === "polygon") return e.points;
  if (e.type === "compound_path") return e.subpaths.flatMap(s => s.points);
  if (e.type === "line") return [{x:e.x,y:e.y},{x:e.x2,y:e.y2}];
  return [{x:e.x,y:e.y},{x:e.x+("width" in e ? e.width : 0),y:e.y+("height" in e ? e.height : 0)}];
}

function move(e: VectorElement, scale: number, dx: number, dy: number): VectorElement {
  const moved = e.type === "ellipse" || e.type === "rect" ? {...e,x:e.x*scale+dx,y:e.y*scale+dy,width:e.width*scale,height:e.height*scale}
    : e.type === "text" ? {...e,x:e.x*scale+dx,y:e.y*scale+dy,size:(e.size ?? 12)*scale}
    : transformGeometryElement(e,{a:scale,b:0,c:0,d:scale,e:dx,f:dy});
  return {...moved, style:{...e.style,
    ...(e.style?.strokeWidth === undefined ? {} : {strokeWidth:e.style.strokeWidth*scale}),
    ...(e.style?.dashArray === undefined ? {} : {dashArray:e.style.dashArray.map(n=>n*scale)}),
    ...(e.style?.dashOffset === undefined ? {} : {dashOffset:e.style.dashOffset*scale})}};
}
