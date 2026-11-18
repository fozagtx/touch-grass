import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1026);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0, -0.06, -0.1);          // desktop preview only; VR uses the headset pose
camera.lookAt(0, -0.29, -0.43);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x221a33, 1.4); scene.add(hemi);
const lamp = new THREE.PointLight(0xffd59a, 1.2, 2); lamp.position.set(0.2, 0.1, -0.3); scene.add(lamp);

// Bedroom sky dots
{
  const g = new THREE.BufferGeometry(), p = [];
  for (let i = 0; i < 800; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(8); if (v.y > -1) p.push(v.x, v.y, v.z); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8899cc, size: 0.03 })));
}

// ---------- The book (on the tray table, seated reach) ----------
const BOOK = new THREE.Group(); BOOK.position.set(0, -0.32, -0.45); scene.add(BOOK);
const PW = 0.2, PD = 0.26;
const cover = new THREE.Mesh(new THREE.BoxGeometry(PW * 2 + 0.02, 0.01, PD + 0.02), new THREE.MeshStandardMaterial({ color: 0x5b2a4a }));
cover.position.y = -0.006; BOOK.add(cover);

function canvasPage(x) {
  const c = document.createElement('canvas'); c.width = 800; c.height = 1040;
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), new THREE.MeshBasicMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.001, 0); BOOK.add(m);
  return { c, ctx: c.getContext('2d'), tex };
}
const left = canvasPage(-PW / 2), right = canvasPage(PW / 2);
function paper(p) { p.ctx.fillStyle = '#f6ecd6'; p.ctx.fillRect(0, 0, 800, 1040); }
function wrap(ctx, text, x, y, w, lh) {
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > w) { ctx.fillText(line, x, y); y += lh; line = word; } else line = t;
    }
    ctx.fillText(line, x, y); y += lh * 1.4;
  }
}
function drawPages(n, total, text, hint) {
  paper(left); const L = left.ctx;
  L.fillStyle = '#3a2a3f'; L.font = 'italic 50px Georgia, serif'; wrap(L, text, 60, 130, 680, 70);
  L.fillStyle = '#9a7a8a'; L.font = '30px Georgia, serif'; L.fillText(`${n} / ${total}`, 360, 990);
  left.tex.needsUpdate = true;
  paper(right); const R = right.ctx;
  R.fillStyle = '#5a3a4a'; R.font = 'italic 38px Georgia, serif'; wrap(R, hint, 60, 860, 680, 48);
  right.tex.needsUpdate = true;
}

// Page corner you pinch to turn
const corner = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd59a }));
corner.position.set(PW - 0.015, 0.012, PD / 2 - 0.015); BOOK.add(corner);

// ---------- Pop-up helpers ----------
const stage = new THREE.Group(); stage.position.set(PW / 2, 0, -0.02); BOOK.add(stage);
const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
let pops = [], tappables = [];
function pop(mesh, delay = 0) { mesh.userData.popT = -delay; mesh.userData.baseScale = mesh.scale.clone(); mesh.scale.setScalar(0.0001); pops.push(mesh); stage.add(mesh); return mesh; }
function tappable(mesh, fn) { mesh.userData.onPinch = fn; tappables.push(mesh); return mesh; }
function hop(m) { m.userData.hop = 1; }

function fox(x, z, curled = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), mat(0xe07b39)); body.scale.set(1.3, curled ? 0.7 : 1, 1); body.position.y = 0.018; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), mat(0xe8894a)); head.position.set(curled ? 0.016 : 0.02, curled ? 0.02 : 0.034, 0); g.add(head);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.01, 8), mat(0x6b3a1e)); ear.position.set(head.position.x, head.position.y + 0.012, s * 0.005); g.add(ear); }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 8), mat(0xfff1dc)); tail.scale.set(1.6, 0.8, 0.8); tail.position.set(-0.026, 0.02, 0); g.add(tail);
  g.position.set(x, 0, z); return g;
}
function hill(x, z, r, c) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(c)); m.position.set(x, 0, z); return m; }
function tree(x, z, h) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, h * 0.4, 8), mat(0x5a3a2a)); trunk.position.y = h * 0.2; g.add(trunk);
  const top = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h * 0.75, 10), mat(0x2f6b4f)); top.position.y = h * 0.7; g.add(top);
  g.position.set(x, 0, z); return g;
}
const sky = new THREE.Group(); stage.add(sky); // moon & cloud live above the book

