import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0, -0.07, -0.08);          // desktop preview only; VR uses the headset pose
camera.rotation.order = 'YXZ';
const look = { yaw: 0, pitch: -0.496, ty: 0, tp: -0.496 };
if (new URLSearchParams(location.search).has('sky')) look.tp = 0.45;
camera.rotation.set(look.pitch, look.yaw, 0);
addEventListener('wheel', e => { look.tp = Math.max(-0.95, Math.min(1.1, look.tp - e.deltaY * 0.0016)); look.ty = Math.max(-1.3, Math.min(1.3, look.ty - e.deltaX * 0.0016)); }, { passive: true });
addEventListener('keydown', e => {
  if (e.key === 'ArrowUp') look.tp = Math.min(1.1, look.tp + 0.15); if (e.key === 'ArrowDown') look.tp = Math.max(-0.95, look.tp - 0.15);
  if (e.key === 'ArrowLeft') look.ty = Math.min(1.3, look.ty + 0.15); if (e.key === 'ArrowRight') look.ty = Math.max(-1.3, look.ty - 0.15);
});
addEventListener('DOMContentLoaded', () => {});
const skyBtn = document.getElementById('skybtn');
if (skyBtn) skyBtn.addEventListener('click', () => { const up = look.tp > 0; look.tp = up ? -0.496 : 0.45; look.ty = 0; skyBtn.textContent = up ? '☁  Look at the sky' : '📖  Back to the book'; });
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x9fb0ff, 0x1a2a1a, 2.2));
const moonLight = new THREE.DirectionalLight(0xdfe6ff, 1.6); moonLight.position.set(-1, 2, -1); scene.add(moonLight);

function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// Night sky dome: indigo gradient, soft stars
{
  const t = tex(1024, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05071a'); g.addColorStop(0.45, '#16184a'); g.addColorStop(0.58, '#3a2f6b'); g.addColorStop(0.7, '#120f2e'); g.addColorStop(1, '#07060f');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const y = Math.random() * h * 0.55, r = Math.random() * 1.4 + 0.3;
      x.fillStyle = `rgba(255,248,230,${0.3 + Math.random() * 0.7})`; x.beginPath(); x.arc(Math.random() * w, y, r, 0, 7); x.fill();
    }
  });
  // Volumetric clouds: ray-march a 3D fbm noise slab, Beer-Lambert transmittance + light march toward the moon
  // (approach learned from tigerabrodi/webgpu-clouds, rewritten here as a WebGL fragment shader for the Quest browser)
  window.__skyU = { uTime: { value: 0 }, uStars: { value: t } };
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: window.__skyU,
    vertexShader: 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
    fragmentShader: `
      uniform float uTime; uniform sampler2D uStars; varying vec3 vW; varying vec2 vUv;
      float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      const float B0 = 2.4, B1 = 4.2;
      float dens(vec3 p){
        vec3 q = p * 0.32 + vec3(uTime * 0.03, 0.0, uTime * 0.015);
        float base = fbm(q);
        float h01 = clamp((p.y - B0) / (B1 - B0), 0.0, 1.0);
        float shape = smoothstep(0.0, 0.25, h01) * smoothstep(1.0, 0.55, h01);   // rounded bottoms, wispy tops
        return max(0.0, base * shape - 0.38) * 3.2;
      }
      void main(){
        vec3 sky = texture2D(uStars, vUv).rgb;
        vec3 ro = cameraPosition, rd = normalize(vW - cameraPosition);
        if (rd.y > 0.04) {
          float t0 = (B0 - ro.y) / rd.y, t1 = (B1 - ro.y) / rd.y;
          const int STEPS = 22; float dt = (t1 - t0) / float(STEPS);
          vec3 moonDir = normalize(vec3(-0.4, 0.8, -0.5));
          float T = 1.0; vec3 L = vec3(0.0);
          for (int i = 0; i < STEPS; i++) {
            vec3 p = ro + rd * (t0 + (float(i) + 0.5) * dt);
            float d = dens(p);
            if (d > 0.01) {
              float sh = dens(p + moonDir * 0.35) + dens(p + moonDir * 0.8);       // light march: self-shadowing
              float lightT = exp(-sh * 1.6);
              vec3 lit = mix(vec3(0.12, 0.12, 0.28), vec3(0.82, 0.84, 1.0), lightT);
              float a = 1.0 - exp(-d * dt * 1.4);                                   // Beer-Lambert
              L += T * a * lit; T *= 1.0 - a;
              if (T < 0.03) break;
            }
          }
          float fade = smoothstep(0.04, 0.25, rd.y);
          sky = mix(sky, sky * T + L, fade);
        }
        gl_FragColor = vec4(sky, 1.0);
        #include <colorspace_fragment>
      }`,
  })));
}

