/* sync-panels.js (v3)
 * - Se não houver eqMC no estado, lê "Win: X%  Tie: Y%" do painel MC.
 * - eqMC = Win + Tie/2
 * - EqAdj = adjustedEquity(eqMC, opps, wetScore)
 * - Atualiza o card "Informações do Pot Odd": "Equity (MC)" -> "Equity (ajustada)" + valor EqAdj
 * - Sincroniza o botão/ação com PCALC.state.finalRec.action (se existir)
 */
(function (g) {
  'use strict';
  const PC = g.PCALC = g.PCALC || {};
  const MW = PC.Multiway || {};

  const pctStr = x => ((+x||0)*100).toFixed(1) + '%';
  const clamp01 = x => Math.max(0, Math.min(1, +x||0));

  // --- Lê Win/Tie do bloco de Monte Carlo (texto tipo "Win: 54.9%  Tie: 0.3%") ---
  function readWinTieFromUI(){
    const nodes = Array.from(document.querySelectorAll('*'));
    const line = nodes.find(n => /Win:\s*\d+(\.\d+)?%\s*Tie:\s*\d+(\.\d+)?%/i.test((n.textContent||'')));
    if (!line) return null;
    const t = (line.textContent || '').replace(/\s+/g, ' ');
    const mWin = t.match(/Win:\s*([\d.]+)%/i);
    const mTie = t.match(/Tie:\s*([\d.]+)%/i);
    if (!mWin || !mTie) return null;
    const win = parseFloat(mWin[1]) / 100;
    const tie = parseFloat(mTie[1]) / 100;
    return { win, tie };
  }

  // --- Busca o card de Pot Odds (onde aparece "Informações do Pot Odd") ---
  function findPotOddsPanel(){
    const nodes = document.querySelectorAll('section, .panel, .card, div');
    for (const n of nodes){
      const txt = (n.textContent || '').replace(/\s+/g,' ').trim();
      if (/Informações do Pot Odd/i.test(txt)) return n;
    }
    return null;
  }

  // Acha a linha "Equity (MC)" (rótulo + valor vizinho) e permite editar o valor
  function findEquityRow(container){
    if (!container) return null;
    const all = container.querySelectorAll('*');
    for (const el of all){
      const tx = (el.textContent||'').trim();
      if (/^Equity\s*\(MC\)$/i.test(tx)){
        // tenta achar um irmão/descendente com número/%
        const parent = el.closest('div,li,tr,section,article') || el.parentElement;
        if (!parent) return { label: el, value: null };
        // valor típico está em outro elemento dentro do mesmo "bloco"
        const valCand = Array.from(parent.querySelectorAll('span,div,strong,b'))
          .reverse().find(x => /%|\d+(\.\d+)?$/.test((x.textContent||'').trim()));
        return { label: el, value: valCand || null };
      }
    }
    return null;
  }

  function ensureEqAdjInState(){
    const st = PC.state = PC.state || {};
    // 1) eqMC (0..1)
    let eqMC = +st.eqMC || +st.equityMC || +st.eqPct || 0;
    if (eqMC > 1) eqMC /= 100;

    if (!(eqMC > 0)){
      // tentar ler Win/Tie do UI
      const wt = readWinTieFromUI();
      if (wt){
        eqMC = clamp01(wt.win + wt.tie * 0.5);
        st.eqMC = eqMC; // mantém no estado
      }
    }

    // 2) parâmetros para ajuste
    const kn = PC.getKnown ? PC.getKnown() : { hand:[], board:[] };
    const flop = (kn.board || []).slice(0,3);
    const opps = +((st.eqOpp ?? st.opponents ?? 2)) || 2;
    const pot = +((st.pot ?? 0)) || 0;
    const toCall = +((st.toCall ?? 0)) || 0;

    // 3) wetScore e EqAdj
    const wet = MW.boardWetnessScore ? MW.boardWetnessScore(flop) : 0;
    let eqAdj = eqMC;
    if (MW.adjustedEquity){
      eqAdj = MW.adjustedEquity(eqMC, opps, wet);
    } else {
      // fallback simples
      const multi = Math.max(0.5, 1 - 0.08*Math.max(0,opps-1));
      const wetF  = 1 - 0.5*Math.max(0, Math.min(1, wet/100));
      eqAdj = clamp01(eqMC * multi * wetF);
    }

    // 4) pot odds (BE)
    const be = MW.potOdds ? MW.potOdds(pot, toCall)
                          : (toCall>0 ? clamp01(toCall/(pot+toCall)) : 0);

    // 5) grava no estado para outras partes aproveitarem
    st.eqAdj = eqAdj;
    st.potOdds = be;
    st.wetScore = wet;
  }

  function syncPotOddsCard(){
    ensureEqAdjInState();
    const st = PC.state || {};

    const card = findPotOddsPanel();
    if (!card) return;

    const row = findEquityRow(card);
    if (row && row.label){
      // renomeia o rótulo
      row.label.textContent = 'Equity (ajustada)';
      // troca o número
      if (row.value){
        row.value.textContent = pctStr(st.eqAdj || 0);
      } else {
        // se não tem elemento de valor, cria um
        const v = document.createElement('div');
        v.textContent = pctStr(st.eqAdj || 0);
        v.style.opacity = '.9';
        row.label.parentElement?.appendChild(v);
      }
    } else {
      // fallback: injeta uma linha informativa
      let info = card.querySelector('.eqadj-inline');
      if (!info){
        info = document.createElement('div');
        info.className = 'eqadj-inline';
        info.style.cssText = 'margin-top:6px; opacity:.85; font-size:12px;';
        card.appendChild(info);
      }
      info.textContent = `Equity (ajustada): ${pctStr(st.eqAdj||0)}  |  BE: ${pctStr(st.potOdds||0)}`;
    }

    // Recomendação (mesma ação final do unificador, se existir)
    const action = st.finalRec?.action;
    if (action){
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

  // roda periodicamente para acompanhar mudanças do app
  setInterval(syncPotOddsCard, 350);
})(window);
