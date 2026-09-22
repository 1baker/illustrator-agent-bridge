import type {VectorScene,PathPoint} from '../core/vectorScene.js';
import {normalizeScene} from '../core/sceneValidation.js';
import {filmSpecimenGeometry,type FilmSpecimenSpec} from './materialSpecimenStudy.js';
import {volumeNetworkGeometry,networkCubic} from './volumeNetworkGeometry.js';

/** A broad illustrative material cutaway, not a measured molecular reconstruction. */
export function polymerCutawayHero(seed=429){
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Invalid polymer hero seed');
 const spec:FilmSpecimenSpec={id:'hero.material',x:115,y:230,width:1010,depth:275,bow:54,curl:135,twist:22,thickness:23,wet:false,surfaceFinish:'studio',lightSpread:{x:.10,y:.03},emitterSpread:{x:.13,y:.1}};
 const film=filmSpecimenGeometry(spec),network=volumeNetworkGeometry(30,seed);
 const project=(x:number,y:number)=>{
  const u=.07+.86*(x+25)/350,v=.1+.78*(y+25)/200;
  return {x:spec.x+spec.width*.17*(1-v)+u*spec.width*.83,
   y:spec.y+v*spec.depth+4*spec.bow*u*(1-u)*(.35+.65*v)-spec.depth*.12*u-spec.curl!*u*u*u*(.3+.7*v)+spec.twist!*(2*u-1)*(2*v-1)};
 };
 const scene:VectorScene={document:{title:'Polymer material — conceptual network cutaway',width:1240,height:720,colorMode:'RGB'},elements:film.elements,paints:[...film.paints,{id:'hero.junction',type:'radial_gradient',cx:.3,cy:.2,r:.85,stops:[{offset:0,color:'#FFF5CD'},{offset:30,color:'#F6D589'},{offset:72,color:'#C18A3D'},{offset:100,color:'#805329'}]}],groups:film.groups,semantics:{objects:[],relationships:[]}};
 // Keep surface reflection above the interior; partial opacity makes this an
 // explicitly illustrative cutaway rather than a photograph of clear resin.
 for(const g of scene.groups!)if(g.id==='hero.material.surface-light'){g.zIndex=35;g.opacity=24;}
 const rim=scene.elements.find(e=>e.id==='hero.material.rim')!;rim.style={...rim.style,strokeWidth:1.2};rim.zIndex=40;
 scene.groups!.push({id:'hero.network',zIndex:20,clip:{type:'path',x:0,y:0,points:film.top,closed:true}});
 const nodePoints=network.points.map(p=>project(p.x,p.y));
 for(const [i,s]of network.strands.entries()){
  const depth=(s.depth+55)/110,width=7+4*depth;
  for(const [part,[start,end]]of s.visible.entries()){
   const at=(t:number)=>{const p=networkCubic(s.points,t);return project(p.x,p.y);};
   const points:PathPoint[]=Array.from({length:25},(_,k)=>{
    const t=start+(end-start)*k/24,p=at(t),h=.00001,a=at(t-h),b=at(t+h),d=(end-start)/24/3;
    const dx=(b.x-a.x)/(2*h),dy=(b.y-a.y)/(2*h);
    return {...p,...(k?{leftX:p.x-dx*d,leftY:p.y-dy*d}:{}),...(k<24?{rightX:p.x+dx*d,rightY:p.y+dy*d}:{})};
   });
   for(const [suffix,color,strokeWidth,opacity]of [['shadow','#173E43',width+5,22],['body',depth<.4?'#8AB4B3':'#E8C67F',width,75+25*depth],['core',depth<.4?'#BED8D1':'#FFEBB5',width*.42,45+25*depth]] as const){
    scene.elements.push({id:`hero.strand-${i}.${part}.${suffix}`,type:'path',x:0,y:0,points:structuredClone(points),closed:false,groupId:'hero.network',zIndex:10+Math.round(depth*20),style:{fill:null,stroke:color,strokeWidth,opacity,lineCap:'round'}});
   }
  }
 }
 for(const [i,p]of nodePoints.entries()){
  const depth=(network.spatial[i]!.z+55)/110,terminal=network.degree[i]===1,r=terminal?3.8:8+4*depth;
  scene.elements.push({id:`hero.node-${i}`,type:'ellipse',x:p.x-r,y:p.y-r,width:2*r,height:2*r,groupId:'hero.network',zIndex:45,style:terminal?{fill:'#CADFD4',stroke:null}:{fillPaint:'hero.junction',stroke:'#B7884B',strokeWidth:1,opacity:65+35*depth}});
 }
 scene.elements.push({id:'hero.title',type:'text',x:65,y:60,text:'Inside a polymer network',size:40,font:'Arial',zIndex:50,style:{fill:'#243D47',stroke:null}},
  {id:'hero.note',type:'text',x:65,y:642,text:'Conceptual cutaway • illustrative material appearance and enlarged strands',size:24,font:'Arial',zIndex:50,style:{fill:'#526A71',stroke:null}});
 scene.semantics!.objects.push({id:'hero',kind:'conceptual_polymer_material_cutaway',label:'Polymer network inside an illustrative curved material',elementIds:scene.elements.map(e=>e.id!),properties:{measured:false,qualitative:true,notToScale:true,sourceSection:'CAN proposal: network topology and cured-sheet context'}});
 return {scene:normalizeScene(scene),report:{version:'polymer-cutaway-hero.v1',spec,network,nodePoints,curveSampling:24,projection:'illustrative_curved_surface_not_physical_microstructure',measured:false,approval:'candidate_only'}};
}
