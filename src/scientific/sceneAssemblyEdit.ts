import {normalizeScene} from '../core/sceneValidation.js';
import {transformGeometryElement,transformPoint} from '../core/affineTransform.js';
import type {VectorElement} from '../core/vectorScene.js';
import {constructionDigest} from './figureConstruction.js';
import {Resvg} from '@resvg/resvg-js';
import {renderSceneToSvg} from '../render/svgRenderer.js';

export interface SceneAssemblyMove {
 schemaVersion:'SceneAssemblyMove.v1';baseDigest:string;objectIds:string[];
 dx:number;dy:number;rationale:string;
}
export interface SceneAssemblyTransform {
 schemaVersion:'SceneAssemblyTransform.v1';baseDigest:string;objectIds:string[];
 dx:number;dy:number;scale:number;origin:{x:number;y:number};rationale:string;
}
export type SceneAssemblyEdit=SceneAssemblyMove|SceneAssemblyTransform;
/** Move whole semantic assemblies in any complete scene. Text/science and styling
 * are immutable; only placement and connected straight/polyline routes change.
 * Curved relationships and non-triangular markers fail closed, not approximated. */
export function moveSceneAssemblies(input:unknown,edit:SceneAssemblyMove){
 return editSceneAssemblies(input,edit);
}
/** Uniform geometry scaling preserves font sizes, stroke widths and arrowhead sizes.
 * Origins are explicit scene coordinates, never inferred from shifting bounds. */
