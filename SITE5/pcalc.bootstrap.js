// =============== pcalc.bootstrap.js ===============
(function(g){
  const PC = g.PCALC || (g.PCALC = {});

  // Estado global
  PC.state = {
    selected: [],   // cartas escolhidas
    prevBoardLen: 0 // len anterior do board
  };

  // Retorna { hand, board, opp }
  PC.getKnown = function(){
    const sel = PC.state.selected || [];
    const hand = sel.slice(0,2);
    const board = sel.slice(2,7);
    const opp = []; // futuro: multi-hand
    return { hand, board, opp };
  };

  // Botões Flop/Turn/River/Clear
  function wireStageButtons(){
    const byId = id=>document.getElementById(id);
    byId('btnFlop')?.addEventListener('click', ()=>PC.drawStage('flop'));
    byId('btnTurn')?.addEventListener('click', ()=>PC.drawStage('turn'));
    byId('btnRiver')?.addEventListener('click', ()=>PC.drawStage('river'));
    byId('btnClear')?.addEventListener('click', ()=>PC.clearAll());
  }

  // Função global de start
  function __pcalc_start_app__(){
    PC.state.prevBoardLen = Math.max(0, PC.state.selected.length-2);
    PC.renderDeck?.();
    PC.renderEquityPanel?.(); // garante que o painel/sugestão monte
    wireStageButtons();
  }

  g.__pcalc_start_app__ = __pcalc_start_app__;
})(window);
