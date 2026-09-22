import assert from "node:assert/strict";
import test from "node:test";
import { renderSceneToTikz } from "../src/render/tikzRenderer.js";

const scene = (r:number,cx=0.5) => ({document:{width:120,height:120},paints:[{id:"sphere",type:"radial_gradient",cx,cy:0.5,r,stops:[{offset:0,color:"#FFFFFF"},{offset:100,color:"#000000"}]}],elements:[{id:"sphere-body",type:"ellipse",x:10,y:10,width:100,height:100,style:{fillPaint:"sphere",stroke:null}}]});
test("TikZ radial paint maps radius into the visible PGF shading region", () => {
  const small = renderSceneToTikz(scene(0.5)).latex;
  assert.match(small,/color\(25bp\)=\(\{rgb,255:red,0;green,0;blue,0\}\)/);
  assert.match(small,/color\(50bp\)/);
  const large = renderSceneToTikz(scene(2)).latex;
  assert.match(large,/color\(50bp\)=\(\{rgb,255:red,128;green,128;blue,128\}\)/);
  assert.doesNotMatch(large,/color\(100bp\)/);
  const displaced = renderSceneToTikz(scene(0.5,0.4)).latex;
  assert.match(displaced,/pgfdeclarefunctionalshading/);
  assert.match(displaced,/45 sub dup mul add sqrt 25 div/);
});
