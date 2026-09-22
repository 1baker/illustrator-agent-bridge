import { normalizeScene, ValidationError } from "../core/sceneValidation.js";
import type { PathPoint, VectorElement, VectorPaint, VectorGroup } from "../core/vectorScene.js";
import { createMaterialHeroStudy } from "./materialHeroStudy.js";
import { ghostPolymerCutaway } from "./publicationCutawayGhosting.js";
import { transformGeometryElement } from "../core/affineTransform.js";
import { chainCrossingCues, chainPairContactShadows } from "./publicationChainCrossings.js";
import { vectorScalarContours } from "./vectorScalarContours.js";
import { filmProjectedShadow } from "./filmProjectedShadow.js";
import { softenPublicationTubes } from "./publicationSoftTubeLighting.js";
import { unifyPublicationAssociations } from "./publicationAssociationStyle.js";
import {filmAreaLight} from "./filmAreaLight.js";
import {filmSatinResponse} from "./filmSatinResponse.js";
import {materialCutawayPalette} from "./materialCutawayPalette.js";

export interface FilmSpecimenSpec {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  bow: number;
  thickness: number;
  wet: boolean;
  /** Illustrative edge lift and twist, in scene units; not measured mechanics. */
  curl?: number;
  twist?: number;
  lightTilt?: {x:number;y:number};
  highlightSharpness?: number;
  /** Illustrative rectangular angular spread; zero retains the point response. */
  lightSpread?: {x:number;y:number};
  emitterSpread?: {x:number;y:number};
  surfaceFinish?: "satin" | "studio";
  /** Relative illustrative liquid relief, not a physical thickness. */
  wetLayerRelief?: number;
}

/** A qualitative thin-sheet specimen, not a reconstruction of measured shape.
 * Cubic surface patches, a connected cut edge and nested vector reflections
 * replace an upright cross-section only in the overview presentation.
 */
