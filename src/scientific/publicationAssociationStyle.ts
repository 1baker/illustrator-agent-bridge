import {normalizeScene,ValidationError} from "../core/sceneValidation.js";

/** One visual convention for a proposed association, not strength/confidence data. */
export function unifyPublicationAssociations(input:unknown,options:{showBoundary?:boolean}={}) {
  const scene=normalizeScene(input);
  const relationships=scene.semantics?.relationships?.filter(r=>r.predicate==="associates_with")??[];
  if(!relationships.length) return {scene,treatment:{version:"association-style.v1",changedElementIds:[] as string[]}};
  const key=scene.elements.find(e=>e.id==="program.legend.association");
  if(!key||key.type!=="line") throw new ValidationError("Association styling requires its visual key.");
  const ids=[key.id!,...relationships.flatMap(r=>r.visualElementIds??[])];
  if(ids.length===1) throw new ValidationError("Association has no visual paths.");
  const style={fill:null,stroke:"#766488",strokeWidth:2.2,opacity:78,lineCap:"round" as const,dashArray:[5,5]};
  for(const id of ids) {
    const e=scene.elements.find(e=>e.id===id);
    if(!e||(e.type!=="line"&&e.type!=="path")||(e.type==="path"&&e.closed))
      throw new ValidationError(`Invalid association cue ${id}`);
    e.style={...style,dashArray:[...style.dashArray]};
  }
  const boundaries=[];
  if(options.showBoundary)for(const objectId of new Set(relationships.map(r=>r.sourceObjectId))) {
    const owner=scene.semantics!.objects.find(o=>o.id===objectId)!;
    const film=scene.elements.find(e=>e.id===`${objectId}.film`),zone=scene.elements.find(e=>e.id===`${objectId}.zone`);
    if(film?.type!=="path"||zone?.type!=="path"||film.groupId!=="hero.crop"||zone.groupId!==film.groupId)
      throw new ValidationError("Association boundary requires a shared cutaway film and zone.");
    const indices=film.points.flatMap((p,i)=>zone.points.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-8)?[i]:[]);
    if(indices.some((index,i)=>i>0&&index!==indices[i-1]!+1))throw new ValidationError("Association boundary must be one contiguous shared edge.");
    const points=indices.map(i=>film.points[i]!);
    if(points.length<2)throw new ValidationError("Association boundary has no shared edge.");
    const cueIds=relationships.filter(r=>r.sourceObjectId===objectId).flatMap(r=>r.visualElementIds??[]);
    for(const id of cueIds) {
      const cue=scene.elements.find(e=>e.id===id);
      if(cue?.type!=="path"||!points.some(p=>Math.hypot(p.x-cue.points[0]!.x,p.y-cue.points[0]!.y)<1e-8))
        throw new ValidationError(`Association start is not on the displayed boundary: ${id}`);
    }
    const id=`${objectId}.association-boundary`;
    if(scene.elements.some(e=>e.id===id))throw new ValidationError("Association boundary already exists.");
    scene.elements.push({id,type:"path",x:0,y:0,groupId:film.groupId,closed:false,points,
      style:{fill:null,stroke:"#738F87",strokeWidth:1.3,opacity:48,lineCap:"round"},zIndex:26});
    owner.elementIds.push(id);
    boundaries.push({elementId:id,sourceElementIds:[film.id!,zone.id!],associationElementIds:cueIds,interpretation:"authored_illustrative_boundary_not_measured_interface"});
  }
  return {scene:normalizeScene(scene),treatment:{version:"association-style.v2",changedElementIds:ids,boundaries}};
}