// ---------- Touchable meadow: grass that sways and parts around your fingers ----------
const GRASS_Y = -0.326;
const grassU = { uTime: { value: 0 }, uH0: { value: new THREE.Vector3(9, 9, 9) }, uH1: { value: new THREE.Vector3(9, 9, 9) }, uH2: { value: new THREE.Vector3(9, 9, 9) } };
{
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.7, 48), new THREE.MeshBasicMaterial({ color: 0x1c3a24 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, GRASS_Y - 0.001, -0.45); scene.add(ground);
  const blade = new THREE.PlaneGeometry(0.005, 0.05, 1, 4); blade.translate(0, 0.025, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: grassU, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform vec3 uH0, uH1, uH2; attribute float aTint; attribute float aBend; varying float vH; varying float vShade;
      vec2 push(vec3 h, vec3 root, float k) {
        vec2 d = root.xz - h.xz; float dist = length(d) + 1e-4;
        float near = (1.0 - smoothstep(0.0, 0.07, dist)) * (1.0 - smoothstep(0.0, 0.08, abs(h.y - root.y - 0.02)));
        return d / dist * near * k;
      }
      void main() {
        vH = uv.y;
        vec3 p = position; p.x *= (1.0 - uv.y * 0.9);
        p.z += aBend * uv.y * uv.y * 0.018; p.y -= aBend * uv.y * uv.y * 0.006;   // curved blade
        vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 w = instanceMatrix * vec4(p, 1.0);
        float k = uv.y * uv.y;
        w.x += sin(uTime * 1.3 + root.x * 9.0 + root.z * 7.0) * 0.006 * k;
        w.z += cos(uTime * 1.1 + root.x * 6.0) * 0.004 * k;
        vec2 b = push(uH0, root.xyz, 0.035) + push(uH1, root.xyz, 0.035) + push(uH2, root.xyz, 0.035);
        w.xz += b * k; w.y -= length(b) * k * 0.6;
        vShade = aTint;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      varying float vH; varying float vShade;
      void main() {
        vec3 base = vec3(0.04, 0.12, 0.06), tip = mix(vec3(0.3, 0.56, 0.28), vec3(0.62, 0.72, 0.34), vShade);
        float ao = smoothstep(0.0, 0.45, vH);
        gl_FragColor = vec4(mix(base, tip, vH) * (0.45 + 0.55 * ao), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  // Placement inspired by the Ghost of Tsushima approach (jittered grid + Voronoi clumps), written from scratch here
  const hash = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
  const CLUMP = 0.07, clumpAt = (x, z) => {
    const cx = Math.floor(x / CLUMP), cz = Math.floor(z / CLUMP); let best = null, bd = 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gz = cz + dz, px = (gx + hash(gx, gz)) * CLUMP, pz = (gz + hash(gz, gx + 7)) * CLUMP;
      const d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; best = { px, pz, id: hash(gx * 3, gz * 5) }; }
    }
    return best;
  };
  const CELL = 0.0105, blades = [];
  for (let gx = -62; gx <= 62; gx++) for (let gz = -62; gz <= 62; gz++) {
    const x = (gx + hash(gx, gz)) * CELL, z = -0.45 + (gz + hash(gz + 3, gx)) * CELL;
    const rx = x / 0.65, rz = (z + 0.45) / 0.52; if (rx * rx + rz * rz > 1) continue;
    if (Math.abs(x) < 0.225 && Math.abs(z + 0.45) < 0.145) continue;   // keep the book clear
    if (Math.abs(x) < 0.3 && z > -0.33) continue;                          // keep your lap clear so the page stays visible
    blades.push([x, z]);
  }
  const N = blades.length, grass = new THREE.InstancedMesh(blade, mat, N);
  const tint = new Float32Array(N), bend = new Float32Array(N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  blades.forEach(([x, z], n) => {
    const c = clumpAt(x, z);
    const face = Math.atan2(x - c.px, z - c.pz) + (hash(x * 91, z * 37) - 0.5) * 1.2;   // clump blades lean outward together
    pos.set(x, GRASS_Y, z); q.setFromAxisAngle(up, face);
    s.set(0.8 + hash(z, x) * 0.5, (0.55 + c.id * 0.7) * (0.8 + hash(x * 13, z) * 0.4), 1);
    grass.setMatrixAt(n, m4.compose(pos, q, s));
    tint[n] = c.id; bend[n] = 0.3 + hash(x * 7, z * 11) * 0.7;
  });
  blade.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  blade.setAttribute('aBend', new THREE.InstancedBufferAttribute(bend, 1));
  grass.frustumCulled = false; scene.add(grass);
}

// ---------- The wider world: 3D trees, a moonlit pond, clouds, fireflies ----------
const world = { fireflies: null, ffBase: [], clouds: [], pondMat: null };
{
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: 0x173220, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, GRASS_Y - 0.003, -0.45); scene.add(ground);

  // Procedural branching trees (recursive, like an L-system)
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3226, roughness: 1 });
  const leafMats = [0x2f6b45, 0x3a7a4c, 0x285c3d].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  const cyl = new THREE.CylinderGeometry(0.7, 1, 1, 6); cyl.translate(0, 0.5, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  const upV = new THREE.Vector3(0, 1, 0);
  function branch(parent, start, dir, len, rad, depth, rnd) {
    const m = new THREE.Mesh(cyl, barkMat);
    m.position.copy(start); m.scale.set(rad, len, rad);
    m.quaternion.setFromUnitVectors(upV, dir); parent.add(m);
    const end = start.clone().addScaledVector(dir, len);
    if (depth === 0) {
      const l = new THREE.Mesh(leafGeo, leafMats[Math.floor(rnd() * 3)]);
      l.position.copy(end); l.scale.setScalar(len * (1.4 + rnd())); l.rotation.set(rnd() * 3, rnd() * 3, 0); parent.add(l); return;
    }
    const kids = depth > 3 ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const a = (k / kids) * Math.PI * 2 + rnd() * 1.2, tilt = 0.35 + rnd() * 0.45;
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), tilt).lerp(upV, 0.15).normalize();
      branch(parent, end, d, len * (0.68 + rnd() * 0.12), rad * 0.65, depth - 1, rnd);
    }
  }
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const Q = new URLSearchParams(location.search);
  if (!Q.has('notrees')) [[-1.1, -1.6, 1.0], [1.2, -1.8, 1.2], [-1.9, -0.6, 0.9], [1.9, -0.4, 0.85], [0.2, -2.6, 1.3], [-0.9, -2.8, 1.1]].forEach(([x, z, s]) => {
    const t = new THREE.Group(); branch(t, new THREE.Vector3(), upV.clone(), 0.32 * s, 0.035 * s, 5, rnd);
    t.position.set(x, GRASS_Y, z); t.rotation.y = rnd() * 6; scene.add(t);
  });

  // Moonlit pond with animated ripples
  world.pondMat = new THREE.ShaderMaterial({
    uniforms: { uTime: grassU.uTime }, transparent: true,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; float d = length(p);
        float ring = sin(d * 70.0 - uTime * 1.6) * 0.5 + 0.5;
        float ring2 = sin(length(p - vec2(0.15, -0.1)) * 90.0 - uTime * 2.1) * 0.5 + 0.5;
        vec3 deep = vec3(0.03, 0.07, 0.18), lit = vec3(0.16, 0.28, 0.5);
        vec3 c = mix(deep, lit, ring * ring2 * 0.5 + 0.15);
        float glint = smoothstep(0.09, 0.0, length(p - vec2(-0.08, 0.12))) * (0.7 + 0.3 * sin(uTime * 3.0 + d * 40.0));
        c += vec3(1.0, 0.95, 0.75) * glint;
        float edge = smoothstep(0.5, 0.46, d);
        gl_FragColor = vec4(c, edge);
        #include <colorspace_fragment>
      }`,
  });
  const pond = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), world.pondMat);
  pond.rotation.x = -Math.PI / 2; pond.position.set(-0.95, GRASS_Y + 0.001, -0.75); scene.add(pond);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a6f78, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03 + rnd() * 0.03, 0), stoneMat);
    st.position.set(-0.95 + Math.cos(a) * 0.43, GRASS_Y + 0.01, -0.75 + Math.sin(a) * 0.43); st.rotation.set(rnd() * 3, rnd() * 3, 0); scene.add(st);
  }

  // Fireflies
  const N = 70, ffPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, r = 0.35 + rnd() * 1.4;
    world.ffBase.push([Math.cos(a) * r, GRASS_Y + 0.05 + rnd() * 0.5, -0.45 + Math.sin(a) * r, rnd() * 10]);
  }
  const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffTex = tex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,240,150,1)'); g.addColorStop(0.3, 'rgba(220,255,120,.6)'); g.addColorStop(1, 'rgba(200,255,100,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  world.fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ size: 0.035, map: ffTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(world.fireflies);
}
function updateWorld(t, dt) {
  const p = world.fireflies.geometry.attributes.position;
  world.ffBase.forEach(([x, y, z, ph], i) => p.setXYZ(i, x + Math.sin(t * 0.4 + ph) * 0.08, y + Math.sin(t * 0.9 + ph * 2) * 0.05, z + Math.cos(t * 0.35 + ph) * 0.08));
  p.needsUpdate = true;
  world.fireflies.material.opacity = 0.75 + 0.25 * Math.sin(t * 2);
}

// ---------- The book ----------
const BOOK = new THREE.Group(); BOOK.position.set(0, -0.32, -0.45); scene.add(BOOK);
const PW = 0.2, PD = 0.26;
// warm bedside-lamp glow under the book
const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false, map: tex(256, 256, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,190,120,.55)'); g.addColorStop(1, 'rgba(255,190,120,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  }),
}));
glow.rotation.x = -Math.PI / 2; glow.position.y = -0.012; BOOK.add(glow);
// Leather cloth cover with grain and a gold-tooled border
const leather = tex(1024, 640, (x, w, h) => {
  x.fillStyle = '#5b2140'; x.fillRect(0, 0, w, h);
  const id = x.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 26; d[i] += n; d[i + 1] += n * 0.6; d[i + 2] += n * 0.8; }
  x.putImageData(id, 0, 0);
  for (let i = 0; i < 2500; i++) { x.strokeStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.lineWidth = 1; const a = Math.random() * w, b = Math.random() * h; x.beginPath(); x.moveTo(a, b); x.lineTo(a + (Math.random() - 0.5) * 18, b + (Math.random() - 0.5) * 18); x.stroke(); }
  const v = x.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)'); x.fillStyle = v; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(214,176,100,.85)'; x.lineWidth = 5; x.strokeRect(22, 22, w - 44, h - 44); x.lineWidth = 2; x.strokeRect(36, 36, w - 72, h - 72);
});
const coverMat = new THREE.MeshBasicMaterial({ map: leather });
const cover = new THREE.Mesh(new THREE.BoxGeometry(PW * 2 + 0.036, 0.005, PD + 0.03), coverMat); cover.position.y = -0.0035; BOOK.add(cover);
// Page block: stacked page edges on the sides
const edges = tex(512, 64, (x, w, h) => {
  x.fillStyle = '#efe4c8'; x.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { x.fillStyle = `rgba(120,95,60,${0.08 + Math.random() * 0.14})`; x.fillRect(0, y, w, 1); }
});
const edgeMat = new THREE.MeshBasicMaterial({ map: edges }), plainMat = new THREE.MeshBasicMaterial({ color: 0xefe4c8 });
const block = new THREE.Mesh(new THREE.BoxGeometry(PW * 2, 0.01, PD), [edgeMat, edgeMat, plainMat, plainMat, edgeMat, edgeMat]); block.position.y = -0.0035; block.scale.y = 0.95; BOOK.add(block);
// Paper grain, generated once and laid over every page
const GRAIN = document.createElement('canvas'); GRAIN.width = 800; GRAIN.height = 1040;
{
  const g = GRAIN.getContext('2d'), id = g.createImageData(800, 1040), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = 128 + (Math.random() - 0.5) * 38; d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(90,70,40,${Math.random() * 0.25})`; g.lineWidth = 0.6; const a = Math.random() * 800, b = Math.random() * 1040, r = Math.random() * 6.28; g.beginPath(); g.moveTo(a, b); g.lineTo(a + Math.cos(r) * 14, b + Math.sin(r) * 14); g.stroke(); }
}

