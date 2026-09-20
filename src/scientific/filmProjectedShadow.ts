import type { PathPoint,VectorElement } from "../core/vectorScene.js";

export interface FilmShadowSpec {
  id:string;x:number;y:number;width:number;depth:number;bow:number;curl:number;twist:number;thickness:number;
  lightTilt:{x:number;y:number};
  emitterSpread?:{x:number;y:number};
}

/** A qualitative projected footprint on a plane tangent to the lowest
 * illustrative underside. It is not calibrated illumination or mechanics. */
export function filmProjectedShadow(spec:FilmShadowSpec) {
  const spread=spec.emitterSpread??{x:0,y:0};
  if(![spread.x,spread.y].every(Number.isFinite)||spread.x<0||spread.y<0||spread.x>.3||spread.y>.3)throw Error("Invalid shadow emitter spread");
  if(![spec.x,spec.y,spec.width,spec.depth,spec.bow,spec.curl,spec.twist,spec.thickness,spec.lightTilt.x,spec.lightTilt.y].every(Number.isFinite)||spec.width<=0||spec.depth<=0||spec.thickness<=0) throw new Error("Invalid projected film shadow");
  if(spec.thickness>spec.depth*.1||Math.abs(spec.bow)>spec.depth*.5||Math.abs(spec.curl)>spec.depth*.6||Math.abs(spec.twist)>spec.depth*.2||Math.abs(spec.lightTilt.x)>1||Math.abs(spec.lightTilt.y)>1) throw new Error("Unsupported projected film shape");
  const height=(u:number,v:number)=>4*spec.bow*u*(1-u)*(.35+.65*v)-spec.curl*u**3*(.3+.7*v)+spec.twist*(2*u-1)*(2*v-1);
  const candidates=[height(0,0),height(1,0),height(0,1),height(1,1)];
  // Height is linear in v and cubic in u; extrema lie on v=0/1 and
  // endpoints or roots of the quadratic derivative. No coarse-grid floor fit.
  for(const v of [0,1]) {
    const aa=-3*spec.curl*(.3+.7*v),bb=-8*spec.bow*(.35+.65*v),cc=4*spec.bow*(.35+.65*v)+2*spec.twist*(2*v-1);
    const magnitude=Math.max(Math.abs(aa),Math.abs(bb),Math.abs(cc))||1;
    const a=aa/magnitude,b=bb/magnitude,c=cc/magnitude;
    const roots:number[]=[];
    if(Math.abs(a)<Number.EPSILON*8) {if(Math.abs(b)>Number.EPSILON*8) roots.push(-c/b);}
    else {
      const discriminant=b*b-4*a*c;
      if(discriminant>=0) {
        // Stable quadratic roots avoid cancellation for nearly flat surfaces.
        const q=-.5*(b+(b>=0?1:-1)*Math.sqrt(discriminant));
        if(q===0) roots.push(-b/(2*a));else roots.push(q/a,c/q);
      }
    }
    for(const u of roots) if(u>0&&u<1) candidates.push(height(u,v));
  }
  const floorOffset=Math.max(...candidates)+spec.thickness;
  if(!Number.isFinite(floorOffset)) throw new Error("Nonfinite shadow floor");
  const project=(u:number,v:number)=> {
    const elevation=floorOffset-height(u,v);
    return {x:spec.x+spec.width*.17*(1-v)+u*spec.width*.83-spec.lightTilt.x*2*elevation,
      y:spec.y+v*spec.depth-spec.depth*.12*u+floorOffset+(0.12-spec.lightTilt.y)*elevation,elevation};
  };
  const boundary=Array.from({length:64},(_,i)=> {
    const edge=Math.floor(i/16),t=(i%16)/16;
    return edge===0?project(t,1):edge===1?project(1,1-t):edge===2?project(1-t,0):project(0,t);
  });
  if(boundary.some(p=>![p.x,p.y,p.elevation].every(Number.isFinite)||p.elevation<0)) throw new Error("Invalid shadow projection");
  const origin=boundary[0]!;
  if(spread.x||spread.y){
    // Gauss-Legendre quadrature normalized to unit total emitter weight.
    const axis=(n:number)=>Array.from({length:n},(_,i)=>{
      let x=Math.cos(Math.PI*(i+.75)/(n+.5)),derivative=0;
      for(let iteration=0;iteration<30;iteration++){
        let p0=1,p1=x;for(let k=2;k<=n;k++){const p=((2*k-1)*x*p1-(k-1)*p0)/k;p0=p1;p1=p;}
        derivative=n*(x*p1-p0)/(x*x-1);const step=p1/derivative;x-=step;if(Math.abs(step)<1e-14)break;
      }
      return {node:x,weight:1/((1-x*x)*derivative*derivative)};
    });
    const samples=axis(12).flatMap(a=>axis(10).map(b=>({x:a.node*spread.x,y:b.node*spread.y,weight:a.weight*b.weight}))),sum=samples.reduce((a,b)=>a+b.weight,0);
    const group={id:`${spec.id}.projected-shadow-group`,opacity:100*.15/.99,zIndex:3};
    const elements:VectorElement[]=samples.map((sample,i)=>({id:`${spec.id}.projected-shadow-${i}`,type:"path",x:0,y:0,closed:true,zIndex:3,groupId:group.id,
      points:boundary.map(p=>({x:p.x-2*p.elevation*sample.x,y:p.y-p.elevation*sample.y})),
      style:{fill:"#344B58",stroke:null,opacity:100*(1-Math.pow(.01,sample.weight/sum))}}));
    return {elements,group,footprint:boundary,parameters:{version:"film-projected-shadow.v3",floorOffset,blur:0,penumbraHeightFactor:0,levels:samples.length,lightTilt:spec.lightTilt,emitterSpread:spread,samples:samples.map(s=>({...s,weight:s.weight/sum})),internalOverlapOpacity:.99,groupOpacity:group.opacity,fullOverlapOpacity:.15,measured:false}};
  }
  const area=boundary.reduce((sum,p,i)=>{const q=boundary[(i+1)%boundary.length]!;return sum+(p.x-origin.x)*(q.y-origin.y)-(q.x-origin.x)*(p.y-origin.y);},0),sign=Math.sign(area);
  if(!sign||!Number.isFinite(area)) throw new Error("Degenerate projected footprint");
  const extent=Math.min(spec.depth,spec.width*.83),blur=extent*.035;
  const elements:VectorElement[]=Array.from({length:32},(_,layer)=> {
    const fraction=layer/31;
    const points:PathPoint[]=boundary.map((p,i)=> {
      const a=boundary[(i+boundary.length-1)%boundary.length]!,b=boundary[(i+1)%boundary.length]!;
      const incoming=Math.hypot(p.x-a.x,p.y-a.y),outgoing=Math.hypot(b.x-p.x,b.y-p.y);
      if(!incoming||!outgoing) throw new Error("Degenerate shadow edge");
      const na={x:sign*(p.y-a.y)/incoming,y:-sign*(p.x-a.x)/incoming};
      const nb={x:sign*(b.y-p.y)/outgoing,y:-sign*(b.x-p.x)/outgoing};
      const denominator=Math.max(.25,1+na.x*nb.x+na.y*nb.y);
      const offset=Math.min(extent*.16,blur+p.elevation*.14)*(1-2*fraction);
      return {x:p.x+(na.x+nb.x)/denominator*offset,y:p.y+(na.y+nb.y)/denominator*offset};
    });
    const darkness=.15*(fraction*fraction*(3-2*fraction));
    const fill=`#${[52,75,88].map(c=>Math.round(255+(c-255)*darkness).toString(16).padStart(2,'0')).join('')}`;
    return {id:`${spec.id}.projected-shadow-${layer}`,type:"path",x:0,y:0,points,closed:true,style:{fill,stroke:null,opacity:100},zIndex:3};
  });
  return {elements,footprint:boundary,parameters:{version:"film-projected-shadow.v1",floorOffset,blur,penumbraHeightFactor:.14,levels:32,lightTilt:spec.lightTilt,measured:false}};
}
