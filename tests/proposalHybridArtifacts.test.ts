import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeProposalHybridHero} from '../src/scientific/proposalHybridArtifacts.js';

test('writes a complete vector-first proposal package without a target image',async()=>{const root=await mkdtemp(join(tmpdir(),'proposal-hybrid-'));try{const input=JSON.parse(await readFile(join(process.cwd(),'examples/proposal-hybrid-dynamic-network.json'),'utf8')),out=join(root,'result'),manifest=await writeProposalHybridHero(input,out,false);assert.equal(manifest.qa.ok,true);assert.equal(manifest.vectorOnly,true);for(const name of['plan.json','prompt.md','scene.json','figure.svg','figure.tex','figure.png','caption.txt','alt-text.txt','qa.json','manifest.json'])assert((await readFile(join(out,name))).length>0);assert.doesNotMatch(await readFile(join(out,'figure.svg'),'utf8'),/<image\b/);}finally{await rm(root,{recursive:true,force:true});}});