function pageMesh(x, spineLeft) {
  const c = document.createElement('canvas'); c.width = 800; c.height = 1040;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(PW, PD, 32, 1), pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const u = spineLeft ? (pa.getX(i) + PW / 2) / PW : (PW / 2 - pa.getX(i)) / PW; pa.setZ(i, 0.005 * (1 - Math.exp(-u * 9)) - 0.001 * u); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.0012, 0); BOOK.add(m);
  return { c, ctx: c.getContext('2d'), t, spineLeft, m, lines: [] };
}
const left = pageMesh(-PW / 2, false), right = pageMesh(PW / 2, true);
function paper(p) {
  const x = p.ctx; x.fillStyle = '#f5ead2'; x.fillRect(0, 0, 800, 1040);
  x.save(); x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.55; x.drawImage(GRAIN, 0, 0); x.restore();
  const g = x.createLinearGradient(p.spineLeft ? 0 : 800, 0, p.spineLeft ? 160 : 640, 0);
  g.addColorStop(0, 'rgba(90,60,30,.38)'); g.addColorStop(1, 'rgba(90,60,30,0)'); x.fillStyle = g; x.fillRect(0, 0, 800, 1040);
  const v = x.createRadialGradient(400, 520, 300, 400, 520, 720); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(110,80,40,.18)'); x.fillStyle = v; x.fillRect(0, 0, 800, 1040);
}
function wrap(ctx, text, x, y, w, lh, out) {
  const put = (line) => { ctx.fillText(line, x, y); if (out) out.push({ x, y, w: ctx.measureText(line).width, lh }); };
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > w) { put(line); y += lh; line = word; } else line = t;
    }
    put(line); y += lh * 1.35;
  }
}
const marks = {};   // page -> { lineIndex: [x0, x1] }  highlighter strokes persist per page
let cur = null;
function drawLeft() {
  if (!cur) return;
  paper(left); const L = left.ctx;
  L.fillStyle = '#a0526e'; L.font = '600 34px Georgia, serif'; L.fillText(cur.heading.toUpperCase(), 70, 110);
  L.fillStyle = '#d9b46a'; L.fillRect(70, 130, 90, 4);
  // measure lines first (invisible pass) so highlights sit under the ink
  L.font = '46px Georgia, serif'; const lines = []; L.save(); L.fillStyle = 'rgba(0,0,0,0)'; wrap(L, cur.text, 70, 220, 660, 66, lines); L.restore();
  left.lines = lines;
  const pm = marks[page] || {};
  L.save(); L.globalCompositeOperation = 'multiply';
  for (const k in pm) { const ln = lines[k]; if (!ln) continue; const [a, b] = pm[k];
    L.fillStyle = 'rgba(255,214,70,.75)'; L.beginPath(); L.roundRect(a, ln.y - ln.lh * 0.72, b - a, ln.lh * 0.86, 10); L.fill(); }
  L.restore();
  L.fillStyle = '#33223a'; L.font = '46px Georgia, serif'; wrap(L, cur.text, 70, 220, 660, 66);
  L.fillStyle = '#a08a7a'; L.font = 'italic 30px Georgia, serif'; L.textAlign = 'center'; L.fillText(`~ ${cur.n} ~`, 400, 985); L.textAlign = 'left';
  left.t.needsUpdate = true;
}
function highlightAt(cx, cy) {
  const ln = left.lines.findIndex(l => cy > l.y - l.lh * 0.8 && cy < l.y + l.lh * 0.25 && cx > l.x - 12 && cx < l.x + l.w + 12);
  if (ln < 0) return false;
  const pm = (marks[page] ??= {}), l = left.lines[ln];
  const a = Math.max(l.x - 6, cx - 16), b = Math.min(l.x + l.w + 6, cx + 16);
  const r = pm[ln]; if (r && a >= r[0] && b <= r[1]) return true;
  pm[ln] = r ? [Math.min(r[0], a), Math.max(r[1], b)] : [a, b];
  drawLeft(); markerSound(); return true;
}
let lastMark = 0;
function markerSound() {
  const now = performance.now(); if (now - lastMark < 90 || !actx) return; lastMark = now;
  const len = actx.sampleRate * 0.08, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
  const src = actx.createBufferSource(); src.buffer = buf; const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
  const g = actx.createGain(); g.gain.value = 0.05; src.connect(f).connect(g).connect(actx.destination); src.start();
}
// A pencil-style highlighter pen that follows your fingertip (VR) or the mouse (desktop)
const pen = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.5 })); body.position.y = 0.055; pen.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0x3a3a3a })); cap.position.y = 0.104; pen.add(cap);
  const tipM = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.01, 12), new THREE.MeshStandardMaterial({ color: 0xffe27a })); tipM.rotation.x = Math.PI; tipM.position.y = 0.005; pen.add(tipM);
  pen.rotation.set(0.5, 0, -0.35); pen.visible = false; scene.add(pen);
}
function pageCanvasPoint(worldP) {
  const l = left.m.worldToLocal(worldP.clone());
  if (Math.abs(l.x) > PW / 2 || Math.abs(l.y) > PD / 2 || l.z < -0.006 || l.z > 0.022) return null;
  return [(l.x / PW + 0.5) * 800, (1 - (l.y / PD + 0.5)) * 1040];
}
function drawPages(n, total, heading, text, hint) {
  cur = { n, total, heading, text }; drawLeft();
  paper(right); const R = right.ctx;
  R.fillStyle = 'rgba(160,82,110,.12)'; R.beginPath(); R.roundRect(50, 880, 700, 110, 24); R.fill();
  R.fillStyle = '#7a3e58'; R.font = 'italic 36px Georgia, serif'; wrap(R, '✋ ' + hint, 80, 945, 640, 44);
  right.t.needsUpdate = true;
}

