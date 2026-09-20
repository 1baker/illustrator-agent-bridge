import {createHash} from 'node:crypto';
import {z} from 'zod/v4';
import {normalizeScene} from '../core/sceneValidation.js';
import type {ScientificObject,VectorElement,VectorPaint,VectorScene} from '../core/vectorScene.js';
import {constructionDigest} from './figureConstruction.js';

const identifier=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const short=z.string().trim().min(1).max(88);
const stage=z.object({id:identifier,title:short,detail:short,depiction:z.enum(['exchange','network','measurement','decision'])}).strict();
export const proposalConceptPlan=z.object({
 schemaVersion:z.literal('ProposalConceptPlan.v1'),title:z.string().trim().min(1).max(150),claim:z.string().trim().min(1).max(190),seed:z.number().int().min(0).max(0xffffffff),
 width:z.number().int().min(1200).max(2400).default(1800),height:z.number().int().min(800).max(1600).default(1100),widthMm:z.number().min(120).max(220).default(220),
 mechanism:z.object({label:short,rateMeasurement:short}).strict(),
 stages:z.array(stage).length(4).refine(v=>new Set(v.map(x=>x.id)).size===v.length,'Stage IDs must be unique').refine(v=>new Set(v.map(x=>x.depiction)).size===4,'Use each depiction once'),
 matrix:z.object({title:short,rowLabel:short,columnLabel:short,rows:z.array(short).min(2).max(4),columns:z.array(short).min(2).max(4)}).strict(),
 controls:z.array(short).min(1).max(4),caption:z.string().trim().min(1).max(1500),sourceRefs:z.array(z.string().trim().min(1).max(240)).min(1).max(12),
}).strict();
export type ProposalConceptPlan=z.infer<typeof proposalConceptPlan>;

type Box={x:number;y:number;w:number;h:number};
type Builder={elements:VectorElement[];paints:VectorPaint[];owners:Map<string,string[]>;relationships:NonNullable<VectorScene['semantics']>['relationships']};
const palette={ink:'#18394B',teal:'#1D7776',orange:'#DC7A3D',orangeInk:'#AD4C1C',paper:'#F7FAFB',line:'#B9CDD5',muted:'#647984',white:'#FFFFFF'};
const style=(fill:string|null,stroke:string|null=palette.ink,strokeWidth=2,opacity=100)=>({fill,stroke,strokeWidth,opacity,lineCap:'round' as const,lineJoin:'round' as const});
const own=(b:Builder,owner:string,e:VectorElement)=>{b.elements.push(e);const ids=b.owners.get(owner)??[];ids.push(e.id!);b.owners.set(owner,ids);return e;};
const rect=(b:Builder,o:string,id:string,x:number,y:number,width:number,height:number,fill:string|null,z=0,stroke:string|null=palette.ink,sw=2,opacity=100)=>own(b,o,{id,type:'rect',x,y,width,height,zIndex:z,style:style(fill,stroke,sw,opacity)});
const ellipse=(b:Builder,o:string,id:string,x:number,y:number,width:number,height:number,fill:string|null,z=0,stroke:string|null=palette.ink,sw=2,opacity=100)=>own(b,o,{id,type:'ellipse',x,y,width,height,zIndex:z,style:style(fill,stroke,sw,opacity)});
const path=(b:Builder,o:string,id:string,points:Array<[number,number]>,stroke=palette.ink,sw=4,z=5,dash?:number[])=>own(b,o,{id,type:'path',x:0,y:0,points:points.map(([x,y])=>({x,y})),closed:false,zIndex:z,style:{fill:null,stroke,strokeWidth:sw,lineCap:'round',lineJoin:'round',...(dash?{dashArray:dash}:{})}});
const polygon=(b:Builder,o:string,id:string,points:Array<[number,number]>,fill:string,z=5,stroke:string|null=palette.ink,sw=2)=>own(b,o,{id,type:'polygon',x:0,y:0,points:points.map(([x,y])=>({x,y})),zIndex:z,style:style(fill,stroke,sw)});
const text=(b:Builder,o:string,id:string,value:string,x:number,y:number,size:number,_bold=false,fill=palette.ink,_width=500)=>own(b,o,{id,type:'text',text:value,x,y,size:Math.max(23,size),font:'DejaVu Sans',zIndex:30,style:{fill,stroke:null}});
const wrapped=(b:Builder,o:string,id:string,value:string,x:number,y:number,width:number,size=24,bold=false,fill=palette.ink,maxLines=3)=>{size=Math.max(23,size);const words=value.split(/\s+/),limit=Math.max(7,Math.floor(width/(size*.56))),lines:string[]=[];for(const word of words){const last=lines.at(-1);if(!last||last.length+1+word.length>limit)lines.push(word);else lines[lines.length-1]=last+' '+word;}if(lines.length>maxLines)throw Error(`Text does not fit ${id}`);lines.forEach((line,i)=>text(b,o,`${id}-${i}`,line,x,y+i*size*1.22,size,bold,fill,width));return lines.length;};
const painted=<T extends VectorElement>(e:T,paint:string)=>{delete e.style!.fill;e.style!.fillPaint=paint;return e;};
const arrow=(b:Builder,o:string,id:string,points:Array<[number,number]>,color=palette.teal,dash?:number[])=>{const [a,c]=points.slice(-2),dx=c![0]-a![0],dy=c![1]-a![1],d=Math.hypot(dx,dy),ux=dx/d,uy=dy/d,q:[number,number]=[c![0]-18*ux,c![1]-18*uy];path(b,o,id,points,color,5,18,dash);polygon(b,o,id+'-head',[c!,[q[0]-7*uy,q[1]+7*ux],[q[0]+7*uy,q[1]-7*ux]],color,19,null,0);return [id,id+'-head'];};
const hashSeed=(seed:number,value:string)=>{const h=createHash('sha256').update(`${seed}:${value}`).digest();return h.readUInt32BE(0)/0xffffffff;};

