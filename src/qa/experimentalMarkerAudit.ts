import type { VectorScene } from "../core/vectorScene.js";
import { placePathMarkers } from "../core/pathMarkers.js";

/** Bounded contract for the experimental recipe's mutable flow/capture arrows. */
export function experimentalMarkerFailures(scene: VectorScene): string[] {
  const flowIds=(scene.semantics?.objects??[])
    .filter(o=>o.properties?.depictionOperator==="instrument_cross_section")
    .flatMap(o=>o.elementIds.filter(id=>/\.flow-stream-\d+$/.test(id)));
  const captureIds=(scene.semantics?.relationships??[])
    .filter(r=>r.predicate==="captures")
    .flatMap(r=>(r.visualElementIds??[]).filter(id=>/\.capture-trajectory-\d+$/.test(id)));
  const failures:string[]=[];
  for(const id of new Set([...flowIds,...captureIds])) {
    const curve=scene.elements.find(e=>e.id===id);
    const headId=id.replace(".flow-stream-",".flow-head-").replace(".capture-trajectory-",".capture-trajectory-head-");
    const head=scene.elements.find(e=>e.id===headId);
    if(curve?.type!=="path"||curve.closed||head?.type!=="polygon"||head.points.length!==3||head.visible===false||(head.style?.opacity??100)<=0) {
      failures.push(headId);continue;
    }
    try {
      const expected=placePathMarkers({source:{...curve,groupId:undefined,style:{fill:null,stroke:"#000000"}},markers:[{at:"end",kind:"arrowhead",size:10,idPrefix:"audit"}]}).placements[0]!;
      const [tip,a,b]=head.points,base={x:(a!.x+b!.x)/2,y:(a!.y+b!.y)/2};
      const dx=tip!.x-base.x,dy=tip!.y-base.y,length=Math.hypot(dx,dy);
      const area=Math.abs((a!.x-tip!.x)*(b!.y-tip!.y)-(a!.y-tip!.y)*(b!.x-tip!.x))/2;
      const t=expected.tangent;
      if(Math.hypot(tip!.x-expected.anchor.x,tip!.y-expected.anchor.y)>.1||length<=.1||area<=.01||
        Math.abs(dx*t.y-dy*t.x)/length>.01||dx*t.x+dy*t.y<=0) failures.push(headId);
    } catch { failures.push(headId); }
  }
  return failures;
}
