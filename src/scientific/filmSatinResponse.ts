/** Illustrative anisotropic two-lobe finish. Not a measured or energy-conserving BRDF. */
export function filmSatinResponse(normal:readonly number[],half:readonly number[]) {
  if(normal.length!==3||half.length!==3||![...normal,...half].every(Number.isFinite))
    throw Error("Satin response requires finite three-dimensional directions");
  const nn=Math.hypot(...normal),hn=Math.hypot(...half);
  if(nn===0||hn===0)throw Error("Satin response requires nonzero directions");
  const nx=normal[0]!/nn,ny=normal[1]!/nn,nz=normal[2]!/nn;
  const hx=half[0]!/hn,hy=half[1]!/hn,hz=half[2]!/hn;
  if(nz<=0||hz<=0)return 0;
  const dx=nx-hx,dy=ny-hy;
  // Wide axial reflection with a quieter, sharper center; no random texture.
  const broad=Math.exp(-.5*((dx/.19)**2+(dy/.065)**2));
  const narrow=Math.exp(-.5*((dx/.095)**2+(dy/.028)**2));
  return .72*broad+.28*narrow;
}
