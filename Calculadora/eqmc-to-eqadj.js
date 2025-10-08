/* eqadj-to-eqmc.js
 * Copia a % que aparece em .decision-detail (ex.: "EqAdj 53.8% em 50–70%")
 * para o valor da linha "Equity (MC)" no card "Informações do Pot Odd".
 * Não altera rótulos, não cria elementos. Só substitui o número.
 */
(function () {
  'use strict';

  // pega "53.8%" de dentro do .decision-detail (último da página)
  function readEqAdjPctFromDecisionDetail(){
    const items = Array.from(document.querySelectorAll('.decision-detail'));
    if (!items.length) return null;
    const txt = (items[items.length - 1].textContent || '').replace(/\s+/g,' ').trim();
    const m = txt.match(/EqAdj\s+(\d+(?:\.\d+)?)%/i);
    return m ? (m[1] + '%') : null;
  }

  // localiza o card "Informações do Pot Odd"
  function findPotOddsPanel(){
    const nodes = document.querySelectorAll('section, .panel, .card, div');
    for (const n of nodes){
      const t = (n.textContent || '').replace(/\s+/g,' ').trim();
      if (/Informações do Pot Odd/i.test(t)) return n;
    }
    return null;
  }

  // acha o elemento onde o **valor** de "Equity (MC)" está renderizado
  function findEquityMCValueEl(container){
    if (!container) return null;
    const all = container.querySelectorAll('*');
    for (const el of all){
      const tx = (el.textContent || '').trim();
      if (/^Equity\s*\(MC\)$/i.test(tx)){
        const parent = el.closest('div,li,tr,section,article') || el.parentElement;
        if (!parent) return null;
        // procure um irmão/descendente com número ou %
        const cand = Array.from(parent.querySelectorAll('span,div,strong,b')).reverse();
        const val = cand.find(x => /^\d+(\.\d+)?%$/.test((x.textContent || '').trim()));
        return val || null;
      }
    }
    return null;
  }

  function tick(){
    const eqAdjPct = readEqAdjPctFromDecisionDetail();
    if (!eqAdjPct) return; // não faz nada se ainda não tem a % no banner

    const panel = findPotOddsPanel();
    if (!panel) return;

    const valueEl = findEquityMCValueEl(panel);
    if (!valueEl) return;

    if ((valueEl.textContent || '').trim() !== eqAdjPct){
      valueEl.textContent = eqAdjPct;
    }
  }

  // roda leve para acompanhar atualizações da UI (sem criar nós)
  setInterval(tick, 300);
})();
