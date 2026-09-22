import type {Point,PathPoint} from '../core/vectorScene.js';

type SpatialPoint=Point&{z:number};
type Strand={from:number;to:number;points:PathPoint[];depth:number;visible:Array<[number,number]>};
/** Evaluate a two-anchor cubic and its derivative; also used for exact interval extraction. */
export function networkCubic(points:PathPoint[],t:number){
 const [a,b]=points as [PathPoint,PathPoint],c={x:a.rightX??a.x,y:a.rightY??a.y},d={x:b.leftX??b.x,y:b.leftY??b.y},q=1-t;
 return {x:q**3*a.x+3*q*q*t*c.x+3*q*t*t*d.x+t**3*b.x,y:q**3*a.y+3*q*q*t*c.y+3*q*t*t*d.y+t**3*b.y,
  vx:3*q*q*(c.x-a.x)+6*q*t*(d.x-c.x)+3*t*t*(b.x-d.x),vy:3*q*q*(c.y-a.y)+6*q*t*(d.y-c.y)+3*t*t*(b.y-d.y)};
}
export function networkCubicInterval(points:PathPoint[],start:number,end:number):PathPoint[]{
 if(points.length!==2||![start,end].every(Number.isFinite)||start<0||end>1||end<=start)throw Error('Invalid network cubic interval');
 const a=networkCubic(points,start),b=networkCubic(points,end),s=(end-start)/3;
 return [{x:a.x,y:a.y,rightX:a.x+a.vx*s,rightY:a.y+a.vy*s},{x:b.x,y:b.y,leftX:b.x-b.vx*s,leftY:b.y-b.vy*s}];
}
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
function distanceToPolyline(p:Point,line:Point[]){
 let best=Infinity;for(let i=1;i<line.length;i++){const a=line[i-1]!,b=line[i]!,dx=b.x-a.x,dy=b.y-a.y,s=dx*dx+dy*dy;
  const t=s?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/s)):0;best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
 }return best;
}
/** Walk out of the actual curved footprint; tangent-angle estimates can undercut tight bends. */
function clearanceGap(back:PathPoint[],front:PathPoint[],at:number):[number,number]|undefined{
 const line=Array.from({length:129},(_,i)=>networkCubic(front,i/128)),distance=(t:number)=>distanceToPolyline(networkCubic(back,t),line);
 const end=(sign:number)=>{let inside=at,outside=at;
  do{inside=outside;outside+=sign*.004;if(outside<.04||outside>.96)return undefined;}while(distance(outside)<9.5);
  for(let i=0;i<16;i++){const mid=(inside+outside)/2;if(distance(mid)<9.5)inside=mid;else outside=mid;}return outside;
 };
 const lo=end(-1),hi=end(1);return lo===undefined||hi===undefined?undefined:[lo,hi];
}
/** Numerical intersections, refined against the cubics rather than left on sampled chords. */
function intersections(a:PathPoint[],b:PathPoint[]){
 const n=48,pa=Array.from({length:n+1},(_,i)=>networkCubic(a,i/n)),pb=Array.from({length:n+1},(_,i)=>networkCubic(b,i/n));
 const out:Array<{t:number;u:number;point:Point;sin:number}>=[];
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const p=pa[i]!,q=pb[j]!,r={x:pa[i+1]!.x-p.x,y:pa[i+1]!.y-p.y},s={x:pb[j+1]!.x-q.x,y:pb[j+1]!.y-q.y},den=cross(r,s);if(Math.abs(den)<1e-9)continue;
  const delta={x:q.x-p.x,y:q.y-p.y},v=cross(delta,s)/den,w=cross(delta,r)/den;if(v<0||v>1||w<0||w>1)continue;
  let t=(i+v)/n,u=(j+w)/n;
  for(let k=0;k<6;k++){const A=networkCubic(a,t),B=networkCubic(b,u),D=A.vx*B.vy-A.vy*B.vx;if(Math.abs(D)<1e-8)break;
   const dx=B.x-A.x,dy=B.y-A.y;t+=(dx*B.vy-dy*B.vx)/D;u+=(dx*A.vy-dy*A.vx)/D;
  }
  if(t<=1e-5||t>=1-1e-5||u<=1e-5||u>=1-1e-5||out.some(p=>Math.abs(p.t-t)<1e-5))continue;
  const A=networkCubic(a,t),B=networkCubic(b,u);if(Math.hypot(A.x-B.x,A.y-B.y)>1e-5)throw Error('Unresolved network crossing');
  out.push({t,u,point:{x:A.x,y:A.y},sin:Math.abs(A.vx*B.vy-A.vy*B.vx)/(Math.hypot(A.vx,A.vy)*Math.hypot(B.vx,B.vy))});
 }
 return out;
}

