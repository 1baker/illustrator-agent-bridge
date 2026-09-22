import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileProposalConceptFigure} from '../src/scientific/proposalConceptFigure.js';
import {editSceneAssemblies} from '../src/scientific/sceneAssemblyEdit.js';
import {constructionDigest} from '../src/scientific/figureConstruction.js';
import {renderSceneToSvg} from '../src/render/svgRenderer.js';

const load=async()=>JSON.parse(await readFile('examples/proposal-concept-dynamic-network.json','utf8'));
test('prompt plan compiles to deterministic persistent vector objects with recorded seed',async()=>{
 const plan=await load(),a=compileProposalConceptFigure(plan),b=compileProposalConceptFigure(plan);assert.deepEqual(a,b);assert.equal(a.manifest.seed,260919);assert.equal(a.manifest.targetImageUsed,false);
 assert.equal(a.scene.semantics?.objects.length,5);assert.equal(a.scene.semantics?.relationships?.length,3);assert(a.scene.elements.length>100);assert(a.scene.elements.every(e=>!!e.id));assert.doesNotMatch(renderSceneToSvg(a.scene),/<image\b/);
 assert.notEqual(compileProposalConceptFigure({...plan,seed:260920}).manifest.sceneDigest,a.manifest.sceneDigest);
});
test('targeted stage move preserves unrelated IDs and geometry while reattaching connectors',async()=>{
 const {scene}=compileProposalConceptFigure(await load()),before=structuredClone(scene),object=scene.semantics!.objects.find(o=>o.id==='network')!,owned=new Set(object.elementIds),routeBefore=scene.elements.find(e=>e.id==='flow-0');assert(routeBefore?.type==='path');
 const result=editSceneAssemblies(scene,{schemaVersion:'SceneAssemblyMove.v1',baseDigest:constructionDigest(scene),objectIds:['network'],dx:0,dy:18,rationale:'Increase separation from the page header.'});
 assert.deepEqual(scene,before);assert.deepEqual(result.scene.semantics,scene.semantics);assert.deepEqual(result.scene.elements.map(e=>e.id),scene.elements.map(e=>e.id));
 for(const element of scene.elements.filter(e=>!owned.has(e.id!)&&!['flow-0','flow-0-head','flow-1','flow-1-head'].includes(e.id!)))assert.deepEqual(result.scene.elements.find(e=>e.id===element.id),element);
 const routeAfter=result.scene.elements.find(e=>e.id==='flow-0');assert(routeAfter?.type==='path');assert.equal(routeAfter.points.at(-1)!.y,routeBefore.points.at(-1)!.y+18);
});
test('proposal concept plan rejects missing controls, repeated depictions and unknown fields',async()=>{
 const p=await load();assert.throws(()=>compileProposalConceptFigure({...p,controls:[]}));assert.throws(()=>compileProposalConceptFigure({...p,stages:p.stages.map((s:any)=>({...s,depiction:'exchange'}))}));assert.throws(()=>compileProposalConceptFigure({...p,targetImage:'forbidden.png'}));
});
