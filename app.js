'use strict';
/* ---------- Supabase (REST โดยตรง ไม่ต้องใช้ไลบรารี) ---------- */
const CFG = window.MONSNATCH_CONFIG || {};
const SB_URL = String(CFG.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_ON = !!(SB_URL && CFG.SUPABASE_ANON_KEY);
function sb(path, opt){
  opt = opt || {};
  const h = Object.assign({apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json'}, opt.headers || {});
  return fetch(SB_URL + '/rest/v1/' + path, Object.assign({}, opt, {headers: h}));
}
async function sbError(r){
  let m = '';
  try { const j = await r.json(); m = j.message || j.hint || ''; } catch (e) {}
  return m || ('HTTP ' + r.status);
}
const mapRow = r => ({c:r.code, n:r.name, e:r.element, p:r.power, s:r.stars, d:r.sight || [], b:r.beats || [], a:r.ability || '', t:r.ability_th || '', r:r.rarity, tr:r.traits || [], im:r.image_url || '', th:r.thumb_url || r.image_url || ''});
async function loadData(){
  let st; try { st = await fetch('cards.json').then(r => { if (!r.ok) throw 0; return r.json(); }); } catch (e) { st = await fetch('data/cards.json').then(r => r.json()); }
  st.source = 'static';
  if (SB_ON) {
    try {
      const r = await sb('cards?select=code,name,element,power,stars,rarity,sight,beats,ability,ability_th,traits,image_url,thumb_url&order=code');
      if (r.ok) { const rows = await r.json(); if (Array.isArray(rows) && rows.length >= 100) { st.cards = rows.map(mapRow); st.source = 'supabase'; } }
    } catch (e) {}
  }
  return st;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

(async function(){
const DATA = await loadData();
const C = DATA.cards, BY = {};
C.forEach(c => BY[c.c] = c);
const EL = ['fire','water','earth','air','thunder','ice','nature','poison','metal','spirit','light','dark'];
const ELN = {fire:['Fire','ไฟ'],water:['Water','น้ำ'],earth:['Earth','ดิน'],air:['Air','ลม'],thunder:['Thunder','สายฟ้า'],ice:['Ice','น้ำแข็ง'],nature:['Nature','ธรรมชาติ'],poison:['Poison','พิษ'],metal:['Metal','โลหะ'],spirit:['Spirit','วิญญาณ'],light:['Light','แสง'],dark:['Dark','มืด'],origin:['Origin','ออริจิน']};
const L2E = {E:'earth',W:'water',A:'air',F:'fire',T:'thunder',I:'ice',N:'nature',P:'poison',M:'metal',S:'spirit',L:'light',D:'dark'};
const E2L = {}; Object.keys(L2E).forEach(k => E2L[L2E[k]] = k);
const MAXSTAR = 25, DECKSIZE = 10, BENCH = 117;
const PRESET = {
  ice: ['1161','1135','1122','1132','1144','1073','1085','1095','1116','1004'],
  fire: ['1157','1130','1136','1134','1138','1075','1079','1087','1113','1022']
};
const BB = {}; EL.forEach(e => BB[e] = []);
const ELBEATS = {};
C.forEach(c => { if (c.b.length && !ELBEATS[c.e]) ELBEATS[c.e] = c.b; });
EL.forEach(e => (ELBEATS[e] || []).forEach(t => BB[t].push(e)));

const norm = s => (s || '').replace(/[‘’]/g, "'");
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const $ = id => document.getElementById(id);

function abScore(a){
  if (!a) return 0;
  let l = norm(a).toLowerCase(), s = 0;
  const nb = l.replace(/can't snatch again/g, '');
  if (l.includes('can snatch momon with power equal') || l.includes('original power 8 or more')) s += 1.5;
  else if (/(may|can) snatch|snatch up to|snatch every|snatch target/.test(l) && !nb.includes("can't snatch")) s += 1.2;
  if (/up to 2|every momon/.test(l)) s += .5;
  if (l.includes('ward') && !l.includes('lose ward')) s += 1;
  if (l.includes("can't be snatched")) s += 1;
  if (l.includes('incite')) s += .6;
  if (l.includes('swap') || l.includes('move')) s += .2;
  if (l.includes("opponent's hand") || l.includes('opponent chooses')) s += .5;
  if (l.includes('put 1 card from your hand') && !l.includes('reveal')) s -= .2;
  if (l.includes('reveal')) s -= .3;
  if (l.includes('power -1')) s += 1;
  return s;
}
function roleOf(c){
  const a = norm(c.a).toLowerCase(), r = [];
  if (/(may|can) snatch|snatch up to|snatch every|snatch momon/.test(a) && !/can't snatch until/.test(a)) r.push('reach');
  if (/ward|can't be snatched/.test(a) && !/lose ward/.test(a)) r.push('guard');
  if (/swap|move|incite|opponent's hand|opponent chooses|power -1/.test(a)) r.push('ctrl');
  if (!c.a && c.p >= 8) r.push('anchor');
  if (!r.length) r.push('base');
  return r;
}
C.forEach(c => { c.sc = c.p + (c.p >= 9 ? 1 : c.p === 8 ? .5 : 0) + .8 * Math.min(c.d.length, 5) + abScore(c.a); c.roles = roleOf(c); c.eff = c.p / c.s; });
const isVuln = (c, e) => c.e === 'origin' || (BB[c.e] || []).includes(e);

/* ---------- state ---------- */
const S = {deck:PRESET.ice.slice(), pane:'deck', tab:'overview', q:'', fEl:'all', fStar:'all', sort:'score', view:'list', open:{}, opp:null, oppTouched:false};
try {
  const raw = localStorage.getItem('msdb-v2');
  if (raw) {
    const j = JSON.parse(raw);
    if (Array.isArray(j.deck)) S.deck = j.deck.filter(x => BY[x]).slice(0, DECKSIZE);
  }
} catch (e) {}
try { const v = localStorage.getItem('msdb-view'); if (v === 'grid' || v === 'list') S.view = v; } catch (e) {}
function save(){ try { localStorage.setItem('msdb-v2', JSON.stringify({deck:S.deck})); } catch (e) {} }
let toastT;
function toast(m){ const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 1800); }

/* ---------- pieces ---------- */
const elChip = (e, short) => `<span class="el" style="--c:var(--el-${e})" title="${ELN[e][1]}"><i></i>${short ? ELN[e][0].slice(0,3) : ELN[e][0]}</span>`;
function abHtml(s){
  return esc(s).replace(/\[([EWAFTINPMSLD])\]/g, (m, L) => `<span class="tk" style="--c:var(--el-${L2E[L]})" title="${ELN[L2E[L]][0]}">${L}</span>`);
}
const DIRS = ['fl','f','fr','l','c','r','bl','b','br'];
const DIRN = {fl:'หน้าซ้าย',f:'หน้า',fr:'หน้าขวา',l:'ซ้าย',r:'ขวา',bl:'หลังซ้าย',b:'หลัง',br:'หลังขวา'};
function compass(d){
  return `<span class="compass" role="img" aria-label="ทิศ Snatch Sight: ${d.map(x => DIRN[x]).join(', ')}">` + DIRS.map(k => k === 'c' ? '<b class="c"></b>' : `<b class="${d.includes(k) ? 'on' : ''}"></b>`).join('') + '</span>';
}
function stats(deck){ return deck.reduce((a, x) => a + BY[x].s, 0); }
function thumb(c, big){
  const src = c.th || c.im;
  const inner = `<span class="ph" aria-hidden="true">${esc(c.n.slice(0, 1))}</span>` + (src ? `<img src="${esc(src)}" alt="การ์ด ${esc(c.n)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '');
  return `<span class="thumb ${big ? 'big' : ''}" style="--c:var(--el-${c.e})" data-act="zoom" data-code="${c.c}" role="button" tabindex="0" aria-label="ดูรูปใหญ่ ${esc(c.n)}">${inner}</span>`;
}

function quick(codes){
  const cards = codes.map(x => BY[x]);
  let cov = 0, weak = 0;
  EL.forEach(e => {
    let a = 0, v = 0;
    cards.forEach(c => { if (c.b.includes(e)) a++; if (isVuln(c, e)) v++; });
    if (a > 0) cov++;
    if (v > a) weak += v - a;
  });
  return {rating: cards.reduce((t, c) => t + c.sc, 0) + .4 * cov, weak};
}

function analyze(codes){
  const cards = codes.map(x => BY[x]).filter(Boolean);
  const n = cards.length, stars = cards.reduce((a, c) => a + c.s, 0);
  const atk = {}, vuln = {}, net = {};
  EL.forEach(e => { atk[e] = cards.filter(c => c.b.includes(e)); vuln[e] = cards.filter(c => isVuln(c, e)); net[e] = atk[e].length - vuln[e].length; });
  const cov = EL.filter(e => atk[e].length), loseTo = EL.filter(e => vuln[e].length);
  const wins = EL.filter(e => net[e] > 0), even = EL.filter(e => net[e] === 0), loss = EL.filter(e => net[e] < 0);
  const weak = EL.reduce((a, e) => a + Math.max(0, vuln[e].length - atk[e].length), 0);
  const rating = cards.reduce((a, c) => a + c.sc, 0) + .4 * cov.length;
  const avgP = n ? cards.reduce((a, c) => a + c.p, 0) / n : 0;
  const avgS = n ? cards.reduce((a, c) => a + c.d.length, 0) / n : 0;
  const dir = {}; DIRS.forEach(k => dir[k] = 0); cards.forEach(c => c.d.forEach(k => dir[k]++));
  const hist = {}; for (let p = 1; p <= 9; p++) hist[p] = 0; cards.forEach(c => hist[c.p]++);
  const ecount = {}; cards.forEach(c => ecount[c.e] = (ecount[c.e] || 0) + 1);
  return {cards, n, stars, atk, vuln, net, cov, loseTo, wins, even, loss, weak, rating, avgP, avgS, dir, hist, ecount};
}
function synergy(A){
  const out = [], els = {};
  A.cards.forEach(c => els[c.e] = (els[c.e] || 0) + 1);
  A.cards.forEach(c => {
    const a = norm(c.a);
    let m;
    const rv = a.match(/reveal 1 \[([A-Z])\] momon from your hand/i);
    if (rv) {
      const e = L2E[rv[1]], have = (els[e] || 0) - (c.e === e ? 1 : 0);
      out.push({c, ok: have > 0, txt: `${c.n} ต้องเปิดการ์ดธาตุ ${ELN[e][0]} จากมือเป็นต้นทุน ` + (have > 0 ? `(มี ${have} ใบใน Deck)` : '(ไม่มีใน Deck เลย ความสามารถใช้ไม่ได้)')});
    }
    const al = a.match(/ally \[([A-Z])\] momon/i);
    if (al) {
      const e = L2E[al[1]], have = (els[e] || 0) - (c.e === e ? 1 : 0);
      out.push({c, ok: have > 0, txt: `${c.n} ต้องมีพวกเดียวกันธาตุ ${ELN[e][0]} อีกใบบนกระดาน ` + (have > 0 ? `(มี ${have} ใบใน Deck)` : '(ไม่มีใน Deck)')});
    }
    if (/summon 1 \[S\] momon with 2 stars or less/i.test(a)) {
      const have = A.cards.filter(x => x !== c && x.e === 'spirit' && x.s <= 2).length;
      out.push({c, ok: have > 0, txt: `${c.n} ต้องมี Spirit ไม่เกิน 2 ดาวในมือ ` + (have > 0 ? `(มี ${have} ใบ)` : '(ไม่มีใน Deck)')});
    }
  });
  return out;
}
function mandatoryCosts(A){
  return A.cards.filter(c => { const a = norm(c.a); return (/on summon: put 1 card from your hand into your void/i.test(a)) || (/on summon: reveal 1 \[[A-Z]\] momon/i.test(a) && !/you may/i.test(a)); });
}
function suggest(){
  const cur = S.deck;
  const base = quick(cur), obj = o => o.rating - .35 * o.weak, b0 = obj(base), stars = stats(cur);
  const pool = C.filter(c => c.e !== 'origin' && !cur.includes(c.c));
  const res = [];
  if (cur.length < DECKSIZE) {
    pool.forEach(c => { if (stars + c.s <= MAXSTAR) { const q = quick(cur.concat(c.c)); res.push({add: c, d: obj(q) - b0, dr: q.rating - base.rating, dw: q.weak - base.weak}); } });
  } else {
    cur.forEach(o => pool.forEach(c => {
      if (stars - BY[o].s + c.s > MAXSTAR) return;
      const q = quick(cur.map(x => x === o ? c.c : x)), d = obj(q) - b0;
      if (d > .05) res.push({out: BY[o], add: c, d, dr: q.rating - base.rating, dw: q.weak - base.weak});
    }));
  }
  res.sort((a, b) => b.d - a.d);
  const per = {}, outList = [];
  res.forEach(r => { const k = r.out ? r.out.c : 'x' + outList.length; per[k] = (per[k] || 0) + 1; if (per[k] <= 2 && outList.length < 6) outList.push(r); });
  return outList;
}

/* ---------- แนะนำสลับการ์ด (static + จำลองด้วยเอนจินเกม) ---------- */
const SWAP = {sig:'', sim:null, running:false, tok:0, prog:0, lv:'normal', err:''};
const SIMLV = {fast:60, normal:120, deep:300};
const decksig = d => d.join(',');
function swapCands(){
  const cur = S.deck; if (cur.length < DECKSIZE) return [];
  const stars = stats(cur), b = quick(cur), obj = o => o.rating - .35 * o.weak, b0 = obj(b);
  const pool = C.filter(c => c.e !== 'origin' && !cur.includes(c.c)), res = [];
  cur.forEach(o => pool.forEach(c => {
    if (stars - BY[o].s + c.s > MAXSTAR) return;
    const nd = cur.map(x => x === o ? c.c : x), q = quick(nd);
    res.push({out: BY[o], add: c, d: obj(q) - b0, deck: nd});
  }));
  res.sort((a, b) => b.d - a.d);
  const per = {}, list = [];
  res.forEach(r => { per[r.out.c] = (per[r.out.c] || 0) + 1; if (per[r.out.c] <= 2) list.push(r); });
  return list.slice(0, 12);
}
function swapReasons(r){
  const A0 = analyze(S.deck), A1 = analyze(r.deck), o = r.out, c = r.add, out = [];
  const names = a => a.map(e => ELN[e][0]).join(', ');
  const fix = A0.loss.filter(e => !A1.loss.includes(e)); if (fix.length) out.push(['good', `แก้ธาตุที่เสียเปรียบ: ${names(fix)}`]);
  const cov = A1.cov.filter(e => !A0.cov.includes(e)); if (cov.length) out.push(['good', `ได้ตัวชนะธาตุใหม่: ${names(cov)}`]);
  const bad = A1.loss.filter(e => !A0.loss.includes(e)); if (bad.length) out.push(['warn', `เสียเปรียบธาตุเพิ่ม: ${names(bad)}`]);
  if (c.p !== o.p) out.push([c.p > o.p ? 'good' : 'warn', `พลัง ${o.p} → ${c.p}`]);
  if (c.d.length !== o.d.length) out.push([c.d.length > o.d.length ? 'good' : 'warn', `ทิศ Snatch ${o.d.length} → ${c.d.length}`]);
  ['guard', 'reach'].forEach(k => { if (c.roles.includes(k) && !o.roles.includes(k)) out.push(['good', k === 'guard' ? 'เพิ่มตัวป้องกัน (Ward/กันถูกแย่ง)' : 'เพิ่มตัวรุกพิเศษ']); if (!c.roles.includes(k) && o.roles.includes(k)) out.push(['warn', k === 'guard' ? 'เสียตัวป้องกัน' : 'เสียตัวรุกพิเศษ']); });
  const ds = c.s - o.s; out.push(['info', ds < 0 ? `ประหยัด ${-ds}★` : ds > 0 ? `ใช้ดาวเพิ่ม ${ds}★` : 'ดาวเท่าเดิม']);
  const u0 = synergy(A0).filter(x => !x.ok).map(x => x.c.c), u1 = synergy(A1).filter(x => !x.ok);
  u1.filter(x => !u0.includes(x.c.c)).forEach(x => out.push(['warn', `${x.c.n} ใช้ความสามารถไม่ได้ (ขาดต้นทุนใน Deck)`]));
  const fixed = u0.filter(id => !u1.some(x => x.c.c === id)); if (fixed.length) out.push(['good', 'ความสามารถที่เคยใช้ไม่ได้ กลับมาใช้ได้']);
  return out.slice(0, 5);
}
/* gauntlet ฝั่งตรงข้ามคงที่ (seed คงที่) เพื่อให้เทียบก่อน/หลังได้แฟร์ */
function gauntlet(){
  const out = [PRESET.ice.slice(), PRESET.fire.slice()]; let s = 20240611;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const pool = C.filter(c => c.e !== 'origin');
  while (out.length < 8) {
    const p = pool.slice().sort(() => rnd() - .5), d = [], nm = new Set(); let st = 0;
    for (const c of p) { if (nm.has(c.n) || st + c.s > MAXSTAR) continue; d.push(c.c); nm.add(c.n); st += c.s; if (d.length === DECKSIZE) break; }
    if (d.length === DECKSIZE) out.push(d);
  }
  return out;
}
function playOne(E, mine, opp, i, opps){
  const seat = i & 1, start = (i >> 1) & 1, decks = seat === 0 ? [mine, opp] : [opp, mine];
  const st = E.newGame({decks: decks.map(x => x.slice()), start, seed: 7000 + i * 7919, rules: {elem: true}});
  let g = 0; const ch = E.autoChooser('normal');
  while (!st.over && g++ < 40) { const mv = E.botMove(st, 'normal'); if (!mv) break; E.apply(st, mv, ch); }
  return st.over ? (st.res.w === seat ? 1 : 0) : 0.5;
}
async function runSim(){
  const E = window.MSE; if (!E) { SWAP.err = 'ยังโหลดเอนจินเกมไม่เสร็จ ลองใหม่อีกครั้ง'; return renderTabs(); }
  if (S.deck.length < DECKSIZE) return;
  const tok = ++SWAP.tok, n = SIMLV[SWAP.lv] || 120, cands = swapCands(), opps = gauntlet();
  const variants = [{key:'base', deck:S.deck.slice()}].concat(cands.map(r => ({key:r.out.c + '>' + r.add.c, deck:r.deck})));
  E.init(C); SWAP.running = true; SWAP.err = ''; SWAP.prog = 0; SWAP.sim = null; SWAP.sig = decksig(S.deck); renderTabs();
  const total = variants.length * n, res = {}; let done = 0, t0 = performance.now();
  variants.forEach(v => res[v.key] = new Array(n));
  try {
    for (let i = 0; i < n; i++) {
      for (const v of variants) {
        res[v.key][i] = playOne(E, v.deck, opps[i % opps.length], i, opps); done++;
        if (performance.now() - t0 > 14) {
          await new Promise(r => setTimeout(r, 0)); t0 = performance.now();
          if (tok !== SWAP.tok || SWAP.sig !== decksig(S.deck)) return;
          SWAP.prog = done / total; const el = $('simProg'); if (el) { el.style.width = (SWAP.prog * 100).toFixed(0) + '%'; $('simTxt').textContent = `กำลังจำลอง ${Math.round(SWAP.prog * 100)}%`; }
        }
      }
    }
  } catch (e) { SWAP.running = false; SWAP.err = 'จำลองไม่สำเร็จ: ' + e.message; return renderTabs(); }
  if (tok !== SWAP.tok) return;
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length, base = res.base, out = {};
  cands.forEach(r => {
    const k = r.out.c + '>' + r.add.c, a = res[k], diff = a.map((x, i) => x - base[i]), m = mean(diff);
    const sd = Math.sqrt(mean(diff.map(x => (x - m) * (x - m)))), z = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
    out[k] = {wr: mean(a), dm: m, z};
  });
  SWAP.sim = {n, base: mean(base), out, opps: opps.length}; SWAP.running = false; renderTabs();
}
function tabSwap(A){
  if (A.n < DECKSIZE) return `<div class="empty">เลือกการ์ดให้ครบ ${DECKSIZE} ใบก่อน แล้วระบบจะแนะนำว่าควรสลับใบไหนเป็นใบไหน<br><span class="muted">(ตอนนี้ ${A.n}/${DECKSIZE} ใบ)</span></div>`;
  if (SWAP.sig && SWAP.sig !== decksig(S.deck) && !SWAP.running) { SWAP.sim = null; SWAP.sig = ''; }
  const cands = swapCands(), sim = SWAP.sim && SWAP.sig === decksig(S.deck) ? SWAP.sim : null;
  let rows = cands.map(r => Object.assign({}, r, {k: r.out.c + '>' + r.add.c}));
  if (sim) { rows.forEach(r => { r.sim = sim.out[r.k]; }); rows.sort((a, b) => b.sim.dm - a.sim.dm); }
  const lab = s => s.z >= 2.6 ? ['good', 'ดีขึ้นชัดเจน'] : s.z >= 1.3 ? ['info', 'น่าจะดีขึ้น'] : s.z <= -2.6 ? ['bad', 'แย่ลง'] : s.z <= -1.3 ? ['warn', 'น่าจะแย่ลง'] : ['muted', 'ใกล้เคียงเดิม (ต่างไม่ชัด)'];
  const pct = x => Math.round(x * 100) + '%';
  const ctl = `<div class="simctl"><label class="fld">ความละเอียด<select id="simLv"><option value="fast" ${SWAP.lv === 'fast' ? 'selected' : ''}>เร็ว (${SIMLV.fast} เกม/ตัวเลือก)</option><option value="normal" ${SWAP.lv === 'normal' ? 'selected' : ''}>ปกติ (${SIMLV.normal})</option><option value="deep" ${SWAP.lv === 'deep' ? 'selected' : ''}>ละเอียด (${SIMLV.deep})</option></select></label>
    <button class="btn primary" data-act="simrun" ${SWAP.running ? 'disabled' : ''}>${sim ? '🔁 จำลองใหม่' : '🧪 จำลองแข่งเพื่อจัดอันดับ'}</button></div>
    ${SWAP.running ? `<div class="simbar" role="progressbar" aria-label="ความคืบหน้า"><i id="simProg" style="width:${Math.round(SWAP.prog * 100)}%"></i></div><p class="note" id="simTxt">กำลังจำลอง…</p>` : ''}
    ${SWAP.err ? `<p class="note" style="color:var(--bad)">${esc(SWAP.err)}</p>` : ''}`;
  const head = sim ? `<div class="kpis"><div class="kpi"><div class="k">Deck ปัจจุบัน (จำลอง)</div><div class="v">${pct(sim.base)}<small> ชนะ จาก ${sim.n} เกม</small></div></div><div class="kpi"><div class="k">คู่ต่อสู้ทดสอบ</div><div class="v">${sim.opps}<small> ชุด สลับฝั่ง/ผู้เริ่ม</small></div></div></div>` : '';
  if (!rows.length) return `<div class="sec" style="margin-top:0"><h3>แนะนำสลับการ์ด</h3><div class="empty">ไม่พบการสลับที่ดีกว่าเดิมภายใต้กติกา (10 ใบ ≤ ${MAXSTAR} ดาว) Deck นี้ค่อนข้างลงตัวแล้ว</div></div>`;
  return `<div class="sec" style="margin-top:0"><h3>แนะนำสลับการ์ด</h3>
    <p class="note">ลองสลับทีละ 1 ใบ (ครบ 10 ใบ ≤ ${MAXSTAR} ดาว ชื่อไม่ซ้ำ) เรียงตามคะแนนประเมิน กด "จำลองแข่ง" ให้บอทเล่นเทียบ Deck เดิมกับ Deck ที่สลับ เพื่อดู % ชนะ <b>(เป็นค่าประมาณจากบอท ตัวบนสุดมักดูดีเกินจริงเล็กน้อย — เลือก "ละเอียด" เพื่อความมั่นใจ)</b></p>
    ${ctl}${head}
    <div class="mt" style="margin-top:10px">${rows.map(r => {
      const rs = swapReasons(r), s = r.sim, L = s ? lab(s) : null;
      return `<div class="swap2"><div class="sw-top"><div class="sw-pair">เอา ${pcard(r.out)} <span class="arrow">→</span> ใส่ ${pcard(r.add)}</div>
        <button class="btn primary" data-act="apply" data-out="${r.out.c}" data-in="${r.add.c}">สลับเลย</button></div>
        ${s ? `<div class="sw-sim ${L[0]}"><b>${pct(s.wr)}</b> ชนะ <span class="muted">(${s.dm >= 0 ? '+' : ''}${(s.dm * 100).toFixed(0)} จุดจากเดิม)</span> · ${L[1]}</div>` : `<div class="sw-sim muted">คะแนนประเมิน ${r.d >= 0 ? '+' : ''}${r.d.toFixed(2)}</div>`}
        <ul class="chips">${rs.map(x => `<li class="${x[0]}">${esc(x[1])}</li>`).join('')}</ul></div>`;
    }).join('')}</div></div>`;
}

/* ---------- pool ---------- */
function reasonBlocked(c){
  const d = S.deck;
  if (d.length >= DECKSIZE) return 'Deck เต็ม 10 ใบแล้ว';
  if (stats(d) + c.s > MAXSTAR) return `เกิน ${MAXSTAR} ดาว (ตอนนี้ ${stats(d)} + ${c.s})`;
  return '';
}
function renderFilters(){
  $('fEl').innerHTML = `<button class="fchip" data-el="all" aria-pressed="${S.fEl === 'all'}">ทุกธาตุ</button>` + EL.concat(['origin']).map(e => `<button class="fchip" data-el="${e}" style="--c:var(--el-${e})" aria-pressed="${S.fEl === e}"><i></i>${ELN[e][0]}</button>`).join('');
  $('fStar').innerHTML = ['all',1,2,3,4,5].map(s => `<button class="fchip" data-star="${s}" aria-pressed="${String(S.fStar) === String(s)}">${s === 'all' ? 'ทุกดาว' : s + '★'}</button>`).join('');
}
function renderPool(){
  const d = S.deck, q = S.q.trim().toLowerCase();
  let list = C.filter(c => (S.fEl === 'all' || c.e === S.fEl) && (S.fStar === 'all' || c.s === +S.fStar) &&
    (!q || c.n.toLowerCase().includes(q) || c.a.toLowerCase().includes(q) || c.t.toLowerCase().includes(q) || c.c.includes(q)));
  const sorters = {score:(a, b) => b.sc - a.sc, eff:(a, b) => b.eff - a.eff || b.p - a.p, power:(a, b) => b.p - a.p || a.s - b.s, stars:(a, b) => a.s - b.s || b.p - a.p, sight:(a, b) => b.d.length - a.d.length || b.p - a.p, code:(a, b) => a.c.localeCompare(b.c)};
  list.sort(sorters[S.sort]);
  $('poolCount').textContent = `${list.length} / ${C.length} ใบ`;
  $('plist').className = 'plist' + (S.view === 'grid' ? ' pgrid' : '');
  document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
  if (S.view === 'grid') { $('plist').innerHTML = list.length ? list.map(c => {
    const inD = d.includes(c.c), why = inD ? '' : reasonBlocked(c), src = c.th || c.im;
    return `<div class="gtile ${inD ? 'in' : ''} ${why ? 'blk' : ''}" style="--c:var(--el-${c.e})">
      <button class="gimg" data-act="toggle" data-code="${c.c}" ${why ? 'disabled' : ''} aria-label="${inD ? 'เอาออก' : 'เพิ่ม'} ${esc(c.n)}" title="${esc(why || c.n)}"><span class="ph">${esc(c.n.slice(0, 1))}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}<b class="gp">${c.p}</b><b class="gs">${c.s}★</b>${inD ? '<b class="gok">✓</b>' : ''}</button>
      <div class="gn"><span>${esc(c.n)}</span><button class="gz" data-act="zoom" data-code="${c.c}" aria-label="ดูรูปใหญ่ ${esc(c.n)}">🔍</button></div></div>`;
  }).join('') : '<div class="empty">ไม่พบการ์ดที่ตรงเงื่อนไข</div>'; return; }
  $('plist').innerHTML = list.length ? list.map(c => {
    const inD = d.includes(c.c), why = inD ? '' : reasonBlocked(c), ex = S.open[c.c];
    return `<div class="row ${inD ? 'in' : ''}" data-code="${c.c}">
      <div class="rhead">
        <button class="add" data-act="toggle" data-code="${c.c}" ${why ? 'disabled' : ''} aria-label="${inD ? 'เอาออกจาก Deck' : 'เพิ่มเข้า Deck'} ${esc(c.n)}" title="${esc(why || (inD ? 'เอาออก' : 'เพิ่ม'))}">${inD ? '✓' : '+'}</button>
        ${thumb(c)}
        <button class="rname" data-act="open" data-code="${c.c}" aria-expanded="${!!ex}"><b>${esc(c.n)}</b><span class="line">${elChip(c.e)}${c.a ? '<span class="badge">มีความสามารถ</span>' : ''}</span></button>
        <span class="stat">${c.p}<small>พลัง</small></span>
        <span class="stat">${c.s}<small>ดาว</small></span>
        ${compass(c.d)}
      </div>
      ${ex ? `<div class="rdetail"><div class="mono muted" style="font-size:11.5px">#${c.c} · ${esc(c.tr.join(' / '))} · ${c.d.length} ทิศ · พลัง/ดาว ${(c.p / c.s).toFixed(1)}</div>${c.a ? `<div>${abHtml(c.t || c.a)}</div><div class="muted" style="font-size:12px">${abHtml(c.a)}</div>` : '<div class="muted">ไม่มีความสามารถพิเศษ</div>'}${c.b.length ? `<div class="line" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center"><span class="muted">ชนะธาตุ:</span>${c.b.map(e => elChip(e)).join('')}</div>` : '<div class="muted">ธาตุ Origin: ไม่ได้เปรียบธาตุใด และถูกทุกธาตุเอาชนะ</div>'}</div>` : ''}
    </div>`;
  }).join('') : '<div class="empty">ไม่พบการ์ดที่ตรงเงื่อนไข</div>';
}

/* ---------- deck ---------- */
function renderHeader(){
  document.body.dataset.pane = S.pane;
  document.querySelectorAll('#paneSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pane === S.pane)));
}
function renderDeck(){
  const d = S.deck, A = analyze(d), st = A.stars, over = st > MAXSTAR;
  $('deckTitle').textContent = 'Deck ของคุณ';
  $('deckSub').textContent = `${d.length}/${DECKSIZE} ใบ · ${st}/${MAXSTAR} ดาว`;
  $('dstat').innerHTML = `<div class="meter ${over ? 'over' : ''}"><div class="lbl"><span>Deck Point</span><b>${st} / ${MAXSTAR} ★</b></div><div class="bar"><i style="width:${Math.min(100, st / MAXSTAR * 100)}%"></i></div></div>
    <div class="meter"><div class="lbl"><span>จำนวนใบ</span><b>${d.length} / ${DECKSIZE}</b></div><div class="bar"><i style="width:${d.length / DECKSIZE * 100}%"></i></div></div>`;
  const al = [];
  if (d.length !== DECKSIZE) al.push(['bad', '!', `Deck ต้องมี ${DECKSIZE} ใบพอดี ตอนนี้ ${d.length} ใบ ${d.length < DECKSIZE ? `(ขาดอีก ${DECKSIZE - d.length})` : ''}`]);
  if (over) al.push(['bad', '!', `เกิน ${MAXSTAR} ดาว ไป ${st - MAXSTAR} ดาว`]);
  if (!al.length) al.push(['good', '✓', `Deck ถูกกติกา: ${DECKSIZE} ใบ ${st} ดาว ไม่มีชื่อซ้ำ${st < MAXSTAR ? ` (ยังเหลือ ${MAXSTAR - st} ดาว)` : ''}`]);
  $('alerts').innerHTML = al.map(a => `<div class="al ${a[0]}"><b class="ic">${a[1]}</b><span>${a[2]}</span></div>`).join('');
  let html = '';
  for (let i = 0; i < DECKSIZE; i++) {
    const c = BY[d[i]];
    html += c ? `<div class="slot">${thumb(c, true)}<div class="sinfo"><div class="sn">${esc(c.n)}</div><div class="meta">${elChip(c.e)}${compass(c.d)}</div><div class="meta"><span class="stat" style="font-size:15px">P${c.p}</span><span class="muted">${c.s}★ · ${c.d.length} ทิศ</span></div></div><button class="rm" data-act="remove" data-code="${c.c}" aria-label="เอา ${esc(c.n)} ออก">×</button></div>`
      : `<div class="slot empty-s">ช่องว่าง ${i + 1}<br><small>เลือกจากคลังการ์ด</small></div>`;
  }
  $('slots').innerHTML = html;
}

/* ---------- analysis ---------- */
const nameList = (arr, n) => arr.length ? arr.slice(0, n || 99).map(c => `<b>${esc(c.n)}</b>`).join(', ') : '–';
function pcard(c, mark){ return `<span class="pcard">${elChip(c.e, true)}<b>${esc(c.n)}</b><span class="muted">P${c.p} · ${c.s}★</span>${mark || ''}</span>`; }
function li(kind, ic, txt){ return `<li class="${kind}"><span class="ic">${ic}</span><span>${txt}</span></li>`; }
function verdict(n){ return n >= 2 ? ['g', 'ได้เปรียบมาก'] : n === 1 ? ['g', 'ได้เปรียบ'] : n === 0 ? ['n', 'สูสี'] : n === -1 ? ['b', 'เสียเปรียบ'] : ['b', 'เสียเปรียบมาก']; }
function ratingLabel(p){ return p >= 95 ? 'ระดับสูงมาก' : p >= 85 ? 'ดี' : p >= 70 ? 'ปานกลาง' : 'ควรปรับ'; }

function tabOverview(A){
  if (!A.n) return '<div class="empty">เลือกการ์ดจากคลังเพื่อเริ่มวิเคราะห์</div>';
  const pct = Math.round(A.rating / BENCH * 100), syn = synergy(A), costs = mandatoryCosts(A);
  const roles = r => A.cards.filter(c => c.roles.includes(r));
  const ins = [];
  ins.push(A.avgP >= 7.8 ? li('good', '✓', `พลังเฉลี่ย <b>${A.avgP.toFixed(1)}</b> สูง: Snatch สำเร็จเมื่อพลังมากกว่าเท่านั้น พลังสูงทั้งช่วยรุกและกันการถูกแย่ง`) :
    A.avgP >= 6.8 ? li('info', 'i', `พลังเฉลี่ย <b>${A.avgP.toFixed(1)}</b> ปานกลาง ถ้าต้องการเพิ่ม ให้มองการ์ดพลัง 8–9 ที่ราคา 1–2 ดาว`) :
    li('warn', '!', `พลังเฉลี่ย <b>${A.avgP.toFixed(1)}</b> ต่ำ จะแพ้การเทียบพลังกับ Deck ทั่วไป`));
  const p9 = A.cards.filter(c => c.p >= 9).length;
  if (p9) ins.push(li('info', 'i', `มีการ์ดพลัง 9 จำนวน <b>${p9}</b> ใบ (${nameList(A.cards.filter(c => c.p >= 9), 6)}) พลัง 9 เป็นเพดานของชุดนี้ จะถูกแย่งได้ด้วยธาตุที่ชนะ หรือความสามารถพิเศษเท่านั้น`));
  const one = A.cards.filter(c => c.d.length === 1);
  ins.push(one.length >= 5 ? li('warn', '!', `มี <b>${one.length}</b> ใบที่ Snatch ได้ทิศเดียว (${nameList(one, 6)}) ต้องเลือกตำแหน่งลงให้มีเป้าหมายในทิศนั้น`) :
    li('good', '✓', `ทิศ Snatch เฉลี่ย <b>${A.avgS.toFixed(1)}</b> ทิศต่อใบ มีการ์ดทิศเดียว ${one.length} ใบ`));
  ins.push(A.loss.length === 0 ? li('good', '✓', `ไม่มีธาตุที่เสียเปรียบเลย (ได้เปรียบ ${A.wins.length} · สูสี ${A.even.length})`) :
    li(A.loss.length >= 4 ? 'bad' : 'warn', '!', `เสียเปรียบ <b>${A.loss.length}</b> ธาตุ: ${A.loss.map(e => elChip(e)).join(' ')} ดูวิธีรับมือในแท็บ "แนวทางแก้ทาง"`));
  const miss = EL.filter(e => !A.atk[e].length);
  ins.push(miss.length ? li('warn', '!', `ไม่มีการ์ดที่ชนะธาตุ ${miss.map(e => elChip(e)).join(' ')} ตรงๆ ต้องพึ่งพลังหรือความสามารถ`) : li('good', '✓', 'ทุกธาตุของคู่ต่อสู้มีการ์ดใน Deck ที่ได้เปรียบอย่างน้อย 1 ใบ'));
  const guards = roles('guard');
  ins.push(guards.length ? li('good', '✓', `มีตัวป้องกัน (Ward / กันถูก Snatch) <b>${guards.length}</b> ใบ: ${nameList(guards, 6)}`) : li('warn', '!', 'ไม่มีการ์ดที่ให้ Ward หรือกันถูก Snatch เลย การ์ดที่ลงแล้วจะถูกแย่งคืนได้ตลอด'));
  const reach = roles('reach');
  ins.push(reach.length >= 2 ? li('good', '✓', `มีตัวรุกพิเศษ (Snatch ซ้ำ/ไกล/เกินกติกาปกติ) <b>${reach.length}</b> ใบ: ${nameList(reach, 6)}`) : li('warn', '!', `ตัวรุกพิเศษมีน้อย (${reach.length} ใบ) ท้ายเกมจะพลิกกระดานยาก`));
  if (A.cards.some(c => c.e === 'origin')) ins.push(li('bad', '!', 'มีการ์ดธาตุ Origin (NEKOMOCHI) ซึ่งทุกธาตุชนะ ควรสลับออก'));
  const mx = Math.max(...Object.values(A.ecount));
  if (mx >= 4) { const e = Object.keys(A.ecount).find(x => A.ecount[x] === mx); ins.push(li('warn', '!', `มีธาตุ ${elChip(e)} ถึง ${mx} ใบ ถ้าคู่ต่อสู้ใช้ธาตุที่ชนะธาตุนี้ (${(BB[e] || []).map(x => ELN[x][0]).join(', ')}) จะเสียหายหนัก`)); }
  syn.forEach(s => ins.push(li(s.ok ? 'good' : 'bad', s.ok ? '✓' : '!', esc(s.txt))));
  if (costs.length) ins.push(li(costs.length > 2 ? 'warn' : 'info', costs.length > 2 ? '!' : 'i', `ต้นทุนบังคับ (ทิ้ง/เปิดการ์ดจากมือ) ${costs.length} ใบ: ${nameList(costs, 6)} ถ้า Deck 10 ใบคือมือทั้งหมดและกระดาน 16 ช่องแบ่งฝ่ายละ ~8 ใบ จะมีการ์ดสำรอง ~2 ใบพอจ่ายต้นทุนได้`));
  const maxh = Math.max(1, ...Object.values(A.hist)), maxd = Math.max(1, ...Object.values(A.dir));
  return `<div class="kpis">
    <div class="kpi"><div class="k">คะแนนประเมิน</div><div class="v">${A.rating.toFixed(1)} <small>/ ${BENCH} · ${ratingLabel(pct)}</small></div></div>
    <div class="kpi"><div class="k">ชนะได้ (มีตัวได้เปรียบ)</div><div class="v">${A.cov.length}<small>/12 ธาตุ</small></div></div>
    <div class="kpi"><div class="k">ถูกชนะโดย (มีตัวเสียเปรียบ)</div><div class="v">${A.loseTo.length}<small>/12 ธาตุ</small></div></div>
    <div class="kpi"><div class="k">เปรียบเทียบสุทธิ</div><div class="v"><span style="color:var(--good)">+${A.wins.length}</span> <span class="muted">·</span> ${A.even.length} <span class="muted">·</span> <span style="color:var(--bad)">−${A.loss.length}</span></div></div>
    <div class="kpi"><div class="k">พลังเฉลี่ย / ทิศเฉลี่ย</div><div class="v">${A.avgP.toFixed(1)} <small>/ ${A.avgS.toFixed(1)}</small></div></div>
  </div>
  <div class="sec"><h3>ผลวิเคราะห์อัตโนมัติ</h3><ul class="list">${ins.join('')}</ul></div>
  <div class="sec two">
    <div><h3>การกระจายพลัง</h3><div class="hist">${Object.keys(A.hist).map(p => `<div><span>${A.hist[p] || ''}</span><i style="height:${A.hist[p] / maxh * 74}px"></i><span>${p}</span></div>`).join('')}</div></div>
    <div><h3>ทิศ Snatch ที่ครอบคลุม</h3><div class="heat">${DIRS.map(k => k === 'c' ? '<div class="cn">การ์ด</div>' : `<div style="--t:${A.dir[k] / maxd}" title="${DIRN[k]}">${A.dir[k]}</div>`).join('')}</div><p class="note">ตัวเลข = จำนวนการ์ดที่มองทิศนั้น</p></div>
  </div>`;
}
function tabElements(A){
  if (!A.n) return '<div class="empty">เลือกการ์ดจากคลังเพื่อเริ่มวิเคราะห์</div>';
  return `<p class="note" style="margin:0 0 10px">เทียบกับ "คู่ต่อสู้ธาตุนั้น": <b>ตัวรุก</b> = การ์ดของเราที่ธาตุชนะธาตุนั้น · <b>ตัวเสี่ยง</b> = การ์ดของเราที่ธาตุนั้นชนะ ผลสุทธิ = ตัวรุก − ตัวเสี่ยง</p>
  <div class="kpis"><div class="kpi"><div class="k">ได้เปรียบ</div><div class="v" style="color:var(--good)">${A.wins.length}<small> ธาตุ</small></div></div><div class="kpi"><div class="k">สูสี</div><div class="v">${A.even.length}<small> ธาตุ</small></div></div><div class="kpi"><div class="k">เสียเปรียบ</div><div class="v" style="color:var(--bad)">${A.loss.length}<small> ธาตุ</small></div></div></div>
  <div class="mhead"><span>คู่ต่อสู้ธาตุ</span><span>ตัวเสี่ยง ◂ ▸ ตัวรุก</span><span>การ์ดของเรา</span><span style="text-align:center">สรุป</span></div>
  <div class="mt">${EL.map(e => {
    const a = A.atk[e].length, v = A.vuln[e].length, vd = verdict(A.net[e]), sc = 5;
    return `<div class="mrow"><div>${elChip(e)}<div class="note" style="margin-top:2px">${ELN[e][1]}</div></div>
      <div><div class="div" role="img" aria-label="ตัวเสี่ยง ${v} ตัวรุก ${a}"><div class="l"><i style="width:${Math.min(100, v / sc * 100)}%"></i></div><div class="r"><i style="width:${Math.min(100, a / sc * 100)}%"></i></div></div><div class="note" style="display:flex;justify-content:space-between"><span>${v}</span><span>${a}</span></div></div>
      <div class="names">${a ? `รุก: ${nameList(A.atk[e], 6)}` : '<span>ไม่มีตัวรุกธาตุนี้</span>'}${v ? `<br>เสี่ยง: ${nameList(A.vuln[e], 6)}` : ''}</div>
      <div class="verdict ${vd[0]}">${vd[1]} (${A.net[e] > 0 ? '+' : ''}${A.net[e]})</div></div>`;
  }).join('')}</div>`;
}
function tabPlay(A){
  if (!A.n) return '<div class="empty">เลือกการ์ดจากคลังเพื่อรับแนวทางการเล่น</div>';
  const used = new Set(), pick = (arr, n) => { const r = []; arr.forEach(c => { if (r.length < n && !used.has(c.c)) { used.add(c.c); r.push(c); } }); return r; };
  const sc = A.cards.slice().sort((a, b) => b.sc - a.sc);
  const gives = c => /ally[^.]*ward|ward[^.]*ally|allied/i.test(norm(c.a));
  const spare = A.cards.slice().sort((a, b) => a.sc - b.sc).slice(0, A.n >= 8 ? 2 : 0); spare.forEach(c => used.add(c.c));
  const early = pick(A.cards.filter(c => c.roles.includes('guard') && !gives(c)).concat(A.cards.filter(c => c.roles.includes('anchor')).sort((a, b) => b.p - a.p)), 3);
  const late = pick(A.cards.filter(c => c.roles.includes('reach') || gives(c)).sort((a, b) => b.sc - a.sc), 3);
  const mid = pick(sc, 10);
  const stars = c => `<span class="muted">${c.s}★</span>`;
  const phase = (t, sub, cards, txt) => `<div class="phase"><header><b>${t}</b><span class="note">${sub}</span></header><div class="body"><div class="pc">${cards.length ? cards.map(c => pcard(c)).join('') : '<span class="note">ไม่มีการ์ดที่เหมาะในกลุ่มนี้</span>'}</div><div>${txt}</div></div>`;
  return `<div class="alerts"><div class="al warn"><b class="ic">i</b><span>แนวทางนี้ประเมินจากกติกาที่ระบุในข้อมูลเกม (พลังต้องมากกว่าจึง Snatch สำเร็จ, Ward, ผู้ถือ First Player Token ชนะเมื่อ Control Count เท่ากัน) และสมมติว่าเกมจบเมื่อกระดาน 4×4 เต็ม ควรเทียบกับ Official Rules อีกครั้ง</span></div></div>
  <ul class="list">
    ${li('info', '1', '<b>เป้าหมายคือ Control Count ตอนจบเกม</b> ไม่ใช่แค่ Snatch ให้ได้เยอะ การ์ดที่ถูกแย่งคืนในเทิร์นสุดท้ายไม่มีค่า ให้นึกถึงว่าใครได้ลงใบสุดท้ายและใครตอบโต้ได้')}
    ${li('info', '2', '<b>ผู้เล่นคนแรก</b> ชนะเมื่อ Control Count เท่ากัน แต่ลงใบสุดท้ายก่อนคู่ต่อสู้ตอบโต้ได้ <b>ผู้เล่นหลัง</b> ได้ลงใบสุดท้ายโดยไม่โดนตอบโต้ ให้เก็บตัวรุกแรง ๆ ไว้ใบสุดท้าย')}
    ${li('info', '3', '<b>Ward ป้องกันถึงจบเทิร์นถัดไปของคู่ต่อสู้</b> จึงคุ้มที่สุดเมื่อใช้ในเทิร์นที่คู่ต่อสู้ยังเหลือตาตอบโต้ ถ้าเป็นผู้เล่นหลังและลงใบสุดท้ายแล้ว Ward ไม่จำเป็น')}
  </ul>
  <div class="sec" style="display:grid;gap:10px">
    <h3 style="margin-bottom:0">ลำดับลงการ์ดแนะนำสำหรับ Deck นี้</h3>
    ${phase('ต้นเกม', 'ลงแล้วอยู่บนกระดานนานที่สุด จึงต้องทนทาน', early, early.length ? 'ลงตัวที่กันถูกแย่งได้หรือพลังสูงก่อน เพราะต้องถูกโจมตีหลายเทิร์น ' + (early.some(c => c.roles.includes('guard')) ? 'ตัวที่มี Ward/กันถูก Snatch จะรักษาแต้มได้ยาว' : 'การ์ดพลัง 8–9 ที่ไม่มีความสามารถเป็นตัวตั้งหลักที่ดี') : 'ถ้าไม่มีตัวทน ให้ลงตัวพลังสูงสุดก่อน')}
    ${phase('กลางเกม', 'ใช้ตัวที่เหลือสร้างแรงกดดันและเปิดทางให้ตัวรุก', mid, 'เลือกลงตามทิศ Snatch ที่มีเป้าหมายอยู่ ใช้ตัวที่ได้เปรียบธาตุกับการ์ดคู่ต่อสู้ในทิศนั้น ตัวที่มีความสามารถ Swap / Move / Incite ใช้จัดตำแหน่งให้ตัวรุกถึงเป้า')}
    ${phase('ท้ายเกม', 'ลงใบสุดท้าย ๆ เพื่อพลิก Control Count', late, late.length ? 'เก็บตัวรุกพิเศษไว้ตอนนี้ (Snatch เกินระยะ, Snatch หลายใบ, Incite) เพราะคู่ต่อสู้เหลือเทิร์นตอบโต้น้อยที่สุด ตัวที่ให้ Ward แก่พวกเดียวกัน ควรลงใบก่อนสุดท้ายถ้าคุณเป็นผู้เล่นคนแรก' : 'ถ้าไม่มีตัวรุกพิเศษ ให้เก็บการ์ดพลังสูงที่สุดไว้ลงใบสุดท้าย')}
    ${phase('การ์ดสำรอง', 'ถ้ากระดานเต็มที่ ~8 ใบต่อฝ่าย จะเหลือ ~2 ใบไม่ได้ลง', spare, spare.length ? 'ใบที่ค่าน้อยที่สุดของ Deck ใช้เป็นต้นทุนของความสามารถที่ต้องทิ้ง/เปิดการ์ดจากมือ ' + (mandatoryCosts(A).length ? 'อย่าลืมเลือกใบที่ตรงธาตุที่ความสามารถกำหนด' : '') : 'Deck ยังไม่ครบ 8 ใบ')}
  </div>`;
}
function tabCounter(A){
  if (!A.n) return '<div class="empty">เลือกการ์ดจากคลังเพื่อรับแนวทางแก้ทาง</div>';
  if (!S.oppTouched) {
    const worst = EL.slice().sort((a, b) => A.net[a] - A.net[b])[0];
    S.opp = A.net[worst] < 0 ? [worst] : [];
  }
  const sel = S.opp || [], hit = c => sel.some(e => c.b.includes(e)), vulnS = c => sel.some(e => isVuln(c, e));
  const rA = A.cards.filter(hit), rV = A.cards.filter(c => vulnS(c)), rN = A.cards.filter(c => !hit(c) && !vulnS(c));
  const cur = S.deck, stars = stats(cur);
  let cand = [];
  if (sel.length) {
    const worstV = rV.slice().sort((a, b) => a.sc - b.sc);
    C.filter(c => c.e !== 'origin' && !cur.includes(c.c) && hit(c) && !vulnS(c)).sort((a, b) => b.sc - a.sc).forEach(c => {
      if (cand.length >= 5) return;
      const out = worstV.find(v => stars - v.s + c.s <= MAXSTAR) || (cur.length < DECKSIZE && stars + c.s <= MAXSTAR ? null : undefined);
      if (out !== undefined) cand.push({c, out});
    });
  }
  const tools = [
    ['คู่ต่อสู้ใช้ Ward / กันถูก Snatch', c => /lose ward/i.test(c.a), 'ลบ Ward ของศัตรูรอบตัว แล้ว Snatch ตามปกติ'],
    ['คู่ต่อสู้มีการ์ดพลังสูง (8–9)', c => /power equal|power 8 or more|original power 8/i.test(norm(c.a)), 'แย่งการ์ดพลังเท่ากัน/พลัง 8 ขึ้นไปได้ แม้พลังตัวเองน้อยกว่า'],
    ['เป้าหมายอยู่ไกลเกิน 1 ช่อง', c => /beyond 1 space/i.test(c.a), 'Snatch การ์ดที่อยู่ไกลจากตัวเองได้'],
    ['ต้องแย่งหลายใบพร้อมกัน', c => /snatch every|snatch up to 2|up to 2 target/i.test(norm(c.a)), 'ใบเดียวพลิกหลายตัวในครั้งเดียว ใช้ตอนท้ายเกม'],
    ['คู่ต่อสู้จัดทัพแน่น ตำแหน่งไม่เข้าทาง', c => /swap me with target enemy|move target enemy|move up to 2 target enemy|enemy momon with ability/i.test(norm(c.a)), 'ย้ายการ์ดศัตรูให้เข้าทิศ Snatch ของเรา']
  ];
  const poolOk = c => c.e !== 'origin';
  const toolHtml = tools.map(t => {
    const m = C.filter(c => t[1](c) && poolOk(c)).sort((a, b) => a.s - b.s || b.p - a.p).slice(0, 8);
    return `<div class="phase"><header><b>${t[0]}</b><span class="note">${t[2]}</span></header><div class="body"><div class="pc">${m.length ? m.map(c => pcard(c, cur.includes(c.c) ? '<span class="badge">อยู่ใน Deck</span>' : '')).join('') : '<span class="note">ไม่มีการ์ดชนิดนี้ในชุด</span>'}</div></div></div>`;
  }).join('');
  const sug = suggest();
  return `<div class="sec" style="margin-top:0"><h3>ถ้าเจอคู่ต่อสู้ธาตุ…</h3>
    <div class="opp" id="oppChips">${EL.map(e => `<button class="fchip" data-opp="${e}" style="--c:var(--el-${e})" aria-pressed="${sel.includes(e)}"><i></i>${ELN[e][0]}</button>`).join('')}</div>
    <p class="note">เลือกได้หลายธาตุ ค่าเริ่มต้นคือธาตุที่ Deck นี้เสียเปรียบที่สุด</p>
    ${sel.length ? `<div class="two" style="margin-top:8px"><div class="phase"><header><b>ตัวรุกของเรา</b><span class="note">ลงเมื่อเห็นธาตุนี้ในทิศ Snatch</span></header><div class="body"><div class="pc">${rA.length ? rA.map(c => pcard(c)).join('') : '<span class="note">ไม่มี</span>'}</div></div></div>
    <div class="phase"><header><b>ตัวเสี่ยง</b><span class="note">เก็บไว้ท้ายเกม หรือลงคู่กับ Ward</span></header><div class="body"><div class="pc">${rV.length ? rV.map(c => pcard(c)).join('') : '<span class="note">ไม่มี</span>'}</div><div class="note">หลีกเลี่ยงวางในทิศที่ธาตุนี้ Snatch ได้ หรือใช้เป็นการ์ดสำรอง/ต้นทุนแทนการลงสนาม</div></div></div></div>
    <p class="note">กลาง (ไม่ได้เปรียบ/เสียเปรียบ): ${rN.length ? nameList(rN) : '–'}</p>` : '<div class="empty">ยังไม่ได้เลือกธาตุ</div>'}
    ${cand.length ? `<h3 style="margin:12px 0 8px">ตัวช่วยจากคลังสำหรับธาตุที่เลือก</h3><div class="mt">${cand.map(x => `<div class="swap"><div>${x.out ? `เอา ${pcard(x.out)} <span class="arrow">→</span> ใส่ ${pcard(x.c)}` : `เพิ่ม ${pcard(x.c)}`}</div><button class="btn primary" data-act="apply" data-in="${x.c.c}" data-out="${x.out ? x.out.c : ''}">ใช้เลย</button><div class="delta">ธาตุ ${elChip(x.c.e)} · ชนะธาตุที่เลือก ไม่ถูกธาตุนั้นชนะ${x.out ? ` · ดาว ${x.c.s - x.out.s >= 0 ? '+' : ''}${x.c.s - x.out.s}` : ''}</div></div>`).join('')}</div>` : ''}
  </div>
  <div class="sec"><h3>แก้จุดอ่อนของ Deck</h3>
    ${sug.length ? `<div class="mt">${sug.map(r => `<div class="swap"><div>${r.out ? `เอา ${pcard(r.out)} <span class="arrow">→</span> ใส่ ${pcard(r.add)}` : `เพิ่ม ${pcard(r.add)}`}</div><button class="btn primary" data-act="apply" data-in="${r.add.c}" data-out="${r.out ? r.out.c : ''}">ใช้เลย</button><div class="delta">คะแนน ${r.dr >= 0 ? '+' : ''}${r.dr.toFixed(1)} · จุดอ่อนธาตุ ${r.dw > 0 ? '+' : ''}${r.dw}${r.out ? ` · ดาว ${r.add.s - r.out.s >= 0 ? '+' : ''}${r.add.s - r.out.s}` : ''}</div></div>`).join('')}</div><p class="note">จัดอันดับด้วยคะแนนรวมที่หักจุดอ่อนธาตุ (ธาตุที่การ์ดเราถูกชนะมากกว่าที่เราชนะ) เคารพกติกา 25 ดาว</p>` : '<div class="al good"><b class="ic">✓</b><span>ไม่พบการสลับที่ทำให้ดีขึ้นอย่างมีนัยสำคัญภายใต้กติกา 25 ดาว</span></div>'}
  </div>
  <div class="sec"><h3>เครื่องมือแก้ทางเฉพาะสถานการณ์</h3><div style="display:grid;gap:8px">${toolHtml}</div></div>`;
}
function renderTabs(){
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  const A = analyze(S.deck);
  $('tabBody').innerHTML = ({overview:tabOverview, elements:tabElements, play:tabPlay, counter:tabCounter, swap:tabSwap})[S.tab](A);
}
function renderAll(){ renderHeader(); renderPool(); renderDeck(); renderTabs(); }

/* ---------- actions ---------- */
function toggle(code){
  const d = S.deck, i = d.indexOf(code);
  if (i >= 0) { d.splice(i, 1); toast(`เอา ${BY[code].n} ออก (${d.length}/10)`); }
  else { const why = reasonBlocked(BY[code]); if (why) { toast(why); return; } d.push(code); toast(`เพิ่ม ${BY[code].n} (${d.length}/10 · ${stats(d)}★)`); }
  save(); renderAll();
}
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act],[data-pane],[data-tab],[data-el],[data-star],[data-opp],[data-view]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.act === 'toggle') toggle(ds.code);
  else if (ds.act === 'remove') toggle(ds.code);
  else if (ds.act === 'open') { S.open[ds.code] = !S.open[ds.code]; renderPool(); }
  else if (ds.act === 'apply') {
    const d = S.deck;
    if (ds.out) { const i = d.indexOf(ds.out); if (i >= 0) d[i] = ds.in; else d.push(ds.in); } else d.push(ds.in);
    S.oppTouched = false; toast('ปรับ Deck แล้ว'); save(); renderAll();
  }
  else if (ds.act === 'simrun') runSim();
  else if (ds.act === 'zoom') zoom(ds.code);
  else if (ds.view) { S.view = ds.view; try { localStorage.setItem('msdb-view', S.view); } catch (e) {} renderPool(); }
  else if (ds.act === 'closezoom') closeZoom();
  else if (ds.pane) { S.pane = ds.pane; renderHeader(); window.scrollTo({top: 0}); }
  else if (ds.tab) { S.tab = ds.tab; renderTabs(); }
  else if (ds.el) { S.fEl = ds.el; renderFilters(); renderPool(); }
  else if (ds.star) { S.fStar = ds.star; renderFilters(); renderPool(); }
  else if (ds.opp) { S.oppTouched = true; const a = S.opp || []; const i = a.indexOf(ds.opp); if (i >= 0) a.splice(i, 1); else a.push(ds.opp); S.opp = a; renderTabs(); }
});
document.addEventListener('change', e => { if (e.target.id === 'simLv') SWAP.lv = e.target.value; });
$('q').addEventListener('input', e => { S.q = e.target.value; renderPool(); });
$('sort').addEventListener('change', e => { S.sort = e.target.value; renderPool(); });
$('presetSel').addEventListener('change', e => {
  const k = e.target.value; e.target.value = '';
  if (!PRESET[k]) return;
  S.deck = PRESET[k].slice(); S.oppTouched = false; save(); renderAll(); toast('โหลด Deck ตัวอย่างแล้ว');
});
$('btnClear').addEventListener('click', () => { S.deck = []; S.oppTouched = false; save(); renderAll(); toast('ล้าง Deck แล้ว'); });

function zoom(code){
  const c = BY[code]; if (!c) return;
  const src = c.im || c.th;
  $('lb').innerHTML = `<div class="lbcard" role="dialog" aria-modal="true" aria-label="${esc(c.n)}">
    <button class="rm lbx" data-act="closezoom" aria-label="ปิด">×</button>
    <div class="lbimg" style="--c:var(--el-${c.e})"><span class="ph">${esc(c.n.slice(0, 1))}</span>${src ? `<img src="${esc(src)}" alt="การ์ด ${esc(c.n)}" referrerpolicy="no-referrer">` : ''}</div>
    <div class="lbinfo"><h3>${esc(c.n)}</h3><div class="line" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${elChip(c.e)}<span class="badge">พลัง ${c.p}</span><span class="badge">${c.s} ดาว</span><span class="badge">${c.d.length} ทิศ Snatch</span></div>
    <div style="margin:8px 0">${compass(c.d)}</div>
    ${c.a ? `<p>${abHtml(c.t || c.a)}</p><p class="muted" style="font-size:12px">${abHtml(c.a)}</p>` : '<p class="muted">ไม่มีความสามารถพิเศษ</p>'}
    ${c.b.length ? `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center"><span class="muted">ชนะธาตุ:</span>${c.b.map(e => elChip(e)).join('')}</div>` : ''}</div></div>`;
  $('lb').hidden = false;
}
function closeZoom(){ $('lb').hidden = true; }
$('lb').addEventListener('click', e => { if (e.target === $('lb')) closeZoom(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeZoom();
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.dataset && e.target.dataset.act === 'zoom') { e.preventDefault(); zoom(e.target.dataset.code); }
});
/* รูปที่โหลดไม่ขึ้นให้ซ่อน เหลือกรอบสีธาตุกับตัวอักษรแรกของชื่อ */
document.addEventListener('error', e => { if (e.target && e.target.tagName === 'IMG' && e.target.closest('.thumb,.lbimg,.gc,.hc')) e.target.remove(); }, true);

/* ---------- บันทึก/แชร์ Deck ---------- */
const MINE_KEY = 'msdb-mine';
function getMine(){ try { const a = JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); return Array.isArray(a) ? a.filter(x => x && UUID.test(x.id)) : []; } catch (e) { return []; } }
function setMine(a){ try { localStorage.setItem(MINE_KEY, JSON.stringify(a.slice(0, 30))); } catch (e) {} }
const shareUrl = id => location.origin + location.pathname + '?deck=' + id;
let lastShare = null, saving = false, saveErr = '', nameDraft = '';
function renderSave(){
  const box = $('savebox');
  if (!SB_ON) { box.innerHTML = '<div class="al warn"><b class="ic">i</b><span>ยังไม่ได้เชื่อม Supabase จึงบันทึกได้เฉพาะในเบราว์เซอร์นี้ ตั้งค่าที่ไฟล์ config.js เพื่อเปิดปุ่มบันทึกและแชร์ลิงก์</span></div>'; return; }
  const d = S.deck, ok = d.length === DECKSIZE && stats(d) <= MAXSTAR;
  const mine = getMine();
  box.innerHTML = `<div class="saverow"><input id="deckName" type="text" maxlength="60" placeholder="ตั้งชื่อ Deck ก่อนบันทึก" value="${esc(nameDraft)}" aria-label="ชื่อ Deck">
      <button class="btn primary" data-act="save" ${ok && !saving ? '' : 'disabled'}>${saving ? 'กำลังบันทึก…' : 'บันทึกและสร้างลิงก์แชร์'}</button></div>
    ${ok ? '' : '<p class="note" style="margin:6px 0 0">บันทึกได้เมื่อ Deck มี 10 ใบพอดีและไม่เกิน 25 ดาว</p>'}
    ${saveErr ? `<div class="al bad" style="margin-top:8px"><b class="ic">!</b><span>${esc(saveErr)}</span></div>` : ''}
    ${lastShare ? `<div class="al good" style="margin-top:8px;flex-wrap:wrap"><b class="ic">✓</b><span style="flex:1 1 200px">บันทึกแล้ว แชร์ลิงก์นี้ให้เพื่อนได้เลย</span><input id="shareLink" readonly value="${esc(shareUrl(lastShare))}" style="flex:1 1 100%" aria-label="ลิงก์แชร์"><button class="btn" data-act="copy">คัดลอกลิงก์</button></div>` : ''}
    <details class="gl" style="margin-top:10px" ${mine.length ? '' : ''}><summary>Deck ที่ฉันบันทึกไว้ (${mine.length})</summary>
      <div class="mt" style="margin-top:8px">${mine.length ? mine.map(m => `<div class="swap"><div><b>${esc(m.name || 'Deck ไม่มีชื่อ')}</b><div class="note">${esc(new Date(m.ts || Date.now()).toLocaleString('th-TH', {dateStyle: 'medium', timeStyle: 'short'}))}</div></div><div style="display:flex;gap:6px"><button class="btn" data-act="loadmine" data-id="${m.id}">โหลด</button><button class="btn" data-act="copymine" data-id="${m.id}">คัดลอกลิงก์</button><button class="btn" data-act="forget" data-id="${m.id}" aria-label="เอาออกจากรายการ">×</button></div></div>`).join('') : '<p class="note">ยังไม่มี Deck ที่บันทึก</p>'}</div>
      <p class="note">ลิงก์ที่บันทึกแล้วเปลี่ยนแก้ไม่ได้ ถ้าแก้ Deck ให้บันทึกใหม่เป็นลิงก์ใหม่</p></details>`;
}
async function copyText(t){
  try { await navigator.clipboard.writeText(t); toast('คัดลอกแล้ว'); }
  catch (e) { const i = $('shareLink'); if (i) { i.select(); } toast('กด Ctrl+C เพื่อคัดลอก'); }
}
async function saveDeck(){
  const nm = ($('deckName') ? $('deckName').value : nameDraft).trim() || 'Deck ไม่มีชื่อ';
  nameDraft = nm === 'Deck ไม่มีชื่อ' ? '' : nm; saving = true; saveErr = ''; renderSave();
  try {
    const r = await sb('decks', {method: 'POST', headers: {Prefer: 'return=representation'}, body: JSON.stringify({name: nm, cards: S.deck})});
    if (!r.ok) throw new Error(await sbError(r));
    const row = (await r.json())[0];
    lastShare = row.id;
    setMine([{id: row.id, name: row.name, ts: Date.now()}].concat(getMine().filter(x => x.id !== row.id)));
    toast('บันทึก Deck แล้ว');
  } catch (e) { saveErr = 'บันทึกไม่สำเร็จ: ' + (e.message || e); }
  saving = false; renderSave();
}
async function loadSharedDeck(id, quiet){
  try {
    const r = await sb('decks?id=eq.' + id + '&select=id,name,cards');
    if (!r.ok) throw new Error(await sbError(r));
    const rows = await r.json();
    if (!rows.length) throw new Error('ไม่พบ Deck นี้');
    const row = rows[0], cards = row.cards.filter(x => BY[x]);
    S.deck = cards.slice(0, DECKSIZE); S.oppTouched = false; nameDraft = row.name || ''; lastShare = row.id; saveErr = '';
    save(); renderAll(); renderSave();
    if (!quiet) toast('โหลด Deck "' + (row.name || '') + '" แล้ว');
  } catch (e) { toast('โหลด Deck ไม่ได้: ' + (e.message || e)); }
}
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'save') saveDeck();
  else if (a === 'copy') copyText(shareUrl(lastShare));
  else if (a === 'copymine') copyText(shareUrl(t.dataset.id));
  else if (a === 'loadmine') loadSharedDeck(t.dataset.id);
  else if (a === 'forget') { setMine(getMine().filter(x => x.id !== t.dataset.id)); renderSave(); }
});
document.addEventListener('input', e => { if (e.target && e.target.id === 'deckName') nameDraft = e.target.value; });
const _renderDeck = renderDeck;
renderDeck = function(){ _renderDeck(); if ($('savebox')) { const f = document.activeElement; if (!(f && f.id === 'deckName')) renderSave(); } };
$('srcNote').textContent = DATA.source === 'supabase' ? '· ข้อมูลการ์ดโหลดจาก Supabase' : (SB_ON ? '· ใช้ข้อมูลการ์ดสำรอง (เชื่อม Supabase ไม่สำเร็จ)' : '· โหมดออฟไลน์ (ยังไม่ได้เชื่อม Supabase)');
const qd = new URLSearchParams(location.search).get('deck');
if (SB_ON && qd && UUID.test(qd)) loadSharedDeck(qd, false);
renderSave();
$('gloss').innerHTML = DATA.kw.map(k => `<dt>${esc(k.n)}</dt><dd>${esc(k.t || k.d)}</dd>`).join('');
renderFilters(); renderAll();
window.MSAPP = {DATA, C, BY, EL, ELN, sb, SB_ON, sbError, esc, toast, zoom, closeZoom, compass, elChip, abHtml, norm, DIRN, PRESET, MAXSTAR, DECKSIZE, stats,
  getDeck: () => S.deck.slice(), setDeck: d => { S.deck = d.filter(x => BY[x]).slice(0, DECKSIZE); S.oppTouched = false; save(); renderAll(); }, validDeck: d => d.length === DECKSIZE && new Set(d).size === DECKSIZE && new Set(d.map(x => BY[x] && BY[x].n)).size === DECKSIZE && stats(d) <= MAXSTAR};
document.dispatchEvent(new Event('ms-ready'));
})();
