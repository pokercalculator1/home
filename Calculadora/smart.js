(() => {
  // ================== PATCH: usar a 2ª .body (lado direito) ==================
  const q  = (s, r=document) => r.querySelector(s);
  const qq = (s, r=document) => Array.from(r.querySelectorAll(s));

  function getRightBody() {
    const bodies = qq('.body');
    return bodies[1] || null; // 2ª ocorrência
  }

  function ensureRightBodyOrWait(cb){
    const rb = getRightBody();
    if (rb) { cb(rb); return; }
    // espera a 2ª .body aparecer
    const mo = new MutationObserver(() => {
      const rb2 = getRightBody();
      if (rb2) { mo.disconnect(); cb(rb2); }
    });
    mo.observe(document.body || document.documentElement, {childList:true, subtree:true});
  }

  function run(rb){
    if (!rb.id) rb.id = 'smart-body-right';

    // Esconde o pcalc-sugestao só na 2ª body
    if (!q('#__smartrec_style_hide_right')) {
      const st = document.createElement('style');
      st.id = '__smartrec_style_hide_right';
      st.textContent = `
        #smart-body-right #pcalc-sugestao { display: none !important; }
      `;
      document.head.appendChild(st);
    }

    // Host para o painel, antes do #pcalc-sugestao (da direita)
    function ensureHost() {
      let host = q('#smart-rec-host', rb);
      if (host) return host;

      host = document.createElement('div');
      host.id = 'smart-rec-host';
      host.style.margin = '12px 0';
      host.style.position = 'relative';

      const sug = q('#pcalc-sugestao', rb);
      if (sug && sug.parentElement === rb) {
        rb.insertBefore(host, sug);
      } else if (sug && sug.parentElement) {
        sug.parentElement.insertBefore(host, sug);
      } else {
        rb.insertBefore(host, rb.firstChild);
        const mo = new MutationObserver(() => {
          const s2 = q('#pcalc-sugestao', rb);
          if (s2 && s2.parentElement) {
            s2.parentElement.insertBefore(host, s2);
            mo.disconnect();
          }
        });
        mo.observe(rb, {childList:true, subtree:true});
      }
      return host;
    }

    // ================== Leitura base (direita) ==================
    const pctToNum = s => s ? parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g,'')) : NaN;
    const cleanTxt = n => (n?.textContent || '').trim();

    function byLabelNextB(container, labelText){
      if (!container) return NaN;
      const labels = qq(':scope div', container);
      for (let i=0;i<labels.length;i++){
        if (cleanTxt(labels[i]).toLowerCase() === labelText.toLowerCase()){
          const valDiv = labels[i].nextElementSibling;
          if (!valDiv) continue;
          const b = q('b', valDiv) || valDiv;
          const m = cleanTxt(b).match(/([\d.,]+)%/);
          if (m) return pctToNum(m[1]);
          const n = pctToNum(cleanTxt(b));
          if (isFinite(n)) return n;
        }
      }
      return NaN;
    }

    function getPotOddsContainer(){ return q('#pcalc-sugestao .raise-potodds.card', rb); }
    function readBE(){ return byLabelNextB(getPotOddsContainer(), 'BE (pot odds)'); }
    function readEquityMC(){ return byLabelNextB(getPotOddsContainer(), 'Equity (MC)'); }
    function readPot(){ return byLabelNextB(getPotOddsContainer(), 'Pot (fichas)'); }
    function readToCall(){ return byLabelNextB(getPotOddsContainer(), 'A pagar (fichas)'); }

    // --- Ler vilões
    function readVillains(){
      const eqb = q('#equityBox', rb) || q('#equityBox');
      const sel = q('#eqOpp', eqb || rb);
      if (sel) {
        const v = parseInt(sel.value, 10);
        if (isFinite(v) && v>0) return v;
      }
      const status = q('#eqStatus', eqb || rb);
      if (status){
        const m = status.innerText.match(/vs\s+(\d+)\s+oponente/i);
        if (m) return +m[1];
      }
      return 1;
    }

    // --- Ler cartas (board e herói)
    const RANKVAL = {A:14, K:13, Q:12, J:11, T:10};
    const parseRank = r => (RANKVAL[String(r).toUpperCase()] ?? parseInt(r,10));

    function parseCardFromSlot(slotEl){
      if (!slotEl || !slotEl.classList.contains('filled')) return null;
      const inner = q('.c,.s,.h,.d', slotEl);
      let suit, rank;
      if (inner){
        if (inner.classList.contains('c')) suit='c';
        else if (inner.classList.contains('s')) suit='s';
        else if (inner.classList.contains('h')) suit='h';
        else if (inner.classList.contains('d')) suit='d';
        const ds = qq('div', inner);
        if (ds.length>=1) rank = cleanTxt(ds[0]);
        if (!suit && ds.length>=2){
          const sym = cleanTxt(ds[1]);
          suit = ({'♣':'c','♠':'s','♥':'h','♦':'d'})[sym] || null;
        }
      } else {
        const ds = qq('div', slotEl);
        if (ds.length>=2){
          rank = cleanTxt(ds[0]);
          const sym = cleanTxt(ds[1]);
          suit = ({'♣':'c','♠':'s','♥':'h','♦':'d'})[sym] || null;
        }
      }
      const rv = parseRank(rank);
      if (!suit || !isFinite(rv)) return null;
      return {rank:String(rank).toUpperCase(), rv, suit};
    }

    function readByIds(ids, root){
      const cards = [];
      for (const id of ids){
        const el = q(id, root) || q(id);
        const c = parseCardFromSlot(el);
        if (c) cards.push(c);
      }
      return cards;
    }

    function readBoard(){ return readByIds(['#b0','#b1','#b2','#b3','#b4'], rb); }

    // tenta padrões comuns para as 2 cartas do herói
    function readHero(){
      // ids mais comuns:
      let hero = readByIds(['#h0','#h1'], rb);
      if (hero.length === 2) return hero;

      // alternativas por data-attrs/classe
      const slots = qq('[data-slot^="h"], .hero .slot, .hand .slot', rb).filter(x=>x.classList.contains('filled'));
      for (const el of slots){
        const c = parseCardFromSlot(el);
        if (c) hero.push(c);
      }
      if (hero.length>2) hero = hero.slice(0,2);
      return hero;
    }

    // ================== Regras de “wetness” com viés (pode ajudar ou punir) ==================
    function boardWetness(cards, heroCards){
      // Sem flop ainda
      if (cards.length < 3) return { label: 'desconhecido', factor: 0.95, tag: '' };

      // ===== 1) FLUSH (contagem de naipes) =====
      const suitCount = { c:0, d:0, h:0, s:0 };
      for (const c of cards) if (suitCount[c.suit] != null) suitCount[c.suit]++;
      const flushMax = Math.max(suitCount.c, suitCount.d, suitCount.h, suitCount.s);

      let toneLabel, toneF;
      if (flushMax >= 5){ toneLabel = 'flush completo no board'; toneF = 0.65; }
      else if (flushMax === 4){ toneLabel = 'flush draw extremo'; toneF = 0.72; }
      else if (flushMax === 3){ toneLabel = 'flush draw forte';  toneF = 0.82; }
      else if (flushMax === 2){ toneLabel = 'flush draw';        toneF = 0.92; }
      else {                    toneLabel = 'board seco';        toneF = 1.00; }

      // ===== 2) CONECTIVIDADE (straight) =====
      const ranks = Array.from(new Set(cards.map(c => c.rv))).sort((a,b)=>a-b);

      const hasSeq3 = (() => {
        if (ranks.length < 3) return false;
        for (let i=0; i<=ranks.length-3; i++){
          if ((ranks[i+2] - ranks[i]) === 2) return true; // ex: 6-7-8
        }
        return false;
      })();

      const hasNearSeq = (() => {
        if (ranks.length >= 3){
          for (let i=0; i<=ranks.length-3; i++){
            const span = ranks[i+2] - ranks[i];
            if (span <= 3) return true;
          }
        }
        if (ranks.length >= 4){
          for (let i=0; i<=ranks.length-4; i++){
            const span = ranks[i+3] - ranks[i];
            if (span <= 4) return true;
          }
        }
        return false;
      })();

      let connLabel, connF;
      if (hasSeq3){         connLabel = 'straight draw forte'; connF = 0.80; }
      else if (hasNearSeq){ connLabel = 'straight draw';       connF = 0.88; }
      else {
        let cons=false, near=false;
        for (let i=1;i<ranks.length;i++){
          const d = ranks[i]-ranks[i-1];
          if (d===1) cons = true;
          else if (d===2) near = true;
        }
        if (cons || near){  connLabel = 'semi conectado';       connF = 0.94; }
        else {              connLabel = 'desconectado';         connF = 1.00; }
      }

      // ===== 3) PARES NO BOARD =====
      const freq = {};
      for (const c of cards) freq[c.rv] = (freq[c.rv]||0) + 1;

      let extras = [];
      let pairF = 1.00;

      const counts = Object.values(freq).sort((a,b)=>b-a);
      const hasQuads  = counts[0] === 4;
      const hasTrips  = counts.includes(3);
      const pairRanks = counts.filter(x=>x===2).length;
      const hasTwoPair = pairRanks >= 2;
      const hasPair    = pairRanks >= 1;
      const hasFull    = hasTrips && hasPair;

      if (hasQuads){ extras.push('quadra no board'); pairF *= 0.72; }
      if (hasFull){  extras.push('full house no board'); pairF *= 0.75; }
      else if (hasTrips){ extras.push('trinca no board'); pairF *= 0.78; }
      if (hasTwoPair){ extras.push('dois pares no board'); pairF *= 0.85; }
      else if (!hasTrips && hasPair){ extras.push('par no board'); pairF *= 0.90; }

      // ===== 4) COMBOS (flush + straight) — pressão dos dois lados
      let comboF = 1.00;
      const temFlushBase = flushMax >= 2;
      const temStraightPress = (connLabel === 'straight draw forte' || connLabel === 'straight draw' || connLabel === 'semi conectado');
      if (temFlushBase && temStraightPress){
        comboF *= 0.80;
      }

      // ===== 5) VIÉS A SEU FAVOR (pode virar >1.0)
      // Heurísticas simples com base nas suas cartas:
      let favorF = 1.00;
      let favorTags = [];

      const hero = heroCards || [];
      const all = [...cards, ...hero];

      // Flush feito / nut flush draw
      const suitAll = { c:0, d:0, h:0, s:0 };
      for (const c of all) suitAll[c.suit] = (suitAll[c.suit]||0) + 1;
      const suitHero = hero.map(c=>c.suit);
      const bestSuit = ['c','d','h','s'].sort((a,b)=>suitAll[b]-suitAll[a])[0];
      const haveFlushNow = suitAll[bestSuit] >= 5 && hero.some(c=>c.suit===bestSuit);
      const haveStrongFD = (suitAll[bestSuit] === 4) && hero.some(c=>c.suit===bestSuit); // 4 do mesmo na soma board+hero

      if (haveFlushNow){
        favorF *= 1.06; // pequeno boost se já tem flush
        favorTags.push('flush feito (favorável)');
      } else if (haveStrongFD){
        favorF *= 1.03; // leve boost se está puxando forte pro flush
        favorTags.push('flush draw forte (favorável)');
      }

      // Conectividade com suas cartas (par borda, sequência encaixando)
      const heroRanks = new Set(hero.map(c=>c.rv));
      const boardRanks = new Set(cards.map(c=>c.rv));
      // Overcards úteis / pares altos no board
      const overToBoard = [...heroRanks].some(rv => !boardRanks.has(rv) && rv >= Math.max(...Array.from(boardRanks)));
      if (overToBoard){ favorF *= 1.02; favorTags.push('overcards úteis'); }

      // Janela de sequência incluindo suas cartas
      const allRanksSorted = Array.from(new Set(all.map(c=>c.rv))).sort((a,b)=>a-b);
      let seqSpan4 = false;
      for (let i=0; i<=allRanksSorted.length-4; i++){
        if (allRanksSorted[i+3] - allRanksSorted[i] <= 4) { seqSpan4 = true; break; }
      }
      if (seqSpan4){ favorF *= 1.02; favorTags.push('sequência bem próxima'); }

      // ===== 6) Fator final do board
      let factor = toneF * connF * pairF * comboF * favorF;
      // permite leve bônus máximo 1.10 e mínimo 0.60
      factor = Math.max(0.60, Math.min(1.10, factor));

      // Label PT-BR + tags
      let base = `${toneLabel} • ${connLabel}`;
      const allTags = [...extras];
      if (favorTags.length) allTags.push(`💪 ${favorTags.join(' • ')}`);
      // “Perigoso/Favorável” quick tag
      let quick = '';
      if (factor <= 0.90) quick = ' ⚠️ Perigoso';
      else if (factor >= 1.02) quick = ' 💪 Favorável';

      const label = allTags.length ? `${base} • ${allTags.join(' • ')}${quick}` : `${base}${quick}`;
      return { label, factor };
    }

    // --- Multiway exponencial + piso 0.55
    function multiwayFactor(n) {
      if (n <= 1) return 1.00;
      const base = 0.92;
      const floor = 0.55;
      return Math.max(floor, Math.pow(base, n - 1));
    }

    // --- Detector de Royal Flush simples (hero + board)
    function hasRoyalFlush(hero, board){
      const need = new Set([10,11,12,13,14]); // T,J,Q,K,A
      const bySuit = { c:new Set(), d:new Set(), h:new Set(), s:new Set() };
      for (const c of [...hero, ...board]) {
        bySuit[c.suit].add(c.rv);
      }
      return Object.values(bySuit).some(set => {
        for (const r of need) if (!set.has(r)) return false;
        return true;
      });
    }

    function decide(eSmart, be) {
      if (!isFinite(eSmart) || !isFinite(be)) return {label:'Sem dados suficientes', level:'neutral'};
      if (eSmart >= be * 1.20) return {label:'Aposte por valor (50–75% pote)', level:'strong'};
      if (eSmart >= be * 1.05) return {label:'Pague / bet pequeno (33–50%)', level:'good'};
      if (eSmart >= be * 0.95) return {label:'Pague marginal (borderline)', level:'thin'};
      return {label:'Desista (fold)', level:'fold'};
    }

    // --- Painel
    function mountPanel(){
      const ex = q('#smart-rec-panel', rb); if (ex) ex.remove();
      const host = ensureHost();

      const p = document.createElement('div');
      p.id = 'smart-rec-panel';
      p.style.cssText = 'background:#0b1324;color:#e5e7eb;border:1px solid #22304a;border-radius:12px;padding:14px 16px;min-width:280px;box-shadow:0 8px 22px rgba(0,0,0,.25);font:14px/1.3 system-ui,Segoe UI,Roboto,Helvetica,Arial;';

      // HTML reformatado para garantir que não haja espaços extras que quebrem o layout
      p.innerHTML = `
<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
<strong style="font-size:15px">Recomendação (Smart)</strong>
<span id="srp-status" style="margin-left:auto;opacity:.8;font-size:12px">—</span>
</div>
<div id="srp-box" style="background:transparent;padding:8px 10px;border-radius:8px;margin-bottom:10px">
<div id="srp-label" style="font-weight:700">—</div>
<div style="opacity:.9;margin-top:4px">Equity Smart = Equity(MC) × fatores (board, multiway). <small>(imune em mãos ~nuts)</small></div>
</div>
<div style="display:grid;grid-template-columns:1fr auto;gap:6px 10px">
<div>Equity (MC)</div><div><b id="srp-eq">—</b></div>
<div>BE (pot odds)</div><div><b id="srp-be">—</b></div>
<div>Equity Smart</div><div><b id="srp-smart">—</b></div>
<div>Fator Board</div><div><span id="srp-fb">—</span> <span id="srp-bt" style="margin-left:6px;padding:2px 8px;border:1px solid rgba(16,185,129,.35);border-radius:999px;font-size:1.5vh"></span></div>
<div>Fator Multiway</div><div><span id="srp-fm">—</span> <span id="srp-vil" style="margin-left:6px;padding:2px 8px;border:1px solid rgba(16,185,129,.35);border-radius:999px;font-size:1.5vh"></span></div>
</div>
<div style="margin-top:8px;display:grid;grid-template-columns:1fr auto;gap:6px 10px">
<div>Pot</div><div id="srp-pot">—</div>
<div>A pagar</div><div id="srp-call">—</div>
</div>
      `.trim();
      host.appendChild(p);
    }

    function paint(level){
      const box = q('#srp-box', rb);
      const bg = {
        strong:'linear-gradient(to right, rgba(16,185,129,.25), transparent)',
        good:'linear-gradient(to right, rgba(59,130,246,.22), transparent)',
        thin:'linear-gradient(to right, rgba(234,179,8,.22), transparent)',
        fold:'linear-gradient(to right, rgba(239,68,68,.22), transparent)',
        neutral:'linear-gradient(to right, rgba(148,163,184,.22), transparent)',
      }[level] || 'transparent';
      if (box) box.style.background = bg;
    }

    // ====== Núcleo: snapshot / render ======
    const IMMUNE_EQ = 95.0; // >= 95% vira imune (ignora descontos)

    function snapshot(){
      const be = readBE();

      // ================== MODIFICAÇÃO DO CÁLCULO (INÍCIO) ==================
      // Se o BE não for um número válido ou for zero, paramos tudo.
      if (!isFinite(be) || be <= 0) {
        // Retornamos um objeto "vazio" para limpar o painel.
        return {
          be: 0, eq: NaN, pot: NaN, call: NaN, villains: 1, 
          wet: { label: 'Aguardando BE > 0%', factor: 1 }, 
          fBoard: 1, fMulti: 1, eqSmart: NaN, immune: false
        };
      }
      // ================== MODIFICAÇÃO DO CÁLCULO (FIM) ==================

      const eq = readEquityMC();
      const pot = readPot();
      const call = readToCall();
      const villains = readVillains();
      const board = readBoard();
      const hero  = readHero();

      const wet = boardWetness(board, hero);

      // Regra de imunidade:
      let immune = false;
      try {
        if (isFinite(eq) && eq >= IMMUNE_EQ) immune = true;
        else if (hasRoyalFlush(hero, board)) immune = true;
      } catch(e){}

      const fBoard = immune ? 1.00 : wet.factor;
      const fMulti = immune ? 1.00 : multiwayFactor(villains);

      const eqSmart = (isFinite(eq) ? Math.max(0, Math.min(100, eq * fBoard * fMulti)) : NaN);
      return {be, eq, pot, call, villains, wet, fBoard, fMulti, eqSmart, immune};
    }

    function render(s){
      const set = (id, val) => { const el=q('#'+id, rb); if (el) el.textContent = val; };
      set('srp-eq', isFinite(s.eq) ? s.eq.toFixed(1)+'%' : '—');
      set('srp-be', isFinite(s.be) ? s.be.toFixed(1)+'%' : '—');
      set('srp-smart', isFinite(s.eqSmart) ? s.eqSmart.toFixed(1)+'%' : '—');
      set('srp-fb', s.fBoard.toFixed(2) + (s.immune ? ' (imune)' : ''));
      set('srp-bt', s.wet.label);
      set('srp-fm', s.fMulti.toFixed(2) + (s.immune ? ' (imune)' : ''));
      set('srp-vil', `${s.villains} vilão(ões)`);
      set('srp-pot', isFinite(s.pot)? String(Math.round(s.pot)) : '—');
      set('srp-call', isFinite(s.call)? String(Math.round(s.call)) : '—');

      const rec = decide(s.eqSmart, s.be);
      const lab = q('#srp-label', rb);
      if (lab) lab.textContent = (s.immune ? 'Imune a descontos — mão ~nuts' : rec.label);
      paint(s.immune ? 'strong' : rec.level);

      const ok = (isFinite(s.eq) && isFinite(s.be) && s.be > 0);
      const st = q('#srp-status', rb); if (st) st.textContent = ok ? 'ok' : 'aguardando…';
    }

    let lastH = '';
    const hash = s => JSON.stringify([s.be,s.eq,s.pot,s.call,s.villains,s.wet.label,s.immune]);

    function tick(){
      const s = snapshot();
      const h = hash(s);
      if (h !== lastH){ lastH = h; render(s); }
    }

    function observe(){
      const obs = new MutationObserver(tick);
      const potC = getPotOddsContainer(); if (potC) obs.observe(potC, {childList:true,subtree:true,characterData:true});
      const eqb  = q('#equityBox', rb) || q('#equityBox'); if (eqb) obs.observe(eqb, {childList:true,subtree:true,characterData:true});
      const boardRow = q('.row', rb) || q('.row'); if (boardRow) obs.observe(boardRow, {childList:true,subtree:true,characterData:true});
      const sel = q('#eqOpp', eqb || rb);  if (sel) sel.addEventListener('change', tick, {passive:true});
      const recalc = q('#btnEqCalc', eqb || rb); if (recalc) recalc.addEventListener('click', tick, {passive:true});
      const id = setInterval(tick, 800);
      return () => { obs.disconnect(); clearInterval(id); sel && sel.removeEventListener('change', tick); recalc && recalc.removeEventListener('click', tick); };
    }

    // start
    (function start(){
      mountPanel();
      const stop = observe();
      tick();
      window.__smartRecRightKill = () => { try{stop();}catch(e){}; const n=q('#smart-rec-panel', rb); if(n) n.remove(); console.log('[SmartRec] painel (direita) removido'); };
      console.log('[SmartRec] ON — direita; #pcalc-sugestao oculto; Sem fator posição; Wetness bidirecional; Imunidade (eq>=95% ou Royal); Multiway=0.92^(n-1) piso 0.55.');
    })();
  }

  ensureRightBodyOrWait(run);
})();
