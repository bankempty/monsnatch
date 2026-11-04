'use strict';
/* Monsnatch — โหมดเล่น (ฝึกกับบอท + ออนไลน์แบบไม่ต้อง Login)
   ต้องโหลดหลัง app.js และ engine.js  */
(function () {
  function boot() {
    const A = window.MSAPP, E = window.MSE;
    const { BY, C, esc, toast } = A;
    E.init(C);
    const $ = id => document.getElementById(id);
    const root = $('gameRoot');
    const OPT_KEY = 'ms-play-opt', SESS_KEY = 'ms-session';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const LV = { easy: 'ง่าย', normal: 'ปกติ', hard: 'ยาก' };
    const store = {
      get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
      del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    };
    const opt = Object.assign({ level: 'normal', oppDeck: 'fire', first: 'rand', elem: true, name: '' }, store.get(OPT_KEY, {}));
    const saveOpt = () => store.set(OPT_KEY, opt);

    /* ---------- global game state ---------- */
    const G = { screen: 'lobby', mode: null, st: null, me: 0, names: ['คุณ', 'คู่ต่อสู้'], sel: null, tgt: null, inspect: null, prompt: null, busy: false,
      fxN: 0, o: null, applied: 0, pollTok: 0, netErr: 0, endInfo: null, err: '', info: '', opp_age: 0, rooms: [], roomsTok: 0, thinking: false, rematch: false };

    /* ---------- util ---------- */
    const flip = () => false; /* ทั้งสองฝั่งเห็นกระดานเหมือนกัน — การ์ดของผู้เล่น 1 หันกลับหัวแทน */
    const di2i = d => (flip() ? 15 - d : d);
    E.setNamer(i => E.rawName(flip() ? 15 - i : i));
    function setNames(a, b) { G.names = [a, b]; E.PN[0] = a; E.PN[1] = b; }
    function newKey() { const a = new Uint8Array(20); (crypto || window.msCrypto).getRandomValues(a); return Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); }
    function randDeck() {
      const pool = C.filter(c => c.e !== 'origin');
      for (let t = 0; t < 500; t++) {
        const p = pool.slice().sort(() => Math.random() - .5); const out = []; let s = 0; const nm = new Set();
        for (const c of p) { if (nm.has(c.n) || s + c.s > A.MAXSTAR) continue; out.push(c.c); nm.add(c.n); s += c.s; if (out.length === 10) return out; }
      }
      return A.PRESET.fire.slice();
    }
    const myDeck = () => A.getDeck();
    const deckOk = () => A.validDeck(myDeck());
    const img = (c, big) => { const src = big ? (c.im || c.th) : (c.th || c.im); return `<span class="ph" aria-hidden="true">${esc(c.n.slice(0, 1))}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}`; };
    function tile(c) { return `<span class="mini gc" style="--c:var(--el-${c.e})" title="${esc(c.n)}">${img(c)}</span>`; }

    /* ---------- RPC ---------- */
    async function rpc(fn, args) {
      const r = await A.sb('rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}) });
      if (!r.ok) {
        let msg = await A.sbError(r);
        if (r.status === 404 || /Could not find the function/i.test(msg)) msg = 'ยังไม่ได้ติดตั้งระบบออนไลน์ — ให้รัน online.sql ใน Supabase SQL Editor ก่อน';
        throw new Error(msg);
      }
      const t = await r.text(); return t ? JSON.parse(t) : null;
    }

    /* ---------- mode switch ---------- */
    function setMode(m) {
      document.body.dataset.mode = m;
      document.querySelectorAll('.modes [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
      $('viewBuild').hidden = m !== 'build'; $('viewPlay').hidden = m !== 'play'; $('viewRules').hidden = m !== 'rules';
      if (m === 'play') render(); if (m === 'rules') renderRules();
      window.scrollTo({ top: 0 });
      try { history.replaceState(null, '', location.pathname + location.search.replace(/[?&]room=[^&]*/, '').replace(/^&/, '?') + (m === 'build' ? '' : '#' + m)); } catch (e) {}
    }
    document.addEventListener('click', ev => { const b = ev.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode); });

    /* ---------- rendering ---------- */
    function render() {
      if ($('viewPlay').hidden) return;
      if (G.screen === 'lobby') return renderLobby();
      if (G.screen === 'wait') return renderWait();
      return renderGame();
    }

    function deckStrip() {
      const d = myDeck(); const ok = deckOk(); const st = A.stats(d);
      return `<div class="deckstrip">
        <div class="ds-h"><b>เด็คที่จะใช้เล่น</b><span class="pill ${ok ? 'good' : 'bad'}">${d.length}/10 ใบ · ${st}★${ok ? ' · พร้อมเล่น' : ''}</span></div>
        <div class="ds-t">${d.map(x => tile(BY[x])).join('') || '<span class="muted">ยังไม่มีการ์ดในเด็ค</span>'}</div>
        ${ok ? '' : `<p class="warn">เด็คต้องมี 10 ใบพอดี ไม่เกิน 25 ดาว และชื่อไม่ซ้ำ — จัดเด็คก่อน หรือเลือกเด็คตัวอย่าง</p>`}
        <div class="ds-b"><button class="btn" data-g="build">✎ จัด/แก้เด็ค</button><button class="btn" data-g="preset" data-k="ice">ใช้เด็ค ไอซ์-เอิร์ธ</button><button class="btn" data-g="preset" data-k="fire">ใช้เด็ค ไฟ-ไอซ์</button><button class="btn" data-g="preset" data-k="rand">สุ่มเด็ค</button></div>
      </div>`;
    }
    function sessBanner() {
      const s = store.get(SESS_KEY, null); if (!s || G.o) return '';
      return `<div class="banner"><span>มีเกมออนไลน์ค้างอยู่ — ห้อง <b class="mono">${esc(s.code)}</b></span><span><button class="btn primary" data-g="resume">กลับเข้าเกม</button> <button class="btn" data-g="dropsess">ลืมห้องนี้</button></span></div>`;
    }
    function roomsHtml() {
      if (!A.SB_ON) return '';
      const rs = G.rooms;
      return `<section class="card rooms"><h3>ห้องที่กำลังรอผู้เล่น</h3>${rs.length ? rs.map(r => `<div class="roomrow"><span><b>${esc(r.host_name)}</b> <span class="mono muted">${esc(r.code)}</span></span><button class="btn primary" data-g="join" data-code="${esc(r.code)}">เข้าห้อง</button></div>`).join('') : '<p class="muted">ยังไม่มีห้องที่เปิดรออยู่ — กด "สุ่มจับคู่" หรือ "สร้างห้อง" เพื่อเป็นคนแรก แล้วชวนเพื่อนเข้ามา</p>'}</section>`;
    }
    function renderLobby() {
      const ok = deckOk(); const dis = ok ? '' : 'disabled';
      const room = new URLSearchParams(location.search).get('room');
      root.innerHTML = `
      ${sessBanner()}
      <section class="card hero"><div><h2>สนามเล่น Monsnatch</h2><p class="muted">ลงการ์ดบนกระดาน 4×4 แล้ว Snatch การ์ดฝั่งตรงข้ามให้มากกว่า ฝึกกับบอทได้ทันที หรือเล่นออนไลน์กับเพื่อน — ไม่ต้องสมัคร ไม่ต้อง Login</p></div>${deckStrip()}</section>
      <div class="grid2">
        <section class="card">
          <h3><span class="ico">🤖</span> ฝึกเล่นกับบอท</h3>
          <label class="fld">ความยาก<select id="oLevel">${Object.keys(LV).map(k => `<option value="${k}" ${opt.level === k ? 'selected' : ''}>${LV[k]}</option>`).join('')}</select></label>
          <label class="fld">เด็คของบอท<select id="oOpp"><option value="fire" ${opt.oppDeck === 'fire' ? 'selected' : ''}>ไฟ-ไอซ์ (บุกหนัก)</option><option value="ice" ${opt.oppDeck === 'ice' ? 'selected' : ''}>ไอซ์-เอิร์ธ (ป้องกันแน่น)</option><option value="rand" ${opt.oppDeck === 'rand' ? 'selected' : ''}>สุ่มเด็คใหม่ทุกเกม</option><option value="mirror" ${opt.oppDeck === 'mirror' ? 'selected' : ''}>เด็คเดียวกับเรา</option></select></label>
          <label class="fld">ใครเริ่มก่อน<select id="oFirst"><option value="rand" ${opt.first === 'rand' ? 'selected' : ''}>สุ่ม</option><option value="me" ${opt.first === 'me' ? 'selected' : ''}>เราก่อน</option><option value="bot" ${opt.first === 'bot' ? 'selected' : ''}>บอทก่อน</option></select></label>
          <label class="chk"><input type="checkbox" id="oElem" ${opt.elem ? 'checked' : ''}> ธาตุได้เปรียบทำให้ Snatch สำเร็จ (ปิด = ใช้ Power อย่างเดียว)</label>
          <button class="btn primary big" data-g="bot" ${dis}>เริ่มเล่นกับบอท</button>
        </section>
        <section class="card">
          <h3><span class="ico">🌐</span> เล่นออนไลน์</h3>
          ${A.SB_ON ? `
          <label class="fld">ชื่อที่แสดง<input id="oName" maxlength="20" placeholder="เช่น Bank" value="${esc(opt.name)}"></label>
          <div class="btnrow"><button class="btn primary big" data-g="quick" ${dis}>⚡ สุ่มจับคู่</button><button class="btn big" data-g="create" ${dis}>สร้างห้อง</button></div>
          <div class="joinrow"><input id="oCode" class="mono" maxlength="5" placeholder="รหัสห้อง 5 ตัว" value="${esc((room || '').toUpperCase())}" autocomplete="off" autocapitalize="characters"><button class="btn" data-g="joincode" ${dis}>เข้าห้อง</button></div>
          ${room ? `<p class="hint">ลิงก์ชวนเล่นห้อง <b class="mono">${esc(room.toUpperCase())}</b> — กด "เข้าห้อง" ได้เลย</p>` : ''}
          ` : `<p class="warn">ยังไม่ได้เชื่อม Supabase (ใส่ URL และ anon key ใน config.js) จึงเล่นออนไลน์ไม่ได้</p>`}
          ${G.err ? `<p class="err" role="alert">${esc(G.err)}</p>` : ''}
        </section>
      </div>
      ${roomsHtml()}
      <details class="card note"><summary>กติกาที่ใช้ในเกมนี้ (สรุป)</summary><ul>${E.RULES_NOTE.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="muted">กติกาทางการอยู่ในหน้า Rules ของ monsnatch.com ซึ่งโหลดด้วย JavaScript อ่านอัตโนมัติไม่ได้ กติกาในนี้จึงสร้างจากคำอธิบายคำศัพท์ทางการและข้อความบนการ์ดทั้งหมด หากต่างจากของจริงบอกได้เลย ปรับแก้ได้</p></details>`;
    }

    function renderWait() {
      const o = G.o || {}; const link = location.origin + location.pathname + '?room=' + o.code;
      root.innerHTML = `<section class="card wait"><div class="spin" aria-hidden="true"></div><h2>รอคู่ต่อสู้เข้าห้อง…</h2>
        <p class="muted">ส่งรหัสหรือลิงก์นี้ให้เพื่อน (หรือรอระบบสุ่มจับคู่)</p>
        <div class="roomcode mono" aria-label="รหัสห้อง">${esc(o.code || '')}</div>
        <div class="btnrow center"><button class="btn primary" data-g="copy" data-v="${esc(link)}">คัดลอกลิงก์ชวน</button><button class="btn" data-g="copy" data-v="${esc(o.code || '')}">คัดลอกรหัส</button></div>
        ${G.err ? `<p class="err">${esc(G.err)}</p>` : ''}
        <p><button class="btn" data-g="cancelroom">ยกเลิกห้อง</button></p></section>`;
    }

    /* ---- game screen ---- */
    function cellHtml(d, fxs, fxStart) {
      const i = di2i(d), st = G.st, c = st.board[i];
      const cls = ['cell']; let inner = '';
      const pk = G.prompt && G.prompt.cells && G.prompt.cells.includes(i);
      const tg = G.tgt === i;
      if (c) {
        const cd = BY[c.c], mine = c.k === G.me;
        cls.push(mine ? 'mine' : 'theirs', 'full');
        const p = E.pw(st, i), base = cd.p;
        const w = E.warded(st, c);
        cls.push(c.k === 1 ? 'o1' : 'o0');
        inner = `<span class="gc cimg" style="--c:var(--el-${cd.e})">${img(cd)}</span><b class="pw ${p > base ? 'up' : p < base ? 'dn' : ''}">${p}</b>${w ? '<i class="wd" title="Ward">🛡</i>' : ''}<i class="mk ${mine ? 'me' : 'op'}"></i>`;
        inner = `<span class="cw">${inner}</span>`;
        if (c.o !== c.k) inner = inner.replace(/<\/span>$/, `<i class="own ${c.o === G.me ? 'me' : 'op'}" title="เจ้าของเดิม"></i></span>`);
        for (const f of fxs.slice(fxStart)) if (f.i === i) cls.push('fx-' + f.t);
      } else {
        cls.push('empty');
        if (G.sel && st.turn === G.me && !G.prompt && !G.busy) cls.push('can');
        if (tg) { cls.push('tgt'); const cd = BY[G.sel]; if (cd) cls.push(G.me === 1 ? 'o1' : 'o0'); inner = `<span class="ghost gc" style="--c:var(--el-${cd.e})">${img(cd)}</span><span class="sight">${A.compass(cd.d)}</span>`; }
      }
      if (G.will && G.will.includes(i)) cls.push('will');
      if (pk) cls.push('pick');
      if (G.inspect && G.inspect.cell === i) cls.push('insp');
      if (st.last && st.last.x === i) cls.push('lastp');
      return `<button class="${cls.join(' ')}" data-cell="${i}" aria-label="ช่อง ${E.cellName(i)}${c ? ' ' + esc(BY[c.c].n) : ' ว่าง'}"><span class="cn">${E.cellName(i)}</span>${inner}</button>`;
    }
    function handHtml() {
      const st = G.st, h = st.hands[G.me].slice().sort((a, b) => BY[b].p - BY[a].p || BY[b].s - BY[a].s);
      const myTurn = st.turn === G.me && !st.over && !G.busy;
      const pc = G.prompt && G.prompt.cards;
      return h.map(code => {
        const c = BY[code], sel = G.sel === code, pick = pc && pc.includes(code);
        return `<button class="hc ${sel ? 'sel' : ''} ${pick ? 'pick' : ''} ${pc && !pick ? 'dim' : ''} ${myTurn || pc ? '' : 'wait'}" data-hand="${code}" style="--c:var(--el-${c.e})" aria-label="${esc(c.n)} พลัง ${c.p} ${c.s} ดาว" aria-pressed="${sel}">
          <span class="gc himg">${img(c)}</span><b class="hp">${c.p}</b><b class="hs">${c.s}★</b><span class="hn">${esc(c.n)}</span></button>`;
      }).join('') || '<span class="muted">ไม่เหลือการ์ดในมือ</span>';
    }
    function infoHtml() {
      let code = G.sel; if (!code && G.inspect) code = G.inspect.code; if (!code) return '<p class="muted">แตะการ์ดในมือหรือบนกระดานเพื่อดูรายละเอียดและความสามารถ</p>';
      const c = BY[code]; if (!c) return '';
      return `<div class="info"><div class="info-img gc" style="--c:var(--el-${c.e})" data-act="zoom" data-code="${c.c}" role="button" tabindex="0" aria-label="ดูรูปใหญ่">${img(c, true)}</div>
        <div class="info-t"><h4>${esc(c.n)}</h4><div class="line">${A.elChip(c.e)}<span class="badge">พลัง ${c.p}</span><span class="badge">${c.s} ดาว</span></div><div class="cmp">${A.compass(c.d)}<span class="muted">ทิศ Snatch</span></div>
        ${c.a ? `<p>${A.abHtml(c.t || c.a)}</p>` : '<p class="muted">ไม่มีความสามารถพิเศษ</p>'}
        ${c.b.length ? `<div class="line"><span class="muted">ชนะธาตุ</span>${c.b.map(e => A.elChip(e, true)).join('')}</div>` : ''}</div></div>`;
    }
    function actionHtml() {
      const st = G.st;
      if (G.prompt) {
        const pr = G.prompt.pr; let btns = '';
        if (pr.kind === 'yn') btns += `<button class="btn primary" data-g="yn" data-v="0">ยืนยัน</button>`;
        if (pr.optional) btns += `<button class="btn" data-g="skip">ข้าม / ไม่ใช้</button>`;
        return `<div class="abar prompt"><b>${esc(pr.text || 'เลือก')}</b><span>${pr.kind === 'card' ? 'แตะการ์ดที่ไฮไลต์ในมือ' : pr.kind === 'cell' ? 'แตะช่องที่ไฮไลต์บนกระดาน' : ''}</span><span class="grow"></span>${btns}</div>`;
      }
      if (st.over) return `<div class="abar"><b>จบเกม</b></div>`;
      if (G.thinking) return `<div class="abar"><span class="dots">บอทกำลังคิด</span></div>`;
      if (st.turn !== G.me) return `<div class="abar"><span class="dots">รอ ${esc(G.names[st.turn])} เดิน</span></div>`;
      if (G.busy) return `<div class="abar"><span class="dots">กำลังส่งตาเดิน</span></div>`;
      if (!G.sel) return `<div class="abar my"><b>ถึงตาคุณ</b><span>เลือกการ์ดจากมือ แล้วแตะช่องว่างที่จะวาง</span></div>`;
      if (G.tgt == null) return `<div class="abar my"><b>${esc(BY[G.sel].n)}</b><span>แตะช่องว่างบนกระดานเพื่อวาง (จะแสดงตัวอย่างการ Snatch)</span></div>`;
      const w = G.will || [];
      return `<div class="abar my"><b>ลง ${esc(BY[G.sel].n)} ที่ ${E.cellName(G.tgt)}</b><span>${w.length ? `Snatch ได้แน่ ๆ ${w.length} ใบ (ยังไม่รวมความสามารถการ์ด)` : 'ยังไม่ Snatch ใครจากทิศปกติ'}</span><span class="grow"></span><button class="btn primary" data-g="place">ลงการ์ด</button><button class="btn" data-g="unsel">ยกเลิก</button></div>`;
    }
    function sideBar(p) {
      const st = G.st, mine = p === G.me;
      const tok = st.tok === p ? '<span class="tok" title="First Player Token (ชนะเมื่อคะแนนเท่ากัน)">⚑</span>' : '';
      const turn = !st.over && st.turn === p ? ' turn' : '';
      const online = G.mode === 'online' && !mine ? `<span class="net ${G.opp_age > 15 ? 'off' : 'on'}" title="${G.opp_age > 15 ? 'ออฟไลน์?' : 'ออนไลน์'}"></span>` : '';
      const backs = mine ? '' : `<span class="backs">${'<i></i>'.repeat(st.hands[p].length)}</span>`;
      return `<div class="side ${mine ? 'me' : 'op'}${turn}">${online}<b class="nm">${esc(G.names[p])}</b>${tok}${backs}<span class="meta">มือ ${st.hands[p].length} · Void ${st.voids[p].length}</span><span class="score"><small>คะแนน</small>${E.score(st, p)}</span></div>`;
    }
    function renderGame() {
      const st = G.st; if (!st) return;
      const fxStart = st.fx.length < G.fxN ? 0 : G.fxN; G.fxN = st.fx.length;
      const cells = Array.from({ length: 16 }, (_, d) => cellHtml(d, st.fx, fxStart)).join('');
      const opp = 1 - G.me;
      const logs = st.log.slice(-14).reverse().map(l => `<li>${esc(l)}</li>`).join('');
      let end = '';
      if ((st.over || G.endInfo) && !G.hideEnd) {
        let title, sub;
        if (G.endInfo && !st.over) { const w = G.endInfo.w; title = w === G.me ? 'คุณชนะ!' : 'คุณแพ้'; sub = G.endInfo.resign ? (w === G.me ? 'คู่ต่อสู้ยอมแพ้' : 'คุณยอมแพ้') : G.endInfo.timeout ? (w === G.me ? 'คู่ต่อสู้หายไปจากเกม' : 'ถูกตัดสินแพ้เพราะหายไปนาน') : ''; }
        else { const r = st.res, w = r.w; title = w === G.me ? 'คุณชนะ!' : 'คุณแพ้'; sub = `${E.score(st, G.me)} : ${E.score(st, opp)}${r.tie ? ' · คะแนนเท่ากัน ตัดสินด้วย First Player Token' : ''}`; }
        end = `<div class="end" role="dialog" aria-label="ผลเกม"><div class="endbox ${title.includes('ชนะ') ? 'win' : 'lose'}"><h2>${title}</h2><p>${esc(sub)}</p><div class="btnrow center">${G.mode === 'bot' ? '<button class="btn primary" data-g="again">เล่นอีกครั้ง</button>' : ''}<button class="btn ${G.mode === 'bot' ? '' : 'primary'}" data-g="lobby">กลับสนามเล่น</button><button class="btn" data-g="hideend">ดูกระดาน</button></div></div></div>`;
      }
      const net = G.mode === 'online' && !st.over && !G.endInfo && G.opp_age > 15 ? `<div class="banner warnb"><span>คู่ต่อสู้ไม่ตอบสนองมา ${Math.round(G.opp_age)} วินาที</span>${G.opp_age > 75 ? '<button class="btn primary" data-g="claim">ประกาศชนะ (อีกฝ่ายหาย)</button>' : '<span class="muted">รอสักครู่ก่อนจะประกาศชนะได้</span>'}</div>` : '';
      const desync = G.err ? `<div class="banner warnb"><span>${esc(G.err)}</span></div>` : '';
      root.innerHTML = `${net}${desync}
      <div class="gamegrid">
        <div class="gleft">
          ${sideBar(opp)}
          <div class="board ${flip() ? 'flipped' : ''}" role="grid" aria-label="กระดาน 4x4">${cells}</div>
          ${sideBar(G.me)}
          ${actionHtml()}
          <div class="hand" aria-label="การ์ดในมือ">${handHtml()}</div>
          <div class="gbtns"><button class="btn" data-g="${G.mode === 'online' ? 'resign' : 'lobby'}">${G.mode === 'online' ? 'ยอมแพ้' : 'ออกจากเกม'}</button>${G.mode === 'bot' ? `<span class="muted">บอทระดับ${LV[opt.level]} · เด็คบอท ${esc(opt.oppDeck)}</span>` : `<span class="muted">ห้อง <b class="mono">${esc((G.o || {}).code || '')}</b></span>`}</div>
        </div>
        <aside class="gright">
          <section class="card infobox">${infoHtml()}</section>
          <section class="card logbox"><h3>บันทึกเกม</h3><ol class="log">${logs || '<li class="muted">ยังไม่มีการเดิน</li>'}</ol></section>
        </aside>
      </div>${end}`;
    }

    /* ---------- prompts (abilities) ---------- */
    function askUser(pr) {
      return new Promise(res => {
        const cells = pr.kind === 'cell' || pr.kind === 'yn' ? pr.opts.map(o => o.i) : null;
        const cards = pr.kind === 'card' ? pr.opts.map(o => o.c) : null;
        G.prompt = { pr, cells, cards, resolve: res }; G.sel = null; G.tgt = null; G.will = null; render();
      });
    }
    function answer(v) { const p = G.prompt; if (!p) return; G.prompt = null; p.resolve(v); }

    /* ---------- bot mode ---------- */
    function startBot() {
      const mine = myDeck(); if (!A.validDeck(mine)) return;
      let od = opt.oppDeck === 'fire' ? A.PRESET.fire : opt.oppDeck === 'ice' ? A.PRESET.ice : opt.oppDeck === 'mirror' ? mine : randDeck();
      const start = opt.first === 'me' ? 0 : opt.first === 'bot' ? 1 : Math.random() < .5 ? 0 : 1;
      G.mode = 'bot'; G.me = 0; G.o = null; setNames('คุณ', 'บอท');
      G.st = E.newGame({ decks: [mine, od.slice()], start, seed: (Math.random() * 2e9) | 0, rules: { elem: opt.elem } });
      Object.assign(G, { screen: 'game', sel: null, tgt: null, will: null, prompt: null, busy: false, thinking: false, fxN: 0, endInfo: null, err: '', hideEnd: false });
      render(); window.scrollTo({ top: 0 }); botLoop();
    }
    async function botLoop() {
      const st = G.st; const tok = G.st;
      while (G.st === tok && !st.over && st.turn !== G.me && G.mode === 'bot') {
        G.thinking = true; render(); await sleep(650 + Math.random() * 450);
        if (G.st !== tok) return;
        const lv = opt.level; const mv = E.botMove(st, lv);
        if (!mv) break;
        E.apply(st, mv, E.autoChooser(lv));
        G.thinking = false; render();
        if (!st.over && st.turn !== G.me) await sleep(250);
      }
      G.thinking = false; if (G.st === tok) render();
    }

    /* ---------- human move ---------- */
    async function humanPlay(code, x) {
      const st = G.st; if (G.busy || st.over || st.turn !== G.me) return;
      G.busy = true; G.sel = null; G.tgt = null; G.will = null; G.inspect = null;
      const rec = []; let ok = true;
      try {
        const gen = E.applyG(st, { c: code, x }); let r = gen.next();
        while (!r.done) {
          const pr = r.value; let a;
          if (pr.who === G.me) a = await askUser(pr); else a = E.autoChooser('normal')(pr, st);
          rec.push(a); r = gen.next(a);
          if (r.done || true) render();
        }
      } catch (err) { ok = false; console.error(err); G.err = 'เกิดข้อผิดพลาดในการประมวลผลตาเดิน: ' + err.message; }
      render();
      if (ok && G.mode === 'online') {
        try {
          const res = st.over ? { w: st.res.w, sc: st.res.sc } : null;
          await rpc('submit_move', { p_id: G.o.id, p_key: G.o.key, p_seq: G.applied, p_c: code, p_x: x, p_ch: rec, p_result: res });
          G.applied++; G.err = '';
        } catch (e) { toast('ส่งตาเดินไม่สำเร็จ: ' + e.message); G.err = ''; await rebuildOnline(); }
      }
      G.busy = false; render();
      if (G.mode === 'bot' && ok) botLoop();
    }

    /* ---------- board interactions ---------- */
    function computeWill() {
      G.will = null; if (G.sel && G.tgt != null && G.st.turn === G.me) G.will = E.previewSnatch(G.st, G.me, G.sel, G.tgt);
    }
    document.addEventListener('click', ev => {
      if ($('viewPlay').hidden) return;
      const cell = ev.target.closest('[data-cell]'), hand = ev.target.closest('[data-hand]'), g = ev.target.closest('[data-g]');
      if (g) return gAction(g);
      if (!G.st || G.screen !== 'game') return;
      if (hand) {
        const code = hand.dataset.hand;
        if (G.prompt && G.prompt.cards) { const k = G.prompt.cards.indexOf(code); if (k >= 0) answer(G.prompt.pr.opts.findIndex(o => o.c === code)); return; }
        if (G.prompt) return;
        G.inspect = { code, cell: null };
        if (G.st.turn === G.me && !G.busy && !G.st.over) { G.sel = G.sel === code ? null : code; G.tgt = null; computeWill(); }
        render(); return;
      }
      if (cell) {
        const i = +cell.dataset.cell, c = G.st.board[i];
        if (G.prompt && G.prompt.cells) { const k = G.prompt.cells.indexOf(i); if (k >= 0) { const pr = G.prompt.pr; answer(pr.kind === 'yn' ? 0 : pr.opts.findIndex(o => o.i === i)); } return; }
        if (G.prompt) return;
        if (c) { G.inspect = { code: c.c, cell: i }; if (!G.sel) render(); else { render(); } return; }
        if (G.sel && G.st.turn === G.me && !G.busy && !G.st.over) {
          if (G.tgt === i) { humanPlay(G.sel, i); return; }
          G.tgt = i; computeWill(); render();
        }
      }
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && G.sel && !G.prompt) { G.sel = null; G.tgt = null; G.will = null; render(); }
    });

    /* ---------- lobby actions ---------- */
    function readLobbyInputs() {
      const g = id => $(id);
      if (g('oLevel')) opt.level = g('oLevel').value;
      if (g('oOpp')) opt.oppDeck = g('oOpp').value;
      if (g('oFirst')) opt.first = g('oFirst').value;
      if (g('oElem')) opt.elem = g('oElem').checked;
      if (g('oName')) opt.name = g('oName').value.trim().slice(0, 20);
      saveOpt();
    }
    const myName = () => opt.name || 'ผู้เล่น';
    async function netAction(fn) {
      G.err = ''; readLobbyInputs();
      if (!deckOk()) { G.err = 'เด็คยังไม่พร้อม (ต้อง 10 ใบ ไม่เกิน 25 ดาว ชื่อไม่ซ้ำ)'; return render(); }
      try { const key = newKey(); const r = await fn(key); startOnline({ id: r.id, code: r.code, role: r.role, key }); }
      catch (e) { G.err = e.message; render(); }
    }
    async function gAction(b) {
      const a = b.dataset.g;
      if (a === 'build') return setMode('build');
      if (a === 'preset') { const k = b.dataset.k; A.setDeck(k === 'rand' ? randDeck() : A.PRESET[k]); return render(); }
      if (a === 'bot') { readLobbyInputs(); return startBot(); }
      if (a === 'quick') return netAction(key => rpc('quick_match', { p_name: myName(), p_key: key, p_deck: myDeck(), p_rules: { elem: opt.elem } }));
      if (a === 'create') return netAction(key => rpc('create_match', { p_name: myName(), p_key: key, p_deck: myDeck(), p_rules: { elem: opt.elem } }));
      if (a === 'join' || a === 'joincode') {
        const code = (a === 'join' ? b.dataset.code : ($('oCode') || {}).value || '').trim().toUpperCase();
        if (code.length < 4) { G.err = 'ใส่รหัสห้องก่อน'; return render(); }
        return netAction(key => rpc('join_match', { p_code: code, p_name: myName(), p_key: key, p_deck: myDeck() }));
      }
      if (a === 'resume') { const s = store.get(SESS_KEY, null); if (s) startOnline(s, true); return; }
      if (a === 'dropsess') { store.del(SESS_KEY); return render(); }
      if (a === 'copy') { try { await navigator.clipboard.writeText(b.dataset.v); toast('คัดลอกแล้ว'); } catch (e) { toast('คัดลอกไม่ได้ — ลองเลือกข้อความเอง'); } return; }
      if (a === 'cancelroom') { await leaveOnline(true); return; }
      if (a === 'resign') { if (confirm('ยอมแพ้เกมนี้?')) { try { await rpc('resign', { p_id: G.o.id, p_key: G.o.key }); } catch (e) { toast(e.message); } } return; }
      if (a === 'claim') { try { const r = await rpc('claim_timeout', { p_id: G.o.id, p_key: G.o.key }); if (!r.ok) toast('ยังประกาศชนะไม่ได้ — ' + (r.reason || '')); } catch (e) { toast(e.message); } return; }
      if (a === 'lobby') { if (G.mode === 'bot' && G.st && !G.st.over && !confirm('ออกจากเกมนี้?')) return; return backToLobby(); }
      if (a === 'again') return startBot();
      if (a === 'hideend') { G.hideEnd = true; return render(); }
      if (a === 'place') { if (G.sel && G.tgt != null) humanPlay(G.sel, G.tgt); return; }
      if (a === 'unsel') { G.sel = null; G.tgt = null; G.will = null; return render(); }
      if (a === 'skip') return answer(-1);
      if (a === 'yn') return answer(0);
    }
    function backToLobby() {
      G.pollTok++; if (G.mode === 'online' && G.o && G.st && G.st.over) store.del(SESS_KEY);
      Object.assign(G, { screen: 'lobby', st: null, o: null, mode: null, prompt: null, busy: false, thinking: false, endInfo: null, err: '', sel: null, tgt: null, will: null, hideEnd: false });
      render(); loadRooms();
    }

    /* ---------- online lifecycle ---------- */
    function startOnline(sess, resume) {
      store.set(SESS_KEY, Object.assign({ t: Date.now() }, sess));
      Object.assign(G, { mode: 'online', o: sess, screen: 'wait', st: null, applied: 0, endInfo: null, err: '', netErr: 0, opp_age: 0, busy: false, sel: null, tgt: null, will: null, hideEnd: false, fxN: 0 });
      render(); startPoll();
    }
    async function leaveOnline(cancel) {
      const o = G.o; G.pollTok++;
      if (o && cancel) { try { await rpc('resign', { p_id: o.id, p_key: o.key }); } catch (e) {} }
      store.del(SESS_KEY); backToLobby();
    }
    function interval() {
      if (document.hidden) return 4000;
      if (G.screen === 'wait') return 1200;
      const st = G.st; return st && !st.over && st.turn === G.me ? 2500 : 1000;
    }
    function startPoll() {
      const tok = ++G.pollTok;
      (async function loop() {
        while (tok === G.pollTok) {
          try { await pollOnce(tok); G.netErr = 0; }
          catch (e) { G.netErr++; if (G.netErr === 3) { G.err = 'การเชื่อมต่อมีปัญหา กำลังลองใหม่…'; render(); } }
          await sleep(interval());
        }
      })();
    }
    function setupFrom(r) { return { decks: [r.deck_a, r.deck_b], start: r.start, seed: r.seed, rules: r.rules || { elem: true } }; }
    async function pollOnce(tok) {
      const o = G.o; if (!o) return;
      const r = await rpc('poll', { p_id: o.id, p_key: o.key, p_after: G.busy ? 1e9 : G.applied });
      if (tok !== G.pollTok) return;
      if (r.gone || r.role == null) { toast('ห้องนี้ไม่อยู่แล้ว'); return leaveOnline(false); }
      if (G.err && G.netErr === 0 && /เชื่อมต่อ/.test(G.err)) G.err = '';
      G.opp_age = r.opp_age == null ? 0 : r.opp_age; G.me = r.role; o.code = r.code;
      setNames(r.role === 0 ? r.host_name : r.guest_name || 'ผู้เล่น', r.role === 0 ? (r.guest_name || 'คู่ต่อสู้') : r.host_name);
      let fresh = false;
      if (!G.st) {
        if (r.status === 'waiting' || !r.deck_b) { if (G.screen === 'wait') renderWait(); return; }
        G.st = E.newGame(setupFrom(r)); G.o.setup = setupFrom(r); G.applied = 0; G.screen = 'game'; G.fxN = 0; fresh = true;
        if (!resumeQuiet) toast('เจอคู่แล้ว! ' + G.names[1 - G.me] + (G.st.turn === G.me ? ' — คุณเริ่มก่อน' : ' เริ่มก่อน'));
      }
      if (G.busy) return;
      const st = G.st; let did = 0;
      for (const m of r.moves) {
        if (m.seq < G.applied) continue; if (m.seq !== G.applied) break;
        if (m.p !== st.turn || st.over) { G.err = 'ข้อมูลการเดินไม่ตรงกติกา (อีกฝ่ายอาจส่งตาผิด) — ลองกลับสนามเล่นแล้วเข้าใหม่'; render(); return; }
        try { E.apply(st, { c: m.c, x: m.x }, E.replayChooser(m.ch || [])); } catch (e) { G.err = 'ตาเดินของอีกฝ่ายผิดกติกา: ' + e.message; render(); return; }
        G.applied++; did++;
      }
      if (r.status === 'done' && !st.over && r.result) G.endInfo = r.result;
      if (did || fresh || G.screen !== 'game' || G.endInfo) { G.screen = 'game'; render(); }
      else if (G.opp_age > 15) render();
      if (st.over || G.endInfo) { G.pollTok++; store.del(SESS_KEY); }
    }
    let resumeQuiet = false;
    async function rebuildOnline() {
      const o = G.o; const r = await rpc('poll', { p_id: o.id, p_key: o.key, p_after: 0 });
      const st = E.newGame(setupFrom(r)); G.applied = 0;
      for (const m of r.moves) { E.apply(st, { c: m.c, x: m.x }, E.replayChooser(m.ch || [])); G.applied++; }
      G.st = st; G.fxN = 0; if (r.status === 'done' && !st.over) G.endInfo = r.result;
    }

    /* ---------- rooms list ---------- */
    async function loadRooms() {
      if (!A.SB_ON) return; const tok = ++G.roomsTok;
      while (tok === G.roomsTok && G.screen === 'lobby' && !$('viewPlay').hidden) {
        try {
          const r = await A.sb('matches?status=eq.waiting&select=code,host_name,host_seen&order=created_at.desc&limit=12');
          if (r.ok) { const rows = await r.json(); G.rooms = rows.filter(x => Date.now() - new Date(x.host_seen).getTime() < 20000); if (G.screen === 'lobby' && !document.activeElement.matches('input,select')) render(); }
        } catch (e) {}
        await sleep(4000);
      }
    }

    /* ---------- rules page ---------- */
    function renderRules() {
      const kw = A.DATA.kw || [];
      const wheel = A.EL.map(e => { const b = (C.find(c => c.e === e && c.b.length) || { b: [] }).b; return `<tr><td>${A.elChip(e)}</td><td>${b.map(x => A.elChip(x, true)).join(' ')}</td><td>${A.EL.filter(z => ((C.find(c => c.e === z && c.b.length) || { b: [] }).b).includes(e)).map(x => A.elChip(x, true)).join(' ')}</td></tr>`; }).join('');
      $('viewRules').innerHTML = `<section class="card"><h2>กติกาที่ใช้ในโหมดเล่น</h2><ul>${E.RULES_NOTE.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="muted">หมายเหตุ: หน้า Rules ทางการของ monsnatch.com โหลดด้วย JavaScript จึงอ่านอัตโนมัติไม่ได้ กติกาข้างบนสร้างจากคำอธิบายคำศัพท์ทางการ + ข้อความบนการ์ด 181 ใบ (ความสามารถทุกใบทำงานในเกมแล้ว) ถ้าส่วนไหนต่างจากกติกาจริง แจ้งได้เพื่อปรับแก้</p></section>
        <section class="card"><h3>วงล้อธาตุ</h3><div class="tblwrap"><table class="tbl"><thead><tr><th>ธาตุ</th><th>ชนะ</th><th>แพ้ให้</th></tr></thead><tbody>${wheel}<tr><td>${A.elChip('origin')}</td><td class="muted">ไม่ชนะธาตุใด</td><td class="muted">ถูกทุกธาตุเอาชนะ</td></tr></tbody></table></div></section>
        <section class="card"><h3>คำศัพท์ในเกม (ข้อมูลทางการ)</h3><dl class="gl2">${kw.map(k => `<dt>${esc(k.n)}</dt><dd>${esc(k.t || k.d)}</dd>`).join('')}</dl></section>`;
    }

    root.addEventListener('change', e => { if (G.screen === 'lobby') readLobbyInputs(); });
    root.addEventListener('input', e => { if (G.screen === 'lobby' && e.target.id === 'oName') readLobbyInputs(); });
    /* ---------- init ---------- */
    document.addEventListener('visibilitychange', () => { /* poll loop adapts interval */ });
    const q = new URLSearchParams(location.search);
    const h = location.hash.replace('#', '');
    if (q.get('room')) { setMode('play'); loadRooms(); }
    else if (h === 'play' || h === 'rules') { setMode(h); if (h === 'play') loadRooms(); }
    document.addEventListener('click', ev => { const b = ev.target.closest('button[data-mode="play"]'); if (b && G.screen === 'lobby') loadRooms(); });
    // auto-resume an online session (e.g. after refresh) when the user is on the play tab
    const sess = store.get(SESS_KEY, null);
    if (sess && Date.now() - (sess.t || 0) < 864e5 && (q.get('room') || h === 'play')) { resumeQuiet = true; startOnline(sess, true); setTimeout(() => { resumeQuiet = false; }, 4000); }
    window.MSGAME = { G, setMode, rpc };
  }
  if (window.MSAPP) boot(); else document.addEventListener('ms-ready', boot, { once: true });
})();
