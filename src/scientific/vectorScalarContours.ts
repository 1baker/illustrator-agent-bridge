import {compactLightingContour} from "./compactLightingContour.js";

export interface ScalarPoint {x:number;y:number}
interface Sample extends ScalarPoint {value:number}

/** Polygonal level sets of a sampled analytic field; no input image or tracing.
 * Triangulation removes the ambiguous saddle case of marching squares. Shared
 * triangle edges cancel, leaving editable region boundaries, including holes.
 */
export function vectorScalarContours(field:(u:number,v:number)=>number,thresholds:number[],resolution=32,contourTolerance=0) {
  if(!Number.isFinite(contourTolerance)||contourTolerance<0||contourTolerance>.01) throw new Error("Invalid scalar contour tolerance");
  if(!Number.isInteger(resolution)||resolution<4||resolution>72||!thresholds.length||thresholds.length>64||thresholds.some((t,i)=>!Number.isFinite(t)||t<=0||t>=1||(i>0&&t<=thresholds[i-1]!))) throw new Error("Invalid scalar contour sampling");
  const grid=Array.from({length:resolution+1},(_,y)=>Array.from({length:resolution+1},(_,x):Sample=> {
    const value=field(x/resolution,y/resolution);
    if(!Number.isFinite(value)||value<0||value>1) throw new Error("Scalar field must be finite and within 0–1");
    return {x:x/resolution,y:y/resolution,value};
  }));
  const key=(p:ScalarPoint)=>`${Math.round(p.x*1e9)},${Math.round(p.y*1e9)}`;
  return thresholds.map(threshold=> {
    const edges=new Map<string,{a:ScalarPoint;b:ScalarPoint;ka:string;kb:string}>();
    const addTriangle=(triangle:Sample[])=> {
      const polygon:ScalarPoint[]=[];
      for(let i=0;i<3;i++) {
        const a=triangle[i]!,b=triangle[(i+1)%3]!,inside=a.value>=threshold,nextInside=b.value>=threshold;
        if(inside) polygon.push(a);
        if(inside!==nextInside) {
          const t=(threshold-a.value)/(b.value-a.value);
          polygon.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
        }
      }
      // A threshold passing exactly through two vertices can leave only a
      // zero-area edge. It must not cancel a neighboring real region boundary.
      const twiceArea=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length]!;return sum+p.x*q.y-q.x*p.y;},0);
      if(Math.abs(twiceArea)<1e-18) return;
      for(let i=0;i<polygon.length;i++) {
        const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,ka=key(a),kb=key(b);
        if(ka===kb) continue;
        if(edges.has(`${kb}|${ka}`)) edges.delete(`${kb}|${ka}`);
        else edges.set(`${ka}|${kb}`,{a,b,ka,kb});
      }
    };
    for(let y=0;y<resolution;y++) for(let x=0;x<resolution;x++) {
      const a=grid[y]![x]!,b=grid[y]![x+1]!,c=grid[y+1]![x+1]!,d=grid[y+1]![x]!;
      addTriangle([a,b,c]);addTriangle([a,c,d]);
    }
    const byStart=new Map<string,string[]>();
    for(const [id,e] of edges) byStart.set(e.ka,[...(byStart.get(e.ka)??[]),id]);
    const loops:ScalarPoint[][]=[];
    while(edges.size) {
      const first=edges.values().next().value!,start=first.ka,loop:ScalarPoint[]=[];
      let current=start;
      do {
        const id=byStart.get(current)?.find(id=>edges.has(id));
        if(!id) throw new Error("Open scalar contour");
        const e=edges.get(id)!;edges.delete(id);loop.push({x:e.a.x,y:e.a.y});current=e.kb;
      } while(current!==start);
      // Remove collinear grid-edge vertices, not geometric features.
      const compact=loop.filter((p,i)=> {
        const a=loop[(i+loop.length-1)%loop.length]!,b=loop[(i+1)%loop.length]!;
        return Math.abs((p.x-a.x)*(b.y-p.y)-(p.y-a.y)*(b.x-p.x))>1e-12;
      });
      if(compact.length>=3) loops.push(contourTolerance?compactLightingContour(compact,contourTolerance):compact);
    }
    if(loops.length>32||loops.some(l=>l.length>500)) throw new Error("Scalar contour exceeds vector scene limits");
    return {threshold,loops};
  });
}
