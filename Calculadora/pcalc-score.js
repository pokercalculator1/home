(() => {
  // ====== encerra versões antigas ======
  if (window.__SRBAR && typeof window.__SRBAR.cleanup === 'function') {
    try { window.__SRBAR.cleanup(); } catch(_) {}
  }

  const PC = window.PCALC;
  if (!PC) { console.warn('[SR] PCALC não encontrado.'); return; }
  const { makeDeck, evalBest, cmpEval, cardId, CAT_NAME } = PC;

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

  // ====== helpers ======
  const $ = (s, r=document)=> r.querySelector(s);

  function listOpponentHoles(deadIds){
    const dead = new Set(deadIds);
    const deck = makeDeck().filter(c => !dead.has(cardId(c)));
    const holes = [];
    for (let i=0;i<deck.length-1;i++){
      for (let j=i+1;j<deck.length;j++){
        holes.push([deck[i], deck[j]]);
      }
    }
    return holes; // ~990 combos típicos no flop
  }

  // força realista vs 1 vilão (enumeração completa)
  function strengthVsOneVillain(hero2, board){
    const heroEv = evalBest(hero2.concat(board));
    const deadIds = hero2.concat(board).map(cardId);
    const oppHoles = listOpponentHoles(deadIds);

    let win=0, tie=0, lose=0;
    for (const [a,b] of oppHoles){
      const villEv = evalBest([a,b].concat(board));
      const c = cmpEval(heroEv, villEv);
      if (c>0) win++; else if (c<0) lose++; else tie++;
    }
    const tot = win+tie+lose || 1;
    return {
      win: win/tot, tie: tie/tot, lose: lose/tot,
      totalCombos: tot,
      heroEv
    };
  }

  // ajusta para N vilões (aprox analítica rápida)
  function adjustForNOpp(p1, t1, nOpp){
    nOpp = Math.max(1, Number(nOpp)||1);
    if (nOpp === 1) return { win: p1, tie: t1, lose: 1-p1-t1 };
    // Aproximação conservadora (independente):
    const win = Math.pow(p1, nOpp);
    const tie = 0; // desprezamos empate multiway para simplicidade
    const lose = Math.max(0, 1 - win - tie);
    return { win, tie, lose };
  }

  function scoreFrom(win, tie){
    // 0..10
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

    // força vs 1 vilão
    const base = strengthVsOneVillain(hand, board);
    // ajuste p/ N vilões (aprox rápida)
    const adj  = adjustForNOpp(base.win, base.tie, nOpp);

    const score = scoreFrom(adj.win, adj.tie);
    const pct = Math.round((score/10)*100);

    // UI
    R.getElementById('fill').style.width = `${pct}%`;
    R.getElementById('left').textContent  = `${score.toFixed(1)} / 10`;
    R.getElementById('right').textContent = `vs ${nOpp} oponente${nOpp>1?'s':''} • ${CAT_NAME ? (CAT_NAME[base.heroEv.cat]||'') : ''}`;

    // KPIs (mostra contagens brutas do cenário 1 vilão, que é a base estatística)
    const better = Math.round(base.totalCombos * (1 - base.win - base.tie));
    const ties   = Math.round(base.totalCombos * base.tie);
    const worse  = Math.round(base.totalCombos * base.win);
    R.getElementById('kpiL').textContent = `Melhores: ${better}`;
    R.getElementById('kpiM').textContent = `Empates: ${ties}`;
    R.getElementById('kpiR').textContent = `Piores: ${worse}`;
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
