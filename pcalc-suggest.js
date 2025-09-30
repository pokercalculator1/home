// pcalc-suggest.js — Sugestões SEM AÇÃO (alinhadas ao raise.js) + buckets de abertura
// - Pré-flop (você primeiro a agir) e Pós-flop (ninguém apostou)
// - Buckets fixos para abertura pré-flop (sem depender de equity bruta):
//   • 3–4 blinds  → open34 (premium/broadways muito fortes)
//   • 2–3 blinds  → open23 (opens padrão)
//   • 1–2 blinds  → limp/call (mãos jogáveis que preferem pote menor)
// - Faixas por equity (fallback e pós-flop):
//   <30%   -> PASSE OU DESISTA
//   30–50  -> PRÉ: PASSE OU DESISTA | PÓS: PASSE (só continue vs aposta se houver pot odds)
//   50–70  -> PRÉ: APOSTE 2 OU 3 BLINDS | PÓS: APOSTE 50–75% DO POTE
//   70–80  -> PRÉ: APOSTE 3 OU 4 BLINDS | PÓS: APOSTE 75–100% DO POTE
//   >80%   -> PRÉ: APOSTE 4 OU 5 BLINDS (Efetivo ≤12BB => ALL-IN; Slow Play se toggle ligado)
//             PÓS: ALL-IN / OVERBET (ou Slow Play se toggle ligado)
//
// Observações:
// - Usa “PASSE” no lugar de “check”.
// - “PASSE OU DESISTA” substitui “Desista” para não confundir iniciantes.
// - Pré-flop sem ação: NÃO aplica ajuste multiway (+pp). Pós-flop: aplica +2pp por oponente extra.
// - Equity indefinida -> “Aguardando cartas…”.
// - Integração leve com raise.js: se houve ação pré-flop (modo Raise ligado), a recomendação vem de lá.

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
  function isRaiseModeOn(){
    try{
      if (!g.RAISE || typeof g.RAISE.getRecommendation !== 'function') return false;
      const rec = g.RAISE.getRecommendation();
      return /Houve Ação/i.test(String(rec||'')) || /Houve raise/i.test(String(rec||''));
    }catch(_){ return false; }
  }

  // =========================================================
  // Buckets pré-flop (você primeiro a agir, SEM ação antes)
  // =========================================================

  // Top 20 mãos iniciais — tratadas como premium para open-raise (3–4 blinds)
  const top20 = new Set([
    "AA","KK","QQ","JJ","TT","99","88","77",
    "AKs","AQs","AJs","ATs","KQs",
    "AKo","AQo","KJs","QJs","JTs","KTs","QTs"
  ]);

  // 3–4 blinds: mantém top20 (premium/broadways muito fortes)
  const open34 = new Set([...top20]);

  // 2–3 blinds: opens padrão
  const open23 = new Set([
    // pares médios/baixos
    "66","55","44","33","22",
    // Axs fortes & wheel bons
    "A9s","A8s","A7s","A6s","A5s",
    // broadways adicionais (opens, mesmo se equity <50% no MC multiway)
    "AJo","KQo","ATo",
    // suited connectors fortes
    "T9s","98s"
  ]);

  // 1–2 blinds (call/limp): jogáveis, preferem pot menor
  const limp12 = new Set([
    // suited connectors / gappers jogáveis
    "87s","76s","65s","54s","J9s","T8s","97s","86s","75s","64s","53s",
    // Axs marginais
    "A4s","A3s","A2s",
    // suited figuras mais fracas
    "Q9s","J8s"
  ]);

  // =========================================================
  // SUGESTÃO por Equidade — SEM AÇÃO (você primeiro a agir / ninguém apostou)
  // =========================================================
  PCALC.suggestAction = function (eqPct, hand, board, opp) {
    // Equity indisponível → aguardar
    if (!isFinite(eqPct)) {
      return { title: 'Aguardando cartas…', detail: 'Calculando equity/outs' };
    }

    const isPre = (board && board.length < 3);
    const isFlop = (board && board.length === 3);
    const isTurn = (board && board.length === 4);
    // Pós-flop aplica ajuste leve multiway (+2pp por oponente extra)
    const oppN = Math.max(1, Number(opp || 1));
    const adjPost = Math.max(0, (oppN - 1) * 2);
    const gePre  = (x) => eqPct >= x;
    const gePost = (x) => eqPct >= (x + adjPost);

    // Integração com raise.js: se houve ação pré-flop, o Raise domina
    if (isPre && isRaiseModeOn()){
      return { title: 'Houve Ação', detail: 'Use a recomendação do módulo Raise (Pot Odds / decisão)' };
    }

    // -------------------- PRÉ-FLOP — você é o primeiro a agir --------------------
    if (isPre) {
      const norm = normalizeHand(hand);

      // Buckets fixos primeiro (independem de equity bruta)
      if (open34.has(norm)) return { title: 'APOSTE 3 OU 4 BLINDS', detail: 'Open padrão (mão forte)' };
      if (open23.has(norm)) return { title: 'APOSTE 2 OU 3 BLINDS', detail: 'Open padrão' };
      if (limp12.has(norm)) return { title: 'PAGUE 1 OU 2 BLINDS', detail: 'Mão jogável; mantenha o pote menor' };

      // Fallback por equity (para mãos fora das listas)
      if (eqPct < 30)  return { title: 'PASSE OU DESISTA', detail: 'Equity < 30%' };
      if (eqPct < 50)  return { title: 'PASSE OU DESISTA', detail: '30–50%: evite abrir; só continue vs aposta se houver pot odds' };
      if (eqPct < 70)  return { title: 'APOSTE 2 OU 3 BLINDS', detail: '50–70% de equity' };
      if (eqPct <= 80) return { title: 'APOSTE 3 OU 4 BLINDS', detail: '70–80% de equity' };

      // >80%
      if (slowPlayOn()) {
        return { title: 'SLOW PLAY', detail: 'Passe/limp ou 33% para induzir' };
      }
      const ebb = effBB();
      if (isFinite(ebb) && ebb <= 12) {
        return { title: 'ALL-IN', detail: '>80% equity e efetivo curto (≤12 BB)' };
      }
      return { title: 'APOSTE 4 OU 5 BLINDS', detail: 'Mão muito forte' };
    }

    // -------------------- PÓS-FLOP — ninguém apostou ainda --------------------
    // (Opcional) leitura de draws para descrição
    const outsRes      = (PCALC.computeOuts && PCALC.computeOuts()) || null;
    const outsStraight = outsRes?.outsExact?.[CAT.STRAIGHT]?.size || 0;
    const outsFlush    = outsRes?.outsExact?.[CAT.FLUSH]?.size    || 0;
    const strongDraw   = (outsFlush >= 9) || (outsStraight >= 8);
    const weakDraw     = (!strongDraw && outsStraight >= 4);

    if (!gePost(30))
      return { title: 'PASSE OU DESISTA', detail: '<30%: blefe só com MUITA fold equity' };

    if (!gePost(50)) {
      if (strongDraw) return { title: 'SEMI-BLEFE', detail: '33–50% do pote (draw forte)' };
      if (weakDraw && oppN === 1 && gePost(32)) return { title: 'SEMI-BLEFE (HU)', detail: '30–40% do pote' };
      return { title: 'PASSE', detail: '30–50%: se houver aposta, continue só com pot odds' };
    }

    if (!gePost(70))
      return { title: 'APOSTE 50–75% DO POTE', detail: 'Faixa de valor (50–70%)' };

    if (!gePost(80))
      return { title: 'APOSTE 75–100% DO POTE', detail: 'Valor forte (70–80%)' };

    // >80%
    if (slowPlayOn())
      return { title: 'SLOW PLAY', detail: 'Passe / 33% do pote para induzir' };

    const ebb2 = effBB();
    if (isFinite(ebb2) && ebb2 <= 12)
      return { title: 'ALL-IN / OVERBET', detail: 'Efetivo curto (≤12 BB)' };

    return { title: 'APOSTE GRANDE', detail: 'Pot / overbet' };
  };

})(window);
