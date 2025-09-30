// pcalc-suggest.js — Sugestões SEM AÇÃO alinhadas ao raise.js (frases ajustadas)
// - Pré-flop (você primeiro a agir) e Pós-flop (ninguém apostou)
// - Faixas:
//   <30%  -> Desista
//   30–50 -> Passe ou Desista (só continue vs aposta se houver pot odds)
//   50–70 -> Pré: APOSTE 2 ou 3 blinds | Pós: APOSTE 50–75% do pote
//   70–80 -> Pré: APOSTE 3 ou 4 blinds | Pós: APOSTE 75–100% do pote
//   >80%  -> Pré: APOSTE 4 ou 5 blinds (Efetivo ≤12BB => All-in; Slow Play se toggle ligado)
//            Pós: All-in/overbet (ou Slow Play)
// - “check” substituído por “passe” em todo o texto.
// - Ajuste multiway: +2pp no limiar por oponente extra.
// - Equity indefinida -> “Aguardando cartas…”.

(function (g) {
  const PCALC = g.PCALC || (g.PCALC = {});
  const CAT = (PCALC && PCALC.CAT) ? PCALC.CAT : {};

  // =========================================================
  // Classes de decisão (cores/estilos na UI)
  // =========================================================
  PCALC.decisionClass = function (title) {
    const t = (title || '').toUpperCase();
    if (t.includes('APOSTE') || t.includes('AUMENTE') || t.includes('3-BET') || t.includes('SQUEEZE'))
      return 'ok';
    if (t.includes('SEMI-BLEFE'))
      return 'warn';
    if (t.includes('PASSE OU DESISTA') || t.includes('DESISTA') || t.includes('FOLD'))
      return 'danger';
    if (t.includes('CONTROLE') || t.includes('PASSE') || t.includes('POT CONTROL') || t.includes('PAGUE') || t.includes('CALL'))
      return 'info';
    return 'info';
  };

  // animação de “glow” quando muda o tipo de decisão
  let _lastDecisionClass = null;
  PCALC.shouldGlow = function (cls) {
    const glow = (_lastDecisionClass && _lastDecisionClass !== cls);
    _lastDecisionClass = cls;
    return glow;
  };

  // =========================================================
  // Utils
  // =========================================================
  function normalizeHand(hand) {
    if (!hand || hand.length < 2) return "";
    const ranks = hand.map(c => c.r).sort((a, b) => b - a);
    const suited = (hand[0].s === hand[1].s);
    const map = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
    const toStr = r => map[r] || r;
    const a = toStr(ranks[0]), b = toStr(ranks[1]);
    if (a === b) return a + a; // pares
    return a + b + (suited ? "s" : "o");
  }

  // Top 20 mãos iniciais — tratadas como premium para open-raise
  const top20 = new Set([
    "AA","KK","QQ","JJ","TT","99","88","77",
    "AKs","AQs","AJs","ATs","KQs",
    "AKo","AQo","KJs","QJs","JTs","KTs","QTs"
  ]);

  // Helpers da UI do raise.js
  function q(sel){ return document.querySelector(sel); }
  function effBB(){
    const eff = Number((q('#inp-eff')||{}).value || NaN);
    const bb  = Number((q('#inp-bb') ||{}).value || NaN);
    if (!isFinite(eff) || !isFinite(bb) || bb <= 0) return NaN;
    return +(eff / bb).toFixed(1);
  }
  function slowPlayOn(){
    const el = document.getElementById('rsw-slow');
    return !!(el && el.checked);
  }

  // =========================================================
  // SUGESTÃO por Equidade — SEM AÇÃO (você primeiro a agir / ninguém apostou)
  // =========================================================
  PCALC.suggestAction = function (eqPct, hand, board, opp) {
    // Equity indisponível → aguardar
    if (!isFinite(eqPct)) {
      return { title: 'Aguardando cartas…', detail: 'Calculando equity/outs' };
    }

    // Stage
    const st = (board && board.length < 3) ? 'pre'
               : (board && board.length === 3) ? 'flop'
               : (board && board.length === 4) ? 'turn'
               : 'river';

    // Ajuste leve para multiway: +2pp por oponente extra
    const oppN = Math.max(1, Number(opp || 1));
    const adj = Math.max(0, (oppN - 1) * 2);
    const ge  = (x) => eqPct >= (x + adj);

    // (Opcional) leitura de draws para descrição pós-flop
    const outsRes      = (PCALC.computeOuts && PCALC.computeOuts()) || null;
    const outsStraight = outsRes?.outsExact?.[CAT.STRAIGHT]?.size || 0;
    const outsFlush    = outsRes?.outsExact?.[CAT.FLUSH]?.size    || 0;
    const strongDraw   = (outsFlush >= 9) || (outsStraight >= 8);
    const weakDraw     = (!strongDraw && outsStraight >= 4);

    // -------------------- PRÉ-FLOP — você é o primeiro a agir --------------------
    if (st === 'pre') {
      const norm = normalizeHand(hand);

      // Premium de verdade → sempre valor (texto concreto em blinds)
      if (top20.has(norm)) {
        return { title: 'APOSTE 3 OU 4 BLINDS', detail: 'Mão premium (top 20)' };
      }

      if (eqPct < 30)
        return { title: 'DESISTA', detail: 'Equity < 30%' };

      if (eqPct < 50)
        return { title: 'PASSE OU DESISTA', detail: '30–50%: evite abrir; só continue mais tarde vs aposta se houver pot odds' };

      if (eqPct < 70)
        return { title: 'APOSTE 2 OU 3 BLINDS', detail: '50–70% de equity' };

      if (eqPct <= 80)
        return { title: 'APOSTE 3 OU 4 BLINDS', detail: '70–80% de equity' };

      // >80%
      if (slowPlayOn())
        return { title: 'SLOW PLAY', detail: 'Passe/limp ou 33% para induzir' };

      const ebb = effBB();
      if (isFinite(ebb) && ebb <= 12)
        return { title: 'ALL-IN', detail: '>80% equity e efetivo curto (≤12 BB)' };

      return { title: 'APOSTE 4 OU 5 BLINDS', detail: 'Mão muito forte' };
    }

    // -------------------- PÓS-FLOP — ninguém apostou ainda --------------------
    if (eqPct < 30)
      return { title: 'DESISTA', detail: '<30%: blefe só com MUITA fold equity' };

    if (eqPct < 50) {
      if (strongDraw) return { title: 'SEMI-BLEFE', detail: '33–50% do pote (draw forte)' };
      if (weakDraw && oppN === 1 && ge(32)) return { title: 'SEMI-BLEFE (HU)', detail: '30–40% do pote' };
      return { title: 'PASSE', detail: '30–50%: se houver aposta, continue só com pot odds' };
    }

    if (eqPct < 70)
      return { title: 'APOSTE 50 á 75% DO POTE', detail: 'Faixa de valor (50–70%)' };

    if (eqPct <= 80)
      return { title: 'APOSTE 75 á 100% DO POTE', detail: 'Valor forte (70–80%)' };

    // >80%
    if (slowPlayOn())
      return { title: 'SLOW PLAY De 33% do POTE', detail: 'Passe / 33% do pote para induzir' };

    const ebb2 = effBB();
    if (isFinite(ebb2) && ebb2 <= 12)
      return { title: 'ALL-IN ou MAIS QUE O POTE', detail: 'Efetivo curto (≤12 BB)' };

    return { title: 'APOSTE VALOR DO POTE', detail: 'Pot / overbet' };
  };

})(window);