function card(b:Builder,id:string,box:Box,index:number,titleValue:string,detail:string){
 rect(b,id,id+'-shadow',box.x+9,box.y+11,box.w,box.h,'#78909A',-2,null,0,18);const body=rect(b,id,id+'-body',box.x,box.y,box.w,box.h,null,-1,palette.line,2);delete body.style!.fill;body.style!.fillPaint='concept-card';
 ellipse(b,id,id+'-index',box.x+22,box.y+21,42,42,index===3?palette.orange:palette.teal,2,null,0);text(b,id,id+'-number',String(index+1).padStart(2,'0'),box.x+28,box.y+24,24,true,palette.white,38);
 wrapped(b,id,id+'-title',titleValue,box.x+80,box.y+22,box.w-100,27,true,palette.ink,2);wrapped(b,id,id+'-detail',detail,box.x+24,box.y+92,box.w-48,24,false,palette.muted,2);
}
function drawExchange(b:Builder,id:string,q:Box & {mechanism:ProposalConceptPlan['mechanism']}){
 wrapped(b,id,id+'-mechanism',q.mechanism.label.toUpperCase(),q.x,q.y,q.w,20,true,palette.orangeInk,2);
 const y=q.y+105,cx=q.x+q.w/2,left=q.x+8,right=q.x+q.w-8;
 const a:[[number,number],[number,number],[number,number]]=[[left,y],[left+42,y-24],[cx-32,y+8]],c:[[number,number],[number,number],[number,number]]=[[cx+32,y-8],[right-42,y+24],[right,y]];
 for(const [side,pts,color]of [['a',a,palette.teal],['b',c,palette.orange]] as const){path(b,id,`${id}-chain-${side}-shadow`,pts,'#77929E',15,3).style!.opacity=20;path(b,id,`${id}-chain-${side}`,pts,color,10,5);path(b,id,`${id}-chain-${side}-highlight`,pts,'#FFFFFF',2,6).style!.opacity=35;}
 painted(ellipse(b,id,id+'-site',cx-18,y-18,36,36,null,8,palette.ink,4),'concept-node-orange');path(b,id,id+'-associative-bond',[[cx-32,y+8],[cx,y],[cx+32,y-8]],palette.ink,4,7,[8,5]);
 arrow(b,id,id+'-swap',[[q.x+35,q.y+178],[q.x+q.w-35,q.y+178]],palette.orange);
 rect(b,id,id+'-rate-panel',q.x,q.y+232,q.w,142,'#EEF6F5',2,palette.line,2);text(b,id,id+'-rate-tag','RATE TEST',q.x+16,q.y+250,21,true,palette.teal);
 path(b,id,id+'-clock-ring',[[q.x+30,q.y+324],[q.x+47,q.y+287],[q.x+75,q.y+324]],palette.orange,4,5);path(b,id,id+'-clock-hand',[[q.x+47,q.y+306],[q.x+65,q.y+294]],palette.orange,4,6);
 wrapped(b,id,id+'-rate-measure',q.mechanism.rateMeasurement,q.x+93,q.y+285,q.w-110,21,true,palette.ink,3);
 text(b,id,id+'-rate','SLOWER  ↔  FASTER',q.x+11,q.y+410,21,true,palette.ink,q.w-20);
}
function drawNetwork(b:Builder,id:string,q:Box,seed:number,plan:ProposalConceptPlan){
 text(b,id,id+'-column-axis','STRAND DENSITY →',q.x+116,q.y,20,true,palette.teal,q.w-120);text(b,id,id+'-row-axis-0','EXCHANGE',q.x,q.y+42,19,true,palette.teal);text(b,id,id+'-row-axis-1','TIME ↓',q.x,q.y+72,19,true,palette.teal);
 const gx=q.x+112,gy=q.y+83,cw=(q.w-116)/plan.matrix.columns.length,rh=118;
 plan.matrix.columns.forEach((label,j)=>text(b,id,`${id}-column-${j}`,label.toUpperCase(),gx+j*cw+8,gy-34,18,true,palette.muted,cw-12));
 for(const [i,label]of plan.matrix.rows.entries()){
  if(i===1){text(b,id,`${id}-row-${i}-0`,'MATCHED',q.x,gy+i*rh+23,18,true,palette.ink);text(b,id,`${id}-row-${i}-1`,'Tg WINDOW',q.x,gy+i*rh+54,18,true,palette.ink);}else text(b,id,`${id}-row-${i}`,label.toUpperCase(),q.x,gy+i*rh+32,18,false,palette.ink);
  for(let j=0;j<plan.matrix.columns.length;j++){
   const x=gx+j*cw,y=gy+i*rh,w=cw-9;painted(rect(b,id,`${id}-cell-${i}-${j}`,x,y,w,rh-10,null,2,palette.line,1.5),(i+j)%2?'concept-network':'concept-network-warm');path(b,id,`${id}-facet-divider-${i}-${j}`,[[x+w/2,y+8],[x+w/2,y+70]],palette.line,1.3,3);
   for(const facet of [0,1]){const fx=x+7+facet*w/2,fw=w/2-14,color=facet?palette.orange:palette.teal;text(b,id,`${id}-facet-label-${i}-${j}-${facet}`,facet?'H':'L',fx,y+3,19,true,color);const nodes=Array.from({length:3+j},(_,k)=>({x:fx+k*fw/(2+j),y:y+36+((k+i+facet)%2)*10+(hashSeed(seed,`${id}:${i}:${j}:${facet}:${k}`)-.5)*4}));path(b,id,`${id}-strand-${i}-${j}-${facet}`,nodes.map(p=>[p.x,p.y]),color,2.5,4);nodes.forEach((p,k)=>ellipse(b,id,`${id}-node-${i}-${j}-${facet}-${k}`,p.x-3,p.y-3,6,6,facet?'#F2B083':'#9FD2CF',5,null,0));}
   const cy=y+84;path(b,id,`${id}-curve-axis-${i}-${j}`,[[x+9,cy+9],[x+9,cy-16],[x+w-8,cy-16]],palette.muted,1.3,4);path(b,id,`${id}-curve-low-${i}-${j}`,[[x+11,cy-13],[x+w*.43,cy-7+i*2],[x+w-10,cy+5-i]],palette.teal,2.2,5);path(b,id,`${id}-curve-high-${i}-${j}`,[[x+11,cy-9],[x+w*.43,cy-1+i*2],[x+w-10,cy+10-i]],palette.orange,2.2,5);
  }
 }
 rect(b,id,id+'-legend',q.x,q.y+455,q.w,83,'#EEF6F5',3,palette.line,1.5);text(b,id,id+'-legend-network','L = LOW SPACER  •  H = HIGH SPACER',q.x+17,q.y+465,20,true,palette.teal);text(b,id,id+'-legend-readout','NETWORK + KINETICS + MECHANICS',q.x+17,q.y+502,20,true,palette.ink);
}
function drawMeasurement(b:Builder,id:string,q:Box){
 const lane=(n:number,label:string,y:number,fill:string)=>{ellipse(b,id,`${id}-lane-${n}`,q.x,y,34,34,fill,4,null,0);text(b,id,`${id}-lane-number-${n}`,String(n),q.x+11,y+4,20,true,palette.white);text(b,id,`${id}-lane-label-${n}`,label,q.x+48,y+4,20,true,n===2?palette.orangeInk:palette.teal);};
 lane(1,'MEASURE',q.y,palette.teal);rect(b,id,id+'-measure-box',q.x,q.y+48,q.w,132,'#EEF6F5',2,palette.line,1.5);path(b,id,id+'-relax-axes',[[q.x+15,q.y+153],[q.x+15,q.y+76],[q.x+94,q.y+76]],palette.muted,2,4);path(b,id,id+'-relax-curve',[[q.x+18,q.y+81],[q.x+40,q.y+92],[q.x+62,q.y+116],[q.x+90,q.y+149]],palette.teal,5,5);['RELAXATION','CREEP','TENSILE','FRACTURE'].forEach((label,i)=>text(b,id,`${id}-measure-label-${i}`,label,q.x+110,q.y+57+i*30,19,true,palette.ink));
 arrow(b,id,id+'-infer-arrow',[[q.x+q.w/2,q.y+188],[q.x+q.w/2,q.y+211]],palette.orange,[5,5]);lane(2,'TEST MECHANISM',q.y+220,palette.orange);rect(b,id,id+'-hypothesis',q.x,q.y+268,q.w,130,'#FFF4E9',2,palette.orange,2);const y=q.y+342,pts=Array.from({length:6},(_,i):[number,number]=>[q.x+19+i*(q.w-38)/5,y+(i%2?-18:13)]);path(b,id,id+'-network-before',pts,palette.teal,5,5);pts.filter((_,i)=>i%2===1).forEach((p,i)=>painted(ellipse(b,id,`${id}-rearrange-node-${i}`,p[0]-7,p[1]-7,14,14,null,7,null,0),'concept-node-orange'));wrapped(b,id,id+'-hypothesis-label','DO EXCHANGE BONDS REARRANGE?',q.x+15,q.y+279,q.w-30,19,true,palette.orangeInk,2);
 arrow(b,id,id+'-outcome-arrow',[[q.x+q.w/2,q.y+402],[q.x+q.w/2,q.y+423]],palette.teal);lane(3,'COMPARE OUTCOMES',q.y+432,palette.teal);['CREEP','FRACTURE','REPROCESS'].forEach((label,i)=>{const yy=q.y+478+i*34;ellipse(b,id,`${id}-outcome-${i}`,q.x+4,yy+3,20,20,i===2?palette.orange:palette.teal,8,null,0);text(b,id,`${id}-outcome-label-${i}`,label,q.x+38,yy,20,i===2,palette.ink);});
}
function drawDecision(b:Builder,id:string,q:Box){
 rect(b,id,id+'-model',q.x,q.y,q.w,112,'#FFF4E9',2,palette.orange,2);text(b,id,id+'-model-label','MECHANISM MODEL',q.x+14,q.y+9,20,true,palette.orangeInk);text(b,id,id+'-data-label','DATA',q.x+14,q.y+44,19,true,palette.ink);path(b,id,id+'-data-curve',[[q.x+78,q.y+58],[q.x+118,q.y+49],[q.x+158,q.y+69],[q.x+198,q.y+54]],palette.teal,4,5);text(b,id,id+'-prediction-label','PRED.',q.x+14,q.y+76,19,true,palette.ink);path(b,id,id+'-prediction-curve',[[q.x+78,q.y+90],[q.x+118,q.y+81],[q.x+158,q.y+101],[q.x+198,q.y+86]],palette.orange,4,5,[7,5]);arrow(b,id,id+'-model-arrow',[[q.x+q.w/2,q.y+118],[q.x+q.w/2,q.y+143]],palette.orange);
 const cx=q.x+q.w/2;polygon(b,id,id+'-gate',[[cx,q.y+150],[cx+76,q.y+202],[cx,q.y+254],[cx-76,q.y+202]],'#FFFFFF',4,palette.orange,3);text(b,id,id+'-gate-label','MATCH?',cx-43,q.y+188,21,true,palette.orangeInk);arrow(b,id,id+'-revise-arrow',[[cx-78,q.y+202],[q.x+9,q.y+202]],palette.orange);text(b,id,id+'-falsify','NO: REVISE',q.x,q.y+216,19,true,palette.orangeInk);arrow(b,id,id+'-pass-arrow',[[cx,q.y+259],[cx,q.y+282]],palette.teal);text(b,id,id+'-pass-label','YES',cx+19,q.y+257,19,true,palette.teal);
 rect(b,id,id+'-heldout',q.x+22,q.y+291,q.w-44,79,'#EEF6F5',3,palette.teal,2);text(b,id,id+'-heldout-label','HELD-OUT NETWORK',q.x+38,q.y+302,19,true,palette.teal);const pts=[[q.x+48,q.y+352],[q.x+91,q.y+331],[q.x+134,q.y+354],[q.x+177,q.y+333],[q.x+220,q.y+352]] as Array<[number,number]>;path(b,id,id+'-heldout-strand',pts,palette.teal,4,5);arrow(b,id,id+'-transfer-arrow',[[cx,q.y+377],[cx,q.y+399]],palette.teal);
 rect(b,id,id+'-transfer-result',q.x+22,q.y+410,q.w-44,108,'#FFFFFF',3,palette.orange,3);text(b,id,id+'-window-label','RULE HOLDS?',q.x+75,q.y+424,19,true,palette.orangeInk);text(b,id,id+'-rules-0','TRANSFERABLE',q.x+63,q.y+461,19,true,palette.teal);text(b,id,id+'-rules-1','DESIGN RULE',q.x+72,q.y+491,19,true,palette.teal);
}
/** A compact reusable scene compiler: the plan changes; the drawing grammar does not. */
export function compileProposalConceptFigure(input:unknown){
 const plan=proposalConceptPlan.parse(input),b:Builder={elements:[],paints:[],owners:new Map(),relationships:[]};
 b.paints.push({id:'concept-card',type:'linear_gradient',x1:0,y1:0,x2:1,y2:0,stops:[{offset:0,color:'#FFFFFF'},{offset:62,color:'#F5F9FA'},{offset:100,color:'#DDE9ED'}]});
 b.paints.push({id:'concept-network',type:'linear_gradient',x1:0,y1:0,x2:1,y2:0,stops:[{offset:0,color:'#FFFFFF'},{offset:55,color:'#EAF3F4'},{offset:100,color:'#C8DDE2'}]},{id:'concept-network-warm',type:'linear_gradient',x1:0,y1:0,x2:1,y2:0,stops:[{offset:0,color:'#FFFFFF'},{offset:55,color:'#FAEEE5'},{offset:100,color:'#E8C7B2'}]},{id:'concept-node',type:'radial_gradient',cx:.5,cy:.5,r:.72,stops:[{offset:0,color:'#FFFFFF'},{offset:38,color:'#9FD2CF'},{offset:100,color:'#1D7776'}]},{id:'concept-node-orange',type:'radial_gradient',cx:.5,cy:.5,r:.72,stops:[{offset:0,color:'#FFF8F0'},{offset:38,color:'#F2B083'},{offset:100,color:'#C85F26'}]});
 const page='figure';rect(b,page,'background',0,0,plan.width,plan.height,palette.paper,-100,null,0);text(b,page,'title',plan.title,48,30,36,true,palette.ink,plan.width-96);text(b,page,'claim',plan.claim,48,84,23,false,palette.teal,plan.width-96);
 const gap=28,left=48,top=145,cardH=755,widths=[280,600,340,350],boxes:Box[]=[];let x=left;
 for(const [i,s]of plan.stages.entries()){const box={x,y:top,w:widths[i]!,h:cardH};boxes.push(box);card(b,s.id,box,i,s.title,s.detail);const q={x:x+20,y:top+175,w:box.w-40,h:560};({exchange:(b:Builder,id:string,q:Box)=>drawExchange(b,id,{...q,mechanism:plan.mechanism} as Box & {mechanism:ProposalConceptPlan['mechanism']}),network:(b:Builder,id:string,q:Box)=>drawNetwork(b,id,q,plan.seed,plan),measurement:drawMeasurement,decision:drawDecision}[s.depiction])(b,s.id,q);x+=box.w+gap;}
 for(let i=0;i<3;i++){const from=plan.stages[i]!,to=plan.stages[i+1]!,y=top+cardH/2,ids=arrow(b,'figure',`flow-${i}`,[[boxes[i]!.x+boxes[i]!.w+5,y],[boxes[i+1]!.x-7,y]],palette.teal);b.relationships!.push({id:`flow-${i}`,sourceObjectId:from.id,targetObjectId:to.id,predicate:'informs_prospective_test_of',visualElementIds:ids});}
 const controlsY=940,controlsW=plan.width-96;rect(b,'controls','controls-body',48,controlsY,controlsW,112,'#FFFFFF',0,palette.line,2);text(b,'controls','controls-title','CONTROLS',70,controlsY+18,20,true,palette.ink);const itemW=(controlsW-250)/plan.controls.length;plan.controls.forEach((label,i)=>{const xx=225+i*itemW;ellipse(b,'controls',`control-${i}-dot`,xx,controlsY+22,18,18,i===0?palette.orange:palette.teal,3,null,0);wrapped(b,'controls',`control-${i}-label`,label,xx+30,controlsY+17,itemW-38,18,i===0,palette.ink,3);});text(b,'controls','controls-note','PROSPECTIVE • NO FABRICATED VALUES • NO PRESELECTED WINNER',70,controlsY+80,18,true,palette.orangeInk,controlsW-40);
 const operators:Record<string,string>={exchange:'molecular_exchange',network:'material_network',measurement:'measurement_causal_chain',decision:'decision_map'};
 const semanticObjects:ScientificObject[]=plan.stages.map(s=>({id:s.id,kind:s.depiction,label:s.title,elementIds:b.owners.get(s.id)??[],properties:{illustrative:true,measured:false,seed:plan.seed,compiler:'figure_program_v1',depictionOperator:operators[s.depiction]!}}));semanticObjects.push({id:'controls',kind:'controls',label:'Controls and interpretation',elementIds:b.owners.get('controls')??[],properties:{illustrative:true,measured:false,compiler:'figure_program_v1',depictionOperator:'control_set'}});
 const scene=normalizeScene({document:{width:plan.width,height:plan.height,title:plan.title,colorMode:'RGB'},elements:b.elements,paints:b.paints,semantics:{objects:semanticObjects,relationships:b.relationships}});
 return {plan,scene,manifest:{schemaVersion:'ProposalConceptManifest.v1',planDigest:constructionDigest(plan),sceneDigest:constructionDigest(scene),seed:plan.seed,sourceRefs:plan.sourceRefs,editableObjects:semanticObjects.map(o=>o.id),targetImageUsed:false,status:'candidate_requires_independent_visual_review',finalApproval:false}};
}
