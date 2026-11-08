/* 地上戦のコマンドバーのアイコン（2026-11-08、Claude のデザイン。線だけの版）。普通の <script> で読むと window.WOS_COMMAND_ICONS に入る。
   使い方: button.innerHTML = WOS_COMMAND_ICONS.board.svg;
   大きさ: すべて viewBox 64×40（横長）。実寸は 64×40 px か 48×30 px。CSS で svg の width / height を決める。
   色: 線は currentColor（ボタンの color を継ぐ）。「その命令の動作」を表す線だけ --cmd-accent（既定は真鍮色 #e2c58a）。
   形: 細めの線だけで描き、線の端と角は丸めない。塗りは使わない。重なる物は後ろの線を途中で止めて表す（背景色で隠さないので、半透明のバーの上でも崩れない）。
   展開（expand）は、開いたとき CSS で transform: rotate(180deg) にする。 */
(() => {
  const a = 'style="stroke:var(--cmd-accent,#e2c58a)"';
  const wrap = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="8" role="img" aria-label="${title}">${body}</svg>`;

  /* 装甲兵員輸送車（右向き、横長）。搭乗と降車で共通 */
  const apc = `
    <path d="M9.7 31.5L5 26l6-7h29l19 7-4.7 5.5M29.1 31.5h4.8"/>
    <path d="M11 26h48" stroke-width="1.2"/>
    <path d="M26 19l3-4.5h9l2.5 4.5"/><path d="M38.5 16.5l16-3.5"/>
    <circle cx="14" cy="33.2" r="4.6"/><circle cx="24.5" cy="33.2" r="4.6"/><circle cx="38.5" cy="33.2" r="4.6"/><circle cx="49" cy="33.2" r="4.6"/>
    <g stroke-width="1.2"><circle cx="14" cy="33.2" r="1.3"/><circle cx="24.5" cy="33.2" r="1.3"/><circle cx="38.5" cy="33.2" r="1.3"/><circle cx="49" cy="33.2" r="1.3"/></g>`;

  const icons = {
    move: ['共有', '移動', '指定した地点へ移動', `
      <path d="M9 20h42"/>
      <path ${a} d="M42 10l12 10-12 10"/>`],

    deploy: ['共有', '布陣', '引いた線に沿って部隊を並べる', `
      <path d="M10.59 4.03C13.79 -0.7 11.84 5.98 11.02 12.4C10.2 18.83 10.38 25.1 12.92 27.19C15.47 29.27 20.24 27.26 25.78 23.34C31.31 19.43 37.46 13.69 41.98 13.11C46.49 12.54 49.23 17.21 49.22 37.5"/>
      <path ${a} d="M11.5 9.1L16.4 9.9M10.5 19.7L15.5 19.6M15.3 28.1L15.6 23.1M25.0 23.9L22.2 19.8M33.6 17.5L30.6 13.5M43.1 13.1L43.5 8.1M48.3 21.6L53.2 20.7M49.2 32.2L54.2 32.1"/>`],

    plan: ['共有', '進撃計画', '現在の位置から指定した線まで進む計画を作る', `
      <path d="M9 5v30"/>
      <path d="M17 13h26M37.5 8.5l5.5 4.5-5.5 4.5"/><path d="M17 27h26M37.5 22.5l5.5 4.5-5.5 4.5"/>
      <path ${a} stroke-dasharray="5 4.5" d="M54 4v32"/>`],

    execute: ['共有', '実行', '作成した計画を開始', `
      <path ${a} d="M22 6l27 14-27 14z"/>`],

    hold: ['共有', '停止・防衛', '行動を止め、その場で防衛', `
      <path ${a} stroke-width="3" d="M28 7v15M36 7v15"/>
      <path d="M4 13h12l7 24h18l7-24h12"/>`],

    board: ['固有', '搭乗', '輸送車などに搭乗', `${apc}
      <path ${a} d="M16 1v14M10.5 10l5.5 5.5 5.5-5.5"/>`],

    unload: ['固有', '降車', '搭乗中の部隊を降ろす', `${apc}
      <path ${a} d="M14 15.5V2.5M8.5 8l5.5-5.5L19.5 8"/>`],

    land: ['固有', '上陸', '艦船から部隊を上陸させる', `
      <path d="M3 21h34l7-2.5-3 8.5H8z"/>
      <path d="M12 21l3-6h8l3.5 6"/><path d="M18 15V9"/>
      <path d="M41.8 25.5l17.5-1.7"/>
      <path ${a} d="M38 38l22.5-15"/>`],

    strike: ['固有', '地点砲撃', '範囲と回数を指定して砲撃', `
      <circle cx="32" cy="20" r="12.5"/>
      <path d="M32 2v10M32 28v10M14 20h10M40 20h10"/>
      <circle ${a} cx="32" cy="20" r="1.8"/>`],

    bridge: ['固有', '架橋', '工兵が川に橋を架ける', `
      <g ${a} transform="translate(-10 0)"><path d="M29.6 28H24v7"/><path d="M43 28h5v7"/><path d="M50 28h11v7H50z"/><path d="M32.5 19h-2v7h3.7"/><path d="M35.5 19h6v5"/><path d="M43.5 19h11v7h-11z"/><path d="M37 10h11v7H37z"/></g>
      <g transform="translate(28 35) rotate(-14)"><path d="M-4-31h8M0-31V-9"/><path d="M-5-1.2V-9H5V1.2"/></g>
      <path d="M3 35h59"/>`],

    supply: ['固有', '補給', '補給部隊から他部隊へ補給', `
      <path d="M11 26h42v11H11z"/>
      <path d="M21 29h18c3 0 5.5 1.3 7 2.5-1.5 1.2-4 2.5-7 2.5H21z"/>
      <path d="M15 26V12.5L19.5 8H30v5"/><path d="M21.5 8V5h5v3"/><path d="M19.5 14l4.5 8"/>
      <path d="M27 14h20v12H27z"/><path d="M33 14v-3.5h8V14"/>
      <path ${a} d="M37 16.5v7M33.5 20h7"/>`],

    expand: ['固有', '展開', '固有命令が多いときに表示を広げる', `
      <path d="M19 26l13-12 13 12"/>`],
  };

  window.WOS_COMMAND_ICONS = Object.fromEntries(Object.entries(icons).map(([id, [group, label, desc, body]]) =>
    [id, { id, group, label, desc, svg: wrap(label, body) }]));
})();
