import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {compileProposalConceptFigure} from './proposalConceptFigure.js';
import {materialStudyPrint} from './materialStudyPrint.js';
import {renderSceneToPng} from '../render/pngRenderer.js';
import {compileLatexWithTectonic} from '../render/latexCompiler.js';
import {inspectPromptFigureScene} from '../qa/promptFigureQa.js';

export async function writeProposalConceptFigure(input:unknown,outputDir:string,pdf=false){
 const built=compileProposalConceptFigure(input),print=materialStudyPrint(built.scene,built.plan.widthMm,{compact:true}),png=renderSceneToPng(built.scene,{width:built.plan.width}).png,qa=inspectPromptFigureScene(built.scene,'proposal',{widthMm:print.manifest.size.widthMm,heightMm:print.manifest.size.heightMm});
 const files:Record<string,string|Buffer>={'plan.json':JSON.stringify(built.plan,null,2),'scene.json':JSON.stringify(built.scene,null,2),'figure.svg':print.svg,'figure.tex':print.latex,'figure.png':png,'caption.txt':built.plan.caption,'construction-manifest.json':JSON.stringify(built.manifest,null,2),'generic-qa.json':JSON.stringify(qa,null,2)};
 if(pdf)files['figure.pdf']=(await compileLatexWithTectonic(print.latex)).pdf;
 await mkdir(outputDir,{recursive:false});for(const [name,value]of Object.entries(files))await writeFile(join(outputDir,name),value,{flag:'wx'});
 const manifest={...built.manifest,print:print.manifest,files:Object.fromEntries(Object.entries(files).map(([name,value])=>[name,createHash('sha256').update(value).digest('hex')]))};await writeFile(join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 return {outputDir,...manifest};
}
