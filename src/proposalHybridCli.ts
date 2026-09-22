#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {writeProposalHybridHero} from './scientific/proposalHybridArtifacts.js';

const [planPath,...rest]=process.argv.slice(2),at=rest.indexOf('--output-dir'),output=at>=0?rest[at+1]:undefined;
if(!planPath||!output||rest.length!==2)throw Error('Usage: proposalHybridCli PLAN_JSON --output-dir FRESH_DIR');
const plan=JSON.parse(await readFile(resolve(planPath),'utf8'));
console.log(JSON.stringify(await writeProposalHybridHero(plan,resolve(output),true),null,2));
