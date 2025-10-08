/* INÍCIO — pcalc.fallback-suggest.js */
(function(g){
  const PC = g.PCALC || (g.PCALC = {});

  function _fallbackSuggest(eqPct){
    if (eqPct >= 70) return { title:'BET',   detail:'muito à frente (≥70%)' };
    if (eqPct >= 55) return { title:'BET',   detail:'valor fino (55–69%)' };
    if (eqPct >= 45) return { title:'CHECK', detail:'marginal (45–54%)' };
    if (eqPct >= 33) return { title:'CHECK', detail:'controle de pote (33–44%)' };
    return { title:'FOLD', detail:'equidade baixa (<33%)' };
  }

  if (typeof PC.suggestAction !== 'function') {
    PC.suggestAction = (eqPct/*, hand, board, opp*/) => _fallbackSuggest(eqPct);
  }
  if (typeof PC.decisionClass !== 'function') {
    PC.decisionClass = (t)=> /BET/.test(t)?'good' : /CHECK/.test(t)?'neutral' : /FOLD/.test(t)?'bad':'neutral';
  }
  if (typeof PC.shouldGlow !== 'function') {
    PC.shouldGlow = (cls)=> cls==='good';
  }
})(window);
/* FIM — pcalc.fallback-suggest.js */
