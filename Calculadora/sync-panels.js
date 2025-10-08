/* sync-panels.js — faz o box de Pot Odds usar EqAdj e a mesma ação final
   Standalone: se PCALC.state.eqAdj não existir, ele calcula usando PCALC.Multiway.
*/
(function (g) {
  'use strict';
  const PC = g.PCALC = g.PCALC || {};
  const MW = PC.Multiway || {};

  // helpers
  const pct = x => ((+x||0)*100).toFixed(1)+'%';
  const clamp01 = x => Math.max(0, Math.min(1, +x||0));

  // pega hand/board do app, se existir
  function getKnown() {
    try { return PC.getKnown ? PC.getKnown() : { hand:[], board:[] }; }
    catch { return { hand:[], board:[] }; }
  }

  // tenta ler equity MC (0..1) do estado; se vier em % converte
  function getEqMC01() {
    const st = PC.state || {};
    let eq = st.eqMC ?? st.equityMC ?? st.eqPct ?? 0;
    eq = +eq;
    if (eq > 1) eq = eq/100;
    return clamp01(eq);
  }

  function calcEqAdjIfMissing() {
    const st = PC.state = PC.state || {};
    // se já tiver EqAdj e PotOdds no estado, só retorna
    if (typeof st.eqAdj === 'number' && typeof st.potOdds === 'number') return;

    const kn = getKnown();
    const flop = (kn.board || []).slice(0,3);
    const opps = +((st.eqOpp ?? st.opponents ?? 2)) || 2;
    const pot = +((st.pot ?? 0)) || 0;
    const toCall = +((st.toCall ?? 0)) || 0;

    const eqMC = getEqMC01();
    const wet = MW.boardWetnessScore ? MW.boardWetnessScore(flop) : 0;

    // fatores padrão se não houver MW
    const multi = Math.max(0.5, 1 - 0.08*Math.max(0,opps-1));
    const wetF  = 1 - 0.5*Math.max(0, Math.min(1, (wet||0)/100));

    const eqAdj = MW.adjustedEquity ? MW.adjustedEquity(eqMC, opps, wet)
                                    : clamp01(eqMC * multi * wetF);
    const be = MW.potOdds ? MW.potOdds(pot, toCall)
                          : (toCall>0 ? clamp01(toCall/(pot+toCall)) : 0);

    st.eqAdj    = eqAdj;
    st.potOdds  = be;
    st.wetScore = wet;
  }

  // acha uma linha "label + valor %" dentro do card de Pot Odds
  function findRowByLabel(container, regex){
    if (!container) return null;
    const nodes = container.querySelectorAll('*');
    for (const el of nodes){
      const txt = (el.textContent || '').trim();
      if (regex.test(txt)){
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
    calcEqAdjIfMissing(); // garante eqAdj/potOdds
    const st = PC.state || {};

    // tenta localizar o card “Informações do Pot Odd”
    const panel = Array.from(document.querySelectorAll('.panel, section, aside, div'))
      .find(el => /Informações do Pot Odd/i.test(el.textContent||''));
    if (!panel) return;

    // 1) trocar “Equity (MC)” por “Equity (ajustada)” e mostrar EqAdj
    const rowEq = findRowByLabel(panel, /Equity\s*\(MC\)/i);
    if (rowEq?.label){
      rowEq.label.textContent = 'Equity (ajustada)';
      if (rowEq.value) rowEq.value.textContent = pct(st.eqAdj||0);
    } else {
      // se não achar a linha, cria um mini-informativo
      let info = panel.querySelector('.eqadj-inline');
      if (!info){
        info = document.createElement('div');
        info.className = 'eqadj-inline';
        info.style.cssText = 'margin-top:6px; opacity:.85; font-size:12px;';
        panel.appendChild(info);
      }
      info.textContent = `EqAdj: ${pct(st.eqAdj||0)}  |  BE: ${pct(st.potOdds||0)}`;
    }

    // 2) Recomendação = mesma ação final (se existir)
    const action = st.finalRec?.action;
    if (action){
      // botão dentro do card de recomendação
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

  // roda em loop leve pra acompanhar os redraws
  setInterval(syncPotOddsBox, 350);
})(window);
