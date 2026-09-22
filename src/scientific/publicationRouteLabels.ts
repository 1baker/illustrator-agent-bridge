import { normalizeScene } from "../core/sceneValidation.js";
import { LabelPlacementError, measureLabel, placeLabels, type LabelBox, type LabelPlacement, type LabelPosition } from "../core/labelPlacement.js";
import type { Point, VectorElement } from "../core/vectorScene.js";

export function publicationAnnotationBounds(element: VectorElement): LabelBox {
  let x=element.x,y=element.y,width=1,height=1;
  if(element.type==="text")({width,height}=measureLabel(element.text,element.size??18,0));
  else if(element.type==="rect"||element.type==="ellipse"){width=element.width;height=element.height;}
  else if(element.type==="line"){x=Math.min(element.x,element.x2);y=Math.min(element.y,element.y2);width=Math.max(1,Math.abs(element.x2-element.x));height=Math.max(1,Math.abs(element.y2-element.y));}
  else {
    const points=element.type==="compound_path"?element.subpaths.flatMap(path=>path.points):element.points;
    const xs=points.flatMap(p=>[p.x,...("leftX" in p&&typeof p.leftX==="number"?[p.leftX]:[]),...("rightX" in p&&typeof p.rightX==="number"?[p.rightX]:[])]);
    const ys=points.flatMap(p=>[p.y,...("leftY" in p&&typeof p.leftY==="number"?[p.leftY]:[]),...("rightY" in p&&typeof p.rightY==="number"?[p.rightY]:[])]);
    x=Math.min(...xs);y=Math.min(...ys);width=Math.max(...xs)-x;height=Math.max(...ys)-y;
  }
  return {id:element.id!,x:x-2,y:y-2,width:width+4,height:height+4};
}

export function annotationLeaderCrossesBox(start: Point,end: Point, obstacle: LabelBox): boolean {
  let low=0,high=1;
  for(const [origin,delta,min,max] of [[start.x,end.x-start.x,obstacle.x,obstacle.x+obstacle.width],[start.y,end.y-start.y,obstacle.y,obstacle.y+obstacle.height]]) {
    if(Math.abs(delta!)<1e-9){if(origin!<min!||origin!>max!)return false;continue;}
    const a=(min!-origin!)/delta!,b=(max!-origin!)/delta!;
    low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(low>high)return false;
  }
  return true;
}

/** Place cellular relation text after final font sizing, with explicit thin leaders. */
export function publicationRouteLabels(input: unknown) {
  const scene=normalizeScene(structuredClone(input));
  if(!scene.elements.some(element=>element.id==="program.cytoplasm-field"))return undefined;
  const relationships=scene.semantics?.relationships??[];
  if(!relationships.length)return undefined;
  const byId=new Map(scene.elements.map(element=>[element.id,element]));
  const owned=new Set(scene.semantics!.objects.flatMap(object=>object.elementIds));
  const routeText=new Set(relationships.flatMap(relationship=>relationship.visualElementIds??[]).filter(id=>id.endsWith(".label-text")));
  const obstacles=scene.elements.filter(element=>element.visible!==false&&(element.style?.opacity??100)>0&&(
    (element.type==="text"&&!routeText.has(element.id!)) ||
    (owned.has(element.id!)&&(element.type==="ellipse"||element.type==="rect"||element.type==="path"&&element.closed)) ||
    element.id==="program.membrane-outer"||element.id==="program.membrane-inner"
  )).map(publicationAnnotationBounds);
  const placed:LabelPlacement[]=[],records=[];
  const shafts=relationships.flatMap(relationship=>(relationship.visualElementIds??[]).map(id=>byId.get(id)).filter((element):element is Extract<VectorElement,{type:"line"}>=>element?.type==="line"&&element.id?.endsWith(".semantic-arrow")===true));
  const canvas={x:12,y:12,width:(scene.document?.width??720)-24,height:(scene.document?.height??480)-24};
  for(const relationship of relationships) {
    const members=(relationship.visualElementIds??[]).map(id=>byId.get(id));
    const shaft=members.find(element=>element?.id?.endsWith(".semantic-arrow"));
    const label=members.find(element=>element?.id?.endsWith(".label-text"));
    const plate=members.find(element=>element?.id?.endsWith(".label-background"));
    const accent=members.find(element=>element?.id?.endsWith(".label-accent"));
    if(shaft?.type!=="line"||label?.type!=="text"||plate?.type!=="rect")return undefined;
    const leaderId=`${relationship.id}.semantic.label-leader`;
    if(byId.has(leaderId))throw new Error("Route labels already placed");
    const candidates:Array<{placement:LabelPlacement;anchor:Point;score:number}>=[];
    for(const fraction of [.5,.35,.65])for(const gap of [8,20,40,65,95])for(const position of ["top","bottom","right","left"] as LabelPosition[])for(const offset of [0,-.6,.6]) {
      const anchor={x:shaft.x+(shaft.x2-shaft.x)*fraction,y:shaft.y+(shaft.y2-shaft.y)*fraction};
      try {
        const size=measureLabel(label.text,label.size??18,6),horizontal=position==="top"||position==="bottom";
        const placement=placeLabels([{id:relationship.id,text:label.text,fontSize:label.size,padding:6,gap,preferredPositions:[position],target:{id:shaft.id!,x:anchor.x-1+(horizontal?offset*size.width:0),y:anchor.y-1+(horizontal?0:offset*size.height),width:2,height:2}}],{bounds:canvas,obstacles,existingLabels:placed})[0]!;
        const end={x:Math.max(placement.x,Math.min(anchor.x,placement.x+placement.width)),y:Math.max(placement.y,Math.min(anchor.y,placement.y+placement.height))};
        placement.leader={start:anchor,end};
        if(shafts.some(line=>annotationLeaderCrossesBox({x:line.x,y:line.y},{x:line.x2,y:line.y2},placement)))continue;
        if([...obstacles,...placed].some(obstacle=>annotationLeaderCrossesBox(anchor,end,obstacle)))continue;
        const score=Math.hypot(placement.leader.end.x-anchor.x,placement.leader.end.y-anchor.y)+Math.abs(fraction-.5)*20;
        candidates.push({placement,anchor,score});
      }catch(error){if(!(error instanceof LabelPlacementError))throw error;}
    }
    candidates.sort((a,b)=>a.score-b.score);
    const selected=candidates[0];if(!selected)throw new Error(`No clear relationship annotation for ${relationship.id}`);
    const originalElements=[label,plate,...(accent?[accent]:[])].map(element=>structuredClone(element));
    const {placement,anchor}=selected;
    label.x=placement.textX;label.y=placement.textY;
    Object.assign(plate,{x:placement.x,y:placement.y,width:placement.width,height:placement.height,style:{fill:null,stroke:null}});
    if(accent){accent.x=plate.x;accent.y=plate.y;accent.style={...accent.style,opacity:0};}
    const leader={id:leaderId,type:"line" as const,x:anchor.x,y:anchor.y,x2:placement.leader!.end.x,y2:placement.leader!.end.y,zIndex:9,style:{fill:null,stroke:"#64748B",strokeWidth:1.25}};
    scene.elements.push(leader);relationship.visualElementIds??=[];relationship.visualElementIds.push(leaderId);
    placed.push(placement);records.push({relationshipId:relationship.id,originalElements,placement,leaderId,anchor,candidateCount:candidates.length});
  }
  return {scene:normalizeScene(scene),provenance:{version:"publication-route-labels.v1",records,approval:"candidate_only",interpretation:"annotation_leaders_not_new_scientific_relationships"}};
}
