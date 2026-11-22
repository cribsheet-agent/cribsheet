// WebGL hero: four shards from the Replicate 3D models, drawn as a dark glass body
// with a lit point skin, orbit rings, volumetric dust and a soft bloom.
// If anything here fails, the 2D canvas in index.html keeps running.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const H2 = window.cribHero;
const hero = document.querySelector('.hero');
const tags = [...document.querySelectorAll('.shard-tag')];

const EMERALD = new THREE.Color('#3bdc92'), SILVER = new THREE.Color('#c7ced5'), MINT = new THREE.Color('#ddf7e6'), INK = new THREE.Color('#f4f8f6');
const LIGHT = new THREE.Vector3(-0.45, 0.65, 0.62).normalize();

function dec(b64, Type) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Type(u8.buffer);
}

const pointVS = `
attribute vec3 aNormal; attribute float aKind; attribute float aRnd;
uniform float uPx; uniform float uSize; uniform float uTime; uniform float uHover; uniform vec3 uLight;
varying float vB; varying float vKind; varying float vA;
void main(){
  vec3 p = position + aNormal * 0.012;
  p += aNormal * sin(uTime * 1.3 + aRnd * 30.0) * 0.006 * (1.0 + uHover * 2.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * aNormal);
  vec3 v = normalize(-mv.xyz);
  float facing = dot(n, v);
  float lam = max(dot(n, normalize((viewMatrix * vec4(uLight, 0.0)).xyz)), 0.0);
  float fres = pow(1.0 - abs(facing), 2.0);
  vB = 0.18 + 0.75 * lam + 0.9 * fres;
  vB *= facing < 0.0 ? 0.35 : 1.0;
  vB *= 0.75 + 0.5 * uHover;
  vKind = aKind;
  vA = 0.55 + 0.45 * aRnd;
  float s = uSize * (aKind > 0.5 ? 1.35 : 1.0) * (0.7 + 0.6 * aRnd);
  gl_PointSize = s * uPx * (6.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const pointFS = `
uniform vec3 uColor; uniform vec3 uMint;
varying float vB; varying float vKind; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  vec3 c = uColor * vB;
  if (vKind > 1.5) c = uColor * (vB * 1.25 + 0.25);
  else if (vKind > 0.5) c = uMint * (0.9 + vB * 0.6);
  gl_FragColor = vec4(c, a * vA);
}`;
const bodyVS = `
varying vec3 vN; varying vec3 vV;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const bodyFS = `
uniform vec3 uTint; uniform vec3 uRim; uniform vec3 uLight; uniform float uHover;
varying vec3 vN; varying vec3 vV;
void main(){
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float lam = max(dot(n, normalize((viewMatrix * vec4(uLight, 0.0)).xyz)), 0.0);
  float fres = pow(1.0 - max(dot(n, vV), 0.0), 3.0);
  vec3 c = uTint * (0.35 + 0.65 * lam) + uRim * fres * (0.55 + 0.4 * uHover);
  gl_FragColor = vec4(c, 1.0);
}`;
const dotVS = `
attribute float aRnd; uniform float uPx; uniform float uSize;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vA = 0.35 + 0.65 * aRnd;
  gl_PointSize = uSize * uPx * (6.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const dotFS = `
