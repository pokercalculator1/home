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

  // Sugestão 100% baseada em equidade (pré e pós-flop)
  PCALC.suggestAction=function(eqPct, hand, board, opp){
    // ajuste leve para multiway: exige um pouco mais de eq% por oponente extra
    const multAdj = Math.max(0, (opp-1)*3); // +3 pontos por vilão a mais
    const gt = (x)=> eqPct >= (x + multAdj);

    // info de draws (apenas pós-flop)
    const outsRes = PCALC.computeOuts?.();
    const outsStraight = outsRes?.outsExact?.[CAT.STRAIGHT]?.size || 0;
    const outsFlush    = outsRes?.outsExact?.[CAT.FLUSH]?.size    || 0;
    const strongDraw = (outsFlush >= 9) || (outsStraight >= 8);
    const weakDraw   = (!strongDraw && outsStraight >= 4);

    // thresholds unificados
    if(gt(65)) return {title:'APOSTE POR VALOR', detail:'66% – 100% pot (ajuste vs vilão)'};
    if(gt(45) && eqPct < 65) return {title:'CONTROLE O POTE', detail:'Check / Bet pequeno (≤ 33% pot)'};
    if(eqPct >= 28 && eqPct < 45){
      if(strongDraw) return {title:'SEMI-BLEFE', detail:'~ 60% pot (draw forte)'};
      if(weakDraw && opp===1 && eqPct >= 32) return {title:'SEMI-BLEFE leve (HU)', detail:'30% – 40% pot (gutshot)'};
      return {title:'CHECK', detail:'Sem valor suficiente para apostar'};
    }
    return {title:'CHECK OU DESISTA', detail:'Blefe puro só com muito fold equity (~75% pot)'};
  };
})(window);
