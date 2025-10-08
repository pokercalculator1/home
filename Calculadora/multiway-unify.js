/* multiway-unify.js — unifica a decisão (pot odds vs faixas)
   Requer multiway.js carregado antes. Não precisa mexer no seu código.
*/
(function (g) {
  'use strict';

  const MW = (g.PCALC && g.PCALC.Multiway) || null;
  if (!MW) { console.warn('[unify] multiway.js não encontrado'); return; }

  // ------- Parâmetros ajustáveis -------
  const THRESH = {
    // Heurística por faixas (quando NÃO há ação a pagar)
    fold: 0.30,     // < 30% -> Desista
    call: 0.50,     // 30–50% -> Pague / Check
    bet50: 0.70     // 50–70% -> Aposte 50–75%
    // >70% -> Agressivo (bet grande/raise)
  };
  const MESSAGES = {
    pot: {
      fold: 'Desista',
      thin: 'Pague (spot marginal — prefira IP/vilões passivos)',
      good: 'Pague a aposta / Aposte'
    },
    heur: {
      fold: 'Passe ou Desista',
      call: 'Check / Pague pequeno',
      bet:  'Aposte 50–75% do pote',
      aggr: 'Aposte caro / Raise'
    }
  };

  function readState(){
    const PC = g.PCALC || g.PC || {};
    const st = PC.state || {};
    const flop =
      st.flop || st.boardFlop || st.board || st.flopCards ||
      (Array.isArray(st.boardAll) ? st.boardAll.slice(0,3) : null) || null;

    // tenta detectar a chave "Houve Ação?"
    const houveAcao = !!(st.houveAcao || st.rswInject || st.rsw || st.hasAction);

    return {
      equityMC: Number(st.eqMC || st.equityMC || st.equity || 0), // 0..1
      pot: Number(st.pot || 0),
      toCall: Number(st.toCall || st.call || 0),
      opps: Number(st.oponentes || st.opponents || st.viloes || st.nViloes || 1),
      flop,
      houveAcao
    };
  }

  function decideUnified(){
    const S = readState();
    const wet = MW.boardWetnessScore(S.flop || []);
    const eqAdj = MW.adjustedEquity(S.equityMC, S.opps || 1, wet);
    const pOdds = MW.potOdds(S.pot, S.toCall);

    let rule = '', action = '', detail = '';

    if (S.houveAcao && S.toCall > 0) {
      // Regra 1: Pot Odds com equity ajustada
      rule = 'Pot Odds (equity ajustada)';
      if (eqAdj + 1e-9 < pOdds) {
        action = MESSAGES.pot.fold;
        detail = `EqAdj ${(eqAdj*100).toFixed(1)}% < PotOdds ${(pOdds*100).toFixed(1)}%`;
      } else if (eqAdj < pOdds * 1.2) {
        action = MESSAGES.pot.thin;
        detail = `Marginal: EqAdj ${(eqAdj*100).toFixed(1)}% vs BE ${(pOdds*100).toFixed(1)}%`;
      } else {
        action = MESSAGES.pot.good;
        detail = `Confortável: EqAdj ${(eqAdj*100).toFixed(1)}% > BE ${(pOdds*100).toFixed(1)}%`;
      }
    } else {
      // Regra 2: Heurística por faixas (sem pressão de call)
      rule = 'Heurística por faixas (equity ajustada)';
      if (eqAdj < THRESH.fold) {
        action = MESSAGES.heur.fold;
        detail = `EqAdj ${(eqAdj*100).toFixed(1)}% < ${THRESH.fold*100}%`;
      } else if (eqAdj < THRESH.call) {
        action = MESSAGES.heur.call;
        detail = `EqAdj ${(eqAdj*100).toFixed(1)}% na faixa 30–50%`;
      } else if (eqAdj < THRESH.bet50) {
        action = MESSAGES.heur.bet;
        detail = `EqAdj ${(eqAdj*100).toFixed(1)}% na faixa 50–70%`;
      } else {
        action = MESSAGES.heur.aggr;
        detail = `EqAdj ${(eqAdj*100).toFixed(1)}% > 70%`;
      }
    }

    // expõe no estado para qualquer módulo consumir
    g.PCALC = g.PCALC || {};
    g.PCALC.state = g.PCALC.state || {};
    Object.assign(g.PCALC.state, {
      wetScore: wet,
      eqAdj,
      potOdds: pOdds,
      finalRec: { rule, action, detail }
    });

    return g.PCALC.state.finalRec;
  }

  // ---- Sincroniza UI se achar elementos comuns (não obrigatório) ----
  function syncUI(rec){
    try {
      // 1) Box de Recomendação principal (procura um botão ou span dentro do box)
      const box = document.querySelector('[data-recomendacao], .rec-box, .recommendation, #recomendacao');
      if (box) {
        let btn = box.querySelector('button, .btn, .rec-action');
        if (!btn) {
          btn = document.createElement('div');
          btn.className = 'rec-action';
          box.appendChild(btn);
        }
        btn.textContent = rec.action;
        // opcional: mostra o motivo
        let why = box.querySelector('.rec-why');
        if (!why) {
          why = document.createElement('div');
          why.className = 'rec-why';
          why.style.opacity = '0.8';
          why.style.fontSize = '12px';
          box.appendChild(why);
        }
        why.textContent = `${rec.rule}: ${rec.detail}`;
      }

      // 2) Banner pós-flop (texto grande)
      const banner = document.querySelector('[data-postflop], .postflop-banner, #postflop');
      if (banner) {
        const title = banner.querySelector('.decision-title, .banner-title') || banner;
        title.textContent = rec.action;
        let sub = banner.querySelector('.decision-detail, .banner-sub');
        if (!sub) {
          sub = document.createElement('div');
          sub.className = 'banner-sub';
          banner.appendChild(sub);
        }
        sub.textContent = `${rec.rule}: ${rec.detail}`;
      }
    } catch (e) {
      console.debug('[unify] syncUI skip:', e);
    }
  }

  // roda a cada pequena mudança (barato)
  function tick(){
    const rec = decideUnified();
    syncUI(rec);
  }

  // primeira execução e observador leve
  tick();
  setInterval(tick, 400); // simples e robusto para o seu fluxo

})(window);
