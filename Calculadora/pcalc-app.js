/* ===== PATCH — Barra "Score Realista" (0–10) com mãos únicas + [ver] ===== */
(function(g){
  const PC = g.PCALC;
  if(!PC){ console.warn('[SR] PCALC indisponível'); return; }
  const { makeDeck, evalBest, cmpEval, cardId, CAT_NAME, CAT } = PC;

  // ---------- Helpers ----------
  function listOpponentHoles(deadIds){
    const dead = new Set(deadIds);
    const deck = makeDeck().filter(c => !dead.has(cardId(c)));
    const out = [];
    for(let i=0;i<deck.length-1;i++){
      for(let j=i+1;j<deck.length;j++){
        out.push([deck[i], deck[j]]);
      }
    }
    return out;
  }
  const r2 = r => r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r||'');
  const K  = (...arr) => arr.map(r2).join('-');

  // Chave canônica "sem naipe" por categoria (deduplica mãos)
  function patternKeyFromEval(ev){
    const k = ev.kick || [];
    switch(ev.cat){
      case CAT.ROYAL:   return 'ROYAL';
      case CAT.SFLUSH:  return `SFL:${r2(k[0]||'')}`;                        // straight flush alto X
      case CAT.STRAIGHT:return `ST:${r2(k[0]||'')}`;                         // straight alto X
      case CAT.QUADS:   return `QD:${K(k[0],k[1])}`;                         // quadra + kicker
      case CAT.FULL:    return `FH:${K(k[0],k[1])}`;                         // trinca cheia de par
      case CAT.FLUSH:   return `FL:${K(k[0],k[1],k[2],k[3],k[4])}`;          // ranks do melhor 5-cartas
      case CAT.TRIPS:   return `TR:${K(k[0],k[1],k[2])}`;                    // trinca + 2 kickers
      case CAT.TWO:     return `2P:${K(k[0],k[1],k[2])}`;                    // dois pares + kicker
      case CAT.PAIR:    return `1P:${K(k[0],k[1],k[2],k[3])}`;               // par + 3 kickers
      case CAT.HIGH:    return `HC:${K(k[0],k[1],k[2],k[3],k[4])}`;          // 5 kickers
      default:          return `C${ev.cat}:${(k||[]).map(r2).join('-')}`;
    }
  }

  // Força vs 1 vilão (enumeração completa) + padrões únicos que te vencem
  function strengthVsOneVillain(hero2, board){
    const heroEv = evalBest(hero2.concat(board));
    const deadIds = hero2.concat(board).map(cardId);
    const holes = listOpponentHoles(deadIds);

    let win=0,tie=0,lose=0;
    const betterPatterns = new Set();

    for(const [a,b] of holes){
      const villEv = evalBest([a,b].concat(board));
      const c = cmpEval(heroEv, villEv);
      if(c>0) win++;
      else if(c<0){ lose++; betterPatterns.add(patternKeyFromEval(villEv)); }
      else tie++;
    }
    const total = win+tie+lose || 1;
    return {
      win: win/total, tie: tie/total, lose: lose/total,
      heroEv, totalCombos: total,
      betterCombos: lose,
      betterUniqueHands: betterPatterns.size
    };
  }

  // Ajuste rápido para multiway (conservador)
  function adjustForNOpp(p1, t1, n){
    n = Math.max(1, Number(n)||1);
    if(n===1) return {win:p1, tie:t1, lose:1-p1-t1};
    const win = Math.pow(p1, n);
    const tie = 0;
    const lose = Math.max(0, 1 - win - tie);
    return { win, tie, lose };
  }

  const scoreFrom = (w,t) => Math.max(0, Math.min(10, 10*w + 5*t));

  // ---------- UI ----------
  function ensureSRBar(){
    let host = document.getElementById('srbar-host');
    if(host) return host;

    const box = document.getElementById('equityBox') || document.body;
    host = document.createElement('div');
    host.id = 'srbar-host';
    box.appendChild(host);

    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `
      <style>
        :host{all:initial}
        .card{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;
              background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;
              padding:10px;margin-top:10px}
        .hdr{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .dot{width:8px;height:8px;border-radius:50%;background:#22d3ee}
        .title{font-weight:700}
        .bar{position:relative;height:12px;border-radius:999px;overflow:hidden;
             border:1px solid #1f2937;background:linear-gradient(90deg,#7f1d1d,#f59e0b,#16a34a)}
        .fill{position:absolute;left:0;top:0;bottom:0;width:0%;background:rgba(255,255,255,.15)}
        .meta{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:12.5px}
        .mut{color:#93a3b8}.big{font-weight:800}
        .link{color:#60a5fa;cursor:pointer;text-decoration:none}.link:hover{text-decoration:underline}
      </style>
      <div class="card">
        <div class="hdr"><div class="dot"></div><div class="title">Score Realista</div></div>
        <div class="bar"><div id="fill" class="fill"></div></div>
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

  function renderSR(){
    const host = ensureSRBar();
    const R = host._root;

    const oppSel = document.getElementById('eqOpp');
    const nOpp = oppSel ? Number(oppSel.value) : 1;

    const {hand,board} = PC.getKnown();
    if(!(hand && hand.length===2)){
      R.getElementById('fill').style.width='0%';
      R.getElementById('left').textContent='Selecione 2 cartas';
      R.getElementById('right').textContent='';
      R.getElementById('kpiL').textContent='Melhores: —';
      R.getElementById('kpiM').textContent='Empates: —';
      R.getElementById('kpiR').textContent='Piores: —';
      return;
    }
    if(board.length<3){
      R.getElementById('fill').style.width='0%';
      R.getElementById('left').textContent='Pré-flop (use MC acima)';
      R.getElementById('right').textContent='';
      R.getElementById('kpiL').textContent='—';
      R.getElementById('kpiM').textContent='—';
      R.getElementById('kpiR').textContent='—';
      return;
    }

    // base exata 1-vilão + ajuste multiway
    const base = strengthVsOneVillain(hand, board);
    const adj  = adjustForNOpp(base.win, base.tie, nOpp);

    const score = scoreFrom(adj.win, adj.tie);
    const pct   = Math.round((score/10)*100);

    R.getElementById('fill').style.width = `${pct}%`;
    R.getElementById('left').textContent  = `${score.toFixed(1)} / 10`;
    R.getElementById('right').textContent = `vs ${nOpp} oponente${nOpp>1?'s':''} • ${(CAT_NAME && base.heroEv)?(CAT_NAME[base.heroEv.cat]||''):''}`;

    const ties  = Math.round(base.totalCombos * base.tie);
    const worse = Math.round(base.totalCombos * base.win);

    // “Melhores: Xc • Y mãos [ver]”
    R.getElementById('kpiL').innerHTML =
      `Melhores: ${base.betterCombos}c • ${base.betterUniqueHands} mãos <a id="srView" class="link">ver</a>`;
    R.getElementById('kpiM').textContent = `Empates: ${ties}`;
    R.getElementById('kpiR').textContent = `Piores: ${worse}`;

    // [ver] abre seu overlay de ranking
    const lnk = R.getElementById('srView');
    if(lnk && !lnk._wired){
      lnk._wired = true;
      lnk.addEventListener('click', (e)=>{
        e.preventDefault();
        if(typeof g.showNutsOverlay === 'function'){ try{ g.showNutsOverlay(); return; }catch(_){ } }
        const anchor = document.querySelector('.nutsline');
        if(anchor){
          const ev = new Event('mouseenter', {bubbles:true});
          anchor.dispatchEvent(ev);
        }
      });
    }
  }

  // atualizações
  const timer = setInterval(renderSR, 600);
  const mo = new MutationObserver(()=>renderSR());
  mo.observe(document.body, {childList:true, subtree:true, attributes:true});

  // cleanup opcional
  g.__SR_cleanup__ = function(){
    try{ clearInterval(timer); mo.disconnect(); }catch(_){}
    const host = document.getElementById('srbar-host');
    if(host) host.remove();
  };
})(window);