/** A bounded illustration volume, not an equilibrated polymer or a measured network. */
export function volumeNetworkGeometry(count:number,seed:number){
 if(!Number.isInteger(count)||count<6||count>40||!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Invalid network volume parameters');
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const spatial:SpatialPoint[]=[],project=(p:SpatialPoint)=>({x:p.x+.35*p.z,y:p.y-.22*p.z});
 for(let i=0;i<count;i++){
  const candidates=Array.from({length:40},()=>({x:random()*290,y:random()*140,z:(random()-.5)*110}));
  const score=(p:SpatialPoint)=>spatial.length?Math.min(...spatial.map(q=>{const a=project(p),b=project(q);return Math.min(Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z),2*Math.hypot(a.x-b.x,a.y-b.y));})):1;
  candidates.sort((a,b)=>score(b)-score(a));spatial.push(candidates[0]!);
 }
 const points=spatial.map(project),degree=points.map(()=>0),parent=points.map((_,i)=>i),strands:Strand[]=[];
 const root=(i:number):number=>parent[i]===i?i:root(parent[i]!);
 const candidates=spatial.flatMap((p,i)=>spatial.slice(i+1).map((q,j)=>({from:i,to:i+j+1,length:Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)}))).sort((a,b)=>a.length-b.length||a.from-b.from||a.to-b.to);
 const crossings:Array<{front:number;back:number;tFront:number;tBack:number;point:Point;depthSeparation:number;gap:[number,number]}>=[];
 const add=(i:number,j:number)=>{
  if(degree[i]!>=4||degree[j]!>=4)return false;
  const p=points[i]!,q=points[j]!,ex=q.x-p.x,ey=q.y-p.y,sign=(i+j)%2?1:-1,bend=.22*sign;
  const curve:PathPoint[]=[{...p,rightX:p.x+.32*ex-ey*bend,rightY:p.y+.32*ey+ex*bend},{...q,leftX:q.x-.32*ex+ey*bend,leftY:q.y-.32*ey-ex*bend}];
  // A projected strand must not masquerade as a connection to an unrelated node.
  for(let k=0;k<points.length;k++)if(k!==i&&k!==j)for(let s=0;s<=48;s++){const p=networkCubic(curve,s/48);if(Math.hypot(p.x-points[k]!.x,p.y-points[k]!.y)<13)return false;}
  const depthAt=(a:number,b:number,t:number)=>spatial[a]!.z*(1-t)+spatial[b]!.z*t;
  const pending:typeof crossings=[];
  for(const [k,other]of strands.entries())for(const hit of intersections(curve,other.points)){
   const z=depthAt(i,j,hit.t),oz=depthAt(other.from,other.to,hit.u),newFront=z>oz;
   // Reject nearly touching, grazing, or node-adjacent projected crossings.
   if(Math.abs(z-oz)<12||hit.sin<.40||Math.min(hit.t,1-hit.t,hit.u,1-hit.u)<.12)return false;
   const backCurve=newFront?other.points:curve,frontCurve=newFront?curve:other.points,tBack=newFront?hit.u:hit.t,gap=clearanceGap(backCurve,frontCurve,tBack);
   if(!gap)return false;
   pending.push({front:newFront?strands.length:k,back:newFront?k:strands.length,tFront:newFront?hit.t:hit.u,tBack,point:hit.point,depthSeparation:Math.abs(z-oz),gap});
  }
  strands.push({from:i,to:j,points:curve,depth:(spatial[i]!.z+spatial[j]!.z)/2,visible:[[0,1]]});crossings.push(...pending);
  degree[i]++;degree[j]++;parent[root(i)]=root(j);return true;
 };
 for(const c of candidates)if(root(c.from)!==root(c.to))add(c.from,c.to);
 if(points.some((_,i)=>root(i)!==root(0)))throw Error('Unable to connect volume with safe projected clearance');
 for(const c of candidates){if(strands.length>=Math.floor(count*1.55))break;if(!strands.some(e=>e.from===c.from&&e.to===c.to))add(c.from,c.to);}
 for(const [i,s]of strands.entries())for(const {gap:[lo,hi]}of crossings.filter(c=>c.back===i))s.visible=s.visible.flatMap(([a,b]):Array<[number,number]>=>hi<=a||lo>=b?[[a,b]]:[...(lo>a?[[a,lo] as [number,number]]:[]),...(hi<b?[[hi,b] as [number,number]]:[])]);
 return {version:'illustrative-network-volume.v1',seed,measured:false,spatial,points,degree,strands,crossings};
}