// ---------- Audio ----------
let actx;
function note(f, d = 0.5, type = 'sine', v = 0.12) {
  actx ??= new AudioContext();
  const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(v, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
  o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
}
const LULL = [392, 440, 523.25, 587.33, 659.25, 783.99];

// ---------- The story (original) ----------
let page = 0, dim = 0;
const PAGES = [
  {
    text: 'Pip the fox lived at the top of Hush Hill.\nEvery night the moon came by to say goodnight.\nBut tonight, the sky was empty.',
    hint: 'Pinch Pip to say hello. Pinch the glowing corner to turn the page.',
    build() {
      pop(hill(0, -0.03, 0.07, 0x3d5a80), 0); pop(hill(-0.06, 0.05, 0.05, 0x46668f), 0.1);
      const house = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.03), mat(0xd9c3a5)); walls.position.y = 0.015; house.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.025, 4), mat(0x8a3b3b)); roof.position.y = 0.042; roof.rotation.y = Math.PI / 4; house.add(roof);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0xffd36b })); win.position.set(0, 0.016, 0.0151); house.add(win);
      house.position.set(0.05, 0, 0.04); pop(house, 0.25);
      const p = fox(-0.01, 0.06); pop(p, 0.4);
      tappable(p, () => { hop(p); note(523.25); note(659.25, 0.4); });
    },
  },
  {
    text: 'Pip padded into Whisper Wood and found Old Owl.\n"The moon is shy tonight," Owl yawned. "Ask the river. Rivers see everything."',
    hint: 'Pinch Old Owl.',
    build() {
      [[-0.06, -0.05, 0.1], [0.06, -0.06, 0.12], [-0.02, -0.08, 0.09], [0.07, 0.05, 0.08], [-0.07, 0.04, 0.09]].forEach(([x, z, h], i) => pop(tree(x, z, h), i * 0.08));
      const owl = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), mat(0x8a6a4a)); b.scale.y = 1.3; owl.add(b);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })); e.position.set(s * 0.005, 0.006, 0.012); owl.add(e); }
      owl.position.set(0.01, 0.06, -0.03); pop(owl, 0.45);
      tappable(owl, () => { hop(owl); note(330, 0.35, 'triangle'); setTimeout(() => note(262, 0.5, 'triangle'), 300); });
      const p = fox(-0.02, 0.07); pop(p, 0.5); tappable(p, () => { hop(p); note(523.25); });
    },
  },
  {
    text: 'The river shimmered. "I only hold the stars," it whispered, "and they have fallen asleep."\nCan you wake them?',
    hint: 'Pinch each sleepy star in the river.',
    build() {
      const river = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.06), new THREE.MeshStandardMaterial({ color: 0x2a4a8a, roughness: 0.2, metalness: 0.3 }));
      river.position.set(0, 0.002, 0); pop(river, 0);
      pop(hill(-0.06, -0.07, 0.04, 0x3d5a80), 0.1); pop(hill(0.06, 0.08, 0.035, 0x46668f), 0.15);
      let woke = 0;
      [-0.07, -0.035, 0, 0.035, 0.07].forEach((x, i) => {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.008), new THREE.MeshBasicMaterial({ color: 0x55607a }));
        s.position.set(x, 0.012, (i % 2 ? 0.012 : -0.012)); pop(s, 0.2 + i * 0.08);
        tappable(s, () => {
          if (s.userData.awake) return; s.userData.awake = true; s.material.color.set(0xfff1a8); hop(s); note(LULL[woke]); woke++;
          if (woke === 5) { [0, 2, 4].forEach((n, k) => setTimeout(() => note(LULL[n], 0.8), k * 140)); }
        });
      });
      const p = fox(-0.06, 0.07); pop(p, 0.6); tappable(p, () => { hop(p); note(523.25); });
    },
  },
  {
    text: 'The stars pointed up, up, up.\nThere was the moon, wrapped in a big sleepy cloud that did not want to let go.',
    hint: 'Pinch the cloud to tickle it awake.',
    build() {
      pop(hill(0, 0.02, 0.06, 0x3d5a80), 0);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.025, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4c8 }));
      moon.position.set(0, 0.14, -0.06); pop(moon, 0.1);
      const cloud = new THREE.Group();
      [[-0.025, 0, 0.018], [0, 0.008, 0.024], [0.025, 0, 0.018], [0, -0.008, 0.02]].forEach(([x, y, r]) => {
        const c = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(0xe8ecf6)); c.position.set(x, y, 0); cloud.add(c);
      });
      cloud.position.set(0, 0.14, -0.04); pop(cloud, 0.3);
      let tickles = 0;
      tappable(cloud, () => {
        tickles++; hop(cloud); note(700 + tickles * 80, 0.2, 'triangle', 0.08);
        if (tickles >= 3 && !cloud.userData.gone) { cloud.userData.gone = true; cloud.userData.drift = 1; [2, 3, 5].forEach((n, k) => setTimeout(() => note(LULL[n], 0.9), k * 160)); }
      });
      const p = fox(0, 0.06); pop(p, 0.4); tappable(p, () => { hop(p); note(523.25); });
    },
  },
  {
    text: 'The moon smiled down on Hush Hill.\n"Goodnight, Pip," said the moon.\nPip curled into a warm, round ball.\nGoodnight, Pip. Goodnight, you.',
    hint: 'Pinch the moon to say goodnight. Pinch the corner to read again.',
    build() {
      pop(hill(0, 0, 0.07, 0x2f4a6e), 0);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4c8 }));
      moon.position.set(0.04, 0.15, -0.07); pop(moon, 0.1);
      tappable(moon, () => { hop(moon); [0, 2, 4, 5].forEach((n, k) => setTimeout(() => note(LULL[n] / 2, 1.2), k * 220)); dim = 1; });
      pop(fox(0, 0.07, true), 0.3);
    },
  },
];

