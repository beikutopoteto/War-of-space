// フェブルアーリアの軍港（ゲートが開き、埠頭が伸びた形）の背景の見本。ゲームを開き、そのコード（艦の形・ゲートの部品・地球）で別の絵を描く
const { openGame } = require(process.argv[2] + '/tools/browser.cjs');
const OPEN = +(process.argv[4] || 115), VIEW = process.argv[5] || 'a', FILL = process.argv[6] && process.argv[6] !== '-' ? JSON.parse(process.argv[6]) : null, COL = process.argv[7] || 'a';
(async () => {
  const { browser, page, errors } = await openGame({ width: 1600, height: 900 });
  const url = await page.evaluate(([OPEN, VIEW, FILL, COL]) => {
    const W = 1600, H = 900, r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(W, H); r.setPixelRatio(1); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .62;
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(34, W / H, .5, 8000);
    let seed = 3; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // 日: 低い（地平線から約20度）、西から
    const sun = new THREE.Vector3(.75, .34, .5).normalize();
    sc.add(new THREE.AmbientLight(0x40506a, .32));
    const dl = new THREE.DirectionalLight(0xfff0d8, 1.7); dl.position.copy(sun).multiplyScalar(600); dl.target.position.set(0, 0, 0); sc.add(dl, dl.target);
    dl.castShadow = true; dl.shadow.mapSize.set(4096, 4096); Object.assign(dl.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 10, far: 1200 }); dl.shadow.bias = -.0006;
    // 地球からの照り返し（南、青）
    const el = new THREE.DirectionalLight(0x6f9fff, .35); el.position.set(0, 40, 300); sc.add(el);
    // 星
    const sp = []; for (let i = 0; i < 3000; i++) { const v = new THREE.Vector3(R() - .5, R() * .6, R() - .5).normalize().multiplyScalar(5000); sp.push(v.x, v.y, v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaab8d8, size: 1.3, sizeAttenuation: false })));
    // 地球: 南の地平線に半分かかる。視直径1.9度を、背景なので大きめに見せる
    const ER = 520, e = new THREE.Mesh(new THREE.SphereGeometry(ER, 96, 64), skyMat(0)); e.material.uniforms.uSun.value.copy(sun);
    e.position.set(-3600, -260, -3000); e.rotation.set(.4, 3.6, .2); sc.add(e);
    const h = skyHalo(ER); h.material.uniforms.uSun.value.copy(sun); h.position.copy(e.position); sc.add(h);
    // 岩の地面: ゆるい起伏と小さなクレーター
    const RB = 2600, G = new THREE.SphereGeometry(RB, 720, 220, 0, Math.PI * 2, 0, .62);
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
    const pier = new THREE.Group(); sc.add(pier);
    const beam = (a, b, t, m) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B), g = new THREE.BoxGeometry(t, t, L), x = new THREE.Mesh(g, m);
      x.position.copy(A).add(B).multiplyScalar(.5); x.lookAt(B); x.castShadow = x.receiveShadow = true; pier.add(x); return x; };
    // 柱: 縦穴から真上へ高く伸びる太い柱（機材と人の往復用）。段ごとに四方へ桟橋が出て、艦は艦首を柱へ向けて水平に着く
    // 本柱（機材と人の往復用）。COL で形を選ぶ。a: 円柱と帯 / b: 骨組みの塔の中に昇降筒 / c: 太細の筒を積んだ節 / d: 3本の柱をひねり合わせる
    const TOP = 480, CR = 8.5;
    const colM = new THREE.MeshStandardMaterial({ color: 0x737a85, metalness: .55, roughness: .5 }), litM = new THREE.MeshBasicMaterial({ color: 0xffd08a });
    const add = (m, y) => { m.position.y = y; m.castShadow = m.receiveShadow = true; pier.add(m); return m; };
    if (COL === 'a') { add(new THREE.Mesh(new THREE.CylinderGeometry(CR, CR * 1.25, TOP + 12, 16), colM), TOP / 2 - 6);
      for (let y = 10; y < TOP; y += 22) add(new THREE.Mesh(new THREE.CylinderGeometry(CR + .9, CR + .9, 1.6, 16), dark), y); }
    else if (COL === 'b') { // 八角の骨組み。中に細い昇降筒（灯りの窓が並ぶ）
      add(new THREE.Mesh(new THREE.CylinderGeometry(CR * .45, CR * .45, TOP + 12, 12), colM), TOP / 2 - 6);
      const pts = [...Array(8)].map((_, k) => [Math.cos(k * Math.PI / 4) * CR, Math.sin(k * Math.PI / 4) * CR]);
      pts.forEach(([x, z]) => beam([x, -10, z], [x, TOP, z], 1.1, steel));
      for (let y = -6; y < TOP; y += 12) pts.forEach(([x, z], k) => { const [x2, z2] = pts[(k + 1) % 8]; beam([x, y, z], [x2, y, z2], .5, steel); beam([x, y, z], [x2, y + 12, z2], .35, dark); });
      for (let y = 5; y < TOP; y += 9) add(new THREE.Mesh(new THREE.BoxGeometry(CR * .95, 1.2, .6), litM), y).position.z = CR * .45; }
    else if (COL === 'c') { // 節: 太い筒（機材の階）と細い首を交互に。太い筒に窓の帯
      for (let y = -8, k = 0; y < TOP; k++) { const fat = k % 2 === 0, h = fat ? 26 : 10;
        add(new THREE.Mesh(new THREE.CylinderGeometry(fat ? CR : CR * .62, fat ? CR : CR * .62, h, fat ? 12 : 10), fat ? colM : dark), y + h / 2);
        if (fat) add(new THREE.Mesh(new THREE.CylinderGeometry(CR + .15, CR + .15, 1.2, 12), litM), y + h / 2); y += h; } }
    else if (COL === 'e') { // 上から見て × の角柱。腕のあいだの4つのくぼみに、畳んだ桟橋が収まる。芯に昇降筒、腕の面に灯りの窓
      const XA = 17, XT = 5.5;   // 腕の半分の長さと厚さ（ゲートの口 46×74 に、畳んだ桟橋ごと収まる）
      for (const r of [Math.PI / 4, -Math.PI / 4]) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(XA * 2, TOP + 12, XT), colM), TOP / 2 - 6); m.rotation.y = r;
        const tipA = new THREE.Mesh(new THREE.BoxGeometry(2.2, TOP + 12, XT + 1.4), dark); tipA.position.set(Math.cos(r) * XA, 0, -Math.sin(r) * XA); m.add(tipA); }
      for (let y = 10; y < TOP; y += 22) for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(XA * 2 + 2, 1.6, XT + 1), dark), y); b.rotation.y = r; }
      for (let y = 4; y < TOP; y += 7) for (const r of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) { const w = add(new THREE.Mesh(new THREE.BoxGeometry(5, .8, .3), litM), y);
        w.position.x = Math.cos(r) * XA * .6 + Math.sin(r) * (XT / 2 + .2) * 0; w.position.z = -Math.sin(r) * XA * .6; w.rotation.y = r; w.translateZ(XT / 2 + .2); } }
    else if (COL === 'f') { // B と E の間: 上から見て × の骨組み。真ん中に昇降筒（灯りの窓）。艦のいない桟橋は × の隙間に畳み込む
      const XA = 14, XT = 4, CORE = 5;
      add(new THREE.Mesh(new THREE.CylinderGeometry(CORE, CORE, TOP + 12, 12), colM), TOP / 2 - 6);
      for (let y = 3; y < TOP; y += 6) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const w = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, .9, .3), litM), y); w.position.x = Math.cos(a) * (CORE + .1); w.position.z = Math.sin(a) * (CORE + .1); w.rotation.y = -a + Math.PI / 2; }
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, ax = Math.cos(a), az = Math.sin(a), nx = -az, nz = ax;
        const P = (r, f, y) => [ax * r + nx * f * XT / 2, y, az * r + nz * f * XT / 2];
        for (const r of [CORE + .6, XA]) for (const f of [-1, 1]) beam(P(r, f, -10), P(r, f, TOP), r === XA ? 1.3 : .8, steel);
        for (let y = -6; y < TOP; y += 11) { for (const f of [-1, 1]) { beam(P(CORE + .6, f, y), P(XA, f, y), .55, steel); beam(P(CORE + .6, f, y), P(XA, f, y + 11), .4, dark); }
          beam(P(XA, -1, y), P(XA, 1, y), .55, steel); } }
      for (let y = 10; y < TOP; y += 44) for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(XA * 2 + 1.5, 1.4, XT + .8), dark), y); b.rotation.y = r; } }
    else { // 3本の柱をゆるくひねって組み、帯で束ねる。真ん中に昇降筒
      add(new THREE.Mesh(new THREE.CylinderGeometry(CR * .4, CR * .4, TOP + 12, 10), colM), TOP / 2 - 6);
      const tw = (y, k) => { const a = k * Math.PI * 2 / 3 + y * .006; return [Math.cos(a) * CR * .8, y, Math.sin(a) * CR * .8]; };
      for (let k = 0; k < 3; k++) for (let y = -10; y < TOP; y += 10) beam(tw(y, k), tw(y + 10, k), 2.6, colM);
      for (let y = 4; y < TOP; y += 26) add(new THREE.Mesh(new THREE.TorusGeometry(CR * .85, .9, 6, 18), dark), y).rotation.x = Math.PI / 2; }
    if (COL !== 'e' && COL !== 'f') add(new THREE.Mesh(new THREE.CylinderGeometry(CR * 1.6, CR * 1.1, 10, 16), dark), TOP + 4);
    const c = new THREE.Color(0x7fc8ff), ship = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, emissive: c, emissiveIntensity: .05, metalness: .5, roughness: .42 });
    const glow = [];
    // 段: [艦種, 高さ, 向きのずれ(度), 桟橋の数, 形]
    //   big: 大型艦。1段に2本だけ（向かい合わせ）、段ごとに向きを90度ずらし、上下の段の艦と重ならず、横へ離れる道をふさがない
    //   tree: 小型艦。桟橋から上下へ縦の枝を出し、枝の横に艦首を柱へ向けて止める。離れるときは横（桟橋と直角）へ
    const levels = [['bb', 70, 0, 2, 'big'], ['cvb', 140, 90, 2, 'big'], ['cl', 230, COL >= 'e' ? 0 : 45, 4, 'tree'], ['dd', 330, 0, 4, 'tree'], ['ff', 420, COL >= 'e' ? 0 : 45, 4, 'tree']];
    const tubeM = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: .4, roughness: .5 }), hingeM = GM.hinge;
    const SZ = { bb: 22, cl: 13, cvb: 21, dd: 10, ff: 8 };
    const hinge = (x, y, z, r, h, axis) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), hingeM); g.position.set(x, y, z); if (axis === 'h') g.rotation.z = Math.PI / 2; g.castShadow = true; pier.add(g); return g; };
    // 折り畳める桟橋: 柱の付け根に太いヒンジ（柱に沿って上へ畳む）、節のつなぎ目に小さいヒンジ
    const foldArm = (A, ux, uz, len, y, w) => { const seg = 20, n = Math.max(1, Math.round(len / seg)), sl = len / n;
      const root = hinge(ux * (A + 1), y, uz * (A + 1), w * .7, w * 2.2, 'v'); root.rotation.set(0, 0, 0); root.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0); root.rotation.x = Math.PI / 2; root.rotation.y = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) { const r0 = A + i * sl + 1.2, r1 = A + (i + 1) * sl - 1.2;
        beam([ux * r0, y, uz * r0], [ux * r1, y, uz * r1], w, steel); beam([ux * r0, y - 3.2, uz * r0], [ux * r1, y - 3.2, uz * r1], .7, dark);
        beam([ux * r0, y - 3.2, uz * r0], [ux * (r0 + r1) / 2, y, uz * (r0 + r1) / 2], .45, dark); beam([ux * (r0 + r1) / 2, y, uz * (r0 + r1) / 2], [ux * r1, y - 3.2, uz * r1], .45, dark);
        if (i < n - 1) hinge(ux * (A + (i + 1) * sl), y - 1, uz * (A + (i + 1) * sl), w * .42, w + 3.6, 'v'); }
      return A + len; };
    // 艦を止める: 位置 c（中心）、艦首の向き face、乗り込みの橋は from（桟橋側の点の列）から
    const putShip = (t, c, face, bridges) => { const S = SZ[t], m = new THREE.Mesh(shapeGeo(t), ship); m.scale.setScalar(S); m.position.set(...c); m.rotation.y = Math.atan2(face[0], face[1]);
      m.castShadow = m.receiveShadow = true; sc.add(m); bridges.forEach(([A, B]) => { beam(A, B, Math.max(2, S * .16), tubeM); glow.push([A[0], A[1] + 1.8, A[2]]); }); };
    // 畳んだ桟橋: 柱の付け根のヒンジから、節を折り重ねて柱に沿わせる（アコーディオンのように）
    const F0 = COL === 'e' ? 3.5 : COL === 'f' ? 6.2 : CR + 1.5, folded = (ux, uz, y, len, w) => { const n = Math.max(1, Math.round(len / 20)); hinge(ux * (F0 - .5), y, uz * (F0 - .5), w * .7, w * 2.2, 'h').rotation.y = Math.atan2(ux, uz);
      for (let i = 0; i < n; i++) { const two = COL === 'f', r = F0 + w * .6 + (two ? i >> 1 : i) * (w + .6), sx = two ? ((i & 1) - .5) * (w + .5) : 0, px = ux * r - uz * sx, pz = uz * r + ux * sx; beam([px, y + 1, pz], [px, y + 19, pz], w, steel); } };
    // 畳んだ枝: 桟橋の上に寝かせる
    const foldedBranch = (bx, bz, ux, uz, y, len) => { beam([bx + ux * 2, y + 2.6, bz + uz * 2], [bx + ux * (2 + len * .5), y + 2.6, bz + uz * (2 + len * .5)], 2, steel); beam([bx - ux * 2, y + 2.6, bz - uz * 2], [bx - ux * (2 + len * .5), y + 2.6, bz - uz * (2 + len * .5)], 2, steel); };
    levels.forEach(([t, y, d0, np, kind], li) => { const S = SZ[t], half = S * 1.4, L0 = COL === 'e' ? 3 : COL === 'f' ? 5.6 : CR + 2; let left = FILL ? FILL[li] : 1e9;
      if (COL !== 'e' && COL !== 'f') { const deck = new THREE.Mesh(new THREE.CylinderGeometry(CR + 5, CR + 5, 2.4, 16), dark); deck.position.y = y; deck.castShadow = true; pier.add(deck); }
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
            for (const d of [H, H2]) { if (left-- <= 0) continue; const [cx, cy, cz] = at(dir, d), gap = S * .45 + 8;
              putShip(t, [cx + vx * sd * gap, cy - S * .08, cz + vz * sd * gap], inward, [-.3, .3].map(f => { const ox = ux * f * half, oz = uz * f * half; return [[cx + ox + vx * sd * 1.6, cy, cz + oz + vz * sd * 1.6], [cx + ox + vx * sd * (gap - S * .2), cy, cz + oz + vz * sd * (gap - S * .2)]]; })); }
            glow.push(at(dir, H2 + 6)); } }
        glow.push([ux * end, y + 2.8, uz * end]); } });
    // 埠頭の灯り
    for (let y = 10; y < TOP; y += 22) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; glow.push([Math.cos(a) * (CR + 1.2), y + 1.2, Math.sin(a) * (CR + 1.2)]); } glow.push([0, TOP + 10, 0]);
    const gp = new Float32Array(glow.length * 3); glow.forEach((v, i) => gp.set(v, i * 3)); const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    sc.add(new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xffd08a, size: 4, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    // カメラ: 低く、岩の上から埠頭の伸びる先と南の地球を見る
    if (VIEW === 'c') { cam.position.set(70, 280, 95); cam.lookAt(0, 300, 0); } else if (VIEW === 'a') { cam.position.set(820, 330, 760); cam.lookAt(-140, 190, -60); }
    else { cam.position.set(230, 345, 250); cam.lookAt(10, 262, 0); }
    if (VIEW === 't') { const oc = new THREE.OrthographicCamera(-80 * W / H, 80 * W / H, 80, -80, 1, 3000); oc.position.set(0, 1500, 0); oc.up.set(0, 0, -1); oc.lookAt(0, 0, 0);
      const o = gScl(GATE_P, 6).map(([x, z]) => new THREE.Vector3(x, 600, z)); const ln = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(o), new THREE.LineBasicMaterial({ color: 0xffb347 })); sc.add(ln);
      r.render(sc, oc); return r.domElement.toDataURL('image/png'); }
    r.render(sc, cam); return r.domElement.toDataURL('image/png');
  }, [OPEN, VIEW, FILL, COL]);
  require('fs').writeFileSync(process.argv[3], Buffer.from(url.split(',')[1], 'base64'));
  if (errors.length) console.log(errors); await browser.close();
})();