// Page corner: a folded, glowing dog-ear you pinch to turn
const corner = new THREE.Mesh(new THREE.CircleGeometry(0.014, 3), new THREE.MeshBasicMaterial({ color: 0xffc977, side: THREE.DoubleSide }));
corner.rotation.x = -Math.PI / 2; corner.rotation.z = Math.PI / 4;
corner.position.set(PW - 0.012, 0.0075, PD / 2 - 0.012); BOOK.add(corner);

// ---------- Paper cut-outs that fold up off the page ----------
const stage = new THREE.Group(); stage.position.set(PW / 2, 0.005, 0); BOOK.add(stage);
let pops = [], tappables = [];
const EDGE = '#fffaf0';
function cutout(w, h, draw, { flat = false } = {}) {
  const px = 512, ph = Math.round(px * h / w);
  const c = document.createElement('canvas'); c.width = px; c.height = ph;
  const ctx = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const redraw = (...a) => { ctx.clearRect(0, 0, px, ph); draw(ctx, px, ph, ...a); t.needsUpdate = true; };
  redraw();
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
  m.userData.redraw = redraw; m.userData.flat = flat;
  return m;
}
// paper-cut fill: thick cream edge, then colour, then a soft inner shade
function cut(ctx, path, fill, shade = 'rgba(0,0,0,.12)') {
  ctx.save(); ctx.lineJoin = 'round';
  ctx.beginPath(); path(); ctx.lineWidth = 16; ctx.strokeStyle = EDGE; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
  ctx.clip(); ctx.lineWidth = 18; ctx.strokeStyle = shade; ctx.stroke();
  ctx.restore();
}
function place(m, x, z, delay = 0) {
  m.position.set(x, 0, z);
  m.userData.popT = -delay; m.userData.baseY = 0;
  m.rotation.x = -Math.PI / 2;
  pops.push(m); stage.add(m); return m;
}
function tappable(m, fn) { m.userData.onPinch = fn; tappables.push(m); return m; }
function hop(m) { m.userData.hop = 1; }

