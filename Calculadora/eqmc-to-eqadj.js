/* eqmc-to-eqadj.js
 * Objetivo: fazer o valor exibido em "Equity (MC)" ser igual a PCALC.state.eqAdj.
 * NÃO muda rótulos, NÃO altera recomendação, NADA além do número mostrado.
 */
(function (g) {
  'use strict';
  const PC = g.PCALC || (g.PCALC = {});
  const pct = x => ((+x || 0) * 100).toFixed(1) + '%';

  // encontra o card "Informações do Pot Odd"
  function findPotOddsPanel() {
    const nodes = document.querySelectorAll('section, .panel, .card, div');
    for (const n of nodes) {
      const txt = (n.textContent || '').replace(/\s+/g,' ').trim();
      if (/Informações do Pot Odd/i.test(txt)) return n;
    }
    return null;
  }

  // acha a linha "Equity (MC)" e o elemento onde o valor aparece
  function findEquityMCRow(container) {
    if (!container) return null;
    const all = container.querySelectorAll('*');
    for (const el of all) {
      const tx = (el.textContent || '').trim();
      if (/^Equity\s*\(MC\)$/i.test(tx)) {
        // tenta achar um "valor" no mesmo bloco
        const parent = el.closest('div,li,tr,section,article') || el.parentElement;
        if (parent) {
          // procurar um irmão/descendente com número ou %
          const val = Array.from(parent.querySelectorAll('span,div,strong,b'))
            .reverse()
            .find(x => /%|\d+(\.\d+)?$/.test((x.textContent || '').trim()));
          return { label: el, value: val || null };
        }
        return { label: el, value: null };
      }
    }
    return null;
  }

  function tick() {
    const st = PC.state || {};
    // Se não houver EqAdj calculada em lugar nenhum, não fazemos nada (patch mínimo)
    if (!(typeof st.eqAdj === 'number')) return;

    const card = findPotOddsPanel();
    if (!card) return;

    const row = findEquityMCRow(card);
    if (!row) return;

    // Apenas substitui o número exibido -> EqAdj
    const show = pct(st.eqAdj);
    if (row.value) {
      // evita loop desnecessário
      if ((row.value.textContent || '').trim() !== show) {
        row.value.textContent = show;
      }
    } else if (row.label && row.label.parentElement) {
      // se não houver elemento de valor, cria um ao lado
      const v = document.createElement('div');
      v.textContent = show;
      v.style.opacity = '.9';
      row.label.parentElement.appendChild(v);
    }
  }

  // roda leve e contínuo para acompanhar mudanças do app
  setInterval(tick, 300);
})(window);
