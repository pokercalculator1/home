/* eqmc-to-eqadj.v2.js
 * Só faz: mostrar EqAdj no lugar do valor de "Equity (MC)".
 * - NÃO altera rótulos, recomendação, pot odds, voz, etc.
 * - Se PCALC.state.eqAdj não existir, calcula localmente (Win/Tie -> eqMC -> EqAdj).
 */
(function (g) {
  'use strict';
  const PC = g.PCALC = g.PCALC || {};
  const MW = PC.Multiway || {};
  const pctStr = x => ((+x||0)*100).toFixed(1) + '%';
  const clamp01 = x => Math.max(0, Math.min(1, +x||0));

  // --- UTIL: ler Win/Tie do bloco de Monte Carlo (ex.: "Win: 54.9%  Tie: 0.3%")
  function readWinTieFromUI(){
    const nodes = document.querySelectorAll('*');
    for (const el of nodes){
      const t = (el.textContent||'').replace(/\s+/g,' ');
      if (/Win:\s*\d+(\.\d+)?%\s*Tie:\s*\d+(\.\d+)?%/i.test(t)){
        const mW = t.match(/Win:\s*([\d.]+)%/i);
        const mT = t.match(/Tie:\s*([\d.]+)%/i);
        if (mW && mT){
          const win = parseFloat(mW[1])/100;
          const tie = parseFloat(mT[1])/100;
          return { win, tie };
        }
      }
    }
    return null;
  }

  // --- achar o card "Informações do Pot Odd"
  function findPotOddsPanel(){
    const nodes = document.querySelectorAll('section, .panel, .card, div');
    for (const n of nodes){
      const txt = (n.textContent||'').replace(/\s+/g,' ').trim();
      if (/Informações do Pot Odd/i.test(txt)) return n;
    }
    return null;
  }

  // --- achar a linha "Equity (MC)" (apenas pega o elemento do valor existente; não cria nada)
  function findEquityMCValueEl(container){
    if (!container) return null;
    const all = container.querySelectorAll('*');
    for (const el of all){
      if (/^Equity\s*\(MC\)$/i.test((el.textContent||'').trim())){
        const parent = el.closest('div,li,tr,section,article') || el.parentElement;
        if (!parent) return null;
        // procura um irmão/descendente que tenha um número ou %
        const candidates = parent.querySelectorAll('span,div,strong,b');
        for (let i = candidates.length - 1; i >= 0; i--){
          const v = (candidates[i].textContent||'').trim();
          if (/%|\d+(\.\d+)?$/.test(v)) return candidates[i];
        }
      }
    }
    return null;
  }

  // --- obter eqMC (0..1) do estado ou via Win/Tie
  function getEqMC01(){
    const st = PC.state || {};
    let eq = st.eqMC ?? st.equityMC ?? st.eqPct ?? 0;
    eq = +eq;
    if (eq > 1) eq = eq/100; // se vier em %
    if (eq > 0) return clamp01(eq);

    // fallback: Win/Tie do UI
    const wt = readWinTieFromUI();
    if (wt){
      const eqMC = clamp01(wt.win + 0.5*wt.tie);
      // não polui se não quiser; mas guardar ajuda a estabilizar
      PC.state = st;
      st.eqMC = eqMC;
      return eqMC;
    }
    return 0;
  }

  // --- calcular EqAdj se não existir no estado
  function ensureEqAdj(){
    const st = PC.state = PC.state || {};
    if (typeof st.eqAdj === 'number' && st.eqAdj >= 0) return st.eqAdj;

    // dados mínimos
    const kn = PC.getKnown ? PC.getKnown() : { hand:[], board:[] };
    const flop = (kn.board||[]).slice(0,3);
    const opps = +((st.eqOpp ?? st.opponents ?? 2)) || 2;

    const eqMC = getEqMC01(); // 0..1
    if (!(eqMC > 0)) return 0; // sem equity, não atualiza nada (evita "0%")

    // wetness (se tiver multiway.js). Fallback simples se não tiver.
    const wet = (MW.boardWetnessScore ? MW.boardWetnessScore(flop) : 0);
    const multi = Math.max(0.5, 1 - 0.08*Math.max(0, opps-1));
    const wetF  = 1 - 0.5*Math.max(0, Math.min(1, wet/100));

    const eqAdj = MW.adjustedEquity
      ? MW.adjustedEquity(eqMC, opps, wet)
      : clamp01(eqMC * multi * wetF);

    st.eqAdj = eqAdj;         // grava para reutilizar
    st.wetScore = wet;        // pode ajudar em debug
    st.eqOpp = opps;          // idem
    return eqAdj;
  }

  // --- atualização do valor mostrado
  function updateEqMCDisplay(){
    const panel = findPotOddsPanel();
    if (!panel) return;

    const valEl = findEquityMCValueEl(panel);
    if (!valEl) return;

    const eqAdj = ensureEqAdj();
    if (!(eqAdj > 0)) return; // não mostra 0% se não conseguiu calcular

    const show = pctStr(eqAdj);
    if ((valEl.textContent||'').trim() !== show){
      valEl.textContent = show;
    }
  }

  // loop leve para acompanhar redraws (não cria elementos; só atualiza texto existente)
  setInterval(updateEqMCDisplay, 350);
})(window);
