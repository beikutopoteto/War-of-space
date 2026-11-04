/* Static preparation-screen dock, based on tools/dock-sample.cjs. */
window.WOS_DOCK = (() => {
  let renderer, scene, rebuild;
  function init(canvas) {
    const OPEN = 115;
    const W = 1600, H = 900, r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setSize(W, H); r.setPixelRatio(1); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .62;
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(34, W / H, .5, 8000);
    let seed = 3; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // 日: 低い（地平線から約20度）、西から
    const sun = new THREE.Vector3(.75, .34, .5).normalize();
    sc.add(new THREE.AmbientLight(0x40506a, .32));
    const dl = new THREE.DirectionalLight(0xfff0d8, 1.7); dl.position.copy(sun).multiplyScalar(600); dl.target.position.set(0, 0, 0); sc.add(dl, dl.target);
    dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048); Object.assign(dl.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 10, far: 1200 }); dl.shadow.bias = -.0006;
    // 地球からの照り返し（南、青）
    const el = new THREE.DirectionalLight(0x6f9fff, .35); el.position.set(0, 40, 300); sc.add(el);
    // 星
    const sp = []; for (let i = 0; i < 3000; i++) { const v = new THREE.Vector3(R() - .5, R() * .6, R() - .5).normalize().multiplyScalar(5000); sp.push(v.x, v.y, v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaab8d8, size: 1.3, sizeAttenuation: false })));
    // 地球: 画面の左上、柱の先の向こう。視直径1.9度を、背景なので大きめに見せる
    const ER = 340, e = new THREE.Mesh(new THREE.SphereGeometry(ER, 96, 64), skyMat(0)); e.material.uniforms.uSun.value.copy(sun);
    e.position.set(599, 1295, -832); e.rotation.set(.4, 3.6, .2); e.material.uniforms.uSun.value.set(.6, -.5, .6).normalize(); sc.add(e);
    const h = skyHalo(ER); h.material.uniforms.uSun.value.copy(sun); h.position.copy(e.position); sc.add(h);
    // 岩の地面: ゆるい起伏と小さなクレーター
    const RB = 2600, G = new THREE.SphereGeometry(RB, 360, 110, 0, Math.PI * 2, 0, .62);
    const P = G.attributes.position, craters = []; for (let i = 0; i < 160; i++) craters.push([(R() - .5) * 2400, (R() - .5) * 2400, 4 + R() * 40]);
    const hgt = (x, z) => { let y = Math.sin(x * .021) * 2.2 + Math.cos(z * .017) * 2.6 + Math.sin((x + z) * .05) * .8 + Math.sin(x * .13 + z * .11) * .25;
      for (const [cx, cz, cr] of craters) { const d = Math.hypot(x - cx, z - cz) / cr; if (d < 1.35) y += d < 1 ? -cr * .22 * (1 - d * d) : cr * .12 * (1.35 - d) / .35 * (d < 1.15 ? (d - 1) / .15 : 1); }
      const d0 = Math.hypot(x, z * .8); if (d0 < 30) y = Math.min(y, -1.2 + d0 * .02); else if (d0 < 42) y += (42 - d0) * .25; return y; };
    const _v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { _v.fromBufferAttribute(P, i); const n = _v.clone().normalize(); _v.addScaledVector(n, hgt(_v.x, _v.z)); P.setXYZ(i, _v.x, _v.y - RB, _v.z); }
    G.computeVertexNormals();
    const rock = new THREE.Mesh(G, new THREE.MeshStandardMaterial({ color: 0x45423e, roughness: .96, metalness: .05, flatShading: true })); rock.receiveShadow = true; rock.castShadow = true; sc.add(rock);
    // 岩くず
    const rk = [new THREE.DodecahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1, 0)];
    for (let i = 0; i < 260; i++) { const x = (R() - .5) * 500, z = (R() - .5) * 500; if (Math.hypot(x, z) < 40) continue; const s = .4 + R() * R() * 4;
      const m = new THREE.Mesh(rk[i % 2], rock.material); m.scale.set(s, s * .6, s); m.position.set(x, hgt(x, z) + s * .2 - (x * x + z * z) / (2 * RB), z); m.rotation.set(R() * 3, R() * 3, R() * 3); m.castShadow = m.receiveShadow = true; sc.add(m); }
    // ゲート（ゲームの部品。1.5倍のさらに4倍で背景の主役に）
    const K = 6, gate = new THREE.Group(); gate.scale.setScalar(K); sc.add(gate);
    gate.add(gBerm(GATE_O, 1.5, 1.4));
    // 開いた口: 中は暗い縦穴、縁に誘導灯
    gate.add(gSlab(gScl(GATE_P, .98), .1, new THREE.MeshBasicMaterial({ color: 0x07090d }), GATE_TOP + .01));
    const lights = []; GATE_P.forEach((a, i) => { const b = GATE_P[(i + 1) % 8]; for (let k = 0; k < 4; k++) { const t = k / 4; lights.push([a[0] + (b[0] - a[0]) * t, GATE_TOP + .12, a[1] + (b[1] - a[1]) * t]); } });
    gPoints(gate, lights, 0xffc070, 4);
    // 2枚のふた: 南北の端のヒンジで外へ開く
    for (const north of [true, false]) {
      const s = north ? -1 : 1, piv = new THREE.Group(); piv.position.set(0, GATE_TOP + .32, s * 6.62); piv.rotation.x = s * -THREE.MathUtils.degToRad(OPEN) * -1; gate.add(piv);
      const leaf = new THREE.Group(); leaf.position.set(0, -(GATE_TOP + .32), -s * 6.62); piv.add(leaf);
      GATE_PIECES.filter(p => p.north === north).forEach(p => { leaf.add(gSlab(p.o, .5, GM.plate, GATE_TOP + .45));
        const c = p.o.reduce((q, v) => [q[0] + v[0] / 3, q[1] + v[1] / 3], [0, 0]); leaf.add(gSlab(p.o.map(([x, z]) => [c[0] + (x - c[0]) * .55, c[1] + (z - c[1]) * .55]), .16, GM.plate2, GATE_LID_Y + .16)); });
      leaf.add(gSlab(GATE_HUB[north ? 0 : 1], .5, GM.dark, GATE_LID_Y + .37));
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 2.9, 12), GM.hinge); pin.rotation.z = Math.PI / 2; pin.position.set(0, GATE_TOP + .32, s * 6.62); gate.add(pin);
    }
    gate.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // 埠頭: 縦穴から斜めに立ち上がり、岩の上へ水平に伸びる骨組みの桟橋。両側に係留の腕
    const steel = new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: .6, roughness: .45 }), dark = new THREE.MeshStandardMaterial({ color: 0x343a44, metalness: .5, roughness: .6 });
    const pier = new THREE.Group(); sc.add(pier); let target = pier;
    const beam = (a, b, t, m) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B), g = new THREE.BoxGeometry(t, t, L), x = new THREE.Mesh(g, m);
      x.position.copy(A).add(B).multiplyScalar(.5); x.lookAt(B); x.castShadow = x.receiveShadow = true; target.add(x); return x; };
    // 本柱（機材と人の往復用。ユーザー決定 2026-11-05、見本の案F）: 上から見て × の骨組み。真ん中に昇降筒（灯りの窓）。艦のいない桟橋は × の隙間に畳み込む
    const TOP = 480, CR = 8.5;
    const colM = new THREE.MeshStandardMaterial({ color: 0x737a85, metalness: .55, roughness: .5 }), litM = new THREE.MeshBasicMaterial({ color: 0xffd08a });
    const add = (m, y) => { m.position.y = y; m.castShadow = m.receiveShadow = true; pier.add(m); return m; };
    { // 上から見て × の骨組み。真ん中に昇降筒（灯りの窓）。艦のいない桟橋は × の隙間に畳み込む
      const XA = 14, XT = 4, CORE = 5;
      add(new THREE.Mesh(new THREE.CylinderGeometry(CORE, CORE, TOP + 12, 12), colM), TOP / 2 - 6);
      for (let y = 3; y < TOP; y += 6) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const w = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, .9, .3), litM), y); w.position.x = Math.cos(a) * (CORE + .1); w.position.z = Math.sin(a) * (CORE + .1); w.rotation.y = -a + Math.PI / 2; }
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, ax = Math.cos(a), az = Math.sin(a), nx = -az, nz = ax;
        const P = (r, f, y) => [ax * r + nx * f * XT / 2, y, az * r + nz * f * XT / 2];
        for (const r of [CORE + .6, XA]) for (const f of [-1, 1]) beam(P(r, f, -10), P(r, f, TOP), r === XA ? 1.3 : .8, steel);
        for (let y = -6; y < TOP; y += 11) { for (const f of [-1, 1]) { beam(P(CORE + .6, f, y), P(XA, f, y), .55, steel); beam(P(CORE + .6, f, y), P(XA, f, y + 11), .4, dark); }
          beam(P(XA, -1, y), P(XA, 1, y), .55, steel); } }
      for (let y = 10; y < TOP; y += 44) for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(XA * 2 + 1.5, 1.4, XT + .8), dark), y); b.rotation.y = r; } }
    /* カメラ（ユーザー決定 2026-11-05、案 e）: 柱の横の引きから、柱が右下の根元から左上の地球へ長く伸びて見える。右下の端にフェブルアーリアの表面とゲート */
    const CP = [-514, 247, 715], CL = [9, 391, 73];
    cam.position.set(...CP); cam.lookAt(...CL); cam.rotateZ(THREE.MathUtils.degToRad(-67.2));
    renderer = r; scene = sc;
    let moving = null;
    const c = new THREE.Color(0x7fc8ff), ship = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, emissive: c, emissiveIntensity: .05, metalness: .5, roughness: .42 });
    const tubeM = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: .4, roughness: .5 }), hingeM = GM.hinge;
    const glowM = new THREE.PointsMaterial({ color: 0xffd08a, size: 4, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    return function update(ships) {
      const start = performance.now(), queues = [[], [], [], [], []];
      ships.forEach(t => { const i = ({bb:0,cvb:1,masc:1,cl:2,dd:3,mas:3,ff:4,cv:4})[t]; if (i !== undefined) queues[i].push(t); });
      if (moving) { sc.remove(moving); moving.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      moving = new THREE.Group(); sc.add(moving); target = moving;
      const counts = [0,0,0,0,0]; let foldedCount = 0;
    const glow = [];
    // 段: [艦種, 高さ, 向きのずれ(度), 桟橋の数, 形]
    //   big: 大型艦。1段に2本だけ（向かい合わせ）、段ごとに向きを90度ずらし、上下の段の艦と重ならず、横へ離れる道をふさがない
    //   tree: 小型艦。桟橋から上下へ縦の枝を出し、枝の横に艦首を柱へ向けて止める。離れるときは横（桟橋と直角）へ
    const levels = [['bb', 70, 0, 2, 'big'], ['cvb', 140, 90, 2, 'big'], ['cl', 230, 0, 4, 'tree'], ['dd', 330, 0, 4, 'tree'], ['ff', 420, 0, 4, 'tree']];
    const SZ = { bb: 22, cl: 13, cvb: 21, dd: 10, ff: 8 };
    const hinge = (x, y, z, r, h, axis) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), hingeM); g.position.set(x, y, z); if (axis === 'h') g.rotation.z = Math.PI / 2; g.castShadow = true; target.add(g); return g; };
    // 折り畳める桟橋: 柱の付け根に太いヒンジ（柱に沿って上へ畳む）、節のつなぎ目に小さいヒンジ
    const foldArm = (A, ux, uz, len, y, w) => { const seg = 20, n = Math.max(1, Math.round(len / seg)), sl = len / n;
      const root = hinge(ux * (A + 1), y, uz * (A + 1), w * .7, w * 2.2, 'v'); root.rotation.set(0, 0, 0); root.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0); root.rotation.x = Math.PI / 2; root.rotation.y = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) { const r0 = A + i * sl + 1.2, r1 = A + (i + 1) * sl - 1.2;
        beam([ux * r0, y, uz * r0], [ux * r1, y, uz * r1], w, steel); beam([ux * r0, y - 3.2, uz * r0], [ux * r1, y - 3.2, uz * r1], .7, dark);
        beam([ux * r0, y - 3.2, uz * r0], [ux * (r0 + r1) / 2, y, uz * (r0 + r1) / 2], .45, dark); beam([ux * (r0 + r1) / 2, y, uz * (r0 + r1) / 2], [ux * r1, y - 3.2, uz * r1], .45, dark);
        if (i < n - 1) hinge(ux * (A + (i + 1) * sl), y - 1, uz * (A + (i + 1) * sl), w * .42, w + 3.6, 'v'); }
      return A + len; };
    // 艦を止める: 位置 c（中心）、艦首の向き face、乗り込みの橋は from（桟橋側の点の列）から
    const putShip = (t, c, face, bridges) => { t = queues[levelIndex].shift(); const S = SZ[levelType], m = new THREE.Mesh(shapeGeo(t), ship); m.scale.setScalar(S); m.position.set(...c); m.rotation.y = Math.atan2(face[0], face[1]);
      m.castShadow = m.receiveShadow = true; target.add(m); counts[levelIndex]++; bridges.forEach(([A, B]) => { beam(A, B, Math.max(2, S * .16), tubeM); glow.push([A[0], A[1] + 1.8, A[2]]); }); };
    // 畳んだ桟橋: 柱の付け根のヒンジから、節を折り重ねて柱に沿わせる（アコーディオンのように）
    const F0 = 6.2, folded = (ux, uz, y, len, w) => { foldedCount++; const n = Math.max(1, Math.round(len / 20)); hinge(ux * (F0 - .5), y, uz * (F0 - .5), w * .7, w * 2.2, 'h').rotation.y = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) { const two = true, r = F0 + w * .6 + (two ? i >> 1 : i) * (w + .6), sx = two ? ((i & 1) - .5) * (w + .5) : 0, px = ux * r - uz * sx, pz = uz * r + ux * sx; beam([px, y + 1, pz], [px, y + 19, pz], w, steel); } };
    // 畳んだ枝: 桟橋の上に寝かせる
    const foldedBranch = (bx, bz, ux, uz, y, len) => { beam([bx + ux * 2, y + 2.6, bz + uz * 2], [bx + ux * (2 + len * .5), y + 2.6, bz + uz * (2 + len * .5)], 2, steel); beam([bx - ux * 2, y + 2.6, bz - uz * 2], [bx - ux * (2 + len * .5), y + 2.6, bz - uz * (2 + len * .5)], 2, steel); };
    let levelIndex, levelType; levels.forEach(([t, y, d0, np, kind], li) => { levelIndex = li; levelType = t; const S = SZ[t], half = S * 1.4, L0 = 5.6; let left = queues[li].length;
      for (let k = 0; k < np; k++) { const a = THREE.MathUtils.degToRad(d0 + k * 360 / np), ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux, inward = [-ux, -uz];
        if (kind === 'big') { const len = half * 2 + 14; if (left <= 0) { folded(ux, uz, y, len, 4.4); continue; } left--; const end = foldArm(L0, ux, uz, len, y, 4.4), rc = L0 + 6 + half, gap = S * .45 + 10;
          putShip(t, [ux * rc + vx * gap, y - S * .08, uz * rc + vz * gap], inward, [-.4, .3].map(f => { const r = rc + f * half; return [[ux * r + vx * 2.4, y + .5, uz * r + vz * 2.4], [ux * r + vx * (gap - S * .2), y + .5, uz * r + vz * (gap - S * .2)]]; }));
          glow.push([ux * end, y + 2.8, uz * end]); continue; }
        // tree: 縦の枝を2本（内と外）。枝は桟橋から上下へ、高さ ±H1・±H2 に艦。内の枝は桟橋の左、外の枝は右に艦を付け、横へ離れる道を互いにふさがない
        const step = half * 2 + 12, nb = 2, len = nb * step + 10, H = S * .9 + 9, H2 = H * 2; if (left <= 0) { folded(ux, uz, y, len, 3.6); continue; } const end = foldArm(L0, ux, uz, len, y, 3.6);
        for (let i = 0; i < nb; i++) { const rb = L0 + 8 + half + i * step, bx = ux * rb, bz = uz * rb, sd = i % 2 ? 1 : -1; if (left <= 0) { foldedBranch(bx, bz, ux, uz, y, H2); continue; }
          hinge(bx, y, bz, 1.6, 6, 'h').rotation.y = Math.atan2(ux, uz);
          // 枝は柱から外へ TILT 度傾ける（上の枝は外上へ、下の枝は外下へ）。付け根にヒンジ、途中にもう一つ
          const TILT = THREE.MathUtils.degToRad(24), at = (dir, d) => [bx + ux * Math.sin(TILT) * d, y + dir * Math.cos(TILT) * d, bz + uz * Math.sin(TILT) * d];
          for (const dir of [1, -1]) { if (left <= 0) { const q = at(dir, 2); beam([q[0], y + 2.6, q[2]], [q[0] + ux * H, y + 2.6, q[2] + uz * H], 2, steel); continue; } beam(at(dir, 2), at(dir, H2 + 5), 2.4, steel); const hm = at(dir, H + 2); hinge(hm[0], hm[1], hm[2], 1.3, 4, 'h').rotation.y = Math.atan2(ux, uz);
            for (const d of [H2]) { if (left-- <= 0) continue; const [cx, cy, cz] = at(dir, d), gap = S * .45 + 8;
              putShip(t, [cx + vx * sd * gap, cy - S * .08, cz + vz * sd * gap], inward, [-.3, .3].map(f => { const ox = ux * f * half, oz = uz * f * half; return [[cx + ox + vx * sd * 1.6, cy, cz + oz + vz * sd * 1.6], [cx + ox + vx * sd * (gap - S * .2), cy, cz + oz + vz * sd * (gap - S * .2)]]; })); }
            glow.push(at(dir, H2 + 6)); } }
        glow.push([ux * end, y + 2.8, uz * end]); } });
    // 埠頭の灯り
    for (let y = 10; y < TOP; y += 22) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; glow.push([Math.cos(a) * (CR + 1.2), y + 1.2, Math.sin(a) * (CR + 1.2)]); } glow.push([0, TOP + 10, 0]);
    const gp = new Float32Array(glow.length * 3); glow.forEach((v, i) => gp.set(v, i * 3)); const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    target.add(new THREE.Points(gg, glowM));
    r.render(sc, cam);
    canvas.dataset.shipCounts = JSON.stringify(counts);
    canvas.dataset.foldedPiers = String(foldedCount);
    canvas.dataset.renderMs = Math.round(performance.now() - start);
    };
  }
  function draw(canvas, ships) {
    const start = performance.now();
    if (!renderer) rebuild = init(canvas);
    rebuild(ships);
    canvas.dataset.renderMs = Math.round(performance.now() - start);
  }
  function close() {
    if (!renderer) return;
    renderer.dispose(); renderer.forceContextLoss();
    const shared = new Set(Object.values(GM)), materials = new Set();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
    materials.forEach(m => { if (!shared.has(m)) m.dispose(); });
    const old = renderer.domElement, fresh = old.cloneNode(false); old.replaceWith(fresh);
    renderer = scene = rebuild = null;
  }
  return { draw, close };
})();
