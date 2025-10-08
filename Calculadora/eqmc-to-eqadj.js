/* eqmc-to-eqadj.v3.js
 * Só substitui o número exibido em "Equity (MC)" pelo EqAdj.
 * - Não altera rótulos nem recomendações
 * - Se eqAdj não existir, calcula localmente (Win/Tie -> eqMC -> EqAdj)
 */
(function (g) {
  'use strict';
  const PC = g.PCALC = g.PCALC || {};
  const MW = PC.Multiway || {};
  const pct = x => ((+x||0)*100).toFixed(1) + '%';
  const clamp01 = x => Math.max(0, Math.min(1, +x||0));

  // ---- Helpers: pegar eqMC (0..1) e calcular eqAdj se não existir ----
  function readWinTieFromUI(){
    const n = Array.from(document.querySelectorAll('*'))
      .find(el => /Win:\s*\d+(\.\d+)?%\s*Tie:\s*\d+(\.\d+)?%/i.test(el.textContent||''));
    if(!n) return null;
    const t = (n.textContent||'').replace(/\s+/g,' ');
    const mW = t.match(/Win:\s*([\d.]+)%/i);
    const mT = t.match(/Tie:\s*([\d.]+)%/i);
    if(!mW || !mT) return null;
    return { win: parseFloat(mW[1])/100, tie: parseFloat(mT[1])/100 };
  }
  function getEqMC01(){
    const st = PC.state || {};
    let eq = st.eqMC ?? st.equityMC ?? st.eqPct ?? 0;
    eq = +eq; if (eq>1) eq/=100;
    if(eq>0) return clamp01(eq);
    const wt = readWinTieFromUI();
    if(!wt) return 0;
    return clamp01(wt.win + 0.5*wt.tie);
  }
  function ensureEqAdj(){
    const st = PC.state = PC.state || {};
    if(typeof st.eqAdj === 'number' && st.eqAdj>0) return st.eqAdj;
    const eqMC = getEqMC01();
    if(!(eqMC>0)) return 0;
    const kn = PC.getKnown ? PC.getKnown() : {hand:[], board:[]};
    const flop = (kn.board||[]).slice(0,3);
    const opps = +((st.eqOpp ?? st.opponents ?? 2)) || 2;
    const wet  = MW.boardWetnessScore ? MW.boardWetnessScore(flop) : 0;
    const eqAdj = MW.adjustedEquity
      ? MW.adjustedEquity(eqMC, opps, wet)
      : clamp01(eqMC * Math.max(0.5,1-0.08*Math.max(0,opps-1)) * (1-0.5*Math.max(0,Math.min(1,wet/100))));
    st.eqAdj = eqAdj; // guarda p/ reutilizar
    return eqAdj;
  }

  // ---- DOM: encontrar o card e o número da linha "Equity (MC)" ----
  function findPotOddsPanel(){
    return Array.from(document.querySelectorAll('section, .panel, .card, div'))
      .find(n => /Informações do Pot Odd/i.test((n.textContent||'')));
  }
  function findEquityMCValueEl(panel){
    if(!panel) return null;
    // 1) ache o rótulo "Equity (MC)"
    const label = Array.from(panel.querySelectorAll('*'))
      .find(el => /^Equity\s*\(MC\)$/i.test((el.textContent||'').trim()));
    if(!label) return null;

    // 2) Caminhe pelos nós seguintes dentro do mesmo painel até achar um % que seja o valor
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_ELEMENT, null);
    let foundLabel = false, node;
    while((node = walker.nextNode())){
      if(node === label){ foundLabel = true; continue; }
      if(!foundLabel) continue;
      const txt = (node.textContent||'').trim();
      // evite capturar "BE (pot odds)" etc.
      if (/^\d+(\.\d+)?%$/.test(txt)) return node;
    }
    return null;
  }

  function tick(){
    const eqAdj = ensureEqAdj();
    if(!(eqAdj>0)) return; // não mostra 0%

    const panel = findPotOddsPanel();
    if(!panel) return;
    const valEl = findEquityMCValueEl(panel);
    if(!valEl) return;

    const show = pct(eqAdj);
    if((valEl.textContent||'').trim() !== show){
      valEl.textContent = show;
    }
  }

  setInterval(tick, 350);
})(window);