export function filmSpecimenGeometry(spec: FilmSpecimenSpec) {
  if(spec.surfaceFinish!==undefined&&!["satin","studio"].includes(spec.surfaceFinish))throw new ValidationError("Invalid film surface finish.");
  if(spec.surfaceFinish==="studio"&&spec.wet)throw new ValidationError("Studio finish requires a dry illustrative sheet.");
  const curl=spec.curl??spec.depth*0.32, twist=spec.twist??spec.depth*0.075;
  const wetLayerRelief=spec.wetLayerRelief??0.08;
  if(!Number.isFinite(wetLayerRelief)||wetLayerRelief<0||wetLayerRelief>0.15)
    throw new ValidationError("Invalid illustrative liquid relief.");
  const lightTilt=spec.lightTilt??{x:-0.10,y:0.045},sharpness=spec.highlightSharpness??(spec.wet?180:65);
  if(![lightTilt.x,lightTilt.y,sharpness].every(Number.isFinite)||Math.abs(lightTilt.x)>1||Math.abs(lightTilt.y)>1||sharpness<16||sharpness>512)
    throw new ValidationError("Invalid specimen lighting controls.");
  if (![spec.x,spec.y,spec.width,spec.depth,spec.bow,spec.thickness].every(Number.isFinite) ||
      spec.width<=0 || spec.depth<=0 || spec.thickness<=0 || spec.thickness>spec.depth*0.1 ||
      Math.abs(spec.bow)>spec.depth*0.5) throw new ValidationError("Invalid specimen geometry.");
  if (![curl,twist].every(Number.isFinite) || Math.abs(curl)>spec.depth*0.6 || Math.abs(twist)>spec.depth*0.2)
    throw new ValidationError("Invalid specimen curl or twist.");
  const skew=spec.width*0.17, tilt=spec.depth*0.12;
  const point=(u:number,v:number,offset=0)=>({
    x:spec.x+skew*(1-v)+u*(spec.width-skew),
    y:spec.y+v*spec.depth+4*spec.bow*u*(1-u)*(0.35+0.65*v)-tilt*u
      -curl*u*u*u*(0.3+0.7*v)+twist*(2*u-1)*(2*v-1)+offset
  });
  const tangent=(u:number,v:number)=>({x:spec.width-skew,y:4*spec.bow*(1-2*u)*(0.35+0.65*v)-tilt
    -3*curl*u*u*(0.3+0.7*v)+2*twist*(2*v-1)});
  const edge=(u0:number,u1:number,v:number,offset=0):PathPoint[]=> {
    const a=point(u0,v,offset),b=point(u1,v,offset),ta=tangent(u0,v),tb=tangent(u1,v),d=(u1-u0)/3;
    return [{...a,rightX:a.x+ta.x*d,rightY:a.y+ta.y*d},{...b,leftX:b.x-tb.x*d,leftY:b.y-tb.y*d}];
  };
  const region=(u0:number,u1:number,v0:number,v1:number)=>[...edge(u0,u1,v1),...edge(u1,u0,v0)];
  const top=region(0,1,0,1);
  const lip=[...edge(0,1,1),...edge(1,0,1,spec.thickness)];
  const side=[point(1,1),point(1,0),point(1,0,spec.thickness),point(1,1,spec.thickness)];
  const elements:VectorElement[]=[];
  const body=spec.wet?[147,196,194]:spec.surfaceFinish==="studio"?[94,133,132]:[181,207,201];
  const tint=(amount:number)=>`#${body.map(c=>Math.round(c+(255-c)*amount).toString(16).padStart(2,"0")).join("")}`;
  const path=(suffix:string,points:PathPoint[],fill:string|undefined,opacity:number,zIndex:number,paint?:string)=> {
    const id=`${spec.id}.${suffix}`;
    elements.push({id,name:id,type:"path",x:0,y:0,closed:true,points,
      style:{...(paint?{fillPaint:paint}:{fill:fill??null}),stroke:null,opacity},zIndex});
  };
  const shadow=filmProjectedShadow({...spec,curl,twist,lightTilt});
  elements.push(...shadow.elements);
  path("side",side,"#527683",85,7);
  path("cut-edge",lip,undefined,100,8,`${spec.id}.edge-paint`);
  // Shade through local thickness, not the bounding box's vertical extent.
  // Each strip follows the same exact cubic, including the lifted corner.
  const edgeBands=8;
  for(let i=0;i<edgeBands;i++) {
    const t=(i+.5)/edgeBands;
    const a=t<.48?[172,203,210]:[69,114,132];
    const b=t<.48?[69,114,132]:[147,184,194];
    const f=t<.48?t/.48:(t-.48)/.52;
    const color=`#${a.map((c,j)=>Math.round(c+(b[j]!-c)*f).toString(16).padStart(2,"0")).join("")}`;
    path(`edge-band-${i}`,[...edge(0,1,1,spec.thickness*i/edgeBands),...edge(1,0,1,spec.thickness*(i+1)/edgeBands)],color,100,8);
  }
  path("surface",top,undefined,100,9,`${spec.id}.surface-paint`);
  // Analytic height derivatives define a qualitative surface orientation.
  // Contour geometry encodes its light response, not pixels of a reference.
  const unit=(x:number,y:number,z:number)=> {const n=Math.hypot(x,y,z);return [x/n,y/n,z/n];};
  const lightSpread=spec.lightSpread??{x:0,y:0},lightSamples=filmAreaLight(lightTilt,lightSpread);
  const field=(u:number,v:number,extraU=0,extraV=0)=> {
    const du=(-4*spec.bow*(1-2*u)*(0.35+0.65*v)+3*curl*u*u*(0.3+0.7*v)-2*twist*(2*v-1))/(spec.width-skew)+extraU;
    const dv=(-4*spec.bow*u*(1-u)*0.65+0.7*curl*u*u*u-2*twist*(2*u-1))/(spec.depth*2)+extraV;
    const normal=unit(-du,-dv,1);
    const response=lightSamples.reduce((sum,sample)=>sum+sample.weight*(spec.surfaceFinish==="studio"
      // Two finite-width studio reflections follow the same analytic normal
      // field as the surface. No hand-positioned glint or image texture.
      ? .28*filmSatinResponse(normal,sample.half)+.72*Math.exp(-.5*(((normal[0]!-sample.half[0]!)/.14)**2+((normal[1]!-sample.half[1]!)/.024)**2))
      :spec.surfaceFinish==="satin"&&!spec.wet
      ?filmSatinResponse(normal,sample.half)
      :Math.max(0,normal.reduce((dot,n,i)=>dot+n*sample.half[i]!,0))**sharpness),0);
    return Math.min(1,0.04+(spec.surfaceFinish==="studio"?.94:spec.wet?0.89:0.76)*response);
  };
  const lightGroup=`${spec.id}.surface-light`;
  const groups:VectorGroup[]=[...(shadow.group?[shadow.group]:[]),{id:lightGroup,zIndex:10,clip:{type:"path",x:0,y:0,points:top,closed:true}}];
  const levels=spec.surfaceFinish==="studio"?128:64;
  const thresholds=Array.from({length:levels},(_,i)=>(i+0.5)/levels);
  // Keep the contour compiler's bounded 64-threshold call contract. The
  // studio mode uses exactly two ordered batches; scene validation still
  // checks the combined geometry before export.
  const contours=vectorScalarContours(field,thresholds.slice(0,64));
  if(levels>64)contours.push(...vectorScalarContours(field,thresholds.slice(64)));
  contours.forEach(({threshold,loops},i)=> {
    if(!loops.length) return;
    elements.push({id:`${spec.id}.surface-isophote-${i}`,type:"compound_path",x:0,y:0,groupId:lightGroup,fillRule:"evenodd",
      subpaths:loops.map(loop=>({closed:true,points:loop.flatMap((p,index)=> {
        const q=loop[(index+1)%loop.length]!,steps=Math.max(1,Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)*32));
        // A straight parameter-space boundary becomes curved on the sheet.
        // Resample even simplified grid edges before surface projection.
        return Array.from({length:steps},(_,i)=>point(p.x+(q.x-p.x)*i/steps,p.y+(q.y-p.y)*i/steps));
      })})),style:{fill:tint(threshold),stroke:null,opacity:100},zIndex:10});
  });
  // The low front rim is the same cubic as the surface boundary.
  const rim=edge(0,1,1);
  elements.push({id:`${spec.id}.rim`,type:"path",x:0,y:0,closed:false,points:rim,
    style:{fill:null,stroke:"#EFFFFF",strokeWidth:0.45,opacity:78},zIndex:12});
  if(spec.wet) {
    const footprint=region(0.035,0.965,0.045,0.88),height=spec.depth*wetLayerRelief;
    const liquidPoint=(s:number,t:number)=>point(.035+.93*s,.045+.835*t,-height*Math.sin(Math.PI*s)*Math.sin(Math.PI*t));
    const liquidField=(s:number,t:number)=> {
      const u=.035+.93*s,v=.045+.835*t,blend=Math.min(1,Math.min(s,1-s,t,1-t)*16);
      const response=field(u,v,
        height*Math.PI*Math.cos(Math.PI*s)*Math.sin(Math.PI*t)/(.93*(spec.width-skew)),
        height*Math.PI*Math.sin(Math.PI*s)*Math.cos(Math.PI*t)/(.835*spec.depth*2));
      return field(u,v)*(1-blend)+response*blend;
    };
    path("wet-surface",footprint,tint(0),100,13);
    const liquidGroup=`${spec.id}.liquid-light`;
    groups.push({id:liquidGroup,zIndex:14,clip:{type:"path",x:0,y:0,points:footprint,closed:true}});
    vectorScalarContours(liquidField,Array.from({length:64},(_,i)=>(i+.5)/64)).forEach(({threshold,loops},i)=> {
      if(!loops.length) return;
      const fill=tint(threshold);
      elements.push({id:`${spec.id}.liquid-isophote-${i}`,type:"compound_path",x:0,y:0,groupId:liquidGroup,fillRule:"evenodd",
        subpaths:loops.map(loop=>({closed:true,points:loop.flatMap((p,index)=> {
          const q=loop[(index+1)%loop.length]!,steps=Math.max(1,Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)*32));
          return Array.from({length:steps},(_,j)=>liquidPoint(p.x+(q.x-p.x)*j/steps,p.y+(q.y-p.y)*j/steps));
        })})),style:{fill,stroke:null,opacity:100},zIndex:14});
    });
    const meniscus=edge(0.035,0.965,0.88);
    // Paths render their anchors/handles directly; x/y metadata is not a transform.
    elements.push({id:`${spec.id}.meniscus-base`,type:"path",x:0,y:0,closed:false,points:edge(0.035,0.965,0.88,.45),
      style:{fill:null,stroke:"#4B8587",strokeWidth:1.6,opacity:70},zIndex:15});
    elements.push({id:`${spec.id}.meniscus`,type:"path",x:0,y:0,closed:false,points:meniscus,
      style:{fill:null,stroke:"#F2FFFF",strokeWidth:.75,opacity:90},zIndex:16});
  }
  const gradient=(suffix:string,stops:Array<{offset:number;color:string}>):VectorPaint=>({
    id:`${spec.id}.${suffix}`,type:"linear_gradient",x1:0,y1:0,x2:0,y2:1,stops});
  const paints=[
    gradient("surface-paint",[{offset:0,color:tint(0)},{offset:100,color:tint(0)}]),
    gradient("edge-paint",[{offset:0,color:"#ACCBD2"},{offset:48,color:"#457284"},{offset:100,color:"#93B8C2"}]),
    gradient("wet-paint",[{offset:0,color:"#E6FFFF"},{offset:42,color:"#A4DCE0"},{offset:100,color:"#3D8E9A"}])
  ];
  return {elements,paints,top,lip,side,detailLocator:{points:region(.18,.34,.5,.8),anchor:point(.26,.8),surfaceParameters:{u0:.18,u1:.34,v0:.5,v1:.8}},edgeLighting:{version:"film-local-edge-light.v1",bands:edgeBands,coordinates:"local_thickness",measured:false},shadow:shadow.parameters,lighting:{lightTilt,sharpness,lightSpread,sampleCount:lightSamples.length,resolution:32,levels,measured:false,
    ...(spec.surfaceFinish?{surfaceFinish:spec.surfaceFinish,finishVersion:spec.surfaceFinish==="studio"?"film-studio-response.v1":"film-satin-response.v1",applied:!spec.wet}: {})},
    liquidLayer:spec.wet?{version:"curved-liquid-light.v2",relativeRelief:wetLayerRelief,footprint:[.035,.965,.045,.88],meniscusBaseOffset:.45,measured:false,applicationMethod:"unspecified"}:null,groups};
}

