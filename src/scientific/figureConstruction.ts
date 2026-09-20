import {createHash} from 'node:crypto';
import {normalizeScene} from '../core/sceneValidation.js';
import {transformGeometryElement,transformPoint} from '../core/affineTransform.js';
import type {VectorScene,VectorElement,VectorGroup,VectorStyle} from '../core/vectorScene.js';
import {canonicalJson} from './figureProject.js';

export interface ConstructionBrief {
 schemaVersion:'ConstructionBrief.v1'; prompt:string; title:string;
 width:number;height:number;widthMm:number;
 objects:Array<{id:string;kind:string;label:string}>;
 relationships:Array<{id:string;source:string;target:string;predicate:string}>;
 caption:string;
}
export interface FigureConstruction {
 schemaVersion:'FigureConstruction.v1';briefDigest:string;rationale:string;
 definitions:Record<string,{scene:VectorScene;ports:Record<string,{x:number;y:number}>}>;
 objects:Array<{id:string;definition:string;x:number;y:number;scale:number;labelX:number;labelY:number}>;
 connections:Array<{id:string;sourcePort:string;targetPort:string;via:Array<{x:number;y:number}>;lineStyle?:'solid'|'dashed';endMarker?:'arrow'|'none'}>;
}
export const constructionDigest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
const finite=(n:unknown,low:number,high:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=low&&n<=high;
const text=(s:unknown,max:number)=>typeof s==='string'&&!!s.trim()&&s.length<=max;
const exact=(o:object,keys:string[])=>{if(Object.keys(o).some(k=>!keys.includes(k)))throw Error('Unknown construction field');};
export function validateConstructionBrief(value:ConstructionBrief){
 const b=structuredClone(value);
 if(!b||b.schemaVersion!=='ConstructionBrief.v1'||!text(b.prompt,12000)||!text(b.title,120)||!text(b.caption,3000)||!finite(b.width,500,2000)||!finite(b.height,350,1600)||!finite(b.widthMm,80,220)||!Array.isArray(b.objects)||b.objects.length<1||b.objects.length>24||!Array.isArray(b.relationships)||b.relationships.length>40)throw Error('Invalid construction brief');
 exact(b,['schemaVersion','prompt','title','width','height','widthMm','objects','relationships','caption']);
 const ids=new Set<string>();
 for(const o of b.objects){exact(o,['id','kind','label']);if(!id(o.id)||ids.has(o.id)||!text(o.kind,80)||!text(o.label,90))throw Error('Invalid scientific object');ids.add(o.id);}
 for(const r of b.relationships){exact(r,['id','source','target','predicate']);if(!id(r.id)||ids.has(r.id)||!b.objects.some(o=>o.id===r.source)||!b.objects.some(o=>o.id===r.target)||!text(r.predicate,80))throw Error('Invalid scientific relationship');ids.add(r.id);}
 return b;
}

/** Declarative generic construction only: no subject-name dispatch, eval, code
 * execution, filesystem references, inferred measurements or provider calls. */
export function compileFigureConstruction(briefInput:ConstructionBrief,input:FigureConstruction){
 const brief=validateConstructionBrief(briefInput),p=structuredClone(input);
 if(!p||p.schemaVersion!=='FigureConstruction.v1'||p.briefDigest!==constructionDigest(brief)||!text(p.rationale,4000)||!p.definitions||typeof p.definitions!=='object'||Array.isArray(p.definitions)||Object.keys(p.definitions).length<1||Object.keys(p.definitions).length>24||!Array.isArray(p.objects)||p.objects.length!==brief.objects.length||!Array.isArray(p.connections)||p.connections.length!==brief.relationships.length)throw Error('Invalid construction or stale scientific brief');
 exact(p,['schemaVersion','briefDigest','rationale','definitions','objects','connections']);
 const elements:VectorElement[]=[],groups:VectorGroup[]=[],paints:NonNullable<VectorScene['paints']>=[],objects:NonNullable<VectorScene['semantics']>['objects']=[],relationships:NonNullable<NonNullable<VectorScene['semantics']>['relationships']>=[];
 const used=new Set<string>(),placed=new Map<string,{ports:Record<string,{x:number;y:number}>}>();
 let definitionElementCount=0;
 for(const [name,d] of Object.entries(p.definitions)){
 if(!id(name)||!d||!d.scene||!d.ports||Array.isArray(d.ports))throw Error('Invalid definition');exact(d,['scene','ports']);
  if(d.scene.semantics)throw Error('Scientific semantics may not be authored in geometry definitions');
  exact(d.scene,['document','elements','groups','paints']);
  if(!Array.isArray(d.scene.elements)||d.scene.elements.length<1||d.scene.elements.length>120||d.scene.elements.some(e=>e.type==='text'))throw Error('Definitions require 1–120 geometry elements; labels come from the brief');
  for(const e of d.scene.elements){
   exact(e,['id','name','type','x','y','groupId','zIndex','visible','style','x2','y2','width','height','points','closed','subpaths','fillRule']);
   if(e.style)exact(e.style,['fill','fillPaint','stroke','strokePaint','strokeWidth','opacity','lineCap','lineJoin','dashArray','dashOffset','miterLimit']);
  }
  if(Object.keys(d.ports).length>20||Object.entries(d.ports).some(([key,pt])=>!id(key)||!pt||!finite(pt.x,-2000,2000)||!finite(pt.y,-2000,2000)||Object.keys(pt).some(k=>!['x','y'].includes(k))))throw Error('Invalid attachment ports');
  d.scene=normalizeScene(d.scene);definitionElementCount+=d.scene.elements.length;
 }
 for(const instance of p.objects){
  exact(instance,['id','definition','x','y','scale','labelX','labelY']);
  const semantic=brief.objects.find(o=>o.id===instance.id),definition=p.definitions[instance.definition];
  if(!semantic||used.has(instance.id)||!definition||!finite(instance.x,0,brief.width)||!finite(instance.y,0,brief.height)||!finite(instance.scale,.1,5)||!finite(instance.labelX,0,brief.width)||!finite(instance.labelY,0,brief.height))throw Error('Invalid object placement');
  used.add(instance.id);const prefix=instance.id+'.',m={a:instance.scale,b:0,c:0,d:instance.scale,e:instance.x,f:instance.y};
  const root=prefix+'assembly';groups.push({id:root,zIndex:10});
  for(const g of definition.scene.groups??[]){
   let clip=g.clip;
   if(clip){if(clip.type==='rect'||clip.type==='ellipse')clip={...clip,...transformPoint(clip,m),width:clip.width*instance.scale,height:clip.height*instance.scale};else{const converted=transformGeometryElement({id:'clip',type:'path',x:0,y:0,closed:true,points:clip.points},m);if(converted.type!=='path')throw Error('Invalid transformed clip');clip={type:'path',x:0,y:0,closed:true,points:converted.points};}}
   groups.push({...g,id:prefix+g.id,parentId:g.parentId?prefix+g.parentId:root,...(clip?{clip}:{})});
  }
  for(const paint of definition.scene.paints??[]){if(paint.units==='user_space'||paint.transform)throw Error('Use object-relative paints in reusable definitions');paints.push({...paint,id:prefix+paint.id});}
  const own:string[]=[];
  for(const [i,e] of definition.scene.elements.entries()){
   if(e.type==='text')throw Error('Definition labels are forbidden');
   const eid=prefix+(e.id??'shape-'+i),style:VectorStyle={...e.style,...(e.style?.fillPaint?{fillPaint:prefix+e.style.fillPaint}:{}),...(e.style?.strokePaint?{strokePaint:prefix+e.style.strokePaint}:{})};
   elements.push({...transformGeometryElement(e,m),id:eid,name:eid,groupId:e.groupId?prefix+e.groupId:root,style});own.push(eid);
  }
  const labelId=prefix+'semantic-label';elements.push({id:labelId,name:labelId,type:'text',x:instance.labelX,y:instance.labelY,text:semantic.label,size:28,font:'Arial',style:{fill:'#193C59',stroke:null},zIndex:40});own.push(labelId);
  objects.push({...semantic,elementIds:own,properties:{illustrative:true,measured:false}});
  placed.set(instance.id,{ports:Object.fromEntries(Object.entries(definition.ports).map(([k,v])=>[k,transformPoint(v,m)]))});
 }
 const routes=new Set<string>();
 for(const c of p.connections){
  exact(c,['id','sourcePort','targetPort','via','lineStyle','endMarker']);const r=brief.relationships.find(r=>r.id===c.id);
  if(c.lineStyle!==undefined&&!['solid','dashed'].includes(c.lineStyle)||c.endMarker!==undefined&&!['arrow','none'].includes(c.endMarker))throw Error('Invalid connector presentation');
  if(!r||routes.has(c.id)||!Array.isArray(c.via)||c.via.length>8||c.via.some(v=>!v||!finite(v.x,0,brief.width)||!finite(v.y,0,brief.height)||Object.keys(v).some(k=>!['x','y'].includes(k))))throw Error('Invalid connection');routes.add(c.id);
  const start=placed.get(r.source)?.ports[c.sourcePort],end=placed.get(r.target)?.ports[c.targetPort];if(!start||!end)throw Error('Unknown attachment port');
  const points=[start,...c.via,end],previous=points.at(-2)!,dx=end.x-previous.x,dy=end.y-previous.y,length=Math.hypot(dx,dy);if(length<12)throw Error('Connection final segment too short');
  const ux=dx/length,uy=dy/length,routeId='relation-'+r.id,headId=routeId+'-arrow';
  elements.push({id:routeId,name:routeId,type:'path',x:0,y:0,points,closed:false,zIndex:5,style:{fill:null,stroke:'#397784',strokeWidth:3,...(c.lineStyle==='dashed'?{dashArray:[10,7]}:{})}});
  if(c.endMarker!=='none')elements.push({id:headId,name:headId,type:'polygon',x:0,y:0,points:[end,{x:end.x-12*ux+5*uy,y:end.y-12*uy-5*ux},{x:end.x-12*ux-5*uy,y:end.y-12*uy+5*ux}],zIndex:5,style:{fill:'#397784',stroke:null}});
  relationships.push({id:r.id,sourceObjectId:r.source,targetObjectId:r.target,predicate:r.predicate,visualElementIds:c.endMarker==='none'?[routeId]:[routeId,headId]});
 }
 if(elements.length+1>800)throw Error('Construction expansion budget exceeded');
 elements.push({id:'figure-title',name:'figure-title',type:'text',x:35,y:28,text:brief.title,size:34,font:'Arial',zIndex:50,style:{fill:'#193C59',stroke:null}});
 const scene=normalizeScene({document:{width:brief.width,height:brief.height,title:brief.title},elements,groups,...(paints.length?{paints}:{}),semantics:{objects,relationships}});
 return {program:p,scene,report:{programDigest:constructionDigest(p),briefDigest:constructionDigest(brief),definitionElementCount,expandedElementCount:elements.length,objectCount:objects.length,relationshipCount:relationships.length,approval:'candidate_only',limitations:['Semantic identity preservation does not prove pictorial scientific correctness.','Connector routing follows author-supplied waypoints; obstacle avoidance is not automatic.']}};
}
