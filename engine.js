/* Monsnatch game engine — deterministic, pure (UMD). Works in browser (window.MSE) and Node.
   NOTE: official rulebook text was not retrievable, so rules are reconstructed from the official
   keyword glossary + card texts. Assumptions are listed in MSE.RULES_NOTE. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MSE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SZ = 16;
  const EL = { E: 'earth', W: 'water', A: 'air', F: 'fire', T: 'thunder', I: 'ice', N: 'nature', P: 'poison', M: 'metal', S: 'spirit', L: 'light', D: 'dark' };
  const DIRS = { f: [-1, 0], b: [1, 0], l: [0, -1], r: [0, 1], fl: [-1, -1], fr: [-1, 1], bl: [1, -1], br: [1, 1] };
  const COLS = 'ABCD';
  let NAMER = null;
  const rawName = i => COLS[i & 3] + ((i >> 2) + 1);
  const cellName = i => (NAMER ? NAMER(i) : rawName(i));
  const RULES_NOTE = [
    'กระดาน Arena 4×4 ผู้เล่นผลัดกัน summon การ์ด 1 ใบจากมือลงช่องว่าง (มือเริ่มต้น = เด็ค 10 ใบ)',
    'หลัง summon: ทำ On Summon → Snatch Check ตามทิศ Snatch Sight (ช่องติดกัน 1 ช่อง; "ข้างหน้า" = ทางฝั่งตรงข้าม) → On Snatch',
    'Snatch สำเร็จเมื่อ Power ฝั่งบุก "สูงกว่า" ฝั่งรับ (เท่ากันไม่สำเร็จ) หรือมี Element Advantage (ตั้งค่าได้) และเป้าหมายไม่มี Ward',
    'Snatch จากความสามารถ (On Summon/On Snatch/…) ข้ามการเทียบ Power/ธาตุ แต่ยังโดน Ward และข้อห้ามต่าง ๆ',
    'Snatch = พลิก Marking Token ให้เป็นฝั่งเรา ไม่ลูกโซ่ต่อ (ลูกโซ่เกิดจาก Incite เท่านั้น)',
    'จบเกมเมื่อ Arena เต็ม (หรือไม่มีใครมีการ์ดให้ลงอีก) คนคุมการ์ดมากกว่าชนะ เท่ากัน = คนถือ First Player Token ชนะ',
    'กฎ Void: ถึงตาใครแล้วมือหมดแต่ Void ยังมีการ์ด คู่ต่อสู้สุ่มการ์ดจาก Void ของคนนั้นขึ้นมือให้ 1 ใบ (ปรับได้ที่ rules.vd) — เป็นการตีความจากฟีดแบ็กผู้เล่น ยังไม่ยืนยันกับกติกาทางการ',
    'ความสามารถที่ให้ "ฝ่ายตรงข้ามเลือกการ์ด" ระบบจะเลือกใบที่อ่อนที่สุดให้โดยอัตโนมัติ',
  ];

  /* ---------- card db + ability compiler ---------- */
  let CARD = {}, AB = {};
  const UNSUP = new Set();
  function splitS(t) { return t.split(/\.\s*/).map(x => x.trim()).filter(Boolean); }
  function parseAb(c) {
    const raw = (c.a || '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
    const o = { raw, s: {}, sum: null, snt: null, back: null, eot: false, once: false };
    if (!raw) return o;
    const L = raw.toLowerCase(); const s = o.s; let m;
    if (/^\[\w\]/.test(raw) && /elemental advantage over me/.test(L)) { s.adv = true; return o; }
    if (/i can snatch momon with power equal to my power/.test(L)) { s.eq = true; return o; }
    if (/i can snatch momon with original power 8 or more/.test(L)) { s.op8 = true; return o; }
    if (/^under my owner's control, i can't be snatched by /.test(L)) { s.imEl = [...raw.matchAll(/\[(\w)\]/g)].map(x => EL[x[1].toUpperCase()]); return o; }
    if (/^under my owner's control, if there are 4 or more other ally momons within 1 space of me, i can't be snatched/.test(L)) { s.i4a = true; return o; }
    if (/^under my owner's control, if there are 4 or more enemy momons within 1 space of me, i can't be snatched/.test(L)) { s.i4e = true; return o; }
    if (/^under my owner's control, i can't be snatched together with other momon/.test(L)) { s.tog = true; return o; }
    if ((m = L.match(/enemy momon gets power -1 for each other ally \[(\w)\] momon within 1 space of them/))) { s.pm = EL[m[1].toUpperCase()]; return o; }
    if (/when i am moved or swapped by an ability of another ally momon, incite me/.test(L)) { s.incMove = true; return o; }
    if (/^at the end of the turn i was summoned, if i did not snatch any momon and there are 4 or more momons on the arena, i gain ward/.test(L)) { o.eot = true; return o; }
    const TRG = [['sum', /^on summon:\s*/i], ['snt', /^on snatch:\s*/i], ['back', /^when i am snatched back to my owner's control,\s*/i]];
    for (const [k, re] of TRG) {
      if ((m = raw.match(re))) {
        let ss = splitS(raw.slice(m[0].length));
        ss = ss.filter(x => {
          if (/^under my owner's control, the marking token on me is worth 1 additional point/i.test(x)) { s.pt1 = true; return false; }
          if (/^trigger this ability only once/i.test(x)) { o.once = true; return false; }
          return true;
        });
        o[k] = ss; return o;
      }
    }
    o.un = [raw]; UNSUP.add(raw); return o;
  }
  function init(cards) {
    CARD = {}; AB = {};
    for (const c of cards) { CARD[c.c] = c; AB[c.c] = parseAb(c); }
    return { cards: cards.length };
  }

  /* ---------- geometry ---------- */
  const rc = i => [i >> 2, i & 3];
  const dist = (a, b) => Math.max(Math.abs((a >> 2) - (b >> 2)), Math.abs((a & 3) - (b & 3)));
  function nb(i) { const r = i >> 2, c = i & 3, o = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 4 && cc >= 0 && cc < 4) o.push(rr * 4 + cc); } return o; }
  function step(i, d, p) { // p = controller; p0 faces up (f = row-1), p1 faces down
    const v = DIRS[d]; if (!v) return -1; const s = p === 0 ? 1 : -1;
    const r = (i >> 2) + v[0] * s, c = (i & 3) + v[1] * s;
    return r < 0 || r > 3 || c < 0 || c > 3 ? -1 : r * 4 + c;
  }

  /* ---------- state ---------- */
  function rnd(st) { // mulberry32
    st.rng = (st.rng + 0x6D2B79F5) | 0; let t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function newGame(o) {
    const st = {
      board: Array(SZ).fill(null), hands: [o.decks[0].slice(), o.decks[1].slice()], voids: [[], []],
      start: o.start | 0, tok: o.start | 0, mv: 0, turn: o.start | 0, rng: (o.seed | 0) || 1,
      rules: Object.assign({ elem: true }, o.rules || {}), shield: [-1, -1], ret: [], q: [], nid: 1,
      over: false, res: null, log: [], fx: [], last: null,
    };
    return st;
  }
  function clone(st) {
    return {
      board: st.board.map(c => c && Object.assign({}, c, { sl: c.sl.slice() })), hands: [st.hands[0].slice(), st.hands[1].slice()],
      voids: [st.voids[0].slice(), st.voids[1].slice()], start: st.start, tok: st.tok, mv: st.mv, turn: st.turn, rng: st.rng,
      rules: st.rules, shield: st.shield.slice(), ret: st.ret.map(x => Object.assign({}, x)), q: [], nid: st.nid,
      over: st.over, res: st.res, log: [], fx: [], last: null, quiet: true,
    };
  }
  const say = (st, t) => { if (!st.quiet) st.log.push(t); };
  const PN = ['ฝั่ง A', 'ฝั่ง B'];
  const cn = c => (CARD[c] ? CARD[c].n : c);

  function score(st, p) {
    let n = 0;
    for (const c of st.board) if (c && c.k === p) { n++; if (AB[c.c].s.pt1 && c.k === c.o) n++; }
    return n;
  }
  function cnt(st, i, player, same) { // count other cards within 1 space, same=true: controlled by player, false: not by player
    let n = 0; for (const j of nb(i)) { const z = st.board[j]; if (z && (same ? z.k === player : z.k !== player)) n++; } return n;
  }
  function pw(st, i) {
    const c = st.board[i]; if (!c) return 0; let v = CARD[c.c].p;
    for (let j = 0; j < SZ; j++) {
      const h = st.board[j]; if (!h || j === i) continue; const pm = AB[h.c].s.pm; if (!pm) continue;
      if (h.k === h.o && h.k === st.turn && h.k !== c.k) {
        for (const q of nb(i)) { const z = st.board[q]; if (z && q !== j && z.k === h.k && CARD[z.c].e === pm) v--; }
      }
    }
    return v;
  }
  function beats(a, d) { const A = CARD[a], D = CARD[d]; return (A.b || []).includes(D.e) || (D.e === 'origin' && A.e !== 'origin'); }
  function warded(st, c) { return c.w > 0 && c.w >= st.mv; }
  function immune(st, a, d, byAb) {
    const A = st.board[a], D = st.board[d], s = AB[D.c].s;
    if (warded(st, D)) return 'ward';
    if (D.k === D.o) {
      if (s.imEl && A && s.imEl.includes(CARD[A.c].e)) return 'imm';
      if (s.i4a && cnt(st, d, D.k, true) >= 4) return 'imm';
      if (s.i4e && cnt(st, d, D.k, false) >= 4) return 'imm';
    }
    if (byAb && st.shield[D.k] >= st.mv) return 'shield';
    return null;
  }
  function canMain(st, a, d) {
    if (immune(st, a, d, false)) return false;
    const A = st.board[a], D = st.board[d], s = AB[A.c].s;
    const pa = pw(st, a), pd = pw(st, d);
    if (pa > pd) return true;
    if (pa === pd && s.eq) return true;
    if (s.op8 && CARD[D.c].p >= 8) return true;
    if (st.rules.elem && beats(A.c, D.c)) return true;
    return false;
  }
  /** preview for UI: which enemy cells would be snatched if `code` were summoned at `x` by p (ignores abilities) */
  function previewSnatch(st, p, code, x) {
    const t = clone(st); t.board[x] = { c: code, o: p, k: p, w: 0, t: st.mv, sn: 0, noSn: -1, u: false, id: 9999, sl: [] };
    const out = []; for (const d of CARD[code].d) { const j = step(x, d, p); if (j >= 0 && t.board[j] && t.board[j].k !== p && canMain(t, x, j)) out.push(j); }
    if (out.length > 1) return out.filter(j => !AB[t.board[j].c].s.tog || t.board[j].k !== t.board[j].o);
    return out;
  }

  /* ---------- effects ---------- */
  function fx(st, t, i) { if (!st.quiet) st.fx.push({ t, i }); }
  function doSnatch(st, ai, list, how) {
    const a = st.board[ai]; let n = 0;
    for (const j of list) {
      const d = st.board[j]; if (!d || d.k === a.k) continue;
      if (d.o === a.k) st.q.push({ idx: j, id: d.id, byId: a.id });
      say(st, `${cn(a.c)} ${how} ${cn(d.c)} (${cellName(j)})`);
      d.k = a.k; a.sn++; a.sl.push(d.id); n++; fx(st, 'flip', j);
    }
    return n;
  }
  function* resolveMain(st, idx) {
    const me = st.board[idx]; if (!me || me.noSn === st.mv) return 0;
    const ts = [];
    for (const d of CARD[me.c].d) { const j = step(idx, d, me.k); if (j >= 0 && st.board[j] && st.board[j].k !== me.k && !ts.includes(j)) ts.push(j); }
    let ok = ts.filter(j => canMain(st, idx, j));
    if (ok.length > 1) ok = ok.filter(j => !(AB[st.board[j].c].s.tog && st.board[j].k === st.board[j].o));
    return doSnatch(st, idx, ok, 'ยึด');
  }
  function* flushBack(st, depth) {
    while (st.q.length) {
      const e = st.q.shift(); const c = st.board[e.idx];
      if (!c || c.id !== e.id || c.k !== c.o) continue;
      const ab = AB[c.c]; if (!ab.back) continue;
      if (ab.once && c.u) continue; c.u = true;
      yield* runList(st, e.idx, ab.back, depth, { byId: e.byId });
    }
  }
  function* incite(st, idx, depth) {
    const c = st.board[idx]; if (!c) return;
    say(st, `Incite ${cn(c.c)} (${cellName(idx)})`); fx(st, 'incite', idx);
    yield* resolveMain(st, idx);
    yield* flushBack(st, depth);
  }
  function* afterMove(st, list, srcId) { // list of [idx]
    for (const i of list) {
      const c = st.board[i]; if (!c || c.id === srcId) continue;
      if (AB[c.c].s.incMove && c.k === c.o && c.k === st.turn) { const src = st.board.find(z => z && z.id === srcId); if (src && src.k === c.k) yield* incite(st, i, 1); }
    }
  }
  function swapCells(st, i, j) { const t = st.board[i]; st.board[i] = st.board[j]; st.board[j] = t; fx(st, 'move', i); fx(st, 'move', j); }

  function* summon(st, p, code, x, depth) {
    const hi = st.hands[p].indexOf(code); if (hi < 0) throw new Error('card not in hand');
    if (st.board[x]) throw new Error('cell occupied');
    st.hands[p].splice(hi, 1);
    st.board[x] = { c: code, o: p, k: p, w: 0, t: st.mv, sn: 0, noSn: -1, u: false, id: st.nid++, sl: [] };
    say(st, `${PN[p]} summon ${cn(code)} ที่ ${cellName(x)}`); fx(st, 'place', x);
    const ab = AB[code]; let idx = x;
    if (ab.sum) idx = yield* runList(st, x, ab.sum, depth, {});
    yield* flushBack(st, depth);
    if (st.board[idx] && st.board[idx].id) {
      yield* resolveMain(st, idx);
      yield* flushBack(st, depth);
      const cur = st.board[idx];
      if (cur && cur.sn > 0 && AB[cur.c].snt) { idx = yield* runList(st, idx, AB[cur.c].snt, depth, {}); yield* flushBack(st, depth); }
    }
  }

  /* ---------- ability sentence interpreter ---------- */
  function parseF(s) {
    const f = { side: 'any', el: [], rng: 0, pmax: null, pmin: null, lt: false, n: 1, up: false, all: false, ab: false, sn: false, other: false };
    if (/\benemy\b/.test(s)) f.side = 'e'; else if (/\ball(y|ied)\b/.test(s)) f.side = 'a';
    for (const m of s.matchAll(/\[(\w)\]/gi)) f.el.push(EL[m[1].toUpperCase()]);
    if (/within 1 space/.test(s)) f.rng = 1; else if (/beyond 1 space/.test(s)) f.rng = 2;
    let m;
    if ((m = s.match(/power (\d+) or less/))) f.pmax = +m[1];
    if ((m = s.match(/power (\d+) or more/))) f.pmin = +m[1];
    if (/lower power than that card/.test(s)) f.lt = true;
    if ((m = s.match(/up to (\d)/))) { f.n = +m[1]; f.up = true; }
    if (/\bevery\b/.test(s)) f.all = true;
    if (/with ability/.test(s)) f.ab = true;
    if (/snatched by me this turn/.test(s)) f.sn = true;
    if (/\b(another|other)\b/.test(s)) f.other = true;
    return f;
  }
  function cellOk(st, X, f, j) {
    const c = st.board[j]; if (!c) return false;
    if ((f.other || f.excl) && j === X.idx) return false;
    if (f.side === 'a' && c.k !== X.p) return false;
    if (f.side === 'e' && c.k === X.p) return false;
    if (f.el.length && !f.el.includes(CARD[c.c].e)) return false;
    if (f.rng === 1 && (j === X.idx || dist(X.idx, j) !== 1)) return false;
    if (f.rng === 2 && dist(X.idx, j) < 2) return false;
    if (f.pmax != null && pw(st, j) > f.pmax) return false;
    if (f.pmin != null && pw(st, j) < f.pmin) return false;
    if (f.lt && X.rev && !(pw(st, j) < CARD[X.rev].p)) return false;
    if (f.ab && !AB[c.c].raw) return false;
    if (f.sn) { const me = st.board[X.idx]; if (!me || !me.sl.includes(c.id)) return false; }
    return true;
  }
  const cellsWhere = (st, fn) => { const o = []; for (let j = 0; j < SZ; j++) if (fn(j)) o.push(j); return o; };
  function ask(X, kind, act, opts, optional, text) { return { who: X.p, kind, act, opts, optional: !!optional, text, src: X.idx }; }
  function* pickCells(st, X, list, optional, act, text) {
    if (!list.length) return -1;
    const r = yield ask(X, 'cell', act, list.map(i => ({ i })), optional, text);
    return r < 0 ? -1 : list[r];
  }
  function* pickMany(st, X, f, baseList, act, text, forceOpt) {
    const chosen = []; const max = f.all ? 99 : f.n;
    for (let k = 0; k < max; k++) {
      const cs = baseList().filter(j => !chosen.includes(j)); if (!cs.length) break;
      const r = yield* pickCells(st, X, cs, forceOpt || f.up || k > 0, act, text);
      if (r < 0) break; chosen.push(r);
    }
    return chosen;
  }
  const wardTo = (st, j) => { const c = st.board[j]; if (c) { c.w = st.mv + 1; fx(st, 'ward', j); } };
  function handOf(st, p, el, extra) { return [...new Set(st.hands[p].filter(c => (!el || CARD[c].e === el) && (!extra || extra(CARD[c]))))]; }
  function weakest(st, p) { return st.hands[p].slice().sort((a, b) => (CARD[a].s - CARD[b].s) || (CARD[a].p - CARD[b].p) || (a < b ? -1 : 1))[0]; }

  function* runList(st, idx, sents, depth, extra) {
    const c = st.board[idx]; if (!c || depth > 3) return idx;
    const X = { idx, id: c.id, p: c.k, did: null, rev: null, depth, byId: extra && extra.byId, after: null };
    for (const s of sents) {
      const cur = st.board[X.idx]; if (!cur || cur.id !== X.id) break;
      yield* sent(st, X, s);
    }
    return X.idx;
  }

  function* sent(st, X, s0) {
    let s = s0.trim().replace(/^then\s+/i, ''); let m;
    const me = () => st.board[X.idx];
    for (; ;) {
      if ((m = s.match(/^if you don't,\s*/i))) { if (X.did !== false) return; }
      else if ((m = s.match(/^if (?:you|i) do,\s*/i))) { if (X.did !== true) return; }
      else if ((m = s.match(/^if there is another ally \[(\w)\] momon,\s*/i))) { const e = EL[m[1].toUpperCase()]; if (!cellsWhere(st, j => j !== X.idx && st.board[j] && st.board[j].k === X.p && CARD[st.board[j].c].e === e).length) return; }
      else if ((m = s.match(/^if there is another ally momon with power (\d+) or more,\s*/i))) { if (!cellsWhere(st, j => j !== X.idx && st.board[j] && st.board[j].k === X.p && pw(st, j) >= +m[1]).length) return; }
      else if ((m = s.match(/^if there are (\d+) or more other ally momons within 1 space of me,\s*/i))) { if (cnt(st, X.idx, X.p, true) < +m[1]) return; }
      else if ((m = s.match(/^if there are (\d+) or more enemy momons within 1 space of me,\s*/i))) { if (cnt(st, X.idx, X.p, false) < +m[1]) return; }
      else if ((m = s.match(/^if i snatched a momon with power (\d+) or more,\s*/i))) { const c = me(); if (!c || !c.sl.some(id => { const z = st.board.find(q => q && q.id === id); return z && CARD[z.c].p >= +m[1]; })) return; }
      else break;
      s = s.slice(m[0].length);
    }
    let opt = false;
    if ((m = s.match(/^(?:you|i|this momon) may\s+/i))) { opt = true; s = s.slice(m[0].length); }
    const L = s.toLowerCase().replace(/\s+/g, ' ').trim();

    /* --- costs from hand --- */
    if ((m = L.match(/^reveal 1 \[(\w)\] momon from your hand(?: and put it into your void| into your void)$/))) {
      const el = EL[m[1].toUpperCase()]; const opts = handOf(st, X.p, el);
      if (!opts.length) { X.did = false; return; }
      const r = yield ask(X, 'card', 'cost', opts.map(c => ({ c })), opt, `เปิดการ์ดธาตุ ${el} จากมือลง Void`);
      if (r < 0) { X.did = false; return; }
      st.hands[X.p].splice(st.hands[X.p].indexOf(opts[r]), 1); st.voids[X.p].push(opts[r]); X.rev = opts[r]; X.did = true;
      say(st, `เปิด ${cn(opts[r])} จากมือลง Void`); return;
    }
    if (L === 'put 1 card from your hand into your void') {
      const opts = handOf(st, X.p); if (!opts.length) return;
      const r = yield ask(X, 'card', 'cost', opts.map(c => ({ c })), false, 'เลือกการ์ด 1 ใบจากมือใส่ Void');
      st.hands[X.p].splice(st.hands[X.p].indexOf(opts[r]), 1); st.voids[X.p].push(opts[r]); say(st, `ใส่ ${cn(opts[r])} ลง Void`); X.did = true; return;
    }

    /* --- ward --- */
    if ((m = L.match(/^i gain ward, and (.*)$/))) { wardTo(st, X.idx); yield* sent(st, X, m[1]); return; }
    if (/^the momon that snatched me gains ward/.test(L)) { const j = st.board.findIndex(z => z && z.id === X.byId); if (j >= 0) wardTo(st, j); return; }
    if (/^i gain ward/.test(L)) { wardTo(st, X.idx); X.did = true; return; }
    if (/gains? ward/.test(L)) {
      const f = parseF(L.replace(/ gains? ward.*$/, '')); if (f.side === 'any') f.side = 'a';
      if (/\btarget\b/.test(L) && !f.up && !/^another|^other/.test(L)) f.excl = false;
      const ch = yield* pickMany(st, X, f, () => cellsWhere(st, j => cellOk(st, X, f, j)), 'ward', 'เลือกการ์ดที่จะได้ Ward', false);
      ch.forEach(j => wardTo(st, j)); X.did = ch.length > 0; return;
    }
    if (/^all enemy momon within 1 space of me lose ward/.test(L)) { for (const j of nb(X.idx)) { const z = st.board[j]; if (z && z.k !== X.p) z.w = 0; } return; }
    if (/^all allied momon can't be snatched by abilities of enemy momon until end of your next turn/.test(L)) { st.shield[X.p] = st.mv + 2; return; }

    /* --- misc --- */
    if (/^take control of the first player token/.test(L)) { st.tok = X.p; say(st, `${PN[X.p]} ยึด First Player Token`); return; }
    if (/^i can't snatch again this turn|^this card can't snatch until the end of this turn/.test(L)) { const c = me(); if (c) c.noSn = st.mv; return; }
    if (/^put 1 random card from target opponent's hand into their void/.test(L)) {
      const o = 1 - X.p; const h = st.hands[o]; if (!h.length) { X.rnd = null; return; }
      const k = Math.floor(rnd(st) * h.length); const code = h.splice(k, 1)[0]; st.voids[o].push(code); X.rnd = { p: o, code };
      say(st, `สุ่มการ์ดจากมือ ${PN[o]} ลง Void`); return;
    }
    if (/^return that card to its owner's hand at the end of their next turn/.test(L)) {
      if (X.rnd) { const v = st.voids[X.rnd.p]; v.splice(v.lastIndexOf(X.rnd.code), 1); st.ret.push({ p: X.rnd.p, code: X.rnd.code, at: st.mv + 1 }); } return;
    }
    if (/^your opponent chooses 1 card from their hand and puts it into their void/.test(L)) {
      const o = 1 - X.p; if (!st.hands[o].length) return; const code = weakest(st, o);
      st.hands[o].splice(st.hands[o].indexOf(code), 1); st.voids[o].push(code); say(st, `${PN[o]} ทิ้ง ${cn(code)} ลง Void`); return;
    }

    /* --- incite --- */
    if ((m = L.match(/^incite (.*)$/))) {
      if (m[1] === 'me') { yield* incite(st, X.idx, X.depth + 1); return; }
      const f = parseF(m[1]); if (f.side === 'any') f.side = 'a';
      const j = yield* pickCells(st, X, cellsWhere(st, k => cellOk(st, X, f, k)), false, 'incite', 'เลือกการ์ดที่จะ Incite');
      if (j >= 0) yield* incite(st, j, X.depth + 1); return;
    }

    /* --- swap --- */
    if ((m = L.match(/^swap me with (.*)$/))) {
      const f = parseF(m[1]); f.excl = true;
      const j = yield* pickCells(st, X, cellsWhere(st, k => cellOk(st, X, f, k)), opt, 'swap', 'เลือกการ์ดที่จะสลับตำแหน่งด้วย');
      if (j < 0) { X.did = false; return; }
      const from = X.idx; swapCells(st, from, j); say(st, `สลับ ${cellName(from)} ↔ ${cellName(j)}`); X.idx = j; X.did = true;
      yield* afterMove(st, [from], X.id); return;
    }

    /* --- move --- */
    if ((m = L.match(/^move (.*?) to (.*?)( and i may snatch them)?$/))) {
      const f = parseF(m[1]); f.rng = 0; if (f.side === 'any') f.side = 'a';
      if (/^another/.test(m[1])) f.excl = true;
      const dr = /within 1 space of me/.test(m[2]) ? 1 : 0; const moved = [];
      for (let k = 0, mx = f.n; k < mx; k++) {
        const ts = cellsWhere(st, j => cellOk(st, X, f, j) && !moved.includes(st.board[j].id) && cellsWhere(st, d => !st.board[d] && (!dr || (d !== X.idx && dist(X.idx, d) === 1))).length > 0);
        const j = yield* pickCells(st, X, ts, opt || k > 0, 'move', 'เลือกการ์ดที่จะย้าย'); if (j < 0) break;
        const ds = cellsWhere(st, d => !st.board[d] && (!dr || (d !== X.idx && dist(X.idx, d) === 1)));
        const d = yield* pickCells(st, X, ds, false, 'dest', 'เลือกช่องว่างปลายทาง');
        const card = st.board[j]; st.board[d] = card; st.board[j] = null; moved.push(card.id); fx(st, 'move', d); say(st, `ย้าย ${cn(card.c)} ${cellName(j)} → ${cellName(d)}`);
        if (X.idx === j) X.idx = d;
        yield* afterMove(st, [d], X.id);
      }
      X.did = moved.length > 0;
      if (m[3] && moved.length) {
        for (const id of moved) {
          const j = st.board.findIndex(z => z && z.id === id); const cur = me(); if (j < 0 || !cur || st.board[j].k === X.p || immune(st, X.idx, j, true)) continue;
          const r = yield ask(X, 'yn', 'snatch', [{ i: j }], true, `Snatch ${cn(st.board[j].c)} ที่เพิ่งย้าย?`);
          if (r >= 0) { doSnatch(st, X.idx, [j], 'ยึด (ability)'); yield* flushBack(st, X.depth + 1); }
        }
      }
      return;
    }

    /* --- put ally into void + summon --- */
    if ((m = L.match(/^put target ally momon into its owner's void/))) {
      const f = parseF('ally'); f.excl = true;
      const j = yield* pickCells(st, X, cellsWhere(st, k => cellOk(st, X, f, k)), opt, 'void', 'เลือกการ์ดฝั่งเราที่จะใส่ Void');
      if (j < 0) { X.did = false; return; }
      const card = st.board[j]; st.board[j] = null; st.voids[card.o].push(card.c); X.free = j; X.did = true; fx(st, 'void', j); say(st, `${cn(card.c)} ลง Void`); return;
    }
    if ((m = L.match(/^summon 1 \[(\w)\] momon with (\d) stars or less from your hand to that space/))) {
      const el = EL[m[1].toUpperCase()], mx = +m[2];
      if (X.free == null || st.board[X.free]) return;
      const opts = handOf(st, X.p, el, c => c.s <= mx); if (!opts.length) return;
      const r = yield ask(X, 'card', 'summon', opts.map(c => ({ c })), true, `เลือกการ์ดธาตุ ${el} (≤${mx}★) ที่จะ summon`);
      if (r < 0) return;
      yield* summon(st, X.p, opts[r], X.free, X.depth + 1); return;
    }

    /* --- snatch (ability) --- */
    if ((m = L.match(/^(?:i|this momon) may snatch (.*)$|^snatch (.*)$|^(.*)$/)) && /snatch/.test(L) && !/snatched/.test(L)) {
      const body = (L.match(/snatch (.*)$/) || [])[1] || '';
      const f = parseF(body); f.side = 'e';
      const lst = () => cellsWhere(st, j => cellOk(st, X, f, j) && !immune(st, X.idx, j, true));
      let chosen = [];
      if (f.all) {
        const all = lst(); if (!all.length) { X.did = false; return; }
        const r = yield ask(X, 'yn', 'snatch', all.map(i => ({ i })), opt, `Snatch ทั้งหมด ${all.length} ใบ?`);
        if (r < 0) { X.did = false; return; } chosen = all;
      } else chosen = yield* pickMany(st, X, f, lst, 'snatch', 'เลือกเป้าหมายที่จะ Snatch', opt);
      if (chosen.length > 1) chosen = chosen.filter(j => !(AB[st.board[j].c].s.tog && st.board[j].k === st.board[j].o));
      if (!chosen.length) { X.did = false; return; }
      doSnatch(st, X.idx, chosen, 'ยึด (ability)'); X.did = true; yield* flushBack(st, X.depth + 1); return;
    }
    UNSUP.add('SENT: ' + s0);
  }

  /* ---------- turn flow ---------- */
  function endCheck(st) {
    if (st.board.every(c => c)) return true;
    return !st.hands[0].length && !st.hands[1].length && !st.ret.length && !st.voids[0].length && !st.voids[1].length;
  }
  /* กฎ Void: ถ้าถึงตาเราแล้วมือหมด แต่ Void ยังมีการ์ด → คู่ต่อสู้สุ่มการ์ดจาก Void ของเราขึ้นมือให้ (ค่าเริ่มต้น 1 ใบ) */
  function voidRefill(st) {
    const p = st.turn, v = st.voids[p]; if (st.hands[p].length || !v.length || st.ret.some(r => r.p === p)) return false;
    const n = Math.max(1, Math.min(v.length, (st.rules.vd | 0) || 1)), got = [];
    for (let i = 0; i < n; i++) { const k = Math.floor(rnd(st) * v.length); got.push(v.splice(k, 1)[0]); }
    st.hands[p].push(...got); st.last = null;
    st.refill = { p, cards: got.slice(), at: st.mv };
    say(st, `${PN[1 - p]} สุ่มการ์ดจาก Void ของ ${PN[p]} ขึ้นมือ: ${got.map(cn).join(', ')}`);
    return true;
  }
  function finish(st) {
    st.over = true; const a = score(st, 0), b = score(st, 1);
    let w = a > b ? 0 : b > a ? 1 : st.tok; st.res = { w, sc: [a, b], tie: a === b };
    say(st, `จบเกม ${a}-${b} ${a === b ? '(เท่ากัน → First Player Token)' : ''} ผู้ชนะ ${PN[w]}`);
  }
  function advance(st) {
    for (let i = 0; i < st.ret.length;) { const r = st.ret[i]; if (r.at === st.mv) { st.hands[r.p].push(r.code); st.ret.splice(i, 1); } else i++; }
    st.mv++; st.turn = (st.start + st.mv) % 2;
    if (endCheck(st)) { finish(st); return; }
    voidRefill(st);
    if (!st.hands[st.turn].length) { say(st, `${PN[st.turn]} ไม่มีการ์ดให้ลง (ข้ามเทิร์น)`); advance(st); }
  }
  function endOfTurn(st) {
    const n = st.board.filter(Boolean).length;
    for (let i = 0; i < SZ; i++) { const c = st.board[i]; if (c && AB[c.c].eot && c.t === st.mv && c.k === st.turn && c.sn === 0 && n >= 4) wardTo(st, i); }
  }
  function legal(st) {
    if (st.over) return []; const o = [];
    for (const code of [...new Set(st.hands[st.turn])]) for (let x = 0; x < SZ; x++) if (!st.board[x]) o.push({ c: code, x });
    return o;
  }
  /** generator version: yields prompts. Returns when the turn is fully resolved. */
  function* applyG(st, mv) {
    if (st.over) throw new Error('game over');
    if (!st.hands[st.turn].includes(mv.c)) throw new Error('card not in hand');
    if (mv.x < 0 || mv.x >= SZ || st.board[mv.x]) throw new Error('bad cell');
    st.fx = []; st.log = st.log.slice(-200);
    const p = st.turn;
    yield* summon(st, p, mv.c, mv.x, 0);
    endOfTurn(st);
    st.last = { p, c: mv.c, x: mv.x };
    advance(st);
  }
  function run(gen, chooser, rec) {
    let r = gen.next();
    while (!r.done) { const a = chooser(r.value); if (rec) rec.push(a); r = gen.next(a); }
    return r.value;
  }
  /** sync apply. chooser(prompt, st) -> index (-1 = skip). returns recorded choices */
  function apply(st, mv, chooser) {
    const rec = []; run(applyG(st, mv), p => chooser ? chooser(p, st) : -1, rec); return rec;
  }
  function replayChooser(list) { let k = 0; return () => { if (k >= list.length) throw new Error('choice list exhausted'); return list[k++]; }; }

  /* ---------- bot ---------- */
  const val = c => CARD[c].p + CARD[c].s * 0.5;
  function autoChooser(level) {
    return (pr, st) => {
      if (pr.kind === 'cell' || pr.kind === 'yn') {
        if (pr.act === 'snatch' || pr.act === 'incite') {
          let b = -1, bv = -1e9;
          pr.opts.forEach((o, k) => { const c = st.board[o.i]; const v = c ? CARD[c.c].p + (c.k !== pr.who ? 3 : 0) : 0; if (v > bv) { bv = v; b = k; } });
          return b;
        }
        if (pr.act === 'void') return -1;
        if (pr.act === 'ward') { let b = 0, bv = -1e9; pr.opts.forEach((o, k) => { const c = st.board[o.i]; const v = c ? CARD[c.c].p - (c.w >= st.mv && c.w > 0 ? 100 : 0) : 0; if (v > bv) { bv = v; b = k; } }); return b; }
        return pr.optional && level === 'easy' ? -1 : 0;
      }
      if (pr.kind === 'card') {
        let b = -1, bv = 1e9; pr.opts.forEach((o, k) => { const v = val(o.c); if (v < bv) { bv = v; b = k; } });
        if (pr.optional && (CARD[pr.opts[b].c].p >= 8 || level === 'easy')) return -1;
        return b;
      }
      return 0;
    };
  }
  function evalState(st, p) {
    let v = score(st, p) - score(st, 1 - p);
    for (const c of st.board) if (c) { const sgn = c.k === p ? 1 : -1; v += sgn * 0.06 * CARD[c.c].p; if (warded(st, c)) v += sgn * 0.25; }
    let h = 0; for (const c of st.hands[p]) h += CARD[c].p; for (const c of st.hands[1 - p]) h -= CARD[c].p; v += 0.02 * h;
    return v;
  }
  function trySim(st, mv, level) {
    const t = clone(st); try { apply(t, mv, autoChooser(level)); } catch (e) { return null; } return t;
  }
  function botMove(st, level) {
    level = level || 'normal'; const p = st.turn; const ms = legal(st); if (!ms.length) return null;
    const scored = [];
    for (const mv of ms) {
      const t = trySim(st, mv, level); if (!t) continue;
      let v = evalState(t, p);
      if (level !== 'easy') {
        // positional hint: prefer cells with fewer empty neighbors that enemy can hit
        v += (Math.random() - 0.5) * 0.02;
      }
      scored.push({ mv, v, t });
    }
    if (!scored.length) return ms[0];
    scored.sort((a, b) => b.v - a.v);
    if (level === 'easy') { const k = Math.min(scored.length, 1 + Math.floor(scored.length * 0.6)); return scored[Math.floor(Math.random() * k)].mv; }
    if (level === 'normal') { const top = scored.filter(s => s.v >= scored[0].v - 0.3); return top[Math.floor(Math.random() * top.length)].mv; }
    // hard: 2-ply (opponent best reply), only top candidates
    const K = Math.min(scored.length, 14); let best = null;
    for (let i = 0; i < K; i++) {
      const s = scored[i]; let worst = evalState(s.t, p);
      if (!s.t.over) {
        const rep = legal(s.t); let rb = -1e9;
        for (const r of rep) { const t2 = trySim(s.t, r, level); if (!t2) continue; const v2 = evalState(t2, 1 - p); if (v2 > rb) { rb = v2; worst = -v2; } }
        if (!rep.length) worst = evalState(s.t, p);
      }
      const tot = worst * 0.75 + s.v * 0.25 + (Math.random() - 0.5) * 0.02;
      if (!best || tot > best.tot) best = { mv: s.mv, tot };
    }
    return best.mv;
  }

  /** full replay helper for online: build state from setup + move list */
  function replay(setup, moves) {
    const st = newGame(setup);
    for (const m of moves) { if (m.p != null && m.p !== st.turn) throw new Error('turn mismatch'); apply(st, { c: m.c, x: m.x }, replayChooser(m.ch || [])); }
    return st;
  }

  return { setNamer: f => { NAMER = f; }, rawName, init, newGame, clone, legal, applyG, apply, run, replay, replayChooser, autoChooser, botMove, score, pw, previewSnatch, canMain, cellName, step, nb, dist, warded, beats,
    get CARD() { return CARD; }, get AB() { return AB; }, UNSUP, RULES_NOTE, SZ, EL, PN };
});
