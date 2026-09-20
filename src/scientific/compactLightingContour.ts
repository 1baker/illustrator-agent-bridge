import type {ScalarPoint} from "./vectorScalarContours.js";

/** Bounded chord approximation of lighting polygons only, never a body clip. */
export function compactLightingContour(points:ScalarPoint[],tolerance=.08):ScalarPoint[] {
  if(!Number.isFinite(tolerance)||tolerance<=0||points.length<3||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) throw Error("Invalid lighting contour");
  const distance=(p:ScalarPoint,a:ScalarPoint,b:ScalarPoint)=> {
    const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  };
  const simplify=(line:ScalarPoint[]):ScalarPoint[]=> {
    let best=tolerance,index=-1;
    for(let i=1;i<line.length-1;i++) {const d=distance(line[i]!,line[0]!,line.at(-1)!);if(d>best){best=d;index=i;}}
    return index<0?[line[0]!,line.at(-1)!]:[...simplify(line.slice(0,index+1)).slice(0,-1),...simplify(line.slice(index))];
  };
  let split=1;
  for(let i=2;i<points.length;i++) if(Math.hypot(points[i]!.x-points[0]!.x,points[i]!.y-points[0]!.y)>Math.hypot(points[split]!.x-points[0]!.x,points[split]!.y-points[0]!.y)) split=i;
  const compact=[...simplify(points.slice(0,split+1)).slice(0,-1),...simplify([...points.slice(split),points[0]!]).slice(0,-1)];
  return (compact.length>=3?compact:points).map(p=>({...p}));
}
