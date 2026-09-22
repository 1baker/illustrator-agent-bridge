import assert from "node:assert/strict";
import test from "node:test";
import { renderSceneToTikz } from "../src/render/tikzRenderer.js";
import {linearPaintConformanceFixture} from '../src/qa/linearPaintConformanceFixture.js';
import {normalizeScene} from '../src/core/sceneValidation.js';

function render(x1:number,y1:number,x2:number,y2:number) {
  return renderSceneToTikz({document:{width:100,height:100},paints:[{id:"ramp",type:"linear_gradient",x1,y1,x2,y2,stops:[{offset:0,color:"#FF0000"},{offset:100,color:"#0000FF"}]}],elements:[{type:"rect",x:0,y:0,width:100,height:100,style:{fillPaint:"ramp",stroke:null}}]}).latex;
}
test("linear TikZ gradients map full color range and direction into visible bounds", () => {
  const red="{rgb,255:red,255;green,0;blue,0}", blue="{rgb,255:red,0;green,0;blue,255}";
  assert.ok(render(0,0,1,0).includes(`color(25bp)=(${red}); color(75bp)=(${blue})`));
  assert.ok(render(1,0,0,0).includes(`color(25bp)=(${blue}); color(75bp)=(${red})`));
  assert.ok(render(0,0,0,1).includes(`color(25bp)=(${blue}); color(75bp)=(${red})`));
  assert.ok(render(0,1,0,0).includes(`color(25bp)=(${red}); color(75bp)=(${blue})`));
  assert.ok(render(0.2,0,0.8,0).includes(`color(35bp)=(${red}); color(65bp)=(${blue})`));
});
test('diagonal parity fixture includes analytic clamped, reversed and non-square probes',()=>{
 const fixture=linearPaintConformanceFixture();assert.deepEqual(fixture,linearPaintConformanceFixture());
 assert.equal(fixture.samples.length,54);assert.equal(fixture.scene.paints!.length,6);
 assert.doesNotThrow(()=>normalizeScene(fixture.scene));
 assert.ok(fixture.samples.every(s=>s.expected.every(c=>c>=0&&c<=255)));
 assert.deepEqual(fixture.samples.find(s=>s.id==='ramp-2-0.1-0.1')!.expected,[255,255,255]);
 assert.deepEqual(fixture.samples.find(s=>s.id==='ramp-2-0.9-0.9')!.expected,[49,77,105]);
 assert.equal((renderSceneToTikz(fixture.scene).latex.match(/pgfdeclarefunctionalshading/g)??[]).length,6);
});
test('diagonal TikZ ramps use clamped object-box projection with reversed directions supported',()=>{
  for(const points of [[0,0,1,1],[1,1,0,0],[.25,.2,.7,.9],[1,0,0,1]]){
    const latex=render(points[0]!,points[1]!,points[2]!,points[3]!);
    assert.ok(latex.includes('\\pgfdeclarefunctionalshading{bridgepaint1}'));
    assert.ok(latex.includes('dup 0 lt { pop 0 } if dup 1 gt { pop 1 } if'));
    assert.ok(!latex.includes('includegraphics'));
  }
  assert.throws(()=>render(0,0,1e-5,1e-5),/too short/);
});
