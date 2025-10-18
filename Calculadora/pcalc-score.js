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
    return holes;
  }

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
    return { win: win/tot, tie: tie/tot, lose: lose/tot, totalCombos: tot, heroEv };
  }

  function adjustForNOpp(p1, t1, nOpp){
    nOpp = Math.max(1, Number(nOpp)||1);
    if (nOpp === 1) return { win: p1, tie: t1, lose: 1-p1-t1 };
    const win = Math.pow(p1, nOpp);
    const tie = 0;
    const lose = Math.max(0, 1 - win - tie);
    return { win, tie, lose };
  }

  function scoreFrom(win, tie){ return Math.max(0, Math.min(10, 10*win + 5*tie)); }

  // ====== dispara o overlay do seu ranking (como hover na .nutsline) ======
  function openRankingOverlay(){
    const a = document.querySelector('.nutsline');
    if (!a) { console.warn('[SR] .nutsline não encontrada.'); return; }
    // tenta abrir por hover...
    a.dispatchEvent(new Event('mouseenter', {bubbles:true}));
    // ...e garante por clique (se seu código alternar por click)
    a.click?.();
    // opcional: rola o overlay para centro após abrir
    setTimeout(()=>{
      const o = document.getElementById('nutsOverlay');
      if (o) o.scrollIntoView({behavior:'smooth', block:'center'});
    }, 60);
  }

  // ====== UI ======
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
        .bar { position: relative; height: 12px; border-radius: 999px;
               background: linear-gradient(90deg,#7f1d1d,#f59e0b,#16a34a);
               overflow: hidden; border:1px solid #1f2937; }
        .fill { position:absolute; left:0; top:0; bottom:0; width:0%;
                background: rgba(255,255
