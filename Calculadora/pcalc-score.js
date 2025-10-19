(() => {
  // ===== SR BAR (Score Realista) — versão por GRUPOS LÓGICOS =====
  if (window.__SRBAR && typeof window.__SRBAR.cleanup === 'function') {
    try { window.__SRBAR.cleanup(); } catch(_) {}
  }

  const PC = window.PCALC;
  if (!PC) { console.warn('[SR] PCALC não encontrado.'); return; }
  const { makeDeck, evalBest, cmpEval, cardId, CAT_NAME, CAT, SUITS } = PC;

  // ====== estado / cleanup ======
  const S = {
    timers: [],
    observers: [],
    cleanup(){
      this.timers.forEach(t=>clearInterval(t));
      this.observers.forEach(o=>{ try{o.disconnect();}catch(_){} });
      const host = document.getElementById('srbar-host');
      if (host) host.remove();
      delete window.__SRBAR;
    }
  };
  window.__SRBAR = S;

  // ====== helpers básicos ======
  const $ = (s, r=document)=> r.querySelector(s);
  const r2cSafe = (r)=> r==null ? '' : (r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r));

  function listOpponentHoles(deadIds){
    const dead = new Set(deadIds);
    const deck = makeDeck().filter(c => !dead.has(cardId(c)));
    const holes = [];
    for (let i=0;i<deck.length-1;i++){
      for (let j=i+1;j<deck.length;j++){
        holes.push([deck[i], deck[j]]);
      }
    }
    return holes;
  }

  // ====== helpers para AGRUPAMENTO LÓGICO (mesma regra do app) ======
  function flushRanksBySuit(all7, suit){
    return all7.filter(c=>c.s===suit).map(c=>c.r).sort((a,b)=>b-a);
  }
  function inferFlushSuit(all7, ev){
    if(ev.cat !== CAT.FLUSH) return null;
    const target = (ev.kick||[]).slice(0,5).join(',');
    for(const s of SUITS){
      const top5 = flushRanksBySuit(all7, s).slice(0,5).join(',');
      if(top5 && top5 === target) return s;
    }
    return null;
  }
  function highCardTop2(all7){
    const uniq = Array.from(new Set(all7.map(c=>c.r))).sort((a,b)=>b-a);
    return { hi: uniq[0]||null, k2: uniq[1]||null };
  }
  function groupKey(ev, all7, board){
    switch(ev.cat){
      case CAT.HIGH: {
        const { hi: H, k2 } = highCardTop2(all7);
        return `HIGH:${H||0}-${k2||0}`;
      }
      case CAT.PAIR: {
        const p = ev.kick?.[0] || 0;
        return `PAIR:${p}`;
      }
      case CAT.TWO: {
        const a = ev.kick?.[0]||0, b = ev.kick?.[1]||0;
        const hi2 = Math.max(a,b), lo2 = Math.min(a,b);
        return `TWO:${hi2}-${lo2}`;
      }
      case CAT.TRIPS: {
        const t = ev.kick?.[0] || 0;
        return `TRIPS:${t}`;
      }
      case CAT.STRAIGHT: {
        const top = ev.kick?.[0] || 0;
        return `STRAIGHT:${top}`;
      }
      case CAT.FLUSH: {
        const suit = inferFlushSuit(all7, ev) || 'x';
        const boardSuitCount = board.filter(c=>c.s===suit).length;
        const ranks = flushRanksBySuit(all7, suit);
        const top = ranks[0]||0, second = ranks[1]||0;
        if(boardSuitCount >= 4) return `FLUSH:${suit}:${top}`;
        return `FLUSH:${suit}:${top}-${second}`;
      }
      case CAT.FULL: {
        const t = ev.kick?.[0]||0, p = ev.kick?.[1]||0;
        return `FULL:${t}-${p}`;
      }
      case CAT.QUADS: {
        const q = ev.kick?.[0]||0;
        return `QUADS:${q}`;
      }
      case CAT.STRAIGHT_FLUSH: {
        const top = ev.kick?.[0]||0;
        const s   = ev.s || inferFlushSuit(all7, ev) || 'x';
        return `SFLUSH:${s}:${top}`;
      }
      case CAT.ROYAL: {
        const s = ev.s || inferFlushSuit(all7, ev) || 'x';
        return `ROYAL:${s}`;
      }
      default:
        return `UNK`;
    }
  }

  // força realista vs 1 vilão — AGORA por GRUPOS (cada grupo conta 1)
  function strengthVsOneVillain(hero2, board){
    const heroEv = evalBest(hero2.concat(board));
    const deadIds = hero2.concat(board).map(cardId);
    const oppHoles = listOpponentHoles(deadIds);

    // 1) agrupar todos os holes por “grupo lógico”
    const groups = new Map(); // key -> representante (ev)
    for (const [a,b] of oppHoles){
      const all7 = [a,b].concat(board);
      const ev = evalBest(all7);
      const key = groupKey(ev, all7, board);
      if(!groups.has(key)){ groups.set(key, ev); } // 1 representante por grupo
    }

    // 2) comparar cada GRUPO com o herói
    let winG = 0, tieG = 0, loseG = 0;
    for(const ev of groups.values()){
      const c = cmpEval(heroEv, ev);
      if (c>0) winG++;
      else if (c<0) loseG++;
      else tieG++;
    }
    const totG = Math.max(1, groups.size);
    return {
      win: winG/totG,             // fração por grupos
      tie: tieG/totG,
      lose: loseG/totG,
      totalGroups: totG,
      betterGroups: loseG,
      tieGroups: tieG,
      worseGroups: winG,
      heroEv
    };
  }

  // ajusta para N vilões (aprox analítica rápida) — usa frações por GRUPOS
  function adjustForNOpp(p1, t1, nOpp){
    nOpp = Math.max(1, Number(nOpp)||1);
    if (nOpp === 1) return { win: p1, tie: t1, lose: 1-p1-t1 };
    // aproximação independente
    const win = Math.pow(p1, nOpp);
    const tie = 0; // ignoramos empate multiway
    const lose = Math.max(0, 1 - win - tie);
    return { win, tie, lose };
  }

  function scoreFrom(win, tie){
    // 0..10 simples
    return Math.max(0, Math.min(10, 10*win + 5*tie));
  }

  // ====== UI: cria barra no Shadow DOM ======
  function ensurePanel(){
    let host = document.getElementById('srbar-host');
    if (host) return host;

    const anchor = document.getElementById('equityBox') || document.body;
    host = document.createElement('div');
    host.id = 'srbar-host';
    anchor.appendChild(host);

    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .card {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          background: #0f172a; color: #e2e8f0;
          border: 1px solid #334155; border-radius: 12px;
          padding: 10px; margin-top: 10px;
        }
        .hdr { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .dot { width:8px; height:8px; border-radius:50%; background:#22d3ee; }
        .title { font-weight: 700; }
        .bar {
          position: relative; height: 12px; border-radius: 999px;
          background: linear-gradient(90deg,#7f1d1d,#f59e0b,#16a34a);
          overflow: hidden; border:1px solid #1f2937;
        }
        .fill {
          position:absolute; left:0; top:0; bottom:0; width:0%;
          background: rgba(255,255,255,.15);
        }
        .meta { display:flex; justify-content:space-between; gap:8px; margin-top:6px; font-size:12.5px; }
        .mut { color:#93a3b8 }
        .big { font-weight:800 }
      </style>
      <div class="card">
        <div class="hdr"><div class="dot"></div><div class="title">Score Realista</div></div>
        <div class="bar"><div class="fill" id="fill"></div></div>
        <div class="meta">
          <div id="left" class="big">— / 10</div>
          <div id="right" class="mut">—</div>
        </div>
        <div class="meta mut">
          <div id="kpiL">Melhores: —</div>
          <div id="kpiM">Empates: —</div>
          <div id="kpiR">Piores: —</div>
        </div>
      </div>
    `;
    host._root = root;
    return host;
  }

  // ====== render principal ======
  function render(){
    const host = ensurePanel();
    const R = host._root;

    const eqOppSel = document.getElementById('eqOpp');
    const nOpp = eqOppSel ? Number(eqOppSel.value) : 1;

    const { hand, board } = PC.getKnown();
    if (!hand || hand.length<2){
      R.getElementById('fill').style.width = '0%';
      R.getElementById('left').textContent = 'Selecione 2 cartas';
      R.getElementById('right').textContent = '';
      R.getElementById('kpiL').textContent = 'Melhores: —';
      R.getElementById('kpiM').textContent = 'Empates: —';
      R.getElementById('kpiR').textContent = 'Piores: —';
      return;
    }

    if (board.length < 3){
      R.getElementById('fill').style.width = '0%';
      R.getElementById('left').textContent = 'Pré-flop (use MC no painel)';
      R.getElementById('right').textContent = '';
      R.getElementById('kpiL').textContent = '—';
      R.getElementById('kpiM').textContent = '—';
      R.getElementById('kpiR').textContent = '—';
      return;
    }

    // força vs 1 vilão (por grupos)
    const base = strengthVsOneVillain(hand, board);
    // ajuste p/ N vilões (aprox rápida)
    const adj  = adjustForNOpp(base.win, base.tie, nOpp);

    const score = scoreFrom(adj.win, adj.tie);
    const pct = Math.round((score/10)*100);

    // UI
    R.getElementById('fill').style.width = `${pct}%`;
    R.getElementById('left').textContent  = `${score.toFixed(1)} / 10`;
    R.getElementById('right').textContent = `vs ${nOpp} oponente${nOpp>1?'s':''} • ${CAT_NAME ? (CAT_NAME[base.heroEv.cat]||'') : ''}`;

    // KPIs — agora por GRUPOS
    R.getElementById('kpiL').textContent = `Melhores: ${base.betterGroups}`;
    R.getElementById('kpiM').textContent = `Empates: ${base.tieGroups}`;
    R.getElementById('kpiR').textContent = `Piores: ${base.worseGroups}`;
  }

  // ====== wiring (auto-update leve) ======
  S.timers.push(setInterval(render, 600));
  const mo = new MutationObserver(()=>render());
  mo.observe(document.body, { childList:true, subtree:true, attributes:true });
  S.observers.push(mo);
  render();

  // API pública mínima
  window.SR_BAR = { render, cleanup: ()=>S.cleanup() };
})();
