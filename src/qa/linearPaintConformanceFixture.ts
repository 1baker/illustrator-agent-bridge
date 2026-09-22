import type {VectorScene} from '../core/vectorScene.js';

/** Analytic color probes away from edges; no scientific measurements. */
export function linearPaintConformanceFixture(){
  const scene:VectorScene={document:{width:600,height:400},elements:[],paints:[]};
  const samples:Array<{id:string;x:number;y:number;expected:number[]}>=[];
  const directions=[[0,0,1,1],[1,1,0,0],[.3,.25,.7,.75],[1,0,0,1],[0,.2,1,.65],[.7,.8,.2,.1]];
  directions.forEach(([x1,y1,x2,y2],i)=>{
    const id=`ramp-${i}`,x=20+200*(i%3),y=20+200*Math.floor(i/3),w=160,h=i<3?120:160;
    const stops=[{offset:0,color:'#FFFFFF'},{offset:40,color:'#A8BDD0'},{offset:100,color:'#314D69'}];
    scene.paints!.push({id,type:'linear_gradient',x1:x1!,y1:y1!,x2:x2!,y2:y2!,stops});
    scene.elements.push({id:id+'.surface',type:'rect',x,y,width:w,height:h,style:{fillPaint:id,stroke:null}});
    for(const u of [.1,.5,.9])for(const v of [.1,.5,.9]){
      const dx=x2!-x1!,dy=y2!-y1!,t=Math.max(0,Math.min(1,((u-x1!)*dx+(v-y1!)*dy)/(dx*dx+dy*dy)));
      const a=t<=.4?stops[0]!:stops[1]!,b=t<=.4?stops[1]!:stops[2]!,q=(t-a.offset/100)/((b.offset-a.offset)/100);
      const expected=[1,3,5].map(k=>Math.round(parseInt(a.color.slice(k,k+2),16)*(1-q)+parseInt(b.color.slice(k,k+2),16)*q));
      samples.push({id:`${id}-${u}-${v}`,x:x+w*u,y:y+h*v,expected});
    }
  });
  return {scene,samples,tolerance:5,scope:'diagonal_linear_gradient_projection_reversal_clamping_multistop_and_non_square_parity'};
}
