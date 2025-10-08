/* sync-panels.js — faz o box de Pot Odds usar EqAdj e a mesma ação final */
(function (g) {
  'use strict';
  const PC = g.PCALC = g.PCALC || {};

  // procura um "par label/valor" dentro do box de pot odds
  function findRowByLabel(container, regex){
    if (!container) return null;
    const all = container.querySelectorAll('*');
    for (const el of all){
      const txt = (el.textContent || '').trim();
      if (regex.test(txt)){
        // tenta achar um "valor" no mesmo bloco/linha
        // heurística: pegue o último span/div do mesmo pai que tenha '%'
        const parent = el.closest('div,li,tr') || el.parentElement;
        if (!parent) return {label: el, value: null};
        const leafs = Array.from(parent.querySelectorAll('span,div,b,strong')).reverse();
        const val = leafs.find(x => /%|\d+(\.\d+)?$/.test((x.textContent||'').trim())) || null;
        return {label: el, value: val};
      }
    }
    return null;
  }

  function syncPotOddsBox(){
    const st = PC.state || {};
    const box = document.querySelector('.pot-odds, [data-pot-odds], .panel:has(h2), .panel'); // tolerante
    const rightPanel = Array.from(document.querySelectorAll('.panel, section, aside'))
      .find(p => /Informações do Pot Odd/i.test(p.textContent||''));

    const container = rightPanel || box;
    if (!container) return;

    // 1) Substitui "Equity (MC)" pela EqAdj
    const rowEq = findRowByLabel(container, /Equity\s*\(MC\)/i);
    if (rowEq && rowEq.label){
      rowEq.label.textContent = 'Equity (ajustada)';
      if (rowEq.value){
        const pct = (st.eqAdj > 0 ? (st.eqAdj*100) : 0).toFixed(1) + '%';
        rowEq.value.textContent = pct;
      }
    } else {
      // se não encontrou, tenta criar uma linha informativa
      let info = container.querySelector('.eqadj-inline');
      if (!info){
        info = document.createElement('div');
        info.className = 'eqadj-inline';
        info.style.cssText = 'margin-top:6px; opacity:.85; font-size:12px;';
        container.appendChild(info);
      }
      const pct = (st.eqAdj > 0 ? (st.eqAdj*100) : 0).toFixed(1) + '%';
      const be  = (st.potOdds > 0 ? (st.potOdds*100) : 0).toFixed(1) + '%';
      info.textContent = `EqAdj: ${pct}  |  BE: ${be}`;
    }

    // 2) Botão/texto de Recomendação = ação final unificada
    const action = st.finalRec?.action || '';
    if (action){
      // tenta achar o botão dentro do box de recomendação
      const recBox = container.querySelector('.rec-action, button, .btn');
      if (recBox && /aposte|pague|desista|check|raise|call/i.test(recBox.textContent||'')){
        recBox.textContent = action;
      } else {
        // tenta achar um container maior (o card de recomendação) e subir o texto
        const recCard = Array.from(document.querySelectorAll('*'))
          .find(el => /Recomendação/i.test(el.textContent||''));
        if (recCard){
          let btn = recCard.querySelector('button, .btn, .rec-action');
          if (!btn){
            btn = document.createElement('div');
            btn.className = 'rec-action';
            btn.style.cssText = 'margin-top:8px; padding:6px 10px; border:1px solid rgba(255,255,255,.2); border-radius:999px; display:inline-block;';
            recCard.appendChild(btn);
          }
          btn.textContent = action;
        }
      }
    }
  }

  // roda a cada ~300ms para se adaptar ao redraw do app
  setInterval(syncPotOddsBox, 300);
})(window);
