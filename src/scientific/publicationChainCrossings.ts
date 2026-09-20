import type { PathPoint, PathElement, VectorElement, VectorGroup } from "../core/vectorScene.js";
import { tubeLightingBand } from "./publicationTubeLighting.js";

type Point={x:number;y:number};
type Cubic=[Point,Point,Point,Point];
const mix=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const curve=(a:PathPoint,b:PathPoint):Cubic=>[a,{x:a.rightX??a.x,y:a.rightY??a.y},{x:b.leftX??b.x,y:b.leftY??b.y},b];
function at(c:Cubic,t:number) {
  const a=mix(c[0],c[1],t),b=mix(c[1],c[2],t),d=mix(c[2],c[3],t);
  return mix(mix(a,b,t),mix(b,d,t),t);
}
function derivative(c:Cubic,t:number) {
  const s=1-t;
  return {x:3*s*s*(c[1].x-c[0].x)+6*s*t*(c[2].x-c[1].x)+3*t*t*(c[3].x-c[2].x),
    y:3*s*s*(c[1].y-c[0].y)+6*s*t*(c[2].y-c[1].y)+3*t*t*(c[3].y-c[2].y)};
}
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const sub=(a:Point,b:Point)=>({x:a.x-b.x,y:a.y-b.y});

/** Recover paired-edge cubic handles, not just anchor chords. */
export function chainCenterline(body:PathPoint[]):PathPoint[] {
  if(body.length<6||body.length>128||body.length%2) throw new Error("Crossings require a bounded paired-edge tube");
  if(body.some(p=>![p.x,p.y].every(Number.isFinite)||(p.leftX===undefined)!==(p.leftY===undefined)||(p.rightX===undefined)!==(p.rightY===undefined)||[p.leftX,p.leftY,p.rightX,p.rightY].some(v=>v!==undefined&&!Number.isFinite(v)))) throw new Error("Invalid tube coordinates");
  return body.slice(0,body.length/2).map((a,i)=> {
    const b=body[body.length-1-i]!;
    return {...mix(a,b,0.5),
      ...(i===0?{}:{leftX:((a.leftX??a.x)+(b.rightX??b.x))/2,leftY:((a.leftY??a.y)+(b.rightY??b.y))/2}),
      ...(i===body.length/2-1?{}:{rightX:((a.rightX??a.x)+(b.leftX??b.x))/2,rightY:((a.rightY??a.y)+(b.leftY??b.y))/2})};
  });
}

export interface ChainCrossing { point:Point; underSegment:number; overSegment:number; underT:number; overT:number; residual:number }
/** Bounded coarse candidates followed by Newton refinement on actual cubics.
 * Later traversal is an illustrative overpass convention, not molecular data.
 */
export function chainSelfCrossings(points:PathPoint[]):ChainCrossing[] {
  return findCrossings(points);
}

export function chainPairCrossings(under:PathPoint[],over:PathPoint[]):ChainCrossing[] {
  return findCrossings(under,over);
}

function findCrossings(points:PathPoint[],other?:PathPoint[]):ChainCrossing[] {
  for(const candidate of other?[points,other]:[points]) {
  if(candidate.length<3||candidate.length>64||candidate.some(p=>![p.x,p.y].every(Number.isFinite)||(p.leftX===undefined)!==(p.leftY===undefined)||(p.rightX===undefined)!==(p.rightY===undefined)||[p.leftX,p.leftY,p.rightX,p.rightY].some(v=>v!==undefined&&!Number.isFinite(v)))) throw new Error("Invalid crossing centerline");
  }
  const curves=points.slice(0,-1).map((p,i)=>curve(p,points[i+1]!));
  const over=other?other.slice(0,-1).map((p,i)=>curve(p,other[i+1]!)):curves;
  const samples=curves.map(c=>Array.from({length:13},(_,i)=>at(c,i/12)));
  const overSamples=other?over.map(c=>Array.from({length:13},(_,i)=>at(c,i/12))):samples;
  const result:ChainCrossing[]=[];
  for(let i=0;i<curves.length;i++) for(let j=other?0:i+2;j<over.length;j++) {
    for(let a=0;a<12;a++) for(let b=0;b<12;b++) {
      const p=samples[i]![a]!,q=overSamples[j]![b]!,r=sub(samples[i]![a+1]!,p),s=sub(overSamples[j]![b+1]!,q),det=cross(r,s);
      if(Math.abs(det)<1e-8) continue;
      const qp=sub(q,p),u=cross(qp,s)/det,v=cross(qp,r)/det;
      if(u<0||u>1||v<0||v>1) continue;
      let t=(a+u)/12,w=(b+v)/12;
      for(let step=0;step<8;step++) {
        const f=sub(at(curves[i]!,t),at(over[j]!,w)),di=derivative(curves[i]!,t),dj=derivative(over[j]!,w),d=cross(di,dj);
        if(Math.abs(d)<1e-9) break;
        t-=cross(f,dj)/d; w-=cross(f,di)/d;
      }
      if(!Number.isFinite(t)||!Number.isFinite(w)||t<0||t>1||w<0||w>1) continue;
      const first=at(curves[i]!,t),second=at(over[j]!,w),residual=Math.hypot(first.x-second.x,first.y-second.y);
      const di=derivative(curves[i]!,t),dj=derivative(over[j]!,w);
      const angle=Math.abs(cross(di,dj))/(Math.hypot(di.x,di.y)*Math.hypot(dj.x,dj.y));
      if(!Number.isFinite(residual)||!Number.isFinite(angle)||residual>1e-5||angle<0.25) continue;
      if(result.some(c=>Math.hypot(c.point.x-first.x,c.point.y-first.y)<0.1)) continue;
      result.push({point:first,underSegment:i,overSegment:j,underT:t,overT:w,residual});
    }
  }
  return result;
}

