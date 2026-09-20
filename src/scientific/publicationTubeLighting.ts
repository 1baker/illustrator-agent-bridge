import type { PathPoint } from "../core/vectorScene.js";

/** Interpolate corresponding cubic edges of a symmetric tube. Unlike a
 * translated highlight this follows the complete taper, including both tips.
 * Fractions run from the forward edge (0) to the reversed edge (1).
 */
export function tubeLightingBand(body: PathPoint[], start: number|readonly number[], end: number|readonly number[]): PathPoint[] {
  if(body.length<6||body.length%2) throw new Error("Invalid tube lighting band");
  const n=body.length/2;
  const starts=typeof start==="number"?Array(n).fill(start) as number[]:start;
  const ends=typeof end==="number"?Array(n).fill(end) as number[]:end;
  if(body.length<6 || body.length%2 || starts.length!==n||ends.length!==n||
    Array.from({length:n},(_,i)=>i).some(i=>!Number.isFinite(starts[i])||!Number.isFinite(ends[i])||starts[i]!<0||ends[i]!>1||starts[i]!>=ends[i]!))
    throw new Error("Invalid tube lighting band");
  for(const p of body) {
    if(![p.x,p.y].every(Number.isFinite) ||
      [p.leftX,p.leftY,p.rightX,p.rightY].some(v=>v!==undefined&&!Number.isFinite(v)) ||
      (p.leftX===undefined)!==(p.leftY===undefined) ||
      (p.rightX===undefined)!==(p.rightY===undefined)) throw new Error("Invalid tube coordinates");
  }
  const edge=(fractions:readonly number[])=>body.slice(0,n).map((a,i):PathPoint=> {
    const t=fractions[i]!;
    const b=body[body.length-1-i]!;
    const mix=(u:number,v:number)=>u+(v-u)*t;
    return {x:mix(a.x,b.x),y:mix(a.y,b.y),
      ...(i===0?{}:{leftX:mix(a.leftX??a.x,b.rightX??b.x),leftY:mix(a.leftY??a.y,b.rightY??b.y)}),
      ...(i===n-1?{}:{rightX:mix(a.rightX??a.x,b.leftX??b.x),rightY:mix(a.rightY??a.y,b.leftY??b.y)})};
  });
  return [...edge(starts),...edge(ends).reverse().map(({leftX,leftY,rightX,rightY,...p})=>({...p,
    ...(rightX===undefined?{}:{leftX:rightX,leftY:rightY!}),
    ...(leftX===undefined?{}:{rightX:leftX,rightY:leftY!})}))];
}

/** Qualitative screen-space light response, not a reconstructed 3D normal field. */
export function tubeLightPeaks(body:PathPoint[],light={x:-.6,y:-.8}):number[] {
  tubeLightingBand(body,0,1);
  const length=Math.hypot(light.x,light.y);
  if(!Number.isFinite(length)||length<1e-12) throw new Error("Invalid tube light direction");
  return body.slice(0,body.length/2).map((a,i)=> {
    const b=body[body.length-1-i]!,dx=b.x-a.x,dy=b.y-a.y,width=Math.hypot(dx,dy);
    const facing=width<1e-12?0:(dx*light.x+dy*light.y)/(width*length);
    return .5+.16*Math.max(-1,Math.min(1,facing));
  });
}

/** Analytic Lambertian level-set on an assumed circular cross-section.
 * The authored 2D edges supply orientation only, not measured 3D geometry.
 * Thresholds stay below the camera-facing response so every section is present.
 */
export function tubeDiffuseBand(body:PathPoint[],threshold:number,light={x:-.6,y:-.8,z:1.4}) {
  tubeLightingBand(body,0,1);
  const length=Math.hypot(light.x,light.y,light.z),front=light.z/length;
  if(!Number.isFinite(length)||length<1e-12||!Number.isFinite(threshold)||threshold<=0||threshold>=front)
    throw new Error("Invalid circular tube diffuse lighting");
  const starts:number[]=[],ends:number[]=[];
  for(let i=0;i<body.length/2;i++) {
    const a=body[i]!,b=body[body.length-1-i]!,dx=b.x-a.x,dy=b.y-a.y,width=Math.hypot(dx,dy);
    const side=width<1e-12?0:(dx*light.x+dy*light.y)/(width*length);
    const phase=Math.atan2(side,front),half=Math.acos(threshold/Math.hypot(side,front));
    starts.push((1+Math.sin(Math.max(-Math.PI/2,phase-half)))/2);
    ends.push((1+Math.sin(Math.min(Math.PI/2,phase+half)))/2);
  }
  return {points:tubeLightingBand(body,starts,ends),starts,ends};
}

/** Complement of the lit circular section, expressed as two editable rim bands.
 * An almost collapsed band (one millionth of tube width) handles sections whose
 * illuminated region reaches an edge without introducing invalid zero widths.
 */
export function tubeShadeBands(body:PathPoint[],threshold:number,light={x:-.6,y:-.8,z:1.4}) {
  const lit=tubeDiffuseBand(body,threshold,light),epsilon=1e-6;
  const forwardEnds=lit.starts.map(t=>Math.max(epsilon,t));
  const reverseStarts=lit.ends.map(t=>Math.min(1-epsilon,t));
  return {forward:tubeLightingBand(body,0,forwardEnds),reverse:tubeLightingBand(body,reverseStarts,1),forwardEnds,reverseStarts};
}