// ---------- Illustrations ----------
const D = {
  hills(c1, c2) {
    return (x, w, h) => {
      cut(x, () => { x.moveTo(8, h - 8); x.bezierCurveTo(w * .2, h * .15, w * .45, h * .2, w * .6, h * .5); x.bezierCurveTo(w * .75, h * .3, w * .9, h * .35, w - 8, h * .6); x.lineTo(w - 8, h - 8); x.closePath(); }, c1);
      cut(x, () => { x.moveTo(8, h - 8); x.bezierCurveTo(w * .25, h * .55, w * .5, h * .5, w * .7, h * .75); x.quadraticCurveTo(w * .85, h * .6, w - 8, h * .8); x.lineTo(w - 8, h - 8); x.closePath(); }, c2);
    };
  },
  house(x, w, h) {
    cut(x, () => { x.rect(w * .62, h * .12, w * .1, h * .25); }, '#7a4b3a');
    cut(x, () => { x.moveTo(w * .1, h * .5); x.lineTo(w * .5, h * .12); x.lineTo(w * .9, h * .5); x.closePath(); }, '#c4574a');
    cut(x, () => { x.rect(w * .18, h * .48, w * .64, h * .48); }, '#efd9b4');
    x.fillStyle = '#ffcf5a'; x.shadowColor = '#ffcf5a'; x.shadowBlur = 30; x.fillRect(w * .28, h * .58, w * .18, h * .16); x.shadowBlur = 0;
    x.fillStyle = '#8a5a44'; x.fillRect(w * .56, h * .64, w * .16, h * .32);
  },
  fox(curled) {
    return (x, w, h) => {
      if (curled) {
        cut(x, () => { x.ellipse(w * .5, h * .68, w * .4, h * .26, 0, 0, 7); }, '#e2763a');
        cut(x, () => { x.ellipse(w * .78, h * .72, w * .16, h * .14, 0, 0, 7); }, '#fff3e2');
        x.strokeStyle = '#3b2230'; x.lineWidth = 6; x.beginPath(); x.arc(w * .34, h * .62, 12, 0.2, Math.PI - 0.2); x.stroke();
        x.font = `${h * .22}px Georgia`; x.fillStyle = '#fff3c4'; x.fillText('z', w * .12, h * .3); x.fillText('z', w * .22, h * .16);
        return;
      }
      cut(x, () => { x.moveTo(w * .08, h * .7); x.quadraticCurveTo(w * .02, h * .25, w * .3, h * .55); x.lineTo(w * .35, h * .75); x.closePath(); }, '#e2763a');
      cut(x, () => { x.ellipse(w * .45, h * .72, w * .24, h * .22, 0, 0, 7); }, '#e2763a');
      cut(x, () => { x.moveTo(w * .55, h * .4); x.lineTo(w * .62, h * .08); x.lineTo(w * .72, h * .32); x.lineTo(w * .82, h * .08); x.lineTo(w * .9, h * .42); x.quadraticCurveTo(w * .96, h * .62, w * .72, h * .66); x.quadraticCurveTo(w * .5, h * .62, w * .55, h * .4); x.closePath(); }, '#ef8a4a');
      cut(x, () => { x.ellipse(w * .74, h * .58, w * .1, h * .07, 0, 0, 7); }, '#fff3e2', 'rgba(0,0,0,0)');
      cut(x, () => { x.arc(w * .08, h * .32, w * .06, 0, 7); }, '#fff3e2', 'rgba(0,0,0,0)');
      x.fillStyle = '#2b1a24'; x.beginPath(); x.arc(w * .68, h * .44, 7, 0, 7); x.arc(w * .82, h * .44, 7, 0, 7); x.fill();
      x.beginPath(); x.arc(w * .76, h * .56, 6, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,120,140,.5)'; x.beginPath(); x.arc(w * .64, h * .54, 9, 0, 7); x.arc(w * .87, h * .54, 9, 0, 7); x.fill();
    };
  },
  tree(c) {
    return (x, w, h) => {
      cut(x, () => x.rect(w * .44, h * .7, w * .12, h * .28), '#6a4434');
      [[.75, .45], [.55, .38], [.35, .3]].forEach(([y, r]) => cut(x, () => { x.moveTo(w * (.5 - r), h * y); x.lineTo(w * .5, h * (y - .4)); x.lineTo(w * (.5 + r), h * y); x.closePath(); }, c));
    };
  },
  owl(x, w, h) {
    cut(x, () => { x.moveTo(w * .2, h * .3); x.lineTo(w * .25, h * .05); x.lineTo(w * .4, h * .2); x.lineTo(w * .6, h * .2); x.lineTo(w * .75, h * .05); x.lineTo(w * .8, h * .3); x.quadraticCurveTo(w * .95, h * .9, w * .5, h * .95); x.quadraticCurveTo(w * .05, h * .9, w * .2, h * .3); x.closePath(); }, '#9a6e4c');
    cut(x, () => x.ellipse(w * .5, h * .7, w * .2, h * .2, 0, 0, 7), '#e9cfa6', 'rgba(0,0,0,0)');
    for (const s of [.36, .64]) { cut(x, () => x.arc(w * s, h * .38, w * .13, 0, 7), '#ffe08a', 'rgba(0,0,0,0)'); x.fillStyle = '#2b1a24'; x.beginPath(); x.arc(w * s, h * .4, w * .05, 0, 7); x.fill(); }
    cut(x, () => { x.moveTo(w * .46, h * .5); x.lineTo(w * .54, h * .5); x.lineTo(w * .5, h * .6); x.closePath(); }, '#e0a040', 'rgba(0,0,0,0)');
  },
  star(awake) {
    return (x, w, h) => {
      if (awake) { x.shadowColor = '#ffe27a'; x.shadowBlur = 40; }
      cut(x, () => { for (let i = 0; i < 10; i++) { const r = i % 2 ? w * .2 : w * .44, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(w / 2 + Math.cos(a) * r, h * .52 + Math.sin(a) * r); } x.closePath(); }, awake ? '#ffe27a' : '#6d7596');
      x.shadowBlur = 0;
      x.fillStyle = '#2b1a24';
      if (awake) { x.beginPath(); x.arc(w * .42, h * .5, 6, 0, 7); x.arc(w * .58, h * .5, 6, 0, 7); x.fill(); x.lineWidth = 5; x.strokeStyle = '#2b1a24'; x.beginPath(); x.arc(w / 2, h * .56, 12, 0.3, Math.PI - 0.3); x.stroke(); }
      else { x.lineWidth = 5; x.strokeStyle = '#2b1a24'; x.beginPath(); x.arc(w * .42, h * .5, 8, 0.2, Math.PI - 0.2); x.stroke(); x.beginPath(); x.arc(w * .58, h * .5, 8, 0.2, Math.PI - 0.2); x.stroke(); }
    };
  },
  river(x, w, h) {
    cut(x, () => { x.moveTo(0, h * .3); x.bezierCurveTo(w * .3, h * .1, w * .6, h * .5, w, h * .25); x.lineTo(w, h * .75); x.bezierCurveTo(w * .6, h * .95, w * .3, h * .55, 0, h * .7); x.closePath(); }, '#3c64b4');
    x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 5;
    for (let i = 0; i < 6; i++) { x.beginPath(); const sx = 40 + i * 80, sy = h * (.4 + (i % 2) * .15); x.moveTo(sx, sy); x.quadraticCurveTo(sx + 20, sy - 10, sx + 40, sy); x.stroke(); }
  },
  cloud(x, w, h) {
    cut(x, () => { x.arc(w * .3, h * .6, h * .28, 0, 7); x.moveTo(w * .55, h * .4); x.arc(w * .5, h * .42, h * .34, 0, 7); x.moveTo(w * .95, h * .6); x.arc(w * .72, h * .6, h * .27, 0, 7); x.rect(w * .3, h * .6, w * .42, h * .27); }, '#eef0fb', 'rgba(80,90,140,.18)');
    x.strokeStyle = '#4a4a6a'; x.lineWidth = 6; x.beginPath(); x.arc(w * .42, h * .55, 12, 0.2, Math.PI - 0.2); x.stroke(); x.beginPath(); x.arc(w * .6, h * .55, 12, 0.2, Math.PI - 0.2); x.stroke();
  },
  moon(smile) {
    return (x, w, h) => {
      x.shadowColor = '#fff1b0'; x.shadowBlur = 60;
      cut(x, () => x.arc(w / 2, h / 2, w * .36, 0, 7), '#fff2c2', 'rgba(200,170,90,.25)'); x.shadowBlur = 0;
      x.fillStyle = 'rgba(210,180,110,.35)'; [[.38, .36, 18], [.62, .62, 26], [.4, .66, 12]].forEach(([a, b, r]) => { x.beginPath(); x.arc(w * a, h * b, r, 0, 7); x.fill(); });
      if (smile) { x.strokeStyle = '#6a4a3a'; x.lineWidth = 7; x.beginPath(); x.arc(w * .42, h * .46, 14, Math.PI + .3, -0.3); x.stroke(); x.beginPath(); x.arc(w * .6, h * .46, 14, Math.PI + .3, -0.3); x.stroke(); x.beginPath(); x.arc(w * .51, h * .56, 24, 0.3, Math.PI - 0.3); x.stroke(); }
    };
  },
};

