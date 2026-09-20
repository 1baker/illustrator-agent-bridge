import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {proposalHybridHero,proposalHybridHeroPlan} from '../src/scientific/proposalHybridHero.js';
import {renderSceneToSvg} from '../src/render/svgRenderer.js';

const fixture=async(name:string)=>JSON.parse(await readFile(new URL(`file://${process.cwd()}/examples/${name}`),'utf8'));
test('builds deterministic editable vectors from a validated structured plan',async()=>{const input=await fixture('proposal-hybrid-dynamic-network.json'),a=proposalHybridHero(input),b=proposalHybridHero(input),svg=renderSceneToSvg(a.scene);assert.deepEqual(a,b);assert.equal(a.plan.mechanism.mode,'formulation');assert.equal(a.scene.semantics?.objects.length,5);assert.equal(a.scene.semantics?.relationships?.length,3);assert(a.scene.elements.length>100);assert(a.scene.elements.every(e=>e.id));assert.doesNotMatch(svg,/<image\b/);assert.doesNotMatch(svg,/SAME TOPOLOGY/);assert.match(svg,/MEASURE FIRST/);});
test('a second proposal plan changes semantics and seeded geometry without target imagery',async()=>{const a=proposalHybridHero(await fixture('proposal-hybrid-dynamic-network.json')),b=proposalHybridHero(await fixture('proposal-hybrid-latent-diol.json'));assert.notEqual(a.plan.seed,b.plan.seed);assert.notDeepEqual(a.scene.elements.filter(e=>e.id?.includes('hero.strand')).map(e=>e.type==='path'?e.points:null),b.scene.elements.filter(e=>e.id?.includes('hero.strand')).map(e=>e.type==='path'?e.points:null));assert.equal(b.scene.semantics?.objects[0]?.label,'Latent diol sites');assert.match(renderSceneToSvg(b.scene),/reaction–transport map/);});
test('strict plan validation rejects arbitrary keys and invalid seeds',async()=>{const input=await fixture('proposal-hybrid-dynamic-network.json');assert.throws(()=>proposalHybridHeroPlan.parse({...input,execute:'rm -rf /'}));assert.throws(()=>proposalHybridHero({...input,seed:-1}));});
