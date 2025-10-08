/* suggest-unified.js — fonte única de recomendação (sem conflito) */
(function (g) {
  'use strict';
  const PC = g.PCALC = g.PCALC || {};
  const MW = (PC.Multiway) || null;
  const THRESH = { fold: 0.30, call: 0.50, bet50: 0.70 };
  function readKnown() {
    const kn = PC.getKnown ? PC.getKnown() : {hand:[],board:[]};
    const opp = Number(PC.state?.eqOpp || PC.state?.opponents || 2) || 2;
    const pot = Number(PC.state?.pot || 0) || 0;
    const toCall = Number(PC.state?.toCall || 0) || 0;
    const houveAcao = !!(PC.state?.houveAcao || (toCall>0));
    return { hand: kn.hand, board: kn.board, opp, pot, toCall, houveAcao };
  }
  function eqAjustada(eqPct0to100, hand, board, opp) {
    const eq = Math.max(0, Math.min(1, (eqPct0to100 || 0) / 100));
    if (!MW) return eq;
    const wet = MW.boardWetnessScore((board || []).slice(0,3));
    return MW.adjustedEquity(eq, Math.max(1, opp), wet);
  }
  PC.suggestAction = function suggestAction(eqPct, hand, board, opponents){
    try{
      const { opp, pot, toCall, houveAcao } = readKnown();
      const opps = opponents || opp || 2;
      const eqAdj = eqAjustada(eqPct, hand, board, opps);
      if (houveAcao && toCall>0){
        const be = MW ? MW.potOdds(pot, toCall) : (toCall>0 ? toCall/(pot+toCall) : 0);
        if (eqAdj + 1e-9 < be) return { title:'FOLD', detail:`EqAdj ${(eqAdj*100).toFixed(1)}% < BE ${(be*100).toFixed(1)}% — fold` };
        if (eqAdj < be*1.2) return { title:'CALL (marginal)', detail:`EqAdj ${(eqAdj*100).toFixed(1)}% ~ BE ${(be*100).toFixed(1)}%` };
        return { title:'CALL / BET', detail:`EqAdj ${(eqAdj*100).toFixed(1)}% > BE ${(be*100).toFixed(1)}%` };
      }
      if (eqAdj < THRESH.fold)       return { title:'CHECK / FOLD', detail:`EqAdj ${(eqAdj*100).toFixed(1)}% < 30%` };
      if (eqAdj < THRESH.call)       return { title:'CHECK / CALL pequeno', detail:`EqAdj ${(eqAdj*100).toFixed(1)}% em 30–50%` };
      if (eqAdj < THRESH.bet50)      return { title:'BET 50–75%', detail:`EqAdj ${(eqAdj*100).toFixed(1)}% em 50–70%` };
      return                           { title:'BET caro / RAISE', detail:`EqAdj ${(eqAdj*100).toFixed(1)}% > 70%` };
    }catch(e){ console.warn('[suggest-unified] erro:', e); return {title:'—', detail:'—'}; }
  };
})(window);
