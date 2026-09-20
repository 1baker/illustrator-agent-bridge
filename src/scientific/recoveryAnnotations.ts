import type {VectorScene} from '../core/vectorScene.js';

/** Text annotations are not physical apparatus. Validate owned source text before
 * exempting them from anatomy scoring or generic material embellishment. */
export function recoveryAnnotationObjects(scene:VectorScene){
 const objects=(scene.semantics?.objects??[]).filter(o=>o.properties?.depictionOperator==='recovery_annotation_v1');
 for(const o of objects){
  const owned=o.elementIds.map(id=>scene.elements.find(e=>e.id===id));
  const text=owned.filter(e=>e?.type==='text').map(e=>e!.type==='text'?e.text:'').join('\n');
  const kinds=['recovery_effluent_composition','recovery_organic_ledger','recovery_titanium_ledger','recovery_volatile_ledger','recovery_endpoints','recovery_scope','prospective_recovery_prediction','prospective_recovery_boundary'];
  if(!kinds.includes(o.kind)||!o.label?.trim()||text!==o.label||owned.some(e=>!e||!['text','path','line'].includes(e.type))||o.properties?.measured!==false)throw Error('Recovery annotation requires its complete owned brief text and candidate status');
 }
 return objects;
}

/** Recovery optics and schematic map faces already have deliberate fills.
 * Generic relighting must not turn a no-data map into a response gradient. */
export function recoveryAuthoredElementIds(scene:VectorScene):string[]{
 const ids=recoveryAnnotationObjects(scene).flatMap(o=>o.elementIds);
 for(const o of scene.semantics?.objects??[]){
  if(o.properties?.depictionOperator==='recovery_unit_operation_v1'){
   const owned=o.elementIds.map(id=>scene.elements.find(e=>e.id===id));
   const body=owned.find(e=>e?.id===o.id+'.body');
   const shell=scene.groups?.find(g=>g.id===o.id+'.volume-shell');
   if(body?.type!=='path'||shell?.clip?.type!=='path'||JSON.stringify(body.points)!==JSON.stringify(shell.clip.points)||!owned.some(e=>e?.id===o.id+'.studio-right-environment')||o.properties?.measured!==false)throw Error('Recovery material requires its complete body-bound volume construction');
   ids.push(...o.elementIds);
  }
  if(o.properties?.depictionOperator==='recovery_local_map_v1'){
   const faces=o.elementIds.map(id=>scene.elements.find(e=>e.id===id)).filter(e=>e?.id==='local-map.triangle-a'||e?.id==='local-map.triangle-b');
   if(faces.length!==2||faces.some(e=>e?.type!=='path'||!e.closed||e.style?.fillPaint||typeof e.style?.fill!=='string')||faces[0]!.style!.fill!==faces[1]!.style!.fill||o.properties?.responseValuesProvided!==false)throw Error('Recovery map requires equal solid schematic faces without response values');
   ids.push(...o.elementIds);
  }
 }
 return ids;
}
