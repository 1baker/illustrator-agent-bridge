import type {PathPoint,VectorElement} from '../core/vectorScene.js';
import {normalizeScene} from '../core/sceneValidation.js';
import {polymerCutawayHero} from './polymerCutawayHero.js';

/** An illustrative peel-away drawing convention, not a delamination experiment. */
export function polymerPeelawayHero(seed=429){
 const base=polymerCutawayHero(seed),scene=structuredClone(base.scene),s=base.report.spec;
 const point=(u:number,v:number)=>({x:s.x+s.width*.17*(1-v)+u*s.width*.83,y:s.y+v*s.depth+4*s.bow*u*(1-u)*(.35+.65*v)-s.depth*.12*u-s.curl!*u**3*(.3+.7*v)+s.twist!*(2*u-1)*(2*v-1)});
 const back=point(.55,0),front=point(.55,1);
 const freeBack={x:back.x-420,y:back.y-105},freeFront={x:front.x-420,y:front.y-175};
 const cover:PathPoint[]=[
  {...freeBack,rightX:freeBack.x+125,rightY:freeBack.y-35},
  {...back,leftX:back.x-155,leftY:back.y-75},
  {...front,rightX:front.x-175,rightY:front.y-155},
  {...freeFront,leftX:freeFront.x+130,leftY:freeFront.y+15}
 ];
 const add=(e:VectorElement)=>scene.elements.push(e);
 scene.paints!.push({id:'peel.face',type:'linear_gradient',x1:0,y1:0,x2:1,y2:.55,stops:[{offset:0,color:'#426D6D'},{offset:20,color:'#89ABA5'},{offset:43,color:'#EAF2E7'},{offset:62,color:'#FCFFF3'},{offset:82,color:'#A1C1B4'},{offset:100,color:'#37686B'}]},
  {id:'peel.under',type:'linear_gradient',x1:0,y1:0,x2:0,y2:1,stops:[{offset:0,color:'#D1E0C9'},{offset:60,color:'#7B9A91'},{offset:100,color:'#315C61'}]});
 const surface=scene.elements.find(e=>e.id==='hero.material.surface');if(surface?.type!=='path')throw Error('Missing material surface');
 scene.groups!.push({id:'peel.shadow',zIndex:55,clip:{type:'path',x:0,y:0,points:surface.points,closed:true},opacity:25});
 // A broad finite footprint, clipped to the receiving sheet, establishes
 // separation. It is an authored shadow, not a calibrated optical solution.
 for(let i=0;i<12;i++)add({id:`peel.shadow-${i}`,type:'path',x:0,y:0,closed:true,groupId:'peel.shadow',points:cover.map(p=>({...p,x:p.x+18+i*2,y:p.y+34+i*2,...(p.rightX===undefined?{}:{rightX:p.rightX+18+i*2,rightY:p.rightY!+34+i*2}),...(p.leftX===undefined?{}:{leftX:p.leftX+18+i*2,leftY:p.leftY!+34+i*2})})),style:{fill:'#14383B',stroke:null,opacity:10},zIndex:i});
 const underside:PathPoint[]=[{...front,rightX:front.x-175,rightY:front.y-155},{...freeFront,leftX:freeFront.x+130,leftY:freeFront.y+15},
  {x:freeFront.x+1,y:freeFront.y+13,rightX:freeFront.x+131,rightY:freeFront.y+28},
  {x:front.x+1,y:front.y+13,leftX:front.x-174,leftY:front.y-142}];
 add({id:'peel.underside',type:'path',x:0,y:0,closed:true,points:underside,zIndex:60,style:{fillPaint:'peel.under',stroke:null}});
 add({id:'peel.cover',type:'path',x:0,y:0,closed:true,points:cover,zIndex:61,style:{fillPaint:'peel.face',stroke:null}});
 add({id:'peel.fold-edge',type:'path',x:0,y:0,closed:false,points:[{...back},{...front}],zIndex:62,style:{fill:null,stroke:'#DCEADF',strokeWidth:2,opacity:85,lineCap:'round'}});
 const title=scene.elements.find(e=>e.id==='hero.title')!;if(title.type==='text'){title.text='Revealing the polymer network';title.y=35;title.size=34;}
 const note=scene.elements.find(e=>e.id==='hero.note')!;if(note.type==='text'){note.text='Illustrative peel-away • enlarged network • not a delamination result';note.size=24;}
 scene.semantics!.objects[0]!.elementIds.push(...scene.elements.filter(e=>e.id?.startsWith('peel.')).map(e=>e.id!));
 scene.semantics!.objects[0]!.properties={...scene.semantics!.objects[0]!.properties,peelAway:'drawing_convention_not_measured_mechanics'};
 return {scene:normalizeScene(scene),report:{...base.report,version:'polymer-peelaway-hero.v1',peel:{hingeU:.55,back,front,freeBack,freeFront,cover,underside,shadow:'authored_clipped_soft_footprint',measured:false},referenceImageUsed:false}};
}
