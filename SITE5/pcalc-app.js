// pcalc-suggest.js
(function(g){
  const PCALC = g.PCALC;
  const { CAT } = PCALC;

  // Mapeia título -> classe (cores/estilos na UI)
  PCALC.decisionClass = function(title){
    const t = (title || '').toUpperCase();
    if (t.includes('APOSTE') || t.includes('VALOR') || t.includes('AUMENTE')) return 'ok';
    if (t.includes('SEMI-BLEFE')) return 'warn';
    if (t.includes('CHECK OU DESISTA') || t.includes('DESISTA') || t.includes('FOLD')) return 'danger';
    if (t.includes('CONTROLE') || t.includes('CHECK') || t.includes('POT CONTROL') || t.includes('PAGUE')) return 'info';
    return 'info';
  };

  // animação de “glow” quando muda o tipo de decisão
  let _lastDecisionClass = null;
  PCALC.shouldGlow = function(cls){
    const glow = (_lastDecisionClass && _lastDecisionClass !== cls);
    _lastDecisionClass = cls;
    return glow;
  };

  // === Util: normaliza mão para notação tipo "AKs", "AQo", "TT" ===
  function normalizeHand(hand){
    if (!hand || hand.length < 2) return "";
    const ranks = hand.map(c=>c.r).sort((a,b)=>b-a);
    const suited = (hand[0].s === hand[1].s);
    const map = {14:"A", 13:"K", 12:"Q", 11:"J", 10:"T", 9:"9", 8:"8", 7:"7", 6:"6", 5:"5", 4:"4", 3:"3", 2:"2"};
    const toStr = r => map[r] || r;
    const a = toStr(ranks[0]), b = toStr(ranks[1]);
    if (a === b) return a+a; // pares: "AA", "TT"...
    return a + b + (suited ? "s" : "o");
  }

  // Top 20 mãos iniciais (tratadas como premium)
  const top20 = new Set([
    "AA","KK","QQ","JJ","TT","99","88","77",
    "AKs","AQs","AJs","ATs","KQs",
    "AKo","AQo","KJs","QJs","JTs","KTs","QTs"
  ]);

  // ===== SUGESTÃO 100% POR EQUIDADE (com exceções de pré-flop premium) =====
  PCALC.suggestAction = function(eqPct, hand, board, opp){
    const st = (board.length < 3) ? 'pre' : (board.length === 3 ? 'flop' : (board.length === 4 ? 'turn' : 'river'));

    // ajuste leve para multiway (+2pp por oponente extra)
    const adj = Math.max(0, (opp - 1) * 2);
    const ge  = (x) => eqPct >= (x + adj);

    // ---------- PRÉ-FLOP ----------
    if (st === 'pre') {
      const norm = normalizeHand(hand);

      // Exceções premium (top 20): sempre valor com sizing recomendado
      if (top20.has(norm)) {
        return { title: 'APOSTE POR VALOR', detail: 'Mão inicial premium (top 20) — Abra raise de 2–3 BB' };
      }

      // Demais mãos: thresholds por equidade simulada
      if (ge(60)) return { title: 'APOSTE POR VALOR', detail: 'Aumento 2–3 BB (pré-flop forte)' };
      if (ge(45)) return { title: 'CONTROLE O POTE', detail: 'Call/Aumento pequeno (posição ajuda)' };
      if (ge(35)) return { title: 'PAGUE BARATO / VEJA O FLOP', detail: 'Evite pot grande fora de posição' };
      return { title: 'CHECK OU DESISTA', detail: 'Sem equidade suficiente pré-flop' };
    }

    // ---------- PÓS-FLOP ----------
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