/** Local illustrative contact shade, clipped to the lower strand's exact body.
 * Existing z-order supplies depth; equal-depth pairs are deliberately ambiguous.
 * No inter-strand connection or physical contact measurement is asserted.
 */
export function chainPairContactShadows(under:PathElement,over:PathElement) {
  if(!under.id||!over.id||under.id===over.id||!under.closed||!over.closed||under.groupId!==over.groupId||
    under.x!==0||under.y!==0||over.x!==0||over.y!==0||!Number.isInteger(under.zIndex)||!Number.isInteger(over.zIndex)||over.zIndex!-under.zIndex!<2)
    throw Error("Pair contact shadows require distinct ordered tubes in one absolute coordinate space");
  const lower=chainCenterline(under.points),upper=chainCenterline(over.points);
  const crossings=chainPairCrossings(lower,upper);
  const groupId=`${over.id}.contact-over.${under.id}`;
  const group:VectorGroup={id:groupId,parentId:over.groupId,zIndex:over.zIndex!-1,clip:{type:"path",x:0,y:0,closed:true,points:under.points}};
  const elements:VectorElement[]=[];
  for(const [index,c] of crossings.entries()) {
    const j=c.overSegment,speed=derivative(curve(upper[j]!,upper[j+1]!),c.overT);
    const edge=at(curve(over.points[j]!,over.points[j+1]!),c.overT);
    const radius=Math.hypot(edge.x-c.point.x,edge.y-c.point.y);
    const extent=Math.min(.45,radius*3.2/Math.max(1,Math.hypot(speed.x,speed.y)));
    if(extent<.01)continue;
    for(let level=0;level<3;level++) {
      const d=extent*(1-level*.2),section=chainCrossingSection(over.points,j,Math.max(0,c.overT-d),Math.min(1,c.overT+d));
      const dx=radius*.25,dy=radius*.5;
      elements.push({id:`${groupId}.${index}.${level}`,type:"path",x:0,y:0,closed:true,groupId,points:section.map(p=>({...p,x:p.x+dx,y:p.y+dy,
        ...(p.leftX===undefined?{}:{leftX:p.leftX+dx,leftY:p.leftY!+dy}),...(p.rightX===undefined?{}:{rightX:p.rightX+dx,rightY:p.rightY!+dy})})),style:{fill:"#334C50",stroke:null,opacity:8},zIndex:over.zIndex!-1});
    }
  }
  return {group,elements,crossings};
}

function split(c:Cubic,t:number):[Cubic,Cubic] {
  const a=mix(c[0],c[1],t),b=mix(c[1],c[2],t),d=mix(c[2],c[3],t),e=mix(a,b,t),f=mix(b,d,t),p=mix(e,f,t);
  return [[c[0],a,e,p],[p,f,d,c[3]]];
}
function portion(c:Cubic,start:number,end:number):PathPoint[] {
  const left=split(c,end)[0],part=split(left,start/end)[1];
  return [{...part[0],rightX:part[1].x,rightY:part[1].y},{...part[3],leftX:part[2].x,leftY:part[2].y}];
}
/** A short exact strip from the original paired edges, never a new branch. */
export function chainCrossingSection(body:PathPoint[],segment:number,start:number,end:number):PathPoint[] {
  chainCenterline(body);
  const n=body.length/2;
  if(!Number.isInteger(n)||!Number.isInteger(segment)||segment<0||segment>=n-1||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>1||start>=end) throw new Error("Invalid crossing section");
  return [...portion(curve(body[segment]!,body[segment+1]!),start,end),
    ...portion(curve(body[body.length-2-segment]!,body[body.length-1-segment]!),1-end,1-start)];
}

/** Exact paired-edge subcurves spanning anchor boundaries. Arc distance is
 * estimated with 24 chords per cubic only to select endpoints; output edges
 * remain original Bezier portions. No new strand or centerline is fitted. */
