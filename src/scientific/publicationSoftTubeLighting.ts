import { normalizeScene } from "../core/sceneValidation.js";
import { tubeLightingBand,tubeDiffuseBand,tubeShadeBands } from "./publicationTubeLighting.js";

/** Presentation-only smooth transverse sheen. Original tube silhouette, sites,
 * topology, and optical depth remain authoritative. Not physical light transport. */
export function softenPublicationTubes(input:unknown,options:{sampling?:"full"|"compact"|"auto";rimShading?:boolean}={}) {
  if(options.sampling!==undefined&&!['full','compact','auto'].includes(options.sampling)) throw new Error("Unsupported tube lighting sampling");
  if(options.rimShading!==undefined&&typeof options.rimShading!=="boolean")throw new Error("Unsupported tube rim shading");
  const scene=normalizeScene(input),records=[];
  let fullAdditionCount=0,fullFits=true;
  for(const object of scene.semantics?.objects??[]) {
    if(object.properties?.materialRealismRole!=="buried_interphase")continue;
    const added=scene.elements.reduce((n,e)=>{
      const match=e.id?.match(/\.(chain|matrix-filament)-\d+$/);
      return n+(match&&object.elementIds.includes(e.id!)&&e.type==="path"&&e.closed?(match[1]==="chain"?28:14):0);
    },0);
    fullAdditionCount+=added;
    if(object.elementIds.length+added>500)fullFits=false;
  }
  fullFits=fullFits&&scene.elements.length+fullAdditionCount<=1200;
  const compact=options.sampling==="compact"||(options.sampling==="auto"&&!fullFits);
  for(const object of scene.semantics?.objects??[]) {
    if(object.properties?.materialRealismRole!=="buried_interphase") continue;
    for(const body of [...scene.elements]) {
      const match=body.id?.match(/^(.*)\.(chain|matrix-filament)-(\d+)$/);
      if(!match||!object.elementIds.includes(body.id!)||body.type!=="path"||!body.closed) continue;
      const changedElementIds:string[]=[];
      const secondary=match[2]==="matrix-filament";
      for(const family of secondary?["highlight"]:["rounded-light","rounded-crest","specular-glint"]) {
        const id=`${match[1]}.${match[2]}-${family}-${match[3]}`;
        const old=scene.elements.find(e=>e.id===id);
        if(!old||!object.elementIds.includes(id)) throw new Error(`Missing tube lighting ${id}`);
        old.style={...old.style,opacity:family==="specular-glint"||family==="highlight"?(old.style?.opacity??100)*.2:0};
        changedElementIds.push(id);
      }
      const elementIds:string[]=[];
      // Nested circular diffuse level sets replace a constant-reach stripe.
      // Anchor fractions are bounded by the authored paired edges.
      const light={x:-.6,y:-.8,z:1.4};
      const shaded=options.rimShading&&!secondary;
      const levels=(secondary?8:shaded?12:16)/(compact?2:1),maximumAlpha=(secondary ? .30 : .43)*(body.style?.opacity??100)/100;
      const rimElementIds:string[]=[],rimLevels=shaded?(compact?1:2):0;
      const rimMaximumAlpha=shaded ? .22*(body.style?.opacity??100)/100 : 0;
      const rimThresholds:number[]=[];
      for(let i=0;i<rimLevels;i++) {
        const threshold=rimLevels===1 ? .26 : .36-.2*i;
        const bands=tubeShadeBands(body.points,threshold,light);
        const outer=rimMaximumAlpha*i/rimLevels,inner=rimMaximumAlpha*(i+1)/rimLevels;
        const opacity=100*(inner-outer)/(1-outer);
        rimThresholds.push(threshold);
        for(const side of ["forward","reverse"] as const) {
          const id=`${body.id}.soft-rim-${side}-${i}`;
          if(scene.elements.some(e=>e.id===id))throw new Error("Tube lighting already softened");
          scene.elements.push({id,type:"path",x:body.x,y:body.y,groupId:body.groupId,closed:true,
            points:bands[side],style:{fill:"#1E293B",stroke:null,opacity},zIndex:body.zIndex??0});
          object.elementIds.push(id);elementIds.push(id);rimElementIds.push(id);
        }
      }
      const diffuseThresholds:number[]=[];
      for(let i=0;i<levels;i++) {
        const outer=i/levels,inner=(i+1)/levels;
        const cumulative=(t:number)=>maximumAlpha*(1-Math.cos(Math.PI*t))/2;
        const opacity=100*(cumulative(inner)-cumulative(outer))/(1-cumulative(outer));
        const id=`${body.id}.soft-sheen-${i}`;
        const threshold=(.12+.86*outer)*light.z/Math.hypot(light.x,light.y,light.z);
        diffuseThresholds.push(threshold);
        if(scene.elements.some(e=>e.id===id)) throw new Error("Tube lighting already softened");
        scene.elements.push({id,type:"path",x:body.x,y:body.y,groupId:body.groupId,closed:true,
          points:tubeDiffuseBand(body.points,threshold,light).points,
          style:{fill:"#FFFFFF",stroke:null,opacity},zIndex:body.zIndex??0});
        object.elementIds.push(id);elementIds.push(id);
      }
      const shadowId=`${match[1]}.${match[2]}-shadow-${match[3]}`;
      const shadow=scene.elements.find(e=>e.id===shadowId);
      if(!shadow||shadow.type!=="path"||!shadow.closed||!object.elementIds.includes(shadowId))
        throw new Error(`Missing tube shadow ${shadowId}`);
      const shadowPeakAlpha=Math.min(.5,(shadow.style?.opacity??100)/100*1.25),shadowLevels=(secondary?6:12)/(compact?2:1),shadowElementIds:string[]=[];
      shadow.style={...shadow.style,opacity:0};changedElementIds.push(shadowId);
      for(let i=0;i<shadowLevels;i++) {
        const t=i/shadowLevels,next=(i+1)/shadowLevels;
        const cumulative=(u:number)=>shadowPeakAlpha*(1-Math.cos(Math.PI*u))/2;
        const opacity=100*(cumulative(next)-cumulative(t))/(1-cumulative(t));
        const id=`${body.id}.soft-shadow-${i}`,inset=t*.5;
        scene.elements.push({id,type:"path",x:shadow.x,y:shadow.y,groupId:shadow.groupId,closed:true,
          points:tubeLightingBand(shadow.points,inset,1-inset),
          style:{fill:shadow.style.fill,stroke:null,opacity},zIndex:shadow.zIndex??0});
        object.elementIds.push(id);elementIds.push(id);shadowElementIds.push(id);
      }
      records.push({sourceChainId:body.id!,role:secondary?"background_matrix":"primary_chain",changedElementIds,elementIds,levels,light,maximumAlpha,diffuseThresholds,
        rim:{elementIds:rimElementIds,levels:rimLevels,maximumAlpha:rimMaximumAlpha,thresholds:rimThresholds},
        shadow:{sourceElementId:shadowId,elementIds:shadowElementIds,levels:shadowLevels,maximumAlpha:shadowPeakAlpha}});
    }
  }
  return {scene:normalizeScene(scene),treatment:{version:"soft-tube-sheen.v7",sampling:compact?"compact":"full",crossSectionModel:"assumed_circular_lambertian",measured:false,records}};
}
