/* raise-eqadj-adapter.js — injeta EqAdj no raise.js sem editar o original
   - Lê equity (MC) do PCALC.state (ou DOM como fallback rápido)
   - Calcula EqAdj com PCALC.Multiway.adjustedEquity (ou fórmula inline)
   - Injeta em raise.js via RAISE.setState({ equityPct: ... })
*/
(function (g) {
  'use strict';

  // ==== Config fallback (mesmo default do multiway.js) ====
  var EQADJ_CFG = { ALPHA: 0.08, BETA: 0.50, MULTIWAY_FLOOR: 0.50 };

  // ==== Utils de ambiente ====
  function getPC() { return (g.PCALC || g.PC || {}); }
  function getState() { var PC = getPC(); return (PC.state || {}); }
  function hasRaise() { return !!(g.RAISE && typeof g.RAISE.setState === 'function'); }

  // ==== Leitura de insumos ====
  function getOpponents() {
    var st = getState();
    var n = Number(st.oponentes ?? st.opponents ?? st.viloes ?? st.nViloes ?? 1);
    return (isFinite(n) && n >= 1) ? n : 1;
  }
  function getFlop() {
    var st = getState();
    var f = st.flop || st.boardFlop || st.board || st.flopCards || null;
    if (!f && Array.isArray(st.boardAll)) f = st.boardAll.slice(0, 3);
    return Array.isArray(f) ? f : null;
  }
  function getWetScore(flop) {
    try {
      var MW = getPC().Multiway;
      if (MW && typeof MW.boardWetnessScore === 'function') {
        return Number(MW.boardWetnessScore(flop || [])) || 0;
      }
    } catch (_) {}
    return 0; // fallback conservador se multiway.js não estiver disponível
  }

  // Equity (MC) fonte principal: PCALC.state.eqMC / equityMC / equity (0..1 ou %)
  function readEquityMC01() {
    var st = getState();
    var v = st.eqMC ?? st.equityMC ?? st.equity;
    if (v == null) {
      // Fallback leve do DOM (Win/Tie): tenta #eqBreak ou #eqBarWin
      try {
        var br = g.document && g.document.getElementById('eqBreak');
        if (br) {
          var t = br.textContent || '';
          var mW = t.match(/Win:\s*([\d.,]+)%/i);
          var mT = t.match(/Tie:\s*([\d.,]+)%/i);
          var win = mW ? parseFloat(String(mW[1]).replace(',','.')) : NaN;
          var tie = mT ? parseFloat(String(mT[1]).replace(',','.')) : NaN;
          if (isFinite(win)) {
            var eqPct = win + (isFinite(tie) ? tie / 2 : 0);
            return Math.max(0, Math.min(1, eqPct / 100));
          }
        }
        var bar = g.document && g.document.getElementById('eqBarWin');
        if (bar && bar.style && bar.style.width) {
          var w = parseFloat(String(bar.style.width).replace('%',''));
          if (isFinite(w)) return Math.max(0, Math.min(1, w / 100));
        }
      } catch (_) {}
      return NaN;
    }
    var n = Number(v);
    if (!isFinite(n)) return NaN;
    // se veio em %, converte para 0..1
    if (n > 1) n = n / 100;
    return Math.max(0, Math.min(1, n));
  }

  // ==== Cálculo EqAdj (prioriza biblioteca oficial) ====
  function computeEqAdjPct() {
    var eq = readEquityMC01();                // 0..1
    if (!(eq >= 0)) return NaN;
    var opps = getOpponents();
    var wet  = getWetScore(getFlop());        // 0..100

    // 1) Se multiway.js estiver disponível, usa a função oficial
    try {
      var MW = getPC().Multiway;
      if (MW && typeof MW.adjustedEquity === 'function') {
        var adj = MW.adjustedEquity(eq, opps, wet);
        if (isFinite(adj)) return +(Math.max(0, Math.min(1, adj)) * 100).toFixed(1);
      }
    } catch (_) {}

    // 2) Fallback: mesma fórmula do multiway.js
    var A = EQADJ_CFG.ALPHA, B = EQADJ_CFG.BETA, FLOOR = EQADJ_CFG.MULTIWAY_FLOOR;
    var multi = Math.max(FLOOR, 1 - A * Math.max(0, (opps || 1) - 1));
    var wetK  = 1 - B * Math.max(0, Math.min(1, (wet || 0) / 100));
    var adjEq = Math.max(0, Math.min(1, eq * multi * wetK));
    return +(adjEq * 100).toFixed(1);
  }

  // ==== Aplicação no raise.js (override limpo) ====
  function pushEqAdjIntoRaise() {
    if (!hasRaise()) return;
    var eqAdjPct = computeEqAdjPct(); // 0..100 com 1 casa
    if (!isFinite(eqAdjPct)) return;
    // Injeta override — raise.js usa overrides.equityPct com prioridade
    try {
      g.RAISE.setState({ equityPct: eqAdjPct });
    } catch (_) {}
  }

  // ==== Observação leve + polling robusto ====
  function setupObservers() {
    // Observa mudanças em #eqBreak e #eqBarWin para reagir rápido
    if (g.MutationObserver && g.document) {
      var targets = ['eqBreak','eqBarWin']
        .map(function(id){ return g.document.getElementById(id); })
        .filter(Boolean);

      targets.forEach(function(el){
        var mo = new MutationObserver(function(){
          pushEqAdjIntoRaise();
        });
        mo.observe(el, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['style'] });
      });
    }
    // Polling a cada 400 ms (cai como fallback mesmo se os nós não existirem)
    setInterval(pushEqAdjIntoRaise, 400);
  }

  // ==== Boot tardio (espera raise.js/multiway.js subirem) ====
  (function waitReady(){
    if (hasRaise()) {
      // primeiro empurrão + observers
      pushEqAdjIntoRaise();
      setupObservers();
    } else {
      setTimeout(waitReady, 150);
    }
  })();

})(window);