export function chainCrossingSpan(body:PathPoint[],segment:number,t:number,halfLength:number):PathPoint[] {
  const center=chainCenterline(body),last=center.length-1;
  if(!Number.isInteger(segment)||segment<0||segment>=last||!Number.isFinite(t)||t<0||t>1||!Number.isFinite(halfLength)||halfLength<=0)
    throw Error("Invalid crossing span");
  const position=segment+t;
  const samples=[{u:0,d:0}];
  let previous:Point=center[0]!,distance=0;
  for(let i=0;i<last;i++)for(let k=1;k<=24;k++) {
    const p=at(curve(center[i]!,center[i+1]!),k/24);
    distance+=Math.hypot(p.x-previous.x,p.y-previous.y);
    samples.push({u:i+k/24,d:distance});previous=p;
  }
  if(distance<1e-10)throw Error("Degenerate crossing span");
  const interpolate=(value:number,from:"u"|"d",to:"u"|"d")=>{
    const index=samples.findIndex(p=>p[from]>=value);
    if(index<=0)return samples[0]![to];
    const a=samples[index-1]!,b=samples[index]!;
    const ratio=b[from]===a[from]?0:(value-a[from])/(b[from]-a[from]);
    return a[to]+ratio*(b[to]-a[to]);
  };
  const location=interpolate(position,"u","d");
  const start=interpolate(Math.max(0,location-halfLength),"d","u");
  const end=interpolate(Math.min(distance,location+halfLength),"d","u");
  if(end-start<1e-10)throw Error("Degenerate crossing span");
  const cuts=[start,end];
  for(let i=Math.ceil(start);i<end;i++)if(i>start)cuts.push(i);
  if(cuts.length===2)cuts.push((start+end)/2);
  const ordered=cuts.sort((a,b)=>a-b).filter((p,i,all)=>i===0||p-all[i-1]!>1e-10);
  const upper:PathPoint[]=[],lower:PathPoint[]=[];
  const reverse=(p:PathPoint):PathPoint=>({...p,leftX:p.rightX,leftY:p.rightY,rightX:p.leftX,rightY:p.leftY});
  const append=(points:PathPoint[],a:PathPoint,b:PathPoint)=>{
    if(points.length)points[points.length-1]={...points.at(-1)!,rightX:a.rightX,rightY:a.rightY};
    else points.push(a);
    points.push(b);
  };
  for(let i=0;i<ordered.length-1;i++) {
    const a=ordered[i]!,b=ordered[i+1]!,j=Math.min(last-1,Math.floor(a));
    const section=chainCrossingSection(body,j,a-j,b-j);
    append(upper,section[0]!,section[1]!);
    append(lower,reverse(section[3]!),reverse(section[2]!));
  }
  return [...upper,...lower.reverse().map(reverse)];
}

export function chainCrossingCues(chain:PathElement):{elements:VectorElement[];crossings:ChainCrossing[]} {
  if(!chain.id||!chain.closed||!chain.style?.fill||chain.style.fillPaint) throw new Error("Crossing cues require an identified, closed, solid-color tube");
  const centerline=chainCenterline(chain.points),crossings=chainSelfCrossings(centerline),elements:VectorElement[]=[];
  for(const [index,c] of crossings.entries()) {
    const j=c.overSegment;
    const a=at(curve(chain.points[j]!,chain.points[j+1]!),c.overT);
    const radius=Math.hypot(a.x-c.point.x,a.y-c.point.y);
    if(radius<1e-8) continue;
    for(let feather=0;feather<5;feather++) {
    const fraction=feather*0.17;
    const section=chainCrossingSpan(chain.points,j,c.overT,radius*3.2*(1-fraction));
    const path=(suffix:string,points:PathPoint[],fill:string,opacity:number)=>elements.push({
      id:`${chain.id}.crossing-${index}.${suffix}-${feather}`,type:"path",x:chain.x,y:chain.y,groupId:chain.groupId,closed:true,points,
      style:{fill,stroke:null,opacity},zIndex:(chain.zIndex??24)+2});
    // Local occlusion and a continuous crest establish over/under ordering.
    // The original tube remains authoritative; no atom or bond is introduced.
    path("shadow",section.map(p=>({...p,x:p.x+radius*0.35,y:p.y+radius*0.6,
      ...(p.leftX===undefined?{}:{leftX:p.leftX+radius*0.35,leftY:p.leftY!+radius*0.6}),
      ...(p.rightX===undefined?{}:{rightX:p.rightX+radius*0.35,rightY:p.rightY!+radius*0.6})})),"#334C50",6);
    path("body",section,chain.style?.fill??"#5C9E99",(chain.style?.opacity??100)*0.18);
    path("crest",tubeLightingBand(section,0.42,0.76),"#FFFFFF",12);
    }
  }
  return {elements,crossings};
}
