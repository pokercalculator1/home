// pcalc-suggest.js — Sugestões SEM AÇÃO alinhadas ao raise.js
// - Pré-flop (você primeiro a agir) e Pós-flop (ninguém apostou)
// - Mesmas faixas do raise.js:
//   <30%  -> Desista
//   30–50 -> Check / só continue se surgirem pot odds (vs aposta)
//   50–70 -> Aposta de valor 50–75%  | Pré: open 2–3 BB
//   70–80 -> Aposta de valor 75–100% | Pré: open 3–4 BB
//   >80%  -> All-in / overbet (ou Slow Play se toggle ligado). Efetivo ≤12BB => All-in
//
// Observações:
// - Mantém “Desista” (nada de "Fold").
// - Ajuste multiway: +2 pontos de porcentagem no limiar por oponente extra.
// - Se equity indisponível, mostra “Aguardando cartas…”.

(function (g) {
  const PCALC = g.PCALC || (g.PCALC = {});
  const CAT = (PCALC && PCALC.CAT) ? PCALC.CAT : {};

  // =========================================================
  // Classes de decisão (cores/estilos na UI)
  // =========================================================
  PCALC.decisionClass = function (title) {
    const t = (title || '').toUpperCase();
    if (t.includes('APOSTE') || t.includes('VALOR') || t.includes('AUMENTE') || t.includes('3-BET') || t.includes('SQUEEZE'))
      return 'ok';
    if (t.includes('SEMI-BLEFE'))
      return 'warn';
    if (t.includes('CHECK OU DESISTA') || t.includes('DESISTA') || t.includes('FOLD'))
      return 'danger';
    if (t.includes('CONTROLE') || t.includes('CHECK') || t.includes('POT CONTROL') || t.includes('PAGUE') || t.includes('CALL'))
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

      // Premium de verdade → sempre valor
      if (top20.has(norm)) {
        // Ajuste por força: TP/overpairs abrem 3–4 BB; pares médios 2–3 BB
        return { title: 'APOSTE POR VALOR', detail: 'Abra 3–4 BB (mão premium)' };
      }

      if (eqPct < 30)
        return { title: 'DESISTA', detail: 'Equity < 30%' };

      if (eqPct < 50)
        return { title: 'CHECK OU DESISTA', detail: '30–50%: evite abrir; só continue se mais tarde houver pot odds vs aposta' };

      if (eqPct < 70)
        return { title: 'APOSTE POR VALOR', detail: 'Abra 2–3 BB (50–70% equity)' };

      if (eqPct <= 80)
        return { title: 'APOSTE POR VALOR', detail: 'Abra 3–4 BB (70–80% equity)' };

      // >80%
      if (slowPlayOn())
        return { title: 'SLOW PLAY', detail: 'Limp/passe ou 33% para induzir' };

      const ebb = effBB();
      if (isFinite(ebb) && ebb <= 12)
        return { title: 'ALL-IN', detail: '>80% equity e efetivo curto (≤12 BB)' };

      return { title: 'APOSTE POR VALOR', detail: 'Abra 4–5 BB (muito forte)' };
    }

    // -------------------- PÓS-FLOP — ninguém apostou ainda --------------------
    if (eqPct < 30)
      return { title: 'DESISTA', detail: '<30%: blefe só com MUITA fold equity' };

    if (eqPct < 50) {
      // Draws podem ditar um semi-blefe leve em HU, mas a regra padrão é check
      if (strongDraw) return { title: 'SEMI-BLEFE', detail: '33–50% do pote (draw forte)' };
      if (weakDraw && oppN === 1 && ge(32)) return { title: 'SEMI-BLEFE (HU)', detail: '30–40% do pote' };
      return { title: 'CHECK', detail: '30–50%: se houver aposta, continue só com pot odds' };
    }

    if (eqPct < 70)
      return { title: 'APOSTE POR VALOR', detail: '50–75% do pote' };

    if (eqPct <= 80)
      return { title: 'APOSTE POR VALOR', detail: '75–100% do pote' };

    // >80%
    if (slowPlayOn())
      return { title: 'SLOW PLAY', detail: 'Passe / 33% do pote para induzir' };

    const ebb2 = effBB();
    if (isFinite(ebb2) && ebb2 <= 12)
      return { title: 'ALL-IN / OVERBET', detail: 'Efetivo curto (≤12 BB)' };

    return { title: 'APOSTE GRANDE', detail: 'Pot / overbet' };
  };

})(window);