export function editSceneAssemblies(input:unknown,edit:SceneAssemblyEdit){
 const scene=normalizeScene(input),before=constructionDigest(scene);
 if(!Number.isFinite(scene.document?.width)||!Number.isFinite(scene.document?.height)||scene.document!.width!<=0||scene.document!.height!<=0)throw Error('Assembly edits require explicit positive document dimensions');
 if(scene.elements.some(e=>!e.id))throw Error('Assembly edits require stable element IDs');
 const transform=edit?.schemaVersion==='SceneAssemblyTransform.v1';
 const keys=['schemaVersion','baseDigest','objectIds','dx','dy','rationale',...(transform?['scale','origin']:[])];
 if(!edit||Object.keys(edit).some(k=>!keys.includes(k))||(!transform&&edit.schemaVersion!=='SceneAssemblyMove.v1')||edit.baseDigest!==before)throw Error('Invalid or stale assembly edit');
 if(transform&&(!Number.isFinite(edit.scale)||edit.scale<.25||edit.scale>4||!edit.origin||Object.keys(edit.origin).some(k=>!['x','y'].includes(k))||![edit.origin.x,edit.origin.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=2000)))throw Error('Invalid assembly transform');
 const scale=transform?edit.scale:1,origin=transform?edit.origin:{x:0,y:0};
 if(!Array.isArray(edit.objectIds)||!edit.objectIds.length||edit.objectIds.length>24||new Set(edit.objectIds).size!==edit.objectIds.length||![edit.dx,edit.dy].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=2000)||typeof edit.rationale!=='string'||!edit.rationale.trim()||edit.rationale.length>4000)throw Error('Invalid assembly move');
 const objects=scene.semantics?.objects??[],links=scene.semantics?.relationships??[];
 if(edit.objectIds.some(id=>!objects.some(o=>o.id===id)))throw Error('Unknown semantic assembly');
 const selected=new Set(edit.objectIds),relationIds=new Set(links.flatMap(r=>r.visualElementIds??[]));
 const owned=new Set(objects.filter(o=>selected.has(o.id)).flatMap(o=>o.elementIds).filter(id=>!relationIds.has(id)));
 if(objects.some(o=>!selected.has(o.id)&&o.elementIds.some(id=>owned.has(id))))throw Error('Geometry shared with an unselected assembly');
 const movedLinks=links.filter(r=>selected.has(r.sourceObjectId)||selected.has(r.targetObjectId));
 if(edit.objectIds.some(id=>!objects.find(o=>o.id===id)!.elementIds.some(e=>owned.has(e))&&!movedLinks.some(r=>(r.sourceObjectId===id||r.targetObjectId===id)&&(r.visualElementIds?.length??0)>0)))throw Error('Selected assembly has no editable geometry or incident relationship visuals');
 const routeShapes=new Set(movedLinks.flatMap(r=>r.visualElementIds??[]));
 const touched=new Set([...owned,...routeShapes]);
 const rigidRoutes=new Set(movedLinks.filter(r=>selected.has(r.sourceObjectId)&&selected.has(r.targetObjectId)).flatMap(r=>r.visualElementIds??[]));
 const listed=movedLinks.flatMap(r=>r.visualElementIds??[]);
 if(listed.length!==routeShapes.size)throw Error('Shared relationship geometry');
 if(links.some(r=>!movedLinks.includes(r)&&r.visualElementIds?.some(id=>routeShapes.has(id))))throw Error('Shared relationship geometry');
 const m={a:scale,b:0,c:0,d:scale,e:edit.dx+origin.x*(1-scale),f:edit.dy+origin.y*(1-scale)},elements=new Map(scene.elements.map(e=>[e.id!,e]));
 const shifted=(e:VectorElement):VectorElement=>{
  // Keep rect/ellipse primitives intact for byte-identical no-op replay and compact state.
  if(e.type==='text')return {...e,...transformPoint(e,m)};
  if(e.type==='rect'||e.type==='ellipse')return {...e,...transformPoint(e,m),width:e.width*scale,height:e.height*scale};
  return transformGeometryElement(e,m);
 };
 const descendants=(id:string):Set<string>=>{const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const g of scene.groups??[])if(g.parentId&&ids.has(g.parentId)&&!ids.has(g.id)){ids.add(g.id);changed=true;}}return ids;};
 const groupMoves=new Set<string>();
 for(const g of scene.groups??[]){
  const ids=descendants(g.id),children=scene.elements.filter(e=>e.groupId&&ids.has(e.groupId));
  if(!children.some(e=>touched.has(e.id!)))continue;
  if(g.clip&&children.some(e=>!touched.has(e.id!)))throw Error('Clipping group shared with an unselected assembly');
  if(g.clip&&children.some(e=>routeShapes.has(e.id!)&&!rigidRoutes.has(e.id!)))throw Error('Clipped relationships require both endpoint assemblies to move');
  if(g.clip)groupMoves.add(g.id);
 }
 // Absolute gradients cannot simply travel with one object if other objects share them.
 const movedPaints=new Set<string>();
 for(const id of touched){const e=elements.get(id)!;for(const p of [e.style?.fillPaint,e.style?.strokePaint])if(p)movedPaints.add(p);}
 if(scene.paints?.some(p=>movedPaints.has(p.id)&&(p.units==='user_space'||p.transform)))throw Error('Assembly moves require object-relative untransformed paints');
 if(edit.dx===0&&edit.dy===0&&scale===1)return {scene,event:{...structuredClone(edit),before,after:before,changedElementIds:[],invalidatesVisualReview:false},finalApproval:false};
 const changed=new Set<string>();
 for(const id of owned){elements.set(id,shifted(elements.get(id)!));changed.add(id);}
 for(const g of scene.groups??[])if(groupMoves.has(g.id)&&g.clip){
  const c=g.clip;
  if(c.type==='rect'||c.type==='ellipse')g.clip={...c,...transformPoint(c,m),width:c.width*scale,height:c.height*scale};
  else g.clip={...c,x:0,y:0,points:c.points.map(p=>{
   const q=transformGeometryElement({type:'path',x:0,y:0,points:[p],closed:false},m);
   if(q.type!=='path')throw Error('Unexpected clip conversion');return q.points[0]!;
  })};
 }
 for(const r of movedLinks){
  const ids=r.visualElementIds??[],visuals=ids.map(id=>elements.get(id));
  const paths=visuals.filter(e=>e?.type==='path'&&!e.closed),heads=visuals.filter(e=>e?.type==='polygon'||e?.type==='path'&&e.closed);
  if(paths.length!==1||heads.length>1||paths.length+heads.length!==visuals.length)throw Error('Unsupported relationship geometry');
  const path=paths[0]!;if(path.type!=='path'||path.points.length<2||path.points.some(p=>p.leftX!==undefined||p.rightX!==undefined))throw Error('Curved relationships need explicit routing');
  const old=structuredClone(path.points),pts=structuredClone(old),last=pts.length-1;
  const source=selected.has(r.sourceObjectId),target=selected.has(r.targetObjectId);
  if(source&&target){for(let i=0;i<pts.length;i++)pts[i]=transformPoint(pts[i]!,m);}
  else{
   if(source)pts[0]=transformPoint(pts[0]!,m);
   if(target)pts[last]=transformPoint(pts[last]!,m);
   // Carry endpoint-adjacent bends along the same original horizontal/vertical axis.
   if(pts.length>2){
    if(source){if(old[0]!.x===old[1]!.x)pts[1]!.x+=pts[0]!.x-old[0]!.x;else if(old[0]!.y===old[1]!.y)pts[1]!.y+=pts[0]!.y-old[0]!.y;}
    if(target){if(old[last]!.x===old[last-1]!.x)pts[last-1]!.x+=pts[last]!.x-old[last]!.x;else if(old[last]!.y===old[last-1]!.y)pts[last-1]!.y+=pts[last]!.y-old[last]!.y;}
   }
  }
  if(pts.some((p,i)=>i>0&&Math.hypot(p.x-pts[i-1]!.x,p.y-pts[i-1]!.y)<1))throw Error('Assembly move collapses a connector segment');
  elements.set(path.id!,{...path,points:pts});changed.add(path.id!);
  const head=heads[0];if(head){
   if(!(head.type==='polygon'||head.type==='path')||head.points.length!==3||head.points.some(p=>('leftX' in p&&p.leftX!==undefined)||('rightX' in p&&p.rightX!==undefined)))throw Error('Only triangular arrowheads can be reattached');
   const a=old[last]!,b=pts[last]!,oldPrev=old[last-1]!,prev=pts[last-1]!;
   if(!head.points.some(p=>Math.hypot(p.x-a.x,p.y-a.y)<1e-6))throw Error('Arrowhead not attached to route endpoint');
   const angle=Math.atan2(b.y-prev.y,b.x-prev.x)-Math.atan2(a.y-oldPrev.y,a.x-oldPrev.x),cos=Math.cos(angle),sin=Math.sin(angle);
   elements.set(head.id!,{...head,points:head.points.map(p=>({x:b.x+cos*(p.x-a.x)-sin*(p.y-a.y),y:b.y+sin*(p.x-a.x)+cos*(p.y-a.y)}))});changed.add(head.id!);
  }
 }
 scene.elements=scene.elements.map(e=>elements.get(e.id!)!);
 const width=scene.document!.width!,height=scene.document!.height!;
 const boundsPoints=(e:VectorElement):Array<{x:number;y:number}>=>{
  if(e.type==='text'){
   if(e.visible===false||e.style?.opacity===0)return [];
   const svg=renderSceneToSvg({document:scene.document,elements:[{...e,groupId:undefined}],paints:scene.paints});
   const renderer=new Resvg(svg,{font:{loadSystemFonts:true,defaultFontFamily:'DejaVu Sans'},textRendering:1,logLevel:'off'}),box=renderer.getBBox();
   if(!box)throw Error('Unable to verify moved text bounds');
   return [{x:box.x,y:box.y},{x:box.x+box.width,y:box.y+box.height}];
  }
  if(e.type==='rect'||e.type==='ellipse')return [{x:e.x,y:e.y},{x:e.x+e.width,y:e.y+e.height}];
  if(e.type==='line')return [{x:e.x,y:e.y},{x:e.x2,y:e.y2}];
  const points=e.type==='compound_path'?e.subpaths.flatMap(p=>p.points):e.points;
  return points.flatMap(p=>[p,...('leftX' in p&&p.leftX!==undefined&&'leftY' in p&&p.leftY!==undefined?[{x:p.leftX as number,y:p.leftY as number}]:[]),...('rightX' in p&&p.rightX!==undefined&&'rightY' in p&&p.rightY!==undefined?[{x:p.rightX as number,y:p.rightY as number}]:[])]);
 };
 for(const e of scene.elements)if(changed.has(e.id!)){
  const margin=(e.style?.stroke||e.style?.strokePaint)?(e.style.strokeWidth??1)/2:0;
  if(boundsPoints(e).some(p=>p.x-margin<0||p.y-margin<0||p.x+margin>width||p.y+margin>height))throw Error('Assembly move leaves document frame');
 }
 const result=normalizeScene(scene),after=constructionDigest(result);
 return {scene:result,event:{...structuredClone(edit),before,after,changedElementIds:[...changed],invalidatesVisualReview:after!==before},finalApproval:false};
}