uniform vec3 uColor; uniform float uAlpha; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor, a * a * vA * uAlpha);
}`;

async function main() {
  const res = await fetch('assets/shards3d.json');
  if (!res.ok) throw new Error('shards3d.json ' + res.status);
  const data = await res.json();

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'gl';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 12);

  const px = { value: 1 };
  const shards = data.shards.map((s, i) => {
    const em = i >= 2, color = em ? EMERALD : SILVER;
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);

    // body
    const bp = dec(s.bp, Int16Array), bi = dec(s.bi, Uint16Array);
    const pos = new Float32Array(bp.length);
    for (let k = 0; k < bp.length; k++) pos[k] = bp[k] / 32000;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bg.setIndex(new THREE.BufferAttribute(bi, 1));
    bg.computeVertexNormals();
    const bodyU = { uTint: { value: em ? new THREE.Color('#06170f') : new THREE.Color('#0c1114') }, uRim: { value: color.clone() }, uLight: { value: LIGHT }, uHover: { value: 0 } };
    const body = new THREE.Mesh(bg, new THREE.ShaderMaterial({ vertexShader: bodyVS, fragmentShader: bodyFS, uniforms: bodyU, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    body.scale.setScalar(0.985);
    inner.add(body);

    // point skin
    const P = dec(s.p, Int8Array), n = data.n;
    const pp = new Float32Array(n * 3), nn = new Float32Array(n * 3), kk = new Float32Array(n), rr = new Float32Array(n);
    let seed = 97 + i * 31; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < n; k++) {
      const o = k * 7;
      pp[k * 3] = P[o] / 127; pp[k * 3 + 1] = P[o + 1] / 127; pp[k * 3 + 2] = P[o + 2] / 127;
      nn[k * 3] = P[o + 3] / 127; nn[k * 3 + 1] = P[o + 4] / 127; nn[k * 3 + 2] = P[o + 5] / 127;
      kk[k] = P[o + 6]; rr[k] = R();
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pg.setAttribute('aNormal', new THREE.BufferAttribute(nn, 3));
    pg.setAttribute('aKind', new THREE.BufferAttribute(kk, 1));
    pg.setAttribute('aRnd', new THREE.BufferAttribute(rr, 1));
    const ptU = { uPx: px, uSize: { value: em ? 2.4 : 2.2 }, uTime: { value: 0 }, uHover: { value: 0 }, uLight: { value: LIGHT }, uColor: { value: em ? color.clone().multiplyScalar(1.35) : color.clone() }, uMint: { value: em ? MINT : INK } };
    const points = new THREE.Points(pg, new THREE.ShaderMaterial({ vertexShader: pointVS, fragmentShader: pointFS, uniforms: ptU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    inner.add(points);

    // orbit ring
    const RN = 260, rp = new Float32Array(RN * 3), rrnd = new Float32Array(RN);
    for (let k = 0; k < RN; k++) { const a = k / RN * Math.PI * 2, rad = 1.5 + (R() - .5) * .05; rp[k * 3] = Math.cos(a) * rad; rp[k * 3 + 1] = (R() - .5) * .04; rp[k * 3 + 2] = Math.sin(a) * rad; rrnd[k] = R(); }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rg.setAttribute('aRnd', new THREE.BufferAttribute(rrnd, 1));
    const ringU = { uPx: px, uSize: { value: 1.6 }, uColor: { value: color.clone() }, uAlpha: { value: 0.55 } };
    const ring = new THREE.Points(rg, new THREE.ShaderMaterial({ vertexShader: dotVS, fragmentShader: dotFS, uniforms: ringU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = 0.32 + i * 0.05; ring.rotation.z = (i % 2 ? -1 : 1) * 0.18;
    const ringPivot = new THREE.Group(); ringPivot.add(ring); group.add(ringPivot);

    scene.add(group);
    return { group, inner, ring, ptU, bodyU, ringU, hover: 0, phase: i * 1.7 };
  });

  // dust volume
  const DN = 1400, dp = new Float32Array(DN * 3), dr = new Float32Array(DN), dseed = [];
  { let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < DN; k++) { dseed.push([R(), R(), R(), R()]); dr[k] = R(); } }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dg.setAttribute('aRnd', new THREE.BufferAttribute(dr, 1));
  const dustU = { uPx: px, uSize: { value: 1.3 }, uColor: { value: EMERALD.clone() }, uAlpha: { value: 0.5 } };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ vertexShader: dotVS, fragmentShader: dotFS, uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let W = 0, H = 0, view = { w: 1, h: 1 }, layout = [];
  function resize() {
    const r = hero.getBoundingClientRect(); W = Math.round(r.width); H = Math.round(r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 1.75);
    px.value = dpr;
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    composer.setPixelRatio(dpr); composer.setSize(W, H);
    bloom.resolution.set(W / 2, H / 2);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    view.h = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); view.w = view.h * camera.aspect;
    // same screen slots as the 2D layout
    const narrow = W < 980;
    const cy = narrow ? Math.min(W * .33, 170) + 20 : Math.min(H * .3, 250);
    const sizePx = narrow ? Math.min(W / 4 * .36, 70) : Math.min(W / 4 * .32, H * .17, 120);
    layout = [0, 1, 2, 3].map(i => {
      const sx = W * (narrow ? (.13 + i * .248) : (.14 + i * .24)), sy = cy + (i % 2 ? sizePx * .12 : 0);
      return { x: (sx / W - .5) * view.w, y: -(sy / H - .5) * view.h, s: sizePx / H * view.h, sx, sy, spx: sizePx };
    });
    shards.forEach((s, i) => { s.group.position.set(layout[i].x, layout[i].y, 0); s.group.scale.setScalar(layout[i].s); });
  }

  let mx = 0, my = 0, tmx = 0, tmy = 0, hoverI = -1;
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect(); tmx = (e.clientX - r.left) / r.width - .5; tmy = (e.clientY - r.top) / r.height - .5;
    let best = -1, bd = 1e9;
    layout.forEach((c, i) => { const d = Math.hypot(e.clientX - r.left - c.sx, e.clientY - r.top - c.sy); if (d < c.spx * 1.6 && d < bd) { bd = d; best = i; } });
    hoverI = best; if (paused) frame(performance.now());
  });
  hero.addEventListener('pointerleave', () => { hoverI = -1; tmx = tmy = 0; });
  tags.forEach((tg, i) => { tg.addEventListener('focus', () => { hoverI = i; if (paused) frame(performance.now()); }); tg.addEventListener('blur', () => { hoverI = -1; }); });

  let paused = H2 ? H2.isPaused() : false, visible = true, raf = 0, t0 = performance.now(), tPause = paused ? 4000 : 0;
  const tv = new THREE.Vector3();
  function frame(now) {
    if (W < 2 || H < 2) { if (!paused && visible) raf = requestAnimationFrame(frame); return; }
    const t = (paused ? tPause : now - t0) / 1000;
    const ease = paused ? 1 : 0.06;
    mx += (tmx - mx) * ease; my += (tmy - my) * ease;
    camera.position.x = mx * 1.1; camera.position.y = -my * 0.6; camera.lookAt(0, 0, 0);
    shards.forEach((s, i) => {
      const target = i === hoverI ? 1 : 0; s.hover += (target - s.hover) * (paused ? 1 : 0.1);
      s.inner.rotation.y = Math.sin(t * .32 + s.phase) * .55 + t * .08 * (i % 2 ? -1 : 1) + mx * .6;
      s.inner.rotation.x = .22 + Math.sin(t * .24 + i) * .1 + my * .3;
      s.inner.rotation.z = Math.sin(t * .18 + s.phase) * .06;
      s.inner.position.y = Math.sin(t * .6 + s.phase) * .06;
      s.inner.scale.setScalar(1 + s.hover * .06);
      s.ring.rotation.y = t * .25 * (i % 2 ? 1 : -1);
      s.ptU.uTime.value = t; s.ptU.uHover.value = s.hover; s.bodyU.uHover.value = s.hover;
      s.ringU.uAlpha.value = .45 + .4 * s.hover;
      // keep the label above the shard
      tv.set(0, 1.55 + s.inner.position.y, 0).applyMatrix4(s.group.matrixWorld).project(camera);
      const lx = (tv.x * .5 + .5) * W, ly = (-tv.y * .5 + .5) * H;
      tags[i].style.left = lx + 'px'; tags[i].style.top = Math.max(8, ly - 44) + 'px';
    });
    // dust drifts left to right in a shallow volume, rising toward the shards
    for (let k = 0; k < DN; k++) {
      const d = dseed[k], u = (d[0] + t * .01 * (.5 + d[2])) % 1;
      dp[k * 3] = (u * 1.15 - .575) * view.w;
      dp[k * 3 + 1] = (-.32 + .5 * u) * view.h + Math.sin(u * 9 + d[1] * 6) * .25 + (d[1] - .5) * .9;
      dp[k * 3 + 2] = (d[3] - .5) * 6;
    }
    dg.attributes.position.needsUpdate = true;
    scene.updateMatrixWorld();
    composer.render();
    if (!paused && visible) raf = requestAnimationFrame(frame);
  }

  resize();
  document.getElementById('field').after(canvas);
  if (H2) H2.off();
  hero.dataset.shards = 'webgl';
  frame(performance.now());
  if (!paused) raf = requestAnimationFrame(frame);

  if (H2) H2.onPause = p => {
    paused = p;
    if (p) { tPause = performance.now() - t0; cancelAnimationFrame(raf); frame(performance.now()); }
    else { t0 = performance.now() - tPause; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  };
  const onSize = () => { resize(); if (paused) frame(performance.now()); };
  window.addEventListener('resize', onSize);
  if ('ResizeObserver' in window) new ResizeObserver(onSize).observe(hero);
  if ('IntersectionObserver' in window) new IntersectionObserver(en => {
    visible = en[0].isIntersecting;
    if (visible && !paused) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  }).observe(hero);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); });
}

main().catch(err => { console.warn('WebGL hero unavailable, keeping 2D:', err && err.message); });