// ---------- Audio ----------
let actx;
function note(f, d = 0.5, type = 'sine', v = 0.12) {
  actx ??= new AudioContext();
  const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(v, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
  o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
}
const LULL = [392, 440, 523.25, 587.33, 659.25, 783.99];
function sayHi(m) { hop(m); note(523.25); setTimeout(() => note(659.25, 0.4), 120); }

// ---------- The story (original) ----------
let page = 0, dim = 0;
const PAGES = [
  {
    heading: 'Hush Hill',
    text: 'Pip the fox lived at the very top of Hush Hill.\nEvery night, the moon came by to say goodnight.\nBut tonight, the sky was empty.',
    hint: 'Pinch Pip to say hello. Pinch the gold corner to turn the page.',
    build() {
      place(cutout(0.19, 0.08, D.hills('#36507e', '#4a6a98')), 0, -0.08, 0);
      place(cutout(0.06, 0.06, D.house), 0.05, -0.03, 0.15);
      place(cutout(0.04, 0.12, D.tree('#2f6b55')), -0.065, -0.05, 0.25);
      tappable(place(cutout(0.06, 0.045, D.fox(false)), -0.015, 0.04, 0.4), function () { sayHi(this); });
    },
  },
  {
    heading: 'Whisper Wood',
    text: 'Pip padded into Whisper Wood and found Old Owl.\n“The moon is shy tonight,” Owl yawned. “Ask the river. Rivers see everything.”',
    hint: 'Pinch Old Owl.',
    build() {
      [[-0.07, -0.09, 0.13, '#24584a'], [0.065, -0.085, 0.14, '#2f6b55'], [-0.02, -0.07, 0.11, '#3a7a60'], [0.075, 0.0, 0.09, '#24584a'], [-0.08, 0.0, 0.1, '#2f6b55']]
        .forEach(([x, z, h, c], i) => place(cutout(h * 0.42, h, D.tree(c)), x, z, i * 0.07));
      tappable(place(cutout(0.045, 0.05, D.owl), 0.012, -0.04, 0.45), function () { hop(this); note(330, 0.35, 'triangle'); setTimeout(() => note(262, 0.5, 'triangle'), 300); });
      tappable(place(cutout(0.06, 0.045, D.fox(false)), -0.03, 0.05, 0.55), function () { sayHi(this); });
    },
  },
  {
    heading: 'The Sleepy River',
    text: 'The river shimmered.\n“I only hold the stars,” it whispered, “and they have all fallen asleep.”\nCan you wake them?',
    hint: 'Pinch each sleepy star to wake it.',
    build() {
      const river = cutout(0.2, 0.09, D.river, { flat: true }); place(river, 0, -0.045, 0);
      place(cutout(0.19, 0.06, D.hills('#2e4570', '#3e5c8a')), 0, -0.1, 0.05);
      let woke = 0;
      [-0.07, -0.035, 0, 0.035, 0.07].forEach((x, i) => {
        const s = cutout(0.026, 0.026, D.star(false));
        place(s, x, -0.01 + (i % 2) * 0.03, 0.2 + i * 0.08);
        tappable(s, function () {
          if (s.userData.awake) return; s.userData.awake = true;
          const t = cutout(0.026, 0.026, D.star(true)); s.material.map = t.material.map; s.material.needsUpdate = true;
          hop(s); note(LULL[woke]); woke++;
          if (woke === 5) [0, 2, 4].forEach((n, k) => setTimeout(() => note(LULL[n], 0.8), k * 140));
        });
      });
      tappable(place(cutout(0.06, 0.045, D.fox(false)), -0.06, 0.07, 0.6), function () { sayHi(this); });
    },
  },
  {
    heading: 'Up, Up, Up',
    text: 'The stars pointed up, up, up.\nThere was the moon, wrapped in a big sleepy cloud that did not want to let go.',
    hint: 'Pinch the cloud three times to tickle it awake.',
    build() {
      place(cutout(0.19, 0.06, D.hills('#36507e', '#4a6a98')), 0, -0.02, 0);
      const moon = place(cutout(0.07, 0.07, D.moon(false)), 0, -0.1, 0.1); moon.userData.lift = 0.06;
      const cloud = place(cutout(0.11, 0.065, D.cloud), 0, -0.085, 0.3); cloud.userData.lift = 0.065;
      let tickles = 0;
      tappable(cloud, function () {
        tickles++; hop(cloud); note(700 + tickles * 80, 0.2, 'triangle', 0.08);
        if (tickles >= 3 && !cloud.userData.drift) { cloud.userData.drift = 1; [2, 3, 5].forEach((n, k) => setTimeout(() => note(LULL[n], 0.9), k * 160)); }
      });
      tappable(place(cutout(0.06, 0.045, D.fox(false)), 0.02, 0.05, 0.45), function () { sayHi(this); });
    },
  },
  {
    heading: 'Breathe with Pip',
    text: 'Before sleep, Pip and the moon always shared three slow breaths.\nPinch and hold while you breathe in…\nthen let go, and breathe out slowly.\nEvery breath sends a little star up into the sky.',
    hint: 'Pinch and hold to breathe in. Let go to breathe out.',
    build() {
      place(cutout(0.19, 0.06, D.hills('#2e4570', '#3e5c8a')), 0, -0.09, 0);
      tappable(place(cutout(0.06, 0.045, D.fox(false)), -0.05, 0.05, 0.3), function () { sayHi(this); });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 32, 20), new THREE.MeshBasicMaterial({ color: 0xfff2c2, transparent: true, opacity: 0.85 }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.045, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffd59a, transparent: true, opacity: 0.18, depthWrite: false }));
      orb.add(halo); orb.position.set(0.01, 0.1, -0.03); stage.add(orb);
      breath = { orb, level: 0.35, peak: 0, count: 0 };
    },
  },
  {
    heading: 'Goodnight',
    text: 'The moon smiled down on Hush Hill.\n“Goodnight, Pip,” said the moon.\nPip curled into a warm, round ball.\nGoodnight, Pip.\nGoodnight, you.',
    hint: 'Pinch the moon to say goodnight. Pinch the corner to read again.',
    build() {
      place(cutout(0.19, 0.08, D.hills('#2b3f66', '#3a5580')), 0, -0.07, 0);
      place(cutout(0.06, 0.06, D.house), 0.055, -0.03, 0.12);
      const moon = cutout(0.08, 0.08, D.moon(true)); place(moon, -0.03, -0.1, 0.2); moon.userData.lift = 0.07;
      tappable(moon, function () { hop(moon); [0, 2, 4, 5].forEach((n, k) => setTimeout(() => note(LULL[n] / 2, 1.2), k * 220)); dim = 1; });
      place(cutout(0.06, 0.04, D.fox(true)), -0.01, 0.05, 0.35);
    },
  },
];

