// pcalc-suggest.js
(function(g){
  const PCALC = g.PCALC;
  const { CAT } = PCALC;

  PCALC.decisionClass=function(title){
    const t = (title || '').toUpperCase();
    if (t.includes('APOSTE') || t.includes('VALOR') || t.includes('AUMENTE')) return 'ok';
    if (t.includes('SEMI-BLEFE')) return 'warn';
    if (t.includes('CHECK OU DESISTA') || t.includes('DESISTA') || t.includes('FOLD')) return 'danger';
    if (t.includes('CONTROLE') || t.includes('CHECK') || t.includes('POT CONTROL')) return 'info';
    return 'info';
  };
  let _lastDecisionClass = null;
  PCALC.shouldGlow=function(cls){
    const glow = (_lastDecisionClass && _lastDecisionClass !== cls);
    _lastDecisionClass = cls;
    return glow;
  };

  PCALC.suggestAction=function(eqPct, hand, board, opp){
    const st = board.length<3 ? 'pre' : (board.length===3?'flop':(board.length===4?'turn':'river'));
    if(st==='pre'){
      const cs = PCALC.chenScore(hand[0], hand[1]).score;
      if(cs >= 11) return {title:'APOSTE POR VALOR (AUMENTE)', detail:'2.5 – 3 BB (mão premium)'};
      if(cs >= 9)  return {title:'AUMENTO PEQUENO', detail:'2 – 2.5 BB (mão forte)'};
      if(cs >= 7)  return {title:'PAGAR OU ABRIR POTE', detail:'ou DESISTA se mesa/posição ruim'};
      return {title:'DESISTA', detail:'mão fraca pré-flop'};
    }
    const outsRes = PCALC.computeOuts();
    const outsStraight = outsRes.outsExact?.[CAT.STRAIGHT]?.size || 0;
    const outsFlush    = outsRes.outsExact?.[CAT.FLUSH]?.size    || 0;
    const strongDraw = (outsFlush >= 9) || (outsStraight >= 8);
    const weakDraw   = (!strongDraw && outsStraight >= 4);
    const mult = (opp >= 2);

    if(eqPct > 65) return {title:'APOSTE POR VALOR', detail:'66% – 100% pot (ajuste vs vilão)'};
    if(eqPct >= 40 && eqPct <= 65) return {title:'CONTROLE O POTE', detail:'Check / Bet pequeno (≤ 33% pot)'};
    if(eqPct >= 20 && eqPct < 40){
      if(strongDraw) return {title:'SEMI-BLEFE', detail:'~ 60% pot (draw forte)'};
      if(!mult && weakDraw && eqPct >= 22) return {title:'SEMI-BLEFE leve (HU)', detail:'30% – 40% pot (gutshot)'};
      return {title:'CHECK', detail:'Sem valor suficiente para apostar'};
    }
    return {title:'CHECK OU DESISTA', detail:'Blefe puro só com muito fold equity (~75% pot) — risco alto'};
  };
})(window);