function showPage(n) {
  page = n; stage.clear(); pops = []; tappables = []; dim = 0;
  PAGES[n].build();
  drawPages(n + 1, PAGES.length, PAGES[n].text, PAGES[n].hint);
}
function turnPage() { note(880, 0.15, 'sine', 0.05); showPage((page + 1) % PAGES.length); }

// ---------- Picking (pinch point / mouse ray) ----------
function hitObject(p, r = 0.025) {
  if (corner.getWorldPosition(new THREE.Vector3()).distanceTo(p) < 0.03) return 'corner';
  let best = null, bd = r;
  for (const t of tappables) {
    const box = new THREE.Box3().setFromObject(t).expandByScalar(0.008);
    if (box.containsPoint(p)) return t;
    const d = box.distanceToPoint(p); if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function activate(h) { if (h === 'corner') turnPage(); else if (h) h.userData.onPinch(); }

const hands = [0, 1].map(i => {
  const hand = renderer.xr.getHand(i); scene.add(hand);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd59a }));
  tip.visible = false; scene.add(tip);
  return { hand, tip, pinching: false };
});
function updateHands() {
  for (const h of hands) {
    const j = h.hand.joints, ti = j && j['index-finger-tip'], tt = j && j['thumb-tip'];
    if (!ti || !tt || !ti.visible) { h.tip.visible = false; h.pinching = false; continue; }
    const a = ti.getWorldPosition(new THREE.Vector3()), b = tt.getWorldPosition(new THREE.Vector3());
    const p = a.clone().add(b).multiplyScalar(0.5), d = a.distanceTo(b);
    h.tip.visible = true; h.tip.position.copy(p);
    if (!h.pinching && d < 0.02) { h.pinching = true; activate(hitObject(p)); }
    else if (h.pinching && d > 0.035) h.pinching = false;
  }
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', e => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(corner).length) return turnPage();
  const hit = ray.intersectObjects(tappables, true)[0];
  if (hit) { let o = hit.object; while (o && !o.userData.onPinch) o = o.parent; if (o) o.userData.onPinch(); }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- Loop ----------
const clock = new THREE.Clock();
showPage(0);
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  updateHands();
  for (const m of pops) {
    const u = m.userData;
    if (u.popT < 1) { u.popT += dt * 1.8; const k = Math.max(0, Math.min(1, u.popT)); const e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); m.scale.copy(u.baseScale).multiplyScalar(Math.max(0.0001, e)); }
    if (u.hop) { u.hop = Math.max(0, u.hop - dt * 3); m.position.y = (u.baseY ??= m.position.y) + Math.sin(u.hop * Math.PI) * 0.02; }
    if (u.drift) { m.position.x += dt * 0.05; m.position.y += dt * 0.02; }
  }
  corner.scale.setScalar(1 + 0.25 * Math.sin(t * 3));
  const target = dim ? 0.35 : 1;
  hemi.intensity += (1.4 * target - hemi.intensity) * dt;
  renderer.render(scene, camera);
});