// ---------- Breathing (pinch-hold = inhale, release = exhale) ----------
let breath = null, holding = false, swell = null;
function breatheStart() {
  holding = true;
  actx ??= new AudioContext();
  const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 196;
  g.gain.setValueAtTime(0.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.06, actx.currentTime + 4);
  o.connect(g).connect(actx.destination); o.start(); swell = { o, g };
}
function breatheEnd() {
  holding = false;
  if (swell) { const { o, g } = swell; g.gain.cancelScheduledValues(actx.currentTime); g.gain.setValueAtTime(g.gain.value, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 6); o.stop(actx.currentTime + 6); swell = null; }
}
function updateBreath(dt) {
  if (!breath) return;
  const b = breath;
  if (holding) { b.level = Math.min(1, b.level + dt / 4); b.peak = Math.max(b.peak, b.level); }   // ~4 s in
  else {
    b.level = Math.max(0.35, b.level - dt / 6 * 0.65);                                              // ~6 s out
    if (b.peak > 0.8 && b.level <= 0.36) {                                                          // one full breath
      b.peak = 0; b.count++;
      const s = cutout(0.022, 0.022, D.star(true)); s.rotation.x = 0; s.userData.rise = 1;
      s.position.set(b.orb.position.x + (Math.random() - 0.5) * 0.06, b.orb.position.y, b.orb.position.z); stage.add(s); pops.push(s);
      note(LULL[(b.count - 1) % LULL.length], 1.2);
      if (b.count === 3) drawPages(page + 1, PAGES.length, PAGES[page].heading, PAGES[page].text, 'Three breaths. Lovely. Pinch the corner when you are ready.');
    }
  }
  b.orb.scale.setScalar(b.level);
}

// Storybook sky: giant paper cut-outs hanging on strings, gently swaying
const skyToys = [];
{
  const string = new THREE.LineBasicMaterial({ color: 0xd8d0f0, transparent: true, opacity: 0.6 });
  const add = (m, x, y, z, ph) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.lookAt(0, y, 0);
    m.position.y = -m.geometry.parameters.height; g.add(m);
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, 0)]), string));
    g.userData.ph = ph; scene.add(g); skyToys.push(g);
  };
  add(cutout(1.1, 1.1, D.moon(true)), 1.6, 2.6, -3.2, 0);
  [[-2.2, 2.2, -2.8], [-0.9, 2.9, -3.6], [0.4, 2.4, -3.8], [2.8, 2.0, -2.0], [-3.0, 1.8, -1.2], [3.2, 2.5, -0.6]].forEach(([x, y, z], i) => add(cutout(0.45, 0.45, D.star(true)), x, y, z, i + 1));
  D.balloon = (x, w, h) => {
    cut(x, () => { x.ellipse(w / 2, h * .36, w * .38, h * .33, 0, 0, 7); }, '#e86a6a');
    x.save(); x.beginPath(); x.ellipse(w / 2, h * .36, w * .38, h * .33, 0, 0, 7); x.clip();
    ['#f2c14e', '#5fb3e8'].forEach((c, k) => { x.fillStyle = c; x.fillRect(w * (.3 + k * .24), 0, w * .12, h); }); x.restore();
    x.strokeStyle = '#6a4a3a'; x.lineWidth = 6; x.beginPath(); x.moveTo(w * .35, h * .66); x.lineTo(w * .42, h * .8); x.moveTo(w * .65, h * .66); x.lineTo(w * .58, h * .8); x.stroke();
    cut(x, () => x.rect(w * .38, h * .8, w * .24, h * .14), '#b07a4a');
  };
  add(cutout(0.8, 1.1, D.balloon), -1.8, 2.7, -2.4, 9);
}
function updateSkyToys(t) { skyToys.forEach(g => { g.rotation.z = Math.sin(t * 0.6 + g.userData.ph) * 0.06; g.position.y += Math.sin(t * 0.5 + g.userData.ph) * 0.0004; }); }

function showPage(n) {
  page = n; stage.clear(); pops = []; tappables = []; dim = 0; breath = null; if (holding) breatheEnd();
  PAGES[n].build();
  drawPages(n + 1, PAGES.length, PAGES[n].heading, PAGES[n].text, PAGES[n].hint);
}
// Real page turn: the right page lifts from the spine, curls, and flips over to the left
let flip = null;
function turnPage() {
  if (flip) return;
  paperSwish();
  const snap = document.createElement('canvas'); snap.width = right.c.width; snap.height = right.c.height;
  snap.getContext('2d').drawImage(right.c, 0, 0);
  const front = new THREE.CanvasTexture(snap); front.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(PW, PD, 24, 1);
  const g = new THREE.Group(); g.position.y = 0.003; BOOK.add(g);
  const sheet = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: front, side: THREE.FrontSide }));
  const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xefe4cc, side: THREE.BackSide }));
  for (const m of [sheet, back]) { m.rotation.x = -Math.PI / 2; m.position.x = PW / 2; g.add(m); }
  pops.forEach(m => (m.userData.fold = 1));   // old scene folds back down into the page
  flip = { g, geo, p: 0, swapped: false, base: Float32Array.from(geo.attributes.position.array) };
  setTimeout(() => paperThump(), 1150);
}
function paperSwish() {
  actx ??= new AudioContext();
  const len = actx.sampleRate * 0.7, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) { const k = i / len; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(k * 60)) ; }
  const src = actx.createBufferSource(); src.buffer = buf;
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(1200, actx.currentTime); bp.frequency.exponentialRampToValueAtTime(4200, actx.currentTime + 0.35); bp.frequency.exponentialRampToValueAtTime(1500, actx.currentTime + 0.7);
  const g = actx.createGain(); g.gain.value = 0.22;
  src.connect(bp).connect(g).connect(actx.destination); src.start();
}
function paperThump() {
  const len = actx.sampleRate * 0.12, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = actx.createBufferSource(); src.buffer = buf;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
  const g = actx.createGain(); g.gain.value = 0.35; src.connect(lp).connect(g).connect(actx.destination); src.start();
}
function updateFlip(dt) {
  if (!flip) return;
  const f = flip; f.p = Math.min(1, f.p + dt * 0.85);
  const e = f.p < 0.5 ? 2 * f.p * f.p : 1 - Math.pow(-2 * f.p + 2, 2) / 2;   // ease in-out
  f.g.rotation.z = e * Math.PI;
  const pos = f.geo.attributes.position, lift = Math.sin(e * Math.PI);
  for (let i = 0; i < pos.count; i++) {
    const x = f.base[i * 3], u = (x + PW / 2) / PW;                           // 0 at spine, 1 at edge
    pos.setZ(i, lift * 0.05 * u * u - lift * 0.02 * u);                      // paper curl
  }
  pos.needsUpdate = true;
  if (!f.swapped && f.p > 0.5) { f.swapped = true; showPage((page + 1) % PAGES.length); }
  if (f.p >= 1) { BOOK.remove(f.g); f.geo.dispose(); flip = null; }
}

