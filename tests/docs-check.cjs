/* War of Space: checks the docs stay tidy (used by /tidy-docs). Run: npm run check-docs
   - CLAUDE.md is read on every turn, so it must stay small
   - every file path written in backticks in the docs must exist
   - old names that were replaced must not come back */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DOCS = ['CLAUDE.md', 'README.md', ...fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => 'docs/' + f),
  '.claude/agents/wos-dev.md', ...fs.readdirSync(path.join(ROOT, '.claude/skills')).map(d => `.claude/skills/${d}/SKILL.md`)];
const CLAUDE_MAX = 7000;   // bytes
/* names replaced by user decisions: [old, allowed only on lines that also contain this] */
const OLD_NAMES = [['M.A.S.', '使わない'], ['蒼環同盟', '差し替え'], ['緋星帝国', '差し替え'], ['交戦/回避', 'から']];
let bad = 0;
const fail = m => { bad++; console.log('✗ ' + m); };

const size = fs.statSync(path.join(ROOT, 'CLAUDE.md')).size;
if (size > CLAUDE_MAX) fail(`CLAUDE.md が大きすぎる: ${size} バイト（上限 ${CLAUDE_MAX}）。詳しい内容は docs/ へ移す`);
else console.log(`✓ CLAUDE.md ${size} バイト（上限 ${CLAUDE_MAX}）`);

for (const f of DOCS) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) { fail(`${f} がない`); continue; }
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [, ref] of line.matchAll(/`([\w./-]+\.(?:md|js|cjs|css|html|json|yml))`/g)) {
      if (ref.includes('*') || /[a-z][NM]\./.test(ref) || ref.startsWith('node_modules')) continue;
      const rel = ref.startsWith(ROOT + '/') ? ref.slice(ROOT.length + 1) : ref;
      const cands = [rel, 'docs/' + rel, 'battle/' + rel, 'data/' + rel, 'tests/' + rel];
      if (!cands.some(c => fs.existsSync(path.join(ROOT, c)))) fail(`${f}:${i + 1} のファイル \`${ref}\` が見つからない`);
    }
    for (const [old, ok] of OLD_NAMES) if (line.includes(old) && !line.includes(ok)) fail(`${f}:${i + 1} に古い名前「${old}」`);
  });
}
console.log(bad ? `\n${bad} 件の問題があります。` : '\n資料の確認に通りました。');
process.exit(bad ? 1 : 0);
