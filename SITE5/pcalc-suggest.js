// pcalc-suggest.js
(function(g){
  const PCALC = g.PCALC;
  const { CAT } = PCALC;

  // Mapeia título -> classe de cor/estilo
  PCALC.decisionClass = function(title){
    const t = (title || '').toUpperCase();
    if (t.includes('APOSTE') || t.includes('VALOR') || t.includes('AUMENTE')) return 'ok';
    if (t.includes('SEMI-BLEFE')) return 'warn';
    if (t.includes('CHECK OU DESISTA') || t.includes('DESISTA') || t.includes('FOLD')) return 'danger';
    if (t.includes('CONTROLE') || t.includes('CHECK') || t.includes('POT CONTROL') || t.includes('PAGUE')) return 'info';
    return 'info';
  };

  // Animação de "glow" quando troca o tipo de decisão
  let _lastDecisionClass = null;
  PCALC.shouldGlow = function(cls){
    const glow = (_lastDecisionClass && _lastDecisionClass !== cls);
    _lastDecisionClass = cls;
    return glow;
  };

  // ===== SUGESTÃO 100% POR EQUIDADE (pré e pós-flop) =====
  // - Pré-flop com thresholds próprios (não subestima pares médios)
  // - Pós-flop usa outs para decidir semi-blefe
  // - Ajuste leve para multiway (+2pp por vilão extra)
  PCALC.suggestAction = function(eqPct, hand, board, opp){
    const st = (board.length < 3) ? 'pre' : (board.length === 3 ? 'flop' : (board.length === 4 ? 'turn' : 'river'));

    // ajuste leve para multiway
    const adj = Math.max(0, (opp - 1) * 2); // +2 pontos por oponente extra
    const ge  = (x) => eqPct >= (x + adj);

    // ---------- PRÉ-FLOP ----------
    if (st === 'pre') {
      // 60%+: forte para abrir por valor mesmo 3-way
      if (ge(60)) return { title: 'APOSTE POR VALOR', detail: 'Aumento 2–3 BB (pré-flop forte)' };
      // 45–60%: mãos boas/ok — controle do pote
      if (ge(45)) return { title: 'CONTROLE O POTE', detail: 'Call/Aumento pequeno (posição ajuda)' };
      // 35–45%: mãos marginais — ver flop barato (ex.: 55 ~40% em 3-way)
      if (ge(35)) return { title: 'PAGUE BARATO / VEJA O FLOP', detail: 'Evite pot grande fora de posição' };
      // <35%: fold
      return { title: 'CHECK OU DESISTA', detail: 'Sem equidade suficiente pré-flop' };
    }

    // ---------- PÓS-FLOP EM DIANTE ----------
    const outsRes      = PCALC.computeOuts?.();
    const outsStraight = outsRes?.outsExact?.[CAT.STRAIGHT]?.size || 0;
    const outsFlush    = outsRes?.outsExact?.[CAT.FLUSH]?.size    || 0;
    const strongDraw   = (outsFlush >= 9) || (outsStraight >= 8);
    const weakDraw     = (!strongDraw && outsStraight >= 4);

    if (ge(65)) return { title: 'APOSTE POR VALOR', detail: '66% – 100% pot' };
    if (ge(45) && eqPct < (65 + adj)) return { title: 'CONTROLE O POTE', detail: 'Check / Bet pequeno (≤ 33% pot)' };

    if (eqPct >= (28 + adj) && eqPct < (45 + adj)) {
      if (strongDraw) return { title: 'SEMI-BLEFE', detail: '~ 60% pot (draw forte)' };
      if (weakDraw && opp === 1 && eqPct >= (32 + adj)) return { title: 'SEMI-BLEFE leve (HU)', detail: '30% – 40% pot' };
      return { title: 'CHECK', detail: 'Sem valor suficiente para apostar' };
    }

    return { title: 'CHECK OU DESISTA', detail: 'Blefe puro só com muito fold equity (~75% pot)' };
  };
})(window);
