// Generated on 2025-09-27T15:25:00.400351 by ChatGPT
/* ============================================================
   INÍCIO DO MÓDULO — pcalc.hero-gto.js
   Reconhecimento da mão do herói e política por categoria
   ============================================================ */
(function (g) {
  const PC = g.PCALC || g.PC;
  if (!PC || !PC.makeDeck || !PC.evalBest) { console.warn('[HERO-GTO] PCALC não disponível.'); return; }

  const byId = Object.fromEntries(PC.makeDeck().map(c => [PC.cardId(c), c]));
  const readSelected = () => {
    const sel = (PC.state && PC.state.selected) ? [...PC.state.selected] : [];
    const cards = sel.map(id => byId[id]).filter(Boolean);
    const hero = cards.slice(0, 2);
    const board = cards.slice(2, 7);
    return { hero, board };
  };

  function suitCounts(cs){ const m={}; cs.forEach(c=>m[c.s]=(m[c.s]||0)+1); return m; }
  function ranks(cs){ return cs.map(c=>c.r).sort((a,b)=>b-a); }
  function isMonotone(board){ const s=suitCounts(board); return Math.max(...Object.values(s||{X:0}))>=3 && new Set(board.map(c=>c.s)).size===1; }
  function isTwoTone(board){ const s=new Set(board.map(c=>c.s)); return s.size===2; }
  function isConnectedish(board){
    const rs = [...new Set(ranks(board))].sort((a,b)=>a-b);
    let gaps=0; for(let i=1;i<rs.length;i++) gaps += (rs[i]-rs[i-1]-1);
    return gaps<=3;
  }

  function classifyHero(hero, board){
    if(hero.length<2 || board.length<3) return null;
    const all = [...hero, ...board];
    const best = PC.evalBest(all);
    const CAT = PC.CAT || {};
    const CAT_NAME = PC.CAT_NAME || (x=>String(x));
    let label = CAT_NAME[best.cat] || String(best.cat);
    const mapPretty = {
      [CAT.HIGH      ]: 'Carta alta',
      [CAT.PAIR      ]: 'Par',
      [CAT.TWO       ]: 'Dois pares',
      [CAT.TRIPS     ]: 'Trinca',
      [CAT.STRAIGHT  ]: 'Sequência',
      [CAT.FLUSH     ]: 'Flush',
      [CAT.FULL      ]: 'Full house',
      [CAT.QUADS     ]: 'Quadra',
      [CAT.SFLUSH    ]: 'Straight flush',
      [CAT.ROYAL     ]: 'Royal Flush'
    };
    if (mapPretty[best.cat]) label = mapPretty[best.cat];
    return { best, cat: best.cat, catLabel: label };
  }

  function heroPolicy(cat, board, nOpponents){
    const multi = (nOpponents||1) >= 2;
    const wet = isMonotone(board) || isTwoTone(board) || isConnectedish(board);
    switch(cat){
      case (PC.CAT && PC.CAT.TRIPS):
        if (!wet && !multi) return { action:'BET', size:'33%', note:'trinca em board seco (HU)' };
        if (!wet &&  multi) return { action:'BET', size:'50%', note:'trinca multiway em board seco' };
        if ( wet && !multi) return { action:'BET', size:'66%', note:'board molhado (proteger vs draws)' };
        return                           { action:'BET', size:'75%', note:'trinca multiway em board molhado' };
      case (PC.CAT && PC.CAT.QUADS):
      case (PC.CAT && PC.CAT.FULL):
        return { action:'BET', size: wet ? '66%' : (multi ? '50%' : '33%'), note:'topo do range; balancear frequência' };
      case (PC.CAT && PC.CAT.FLUSH):
      case (PC.CAT && PC.CAT.STRAIGHT):
        return { action:'BET', size: wet ? '66%' : '50%', note:'mão feita forte' };
      case (PC.CAT && PC.CAT.TWO):
        return { action:'BET', size: wet ? (multi ? '66%' : '50%') : (multi ? '50%' : '33%'), note:'value vs ranges' };
      case (PC.CAT && PC.CAT.ONE):
        return { action: wet ? 'CHECK' : 'BET', size: wet ? '-' : '33%', note:'par único: controlar pote' };
      default:
        return { action:'CHECK', size:'-', note:'sem valor claro de aposta' };
    }
  }

  function renderSuggestion(catLabel, policy){
    const host = document.querySelector('#pcalc-sugestao') || document.querySelector('[data-sugestao]') || null;
    const text = `🧠 Reconhecido: ${catLabel} · Sugerido (por mão): ${policy.action}${policy.size==='-'?'':(' '+policy.size)} — ${policy.note}`;
    if (host){
      let box = host.querySelector('.hero-gto-line');
      if (!box){
        box = document.createElement('div');
        box.className = 'hero-gto-line';
        box.style.marginTop = '6px';
        box.style.padding = '10px';
        box.style.border = '1px solid rgba(80,140,255,.25)';
        box.style.borderRadius = '8px';
        box.style.fontSize = '0.95rem';
        box.style.lineHeight = '1.2';
        host.appendChild(box);
      }
      box.textContent = text;
    } else { console.log('[HERO-GTO]', text); }
  }

  function readOpponents(){
    const sel = document.querySelector('[name="oponentes"], #oponentes, [data-oponentes], #eqOpp');
    if (!sel) return 1;
    const v = Number(sel.value || sel.textContent || 1);
    return Number.isFinite(v) && v>0 ? v : 1;
  }

  let lastKey = '';
  function tick(){
    try{
      const { hero, board } = readSelected();
      if (hero.length<2 || board.length<3){ lastKey=''; return; }
      const key = hero.map(c=>PC.cardId(c)).join('-')+'|'+board.map(c=>PC.cardId(c)).join('-')+'|'+readOpponents();
      if (key===lastKey) return;
      lastKey = key;
      const cls = classifyHero(hero, board); if (!cls) return;
      const pol = heroPolicy(cls.cat, board, readOpponents());
      renderSuggestion(cls.catLabel, pol);
    }catch(e){ console.warn('[HERO-GTO] erro:', e); }
  }

  setInterval(tick, 400);
  console.info('[HERO-GTO] ativo.');
})(window);
/* FIM DO MÓDULO — pcalc.hero-gto.js */