export interface MaterialSpecimenOptions {
  softFilmShadow?:boolean;
  satinFilm?:boolean;
  asymmetricFilm?:boolean;
  /** Retain the authored activation anatomy instead of a second sheet. */
  retainActivationCutaway?:boolean;
  overviewMorphologyDetail?:boolean;
  softDetailEdge?:boolean;
  /** Qualitative overview light direction; shared by reflection and shadow. */
  filmLightTilt?:{x:number;y:number};
}

/** Specimen overview above an unchanged molecular geometry with a ghosted envelope. */
export function createMaterialSpecimenStudy(input:unknown,options:MaterialSpecimenOptions={}) {
  const source=normalizeScene(input);
  const hero=createMaterialHeroStudy(source,{layout:"interface_plate",activationDetail:options.retainActivationCutaway,softDetailEdge:options.softDetailEdge});
  const hostPalette=options.retainActivationCutaway?materialCutawayPalette(hero.scene):undefined;
  if(hostPalette)hero.scene=hostPalette.scene;
  const roles=["polymer_material","capillary_activation"];
  const supports=roles.map(role=>source.semantics!.objects.find(o=>o.properties?.materialRealismRole===role)!);
  if(!/\b(film|coating|sheet)\b/i.test(supports[0]!.label??"")) {
    throw new ValidationError("Specimen overview requires an explicitly identified film, coating or sheet.");
  }
  const replacements=options.retainActivationCutaway?supports.slice(0,1):supports;
  const replacedIds=new Set(replacements.flatMap(o=>o.elementIds));
  const elements=hero.scene.elements.filter(e=>!replacedIds.has(e.id??""));
  const paints=[...(hero.scene.paints??[])];
  const groups=[...(hero.scene.groups??[])];
  const records=replacements.map((object,index)=> {
    const id=`${object.id}.specimen-overview`;
    const spec:FilmSpecimenSpec={id,x:index===0?80:740,y:190,width:365,depth:86,bow:23,thickness:2.1,wet:index===1,curl:27.52,twist:6.45,lightSpread:{x:.075,y:.025}};
    // One surface controls geometry, normals, liquid footprint and shadow.
    // This is an illustrative pose, not a deformation caused by treatment.
    if(options.asymmetricFilm)Object.assign(spec,{y:170,depth:96,bow:32,curl:50,twist:10,thickness:3.4});
    if(options.retainActivationCutaway)spec.y+=65;
    if(options.softFilmShadow)spec.emitterSpread={x:.14,y:.24};
    if(options.satinFilm)spec.surfaceFinish="satin";
    if(options.filmLightTilt)spec.lightTilt={...options.filmLightTilt};
    const geometry=filmSpecimenGeometry(spec);
    elements.push(...geometry.elements);
    paints.push(...geometry.paints);
    groups.push(...geometry.groups);
    return {sourceObjectId:object.id,sourceElementIds:object.elementIds,spec,lighting:geometry.lighting,edgeLighting:geometry.edgeLighting,shadow:geometry.shadow,liquidLayer:geometry.liquidLayer,detailLocator:geometry.detailLocator,
      replacementElementIds:geometry.elements.map(e=>e.id!)};
  });
  const qualifier=elements.find(e=>e.id==="hero.qualifier");
  if(qualifier?.type==="text") qualifier.text=options.retainActivationCutaway
    ? "Illustrative film • activation cutaway • enlarged interface • not experimental data"
    : "Illustrative specimen views • enlarged molecular cutaway • not experimental data";
  const objects=hero.scene.semantics!.objects.map(o=> {
    const replacement=records.find(r=>r.sourceObjectId===o.id);
    return replacement?{...o,elementIds:replacement.replacementElementIds,
      properties:{...o.properties,presentationDepiction:"qualitative_thin_sheet",physicalCalibration:false}}:o;
  });
  const retained=new Set(elements.map(e=>e.id));
  const morphologyDetail=options.overviewMorphologyDetail?(()=>{
    if(!options.retainActivationCutaway)throw new ValidationError("Morphology detail requires the expanded activation cutaway layout.");
    const owner=objects.find(o=>o.id===supports[0]!.id)!;
    const amorphous=supports[0]!.properties?.morphologyMode==="amorphous";
    const prefix=amorphous?`${owner.id}.chain-`:`${owner.id}.crystallite-1.`;
    const selected=source.elements.filter(e=>e.id?.startsWith(prefix)&&supports[0]!.elementIds.includes(e.id!)
      &&(!amorphous||/\.chain-(?:[a-z-]+-)?[12]$/.test(e.id!)));
    if(!selected.length||selected.some(e=>e.type!=="path"))throw new ValidationError("Morphology detail requires an authored crystalline or amorphous assembly.");
    if(amorphous)for(const index of [1,2])for(const suffix of ["", "scatter-", "shadow-", "rounded-light-", "rounded-crest-", "specular-glint-"])
      if(!selected.some(e=>e.id===`${prefix}${suffix}${index}`))throw new ValidationError("Amorphous detail requires complete authored chain assemblies.");
    const points=selected.flatMap(e=>e.type==="path"?e.points.flatMap(p=>[{x:p.x+e.x,y:p.y+e.y},...(p.leftX===undefined?[]:[{x:p.leftX+e.x,y:p.leftY!+e.y}]),...(p.rightX===undefined?[]:[{x:p.rightX+e.x,y:p.rightY!+e.y}])]):[]);
    const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
    const width=Math.max(...points.map(p=>p.x))-left,height=Math.max(...points.map(p=>p.y))-top;
    const scale=Math.min(190/width,75/height),dx=95-left*scale,dy=380-top*scale;
    const mappings=selected.map(e=>{
      if(e.type!=="path")throw new ValidationError("Morphology detail requires vector paths.");
      const id=`${owner.id}.morphology-detail.${e.id}`;
      const detailStyle={...e.style,...(e.style?.strokeWidth===undefined?{}:{strokeWidth:e.style.strokeWidth*scale})};
      if(!amorphous) {
        // This separate detail is viewed on white, not through the host film.
        // Retain the source geometry and relative sheet ordering, but remove
        // host-depth veiling and let the existing front/side paints read.
        const part=e.id!.slice(prefix.length),opacity=e.style?.opacity??100;
        if(/(?:^|\.)(front|extrusion-top|extrusion-side)$/.test(part))detailStyle.opacity=60+.4*opacity;
        else if(/^stem-\d+$/.test(part))detailStyle.opacity=Math.max(45,opacity);
        else if(/^tie-chain-(left|right)\.body$/.test(part))detailStyle.opacity=85;
        else if(/^fold-loop-\d+$/.test(part))detailStyle.opacity=80;
        else if(/(?:^|\.)(glint|highlight)$/.test(part))detailStyle.opacity=Math.min(35,opacity);
        else if(part==="depth-veil"||part==="depth-rim")detailStyle.opacity=0;
      }
      elements.push({...transformGeometryElement(e,{a:scale,b:0,c:0,d:scale,e:dx,f:dy}),id,name:id,groupId:undefined,
        style:detailStyle});
      owner.elementIds.push(id);return {sourceElementId:e.id!,elementId:id,sourceStyle:structuredClone(e.style),displayStyle:structuredClone(detailStyle)};
    });
    const locator=records.find(r=>r.sourceObjectId===owner.id)!.detailLocator;
    const locatorId=`${owner.id}.morphology-detail.locator`,leaderId=`${owner.id}.morphology-detail.leader`;
    const destination={x:95+width*scale/2,y:374};
    elements.push({id:locatorId,type:"path",x:0,y:0,closed:true,points:locator.points,
      style:{fill:null,stroke:"#526B7A",strokeWidth:1,dashArray:[3,3],opacity:75},zIndex:90});
    elements.push({id:leaderId,type:"path",x:0,y:0,closed:false,points:[
      {...locator.anchor,rightX:locator.anchor.x,rightY:locator.anchor.y+18},
      {...destination,leftX:destination.x,leftY:destination.y-18}],
      style:{fill:null,stroke:"#526B7A",strokeWidth:1,opacity:75},zIndex:90});
    owner.elementIds.push(locatorId,leaderId);
    for(const [suffix,y,text] of [["label",393,amorphous?"Amorphous detail":"Lamellar detail"],["qualifier",425,"Illustrative • not to scale"]] as const){
      const id=`${owner.id}.morphology-detail.${suffix}`;
      elements.push({id,type:"text",x:310,y,text,size:21,font:"Arial",style:{fill:"#243548"},zIndex:100});owner.elementIds.push(id);
    }
    return {sourceObjectId:owner.id,morphologyMode:amorphous?"amorphous":"crystalline",displayOptics:amorphous?"source":"isolated-lamellar-detail.v1",sourceAssemblyPrefix:prefix,scale,dx,dy,mappings,locator:{elementIds:[locatorId,leaderId],surfaceParameters:locator.surfaceParameters,anchor:locator.anchor,destination,interpretation:"illustrative_detail_locator_not_sampled_roi"},interpretation:"authored_domain_detail_not_measured_micrograph"};
  })():undefined;
  for(const element of elements) if(element.type==="text") element.size=Math.max(21,element.size??12);
  const legendTransforms=enlargeMolecularKeys(elements);
  const overviewKeys=legendTransforms.map((key,index)=> {
    const selected=elements.filter(e=>key.elementIds.includes(e.id!));
    const note=elements.find(e=>e.id===`hero.stage-${index}.note`)!;
    const object=objects.find(o=>o.id===supports[index]!.id)!;
    const points=selected.flatMap(e=>e.type==="path"?e.points.map(p=>({x:p.x+e.x,y:p.y+e.y}))
      :e.type==="line"?[{x:e.x,y:e.y},{x:e.x2,y:e.y2}]
      :e.type==="ellipse"||e.type==="rect"?[{x:e.x,y:e.y},{x:e.x+e.width,y:e.y+e.height}]:[]);
    const cx=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2;
    const cy=(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2;
    const scale=2,dx=note.x+34-cx*scale,dy=note.y+2-cy*scale;
    const mappings=[];
    for(const source of selected) {
      if(source.type==="text") throw new ValidationError("Overview keys must be authored vector glyphs.");
      const moved=source.type==="ellipse"||source.type==="rect"
        ? {...source,x:source.x*scale+dx,y:source.y*scale+dy,width:source.width*scale,height:source.height*scale}
        : transformGeometryElement(source,{a:scale,b:0,c:0,d:scale,e:dx,f:dy});
      const id=`${object.id}.overview-key.${source.id}`;
      elements.push({...moved,id,name:id,groupId:undefined,zIndex:100,
        style:{...source.style,...(source.style?.strokeWidth===undefined?{}:{strokeWidth:source.style.strokeWidth*scale})}});
      object.elementIds.push(id);mappings.push({sourceElementId:source.id!,elementId:id});
    }
    note.x+=94;
    if(index===1) {
      const label=elements.find(e=>e.id==="program.legend.diol-label"||e.id==="program.legend.transformed-site-label");
      if(!label||label.type!=="text") throw new ValidationError("Transformed motif requires its authored label.");
      const id=`${object.id}.overview-key.label`;
      elements.push({...label,id,name:id,x:note.x,y:note.y,size:21,groupId:undefined,zIndex:100});
      object.elementIds.push(id);mappings.push({sourceElementId:label.id!,elementId:id});
      // The treatment sits below the wider fork/atom cluster, beside its narrow
      // lower stem. A smaller indent preserves clearance from the process arrow.
      note.x-=30;note.y+=28;
    }
    return {sourceObjectId:object.id,scale,dx,dy,mappings,interpretation:"authored_group_motif_not_specimen_scale_or_conversion_fraction"};
  });
  const relationships=hero.scene.semantics!.relationships?.map(r=> {
    const ids=r.visualElementIds?.filter(id=>retained.has(id));
    if(!ids?.length) throw new ValidationError(`Specimen study would lose relationship ${r.id}.`);
    return {...r,visualElementIds:ids};
  });
  const usedPaints=new Set(elements.map(e=>e.style?.fillPaint).filter(Boolean));
  const scene=normalizeScene({...hero.scene,elements,groups,paints:paints.filter(p=>usedPaints.has(p.id)),semantics:{objects,relationships}});
  const ghosted=ghostPolymerCutaway(scene,.42,true);
  const crossings=[];
  const pairContacts=[];
  const crop=ghosted.scene.groups!.find(g=>g.id==="hero.crop")!.clip!;
  for(const object of ghosted.scene.semantics!.objects.filter(o=>o.properties?.materialRealismRole==="buried_interphase")) {
    const chains=ghosted.scene.elements.filter((e):e is Extract<VectorElement,{type:"path"}>=>e.type==="path"&&object.elementIds.includes(e.id!)&&/\.chain-\d+$/.test(e.id!));
    for(const under of chains)for(const over of chains) {
      if((over.zIndex??0)-(under.zIndex??0)<2)continue;
      const cues=chainPairContactShadows(under,over);
      const visible=cues.crossings.flatMap((c,index)=>crop.type==="rect"&&c.point.x>crop.x+12&&c.point.x<crop.x+crop.width-12&&c.point.y>crop.y+12&&c.point.y<crop.y+crop.height-12?[index]:[]);
      const derived=cues.elements.filter(e=>visible.some(i=>e.id!.startsWith(`${cues.group.id}.${i}.`)));
      if(!derived.length)continue;
      ghosted.scene.groups!.push(cues.group);
      ghosted.scene.elements.push(...derived);object.elementIds.push(...derived.map(e=>e.id!));
      pairContacts.push({underElementId:under.id!,overElementId:over.id!,groupId:cues.group.id,elementIds:derived.map(e=>e.id!),crossings:cues.crossings.filter((_,i)=>visible.includes(i))});
    }
    for(const chain of ghosted.scene.elements.filter(e=>object.elementIds.includes(e.id!)&&/\.chain-\d+$/.test(e.id!))) {
      if(chain.type!=="path") continue;
      const cues=chainCrossingCues(chain);
      const visible=cues.crossings.flatMap((c,index)=>crop.type==="rect"&&c.point.x+chain.x>crop.x+12&&c.point.x+chain.x<crop.x+crop.width-12&&c.point.y+chain.y>crop.y+12&&c.point.y+chain.y<crop.y+crop.height-12?[index]:[]);
      const derived=cues.elements.filter(e=>visible.some(index=>e.id!.startsWith(`${chain.id}.crossing-${index}.`)));
      ghosted.scene.elements.push(...derived);
      object.elementIds.push(...derived.map(e=>e.id!));
      if(derived.length) crossings.push({sourceChainId:chain.id,coordinateSpace:"scene",crossings:cues.crossings.filter((_,i)=>visible.includes(i)).map(c=>({...c,point:{x:c.point.x+chain.x,y:c.point.y+chain.y}})),elementIds:derived.map(e=>e.id!)});
    }
  }
  const associations=unifyPublicationAssociations(ghosted.scene,{showBoundary:true});
  // Reserve scientific presentation geometry before selecting lighting density.
  const softened=softenPublicationTubes(associations.scene,{sampling:options.retainActivationCutaway?"compact":"auto",rimShading:true});
  return {scene:softened.scene,provenance:{...hero.provenance,schemaVersion:"MaterialSpecimenStudy.v1",layout:"specimen_overview",
    associationStyle:associations.treatment,
    ...(hostPalette?{hostPalette:hostPalette.provenance}:{}),
    tubeLighting:softened.treatment,
    chainCrossings:{version:"chain-crossing-cues.v2",extent:"distance_window_across_source_cubics",ordering:"later_traversal_overpass_illustrative_not_simulated",records:crossings},
    pairContacts:{version:"clipped-strand-contact.v1",interpretation:"illustrative_depth_cue_not_chemical_bond_or_measured_contact",records:pairContacts},
    cutawayTreatment:ghosted.treatment,
    legendTransforms,
    overviewKeys,
    ...(morphologyDetail?{morphologyDetail}:{}),
    surfaceLightingVersion:"normal-field-vector-contours.v1",
    ...(options.retainActivationCutaway?{activationPresentation:"retained_source_cutaway"}:{}),
    representations:records,operations:["replace_overview_with_qualitative_thin_sheet","curvature_linked_vector_surface_lighting","retain_exact_interface_crop","retain_sequence_and_legend"],
    limitations:["isolated_layer_illustration_not_proven_freestanding_specimen","curvature_not_measured_bending_response","not_measured_specimen_shape","not_measured_optics","no_physical_scale","overview_omits_molecular_detail"]}};
}

/** Keep each authored key intact but make its complete silhouette legible. */
function enlargeMolecularKeys(elements:VectorElement[]) {
  const pairs=[["cyclic-key","protected-label"],["diol-key","diol-label"],
    ["initial-site-","initial-site-label"],["transformed-site-","transformed-site-label"]];
  const transforms=[];
  for(const [key,labelId] of pairs) {
    const prefix=`program.legend.${key}`;
    const selected=elements.filter(e=>e.type!=="text"&&e.id?.startsWith(prefix));
    const label=elements.find(e=>e.id===`program.legend.${labelId}`);
    if(!selected.length||label?.type!=="text") continue;
    const points=selected.flatMap(e=>e.type==="path"||e.type==="polygon"
      ? e.points.map(p=>({x:p.x+e.x,y:p.y+e.y}))
      : e.type==="line"?[{x:e.x,y:e.y},{x:e.x2,y:e.y2}]
      : e.type==="ellipse"||e.type==="rect"?[{x:e.x,y:e.y},{x:e.x+e.width,y:e.y+e.height}]:[]);
    const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x));
    const top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
    const scale=36/Math.max(right-left,bottom-top),cx=(left+right)/2,cy=(top+bottom)/2;
    if(!Number.isFinite(scale)||scale<=0) throw new ValidationError("Invalid molecular legend extent.");
    const dx=cx*(1-scale),dy=label.y+10-cy*scale;
    for(const e of selected) {
      if(e.type==="text") continue;
      const moved=e.type==="ellipse"||e.type==="rect"
        ? {...e,x:e.x*scale+dx,y:e.y*scale+dy,width:e.width*scale,height:e.height*scale}
        : transformGeometryElement(e,{a:scale,b:0,c:0,d:scale,e:dx,f:dy});
      moved.style={...e.style,...(e.style?.strokeWidth===undefined?{}:{strokeWidth:e.style.strokeWidth*scale})};
      elements[elements.indexOf(e)]=moved;
    }
    transforms.push({prefix,scale,dx,dy,elementIds:selected.map(e=>e.id!),targetMaximumExtent:36});
  }
  return transforms;
}