// ---------- Picking ----------
function hitObject(p) {
  if (corner.getWorldPosition(new THREE.Vector3()).distanceTo(p) < 0.03) return 'corner';
  let best = null, bd = 0.02;
  for (const t of tappables) {
    const box = new THREE.Box3().setFromObject(t).expandByScalar(0.01);
    const d = box.distanceToPoint(p); if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function activate(h) { if (h === 'corner') turnPage(); else if (h) h.userData.onPinch.call(h); }

const hands = [0, 1].map(i => {
  const hand = renderer.xr.getHand(i); scene.add(hand);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd59a }));
  tip.visible = false; scene.add(tip);
  return { hand, tip, pinching: false };
});
let penOwner = null;
function updateHands() {
  hands.forEach((h, i) => (h.slot = i ? grassU.uH1 : grassU.uH0));
  for (const h of hands) {
    const j = h.hand.joints, ti = j && j['index-finger-tip'], tt = j && j['thumb-tip'];
    if (!ti || !tt || !ti.visible) { h.tip.visible = false; h.pinching = false; h.slot.value.set(9, 9, 9); continue; }
    const a = ti.getWorldPosition(new THREE.Vector3()), b = tt.getWorldPosition(new THREE.Vector3());
    const palm = j['middle-finger-metacarpal'];
    h.slot.value.copy(palm && palm.visible ? palm.getWorldPosition(new THREE.Vector3()).lerp(a, 0.5) : a);
    const p = a.clone().add(b).multiplyScalar(0.5), d = a.distanceTo(b);
    h.tip.visible = true; h.tip.position.copy(p);
    const cp = !h.pinching && pageCanvasPoint(a);
    if (cp) { pen.visible = true; pen.position.copy(a); penOwner = h; highlightAt(cp[0], cp[1]); }
    else if (penOwner === h) { pen.visible = false; penOwner = null; }
    if (!h.pinching && d < 0.02) {
      h.pinching = true; const hit = hitObject(p);
      if (!hit && breath) { h.breathing = true; breatheStart(); } else activate(hit);
    } else if (h.pinching && d > 0.035) { h.pinching = false; if (h.breathing) { h.breathing = false; breatheEnd(); } }
  }
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', e => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(corner).length) return turnPage();
  const hit = ray.intersectObjects(tappables, false)[0];
  if (hit) hit.object.userData.onPinch.call(hit.object);
  else if (breath) breatheStart();
});
addEventListener('pointerup', () => { if (holding) breatheEnd(); });
// Desktop: the mouse brushes the grass
const grassPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(GRASS_Y + 0.02));
renderer.domElement.addEventListener('pointermove', e => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  ray.ray.intersectPlane(grassPlane, grassU.uH2.value) || grassU.uH2.value.set(9, 9, 9);
  const hit = ray.intersectObject(left.m)[0];
  if (hit && !renderer.xr.isPresenting) {
    pen.visible = true; pen.position.copy(hit.point);
    const cx = hit.uv.x * 800, cy = (1 - hit.uv.y) * 1040;
    renderer.domElement.style.cursor = highlightAt(cx, cy) || left.lines.some(l => cy > l.y - l.lh && cy < l.y + l.lh * 0.3) ? 'none' : 'none';
  } else if (!renderer.xr.isPresenting) { pen.visible = false; renderer.domElement.style.cursor = ''; }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- Loop ----------
const clock = new THREE.Clock();
const backOut = k => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
showPage(0);
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  grassU.uTime.value = t; window.__skyU.uTime.value = t;
  if (!renderer.xr.isPresenting) { look.pitch += (look.tp - look.pitch) * Math.min(1, dt * 4); look.yaw += (look.ty - look.yaw) * Math.min(1, dt * 4); camera.rotation.set(look.pitch, look.yaw, 0); }
  updateWorld(t, dt);
  updateFlip(dt);
  updateSkyToys(t);
  updateHands();
  updateBreath(dt);
  for (const m of pops) {
    const u = m.userData;
    if (u.fold !== undefined) { u.fold = Math.max(0, u.fold - dt * 2.6); if (!u.flat) m.rotation.x = -Math.PI / 2 * (1 - u.fold * u.fold); m.position.y = (u.baseY || 0) * u.fold; continue; }
    if (u.rise) { m.position.y += dt * 0.03; m.position.x += Math.sin(t * 2 + m.id) * dt * 0.005; continue; }
    // fold up from the page like paper engineering
    if (u.popT < 1) { u.popT += dt * 1.25; const k = Math.max(0, Math.min(1, u.popT)); const target = u.flat ? -Math.PI / 2 : 0; m.rotation.x = -Math.PI / 2 + (target + Math.PI / 2) * (u.flat ? k : backOut(k)); }
    let y = u.baseY + (u.lift && u.popT >= 0 ? u.lift * Math.min(1, u.popT) : 0);
    if (u.hop) { u.hop = Math.max(0, u.hop - dt * 3); y += Math.sin(u.hop * Math.PI) * 0.015; }
    if (u.drift) { u.drift += dt; m.position.x = Math.min(0.2, (u.drift - 1) * 0.08); y += (u.drift - 1) * 0.02; }
    if (u.lift && !u.hop) y += Math.sin(t * 1.5 + m.position.x * 30) * 0.003;
    m.position.y = y;
  }
  corner.scale.setScalar(1 + 0.2 * Math.sin(t * 3));
  renderer.toneMappingExposure += ((dim ? 0.45 : 1) - renderer.toneMappingExposure) * dt * 0.8;
  renderer.render(scene, camera);
});
