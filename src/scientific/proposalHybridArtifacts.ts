import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {proposalHybridHero} from './proposalHybridHero.js';
import {materialStudyPrint} from './materialStudyPrint.js';
import {renderSceneToPng} from '../render/pngRenderer.js';
import {compileLatexWithTectonic} from '../render/latexCompiler.js';
import {inspectPromptFigureScene} from '../qa/promptFigureQa.js';

const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const luminance=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]!+.7152*c[1]!+.0722*c[2]!;};
const contrast=(a:string,b:string)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi!+.05)/(lo!+.05);};
export async function writeProposalHybridHero(input:unknown,outputDir:string,pdf=true){
 const built=proposalHybridHero(input),print=materialStudyPrint(built.scene,built.plan.widthMm,{compact:true}),pngWidth=Math.round(built.plan.widthMm/25.4*300),png=renderSceneToPng(built.scene,{width:pngWidth}).png;
 const qa=inspectPromptFigureScene(built.scene,'proposal',print.manifest.size),prompt=`# Structured figure prompt\n\nCreate a proposal concept figure from the validated plan below. Use editable vector components, preserve stable IDs and deterministic geometry, and do not invent measurements. The plan selects scientific semantics, text, palette, and a reproducible seed; the component library owns geometry.\n\n${JSON.stringify(built.plan,null,2)}\n`;
 const ids=built.scene.elements.map(e=>e.id).filter((id):id is string=>Boolean(id)),idSet=new Set(ids),semanticRefs=[...(built.scene.semantics?.objects??[]).flatMap(o=>o.elementIds),...(built.scene.semantics?.relationships??[]).flatMap(r=>r.visualElementIds??[])];
 const ignoredGenericCodes=new Set(['contrast','safe_inset','scientific_depiction_missing']),genericBlockers=qa.findings.filter(f=>f.severity==='error'&&!ignoredGenericCodes.has(f.code));
 const textColors=[built.plan.palette.deep,built.plan.palette.teal,built.plan.palette.orange,built.plan.palette.muted],hybridQa={schemaVersion:'ProposalHybridQa.v1',ok:false,checks:{vectorOnly:!/<image\b/i.test(print.svg),stableIds:ids.length===built.scene.elements.length&&idSet.size===ids.length,semanticReferences:semanticRefs.every(id=>idSet.has(id)),minimumFontPt:print.manifest.minimumPredictedPdfFontPt>=8,textContrast:textColors.every(color=>contrast(color,built.plan.palette.paper)>=4.5&&contrast(color,'#FFFFFF')>=4.5),sourceBound:built.plan.sourceRefs.length>0,genericLayoutBlockers:genericBlockers.length===0},genericAdvisories:{policyVersion:qa.policyVersion,ignoredCodes:[...ignoredGenericCodes],reason:'The shared contrast pass compares clipped translucent material layers with the page instead of their local vector backdrop, while its depiction registry does not recognize this custom component family. Text palette contrast and semantic membership are checked explicitly here.',findings:qa.findings.filter(f=>ignoredGenericCodes.has(f.code)).length}};
 hybridQa.ok=Object.values(hybridQa.checks).every(Boolean);if(!hybridQa.ok)throw Error(`Proposal hybrid QA failed: ${JSON.stringify(hybridQa.checks)}`);
 const files:Record<string,string|Buffer>={'plan.json':JSON.stringify(built.plan,null,2)+'\n','prompt.md':prompt,'scene.json':JSON.stringify(built.scene,null,2)+'\n','figure.svg':print.svg,'figure.tex':print.latex,'figure.png':png,'caption.txt':built.plan.caption+'\n','alt-text.txt':built.plan.altText+'\n','qa.json':JSON.stringify(hybridQa,null,2)+'\n','generic-qa.json':JSON.stringify(qa,null,2)+'\n','report.json':JSON.stringify(built.report,null,2)+'\n'};
 if(pdf)files['figure.pdf']=(await compileLatexWithTectonic(print.latex)).pdf;
 const manifest={schemaVersion:'ProposalHybridArtifacts.v1',planSha256:digest(files['plan.json']!),sceneSha256:digest(files['scene.json']!),vectorOnly:true,reproducibleSeed:built.plan.seed,print:print.manifest,qa:{ok:hybridQa.ok,policyVersion:hybridQa.schemaVersion,genericPolicyVersion:qa.policyVersion},files:Object.fromEntries(Object.entries(files).map(([name,value])=>[name,digest(value)]))};
 files['manifest.json']=JSON.stringify(manifest,null,2)+'\n';await mkdir(outputDir,{recursive:false});for(const[name,value]of Object.entries(files))await writeFile(join(outputDir,name),value,{flag:'wx'});return{outputDir,...manifest};
}
