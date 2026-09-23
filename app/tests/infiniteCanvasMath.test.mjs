import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/infiniteCanvasMath.ts', import.meta.url));
const result = await build({entryPoints:[source],bundle:true,write:false,platform:'node',format:'esm'});
const {clampZoom,panCamera,zoomCameraAt,fitCamera,moveWorldPoint} = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const close = (actual,expected) => assert(Math.abs(actual-expected) < 1e-8,`${actual} differs from ${expected}`);

test('panning is unbounded in both directions and accumulates finite translations',()=>{
  let camera={x:0,y:0,zoom:0.5};
  camera=panCamera(camera,{x:1000000,y:-2000000});assert.deepEqual(camera,{x:1000000,y:-2000000,zoom:0.5});
  camera=panCamera(camera,{x:-3000000,y:4000000});assert.deepEqual(camera,{x:-2000000,y:2000000,zoom:0.5});
});

test('anchor world point is invariant under zoom including clamped endpoints',()=>{
  const camera={x:-700,y:245,zoom:0.8},anchor={x:137,y:411};
  for(const requested of [0.05,0.2,0.7,1,2,100]){
    const next=zoomCameraAt(camera,anchor,requested);
    close((anchor.x-next.x)/next.zoom,(anchor.x-camera.x)/camera.zoom);
    close((anchor.y-next.y)/next.zoom,(anchor.y-camera.y)/camera.zoom);
    assert.equal(next.zoom,clampZoom(requested));
  }
});

test('fit centers negative-coordinate bounds within requested viewport padding',()=>{
  const bounds={x:-500,y:-300,width:600,height:400};
  const camera=fitCamera(bounds,{width:1000,height:800},50);
  close(camera.zoom,1.5);
  close((bounds.x+bounds.width/2)*camera.zoom+camera.x,500);
  close((bounds.y+bounds.height/2)*camera.zoom+camera.y,400);
  assert(bounds.x*camera.zoom+camera.x>=50);
  assert((bounds.x+bounds.width)*camera.zoom+camera.x<=950);
  assert(bounds.y*camera.zoom+camera.y>=50);
  assert((bounds.y+bounds.height)*camera.zoom+camera.y<=750);
});

test('fit clamps scale and normalizes negative dimensions without changing center',()=>{
  assert.equal(fitCamera({x:0,y:0,width:100000,height:100000},{width:500,height:500}).zoom,0.2);
  assert.equal(fitCamera({x:0,y:0,width:1,height:1},{width:500,height:500}).zoom,2);
  const reverse=fitCamera({x:100,y:200,width:-100,height:-200},{width:500,height:400},0);
  const normal=fitCamera({x:0,y:0,width:100,height:200},{width:500,height:400},0);
  assert.deepEqual(reverse,normal);
});

test('screen drag converts to world movement using camera zoom',()=>{
  assert.deepEqual(moveWorldPoint({x:-5,y:10},{x:100,y:-50},0.5),{x:195,y:-90});
  assert.deepEqual(moveWorldPoint({x:-5,y:10},{x:100,y:-50},2),{x:45,y:-15});
});

test('invalid inputs recover to finite stable cameras and points',()=>{
  for(const value of [NaN,Infinity,-Infinity])assert.equal(clampZoom(value),1);
  for(const value of [0,-2,0.1])assert.equal(clampZoom(value),0.2);
  assert.deepEqual(panCamera({x:NaN,y:Infinity,zoom:NaN},{x:Infinity,y:-Infinity}),{x:0,y:0,zoom:1});
  assert.deepEqual(panCamera({x:Number.MAX_VALUE,y:0,zoom:1},{x:Number.MAX_VALUE,y:0}),{x:Number.MAX_VALUE,y:0,zoom:1});
  for(const camera of [fitCamera({x:NaN,y:Infinity,width:0,height:NaN},{width:0,height:Infinity},Infinity),zoomCameraAt({x:NaN,y:Infinity,zoom:0},{x:NaN,y:Infinity},NaN)]){
    assert(Object.values(camera).every(Number.isFinite));assert(camera.zoom>=0.2&&camera.zoom<=2);
  }
  assert.deepEqual(moveWorldPoint({x:NaN,y:Infinity},{x:NaN,y:Infinity},0),{x:0,y:0});
});
