import assert from "node:assert/strict";
import test from "node:test";
import { renderSceneToTikz } from "../src/render/tikzRenderer.js";
import type { VectorScene } from "../src/core/vectorScene.js";

test("TikZ matches SVG's implicit corner limit and preserves explicit limits", () => {
  const scene: VectorScene = { document: {width:200,height:200}, elements: [
    {id:"default",type:"path",x:0,y:0,closed:false,points:[{x:20,y:60},{x:180,y:80},{x:20,y:100}],style:{fill:null,stroke:"#000000",strokeWidth:6}},
    {id:"explicit",type:"path",x:0,y:0,closed:false,points:[{x:20,y:110},{x:180,y:130},{x:20,y:150}],style:{fill:null,stroke:"#000000",strokeWidth:6,miterLimit:12}},
    {id:"fill-only",type:"rect",x:10,y:10,width:20,height:20,style:{fill:"#000000",stroke:null}}
  ]};
  const latex = renderSceneToTikz(scene).latex;
  assert.equal((latex.match(/miter limit=4[,\]]/g) ?? []).length,1);
  assert.equal((latex.match(/miter limit=12[,\]]/g) ?? []).length,1);
  assert.equal((latex.match(/miter limit=/g) ?? []).length,2);
});
