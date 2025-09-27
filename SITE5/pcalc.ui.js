// =============== pcalc.ui.js ===============
(function(g){
  const PC = g.PCALC;

  // antes: const deckEl = document.getElementById('deck');
  function getDeckEl(){ return document.getElementById('deck'); }

  function renderCard(c){
    const el = document.createElement('div');
    el.className = 'cell '+PC.SUIT_CLASS[c.s];
    el.textContent = PC.fmtRank(c.r)+PC.SUIT_GLYPH[c.s];
    el.dataset.id = PC.cardId(c);
    if(PC.state.selected.find(x=>PC.cardId(x)===PC.cardId(c))) el.classList.add('sel');
    el.addEventListener('click', ()=>{
      PC.toggleSelect(c);
      safeRedraw();
    });
    return el;
  }

  function renderDeck(){
    const deckEl = getDeckEl();
    if(!deckEl) return;
    deckEl.innerHTML='';
    for(const c of PC.makeDeck()){
      deckEl.appendChild(renderCard(c));
    }
  }

  function safeRedraw(){
    try{
      renderDeck();
      PC.renderEquityPanel?.();
    }catch(e){ console.warn(e); }
  }

  PC.renderDeck = renderDeck;
  PC.safeRedraw = safeRedraw;

})(window);
