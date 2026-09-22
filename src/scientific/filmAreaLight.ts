/** Fixed tensor Gauss quadrature over an illustrative rectangular half-vector
 * distribution. Unit weight preserves exposure when the light is widened.
 * This is not a calibrated emitter/camera or a full BRDF model.
 */
export function filmAreaLight(tilt:{x:number;y:number},spread={x:0,y:0}) {
  if(![tilt.x,tilt.y,spread.x,spread.y].every(Number.isFinite)||Math.abs(tilt.x)>1||Math.abs(tilt.y)>1||spread.x<0||spread.y<0||spread.x>.3||spread.y>.3)
    throw Error("Invalid film area light");
  const node=Math.sqrt(3/5),axis=[{p:-node,w:5/18},{p:0,w:8/18},{p:node,w:5/18}];
  const normalize=(x:number,y:number)=> {const n=Math.hypot(x,y,1);return [x/n,y/n,1/n];};
  if(spread.x===0&&spread.y===0) return [{half:normalize(tilt.x,tilt.y),weight:1}];
  return axis.flatMap(a=>axis.map(b=>({half:normalize(tilt.x+a.p*spread.x,tilt.y+b.p*spread.y),weight:a.w*b.w})));
}
