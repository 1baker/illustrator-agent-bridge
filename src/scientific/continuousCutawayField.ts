import type {PathPoint,VectorScene} from "../core/vectorScene.js";

/** Exact cubic vertical extrema, including curved handles rather than anchors only. */
export function cubicVerticalExtent(points:PathPoint[],offset=0) {
  const ys=points.map(p=>p.y+offset);
  for(let i=0;i<points.length;i++) {
    const a=points[i]!,b=points[(i+1)%points.length]!,p=a.y,q=a.rightY??p,r=b.leftY??b.y,s=b.y;
    const A=-p+3*q-3*r+s,B=2*(p-2*q+r),C=q-p;
    const roots:number[]=[];
    if(Math.abs(A)<1e-12) {if(Math.abs(B)>1e-12) roots.push(-C/B);}
    else {const d=B*B-4*A*C;if(d>=0) roots.push((-B+Math.sqrt(d))/(2*A),(-B-Math.sqrt(d))/(2*A));}
    for(const t of roots) if(t>0&&t<1) {const u=1-t;ys.push(u*u*u*p+3*u*u*t*q+3*u*t*t*r+t*t*t*s+offset);}
  }
  return {top:Math.min(...ys),bottom:Math.max(...ys)};
}

/** Mutate only already-cloned presentation paints. Both regions sample the same
 * scene-space field, expressed in local bounds for SVG and editable TikZ. */
export function continuousCutawayField(scene:VectorScene,objectId:string) {
  const crop=scene.groups?.find(g=>g.id==="hero.crop")?.clip;
  if(!crop||crop.type!=="rect") throw Error("Continuous field requires rectangular crop");
  const regions=["film","zone"].map(suffix=> {
    const e=scene.elements.find(e=>e.id===`${objectId}.${suffix}`);
    if(!e||e.type!=="path"||!e.closed) throw Error("Continuous field requires closed material regions");
    const paint=scene.paints?.find(p=>p.id===e.style?.fillPaint);
    if(!paint||paint.type!=="linear_gradient"||!paint.id.startsWith("cutaway-ghost.")) throw Error("Continuous field requires private cloned linear paints");
    return {e,paint,...cubicVerticalExtent(e.points,e.y)};
  });
  const top=crop.y,bottom=regions[1]!.bottom;
  if(bottom<=top) throw Error("Continuous field has no visible depth");
  const stops=[{offset:0,color:"#E8F2F0"},{offset:40,color:"#D6E7E3"},{offset:68,color:"#E4E9DB"},{offset:100,color:"#F5DEBB"}];
  for(const region of regions) {
    const height=region.bottom-region.top;
    if(height<=0) throw Error("Degenerate continuous field region");
    Object.assign(region.paint,{x1:0,x2:0,y1:(top-region.top)/height,y2:(bottom-region.top)/height,stops:structuredClone(stops)});
  }
  // A single compound foundation covers antialias cracks between adjacent fills.
  // Its subpaths are exact copies, not expanded or displaced scientific edges.
  const underlayId=`${objectId}.continuous-field-underlay`,paintId=`cutaway-ghost.${objectId}.continuous-foundation`;
  if(scene.elements.some(e=>e.id===underlayId)||scene.paints!.some(p=>p.id===paintId)) throw Error("Continuous foundation already exists");
  const unionTop=Math.min(...regions.map(r=>r.top)),unionBottom=Math.max(...regions.map(r=>r.bottom));
  scene.paints!.push({...regions[0]!.paint,id:paintId,y1:(top-unionTop)/(unionBottom-unionTop),y2:(bottom-unionTop)/(unionBottom-unionTop)});
  const absolute=(p:PathPoint,x:number,y:number):PathPoint=>({...p,x:p.x+x,y:p.y+y,
    ...(p.leftX===undefined?{}:{leftX:p.leftX+x,leftY:p.leftY!+y}),
    ...(p.rightX===undefined?{}:{rightX:p.rightX+x,rightY:p.rightY!+y})});
  scene.elements.push({id:underlayId,type:"compound_path",x:0,y:0,groupId:"hero.crop",zIndex:Math.min(...regions.map(r=>r.e.zIndex??0))-1,
    fillRule:"nonzero",subpaths:regions.map(r=>({closed:true,points:r.e.points.map(p=>absolute(p,r.e.x,r.e.y))})),
    style:{fillPaint:paintId,stroke:null,opacity:100}});
  scene.semantics!.objects.find(o=>o.id===objectId)!.elementIds.push(underlayId);
  return {version:"continuous-cutaway-field.v2",top,bottom,underlayId,underlayPaintId:paintId,regions:regions.map(r=>({elementId:r.e.id!,paintId:r.paint.id,top:r.top,bottom:r.bottom})),interpretation:"illustrative_material_color_not_measured_concentration"};
}
