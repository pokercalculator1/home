(() => {
  // ===== encerra versões antigas =====
  if (window.__AIF && typeof window.__AIF.cleanup === 'function') {
    try { window.__AIF.cleanup(); } catch(_) {}
  }

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from((r||document).querySelectorAll(s));

  // ===== Config =====
  const CFG = {
    pushHands: new Set([
      "AA","KK","QQ","JJ","TT","99","88","77","66","55",
      "AK","AQ","AJ","AT","KQ","KJ","KT","QJ","QT","JT"
    ]),
    equityThreshold: 50,
    pollMs: 600,
    cardPollMs: 400
  };

  // ===== Estado global / cleanup =====
  const AIF = {
    timers: [],
    observers: [],
    lastSig: null,
    cleanup(){
      this.timers.forEach(t => clearInterval(t));
      this.timers = [];
      this.observers.forEach(o => { try{o.disconnect();}catch(_){} });
      this.observers = [];
      $$('.decision.aif-decision').forEach(el => el.remove());
      $$('[data-aif-hidden]').forEach(n => { n.style.removeProperty('display'); n.removeAttribute('data-aif-hidden'); });
      const tb = $('#pcalc-toolbar'); if (tb) tb.style.removeProperty('display');
      document.body.classList.remove('aif-lock-toolbar');
      const card = $('#aif-card'); if (card) card.classList.remove('aif-active');
      try { speechSynthesis.cancel(); } catch(_){}
    }
  };
  window.__AIF = AIF;

  // ===== CSS =====
  const css = `
    #aif-wrap { width: 100% !important; }
    .aif-card {
      display:flex; align-items:center; gap:10px; flex-wrap:nowrap;
      border:2px dashed #6b7280; border-radius:12px; padding:10px 12px; margin:10px 0 12px;
      background:#0b1324; color:#e5e7eb;
    }
    .aif-card.aif-active { border-color:#ef4444; box-shadow:0 0 0 2px rgba(239,68,68,.15) inset; }
    .aif-line { font-weight:700; white-space:nowrap; }
    .aif-switch { position:relative; display:inline-block; width:48px; height:26px; }
    .aif-switch input{ opacity:0; width:0; height:0; }
    .aif-slider { position:absolute; inset:0; cursor:pointer; border-radius:999px; background:#374151; transition:.2s ease; box-shadow:inset 0 0 0 2px #94a3b8; }
    .aif-slider:before { content:""; position:absolute; height:20px; width:20px; left:3px; top:3px; background:#e5e7eb; border-radius:999px; transition:.2s ease; }
    .aif-switch input:checked + .aif-slider { background:#991b1b; box-shadow:inset 0 0 0 2px #f87171; }
    .aif-switch input:checked + .aif-slider:before { transform:translateX(22px); }

    /* ON: esconder toolbar + decisões nativas */
    body.aif-lock-toolbar #pcalc-toolbar { display:none !important; }
    body.aif-lock-toolbar .decision:not(.aif-decision) { display:none !important; }

    /* Decisão especial */
    .decision.aif-decision {
      border:1px solid #ef4444; border-radius:10px; padding:10px 12px; background:#1b0a0a;
      color:#fee2e2; box-shadow: rgba(0,0,0,.25) 0 8px 24px; margin:10px 0;
    }
    .decision.aif-decision .decision-title { font-weight:800; }
    .decision.aif-decision .decision-title.ok { color:#86efac; }
    .decision.aif-decision .decision-title.warn { color:#fca5a5; }
    .decision.aif-decision .decision-detail { opacity:.9; }
  `;
  let style = $('#aif-style'); if (!style) { style = document.createElement('style'); style.id='aif-style'; document.head.appendChild(style); }
  style.textContent = css;

  // ===== cria o botão (abaixo do #btnClear) =====
  const btnClear = $('#btnClear');
  if (!btnClear) { console.warn('[AIF] #btnClear não encontrado.'); return; }

  let wrap = $('#aif-wrap');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.id = 'aif-wrap';
    wrap.innerHTML = `
      <div class="aif-card" id="aif-card">
        <label class="aif-switch" title="Ative sempre que tiver menos de 10 BB">
          <input id="aif-toggle" type="checkbox"/>
          <span class="aif-slider"></span>
        </label>
        <div class="aif-line">All in / Fold (Ative sempre que tiver <10 BB)</div>
      </div>
    `;
    btnClear.insertAdjacentElement('afterend', wrap);
  } else {
    const card = $('#aif-card') || (() => { const c=document.createElement('div'); c.className='aif-card'; c.id='aif-card'; wrap.appendChild(c); return c; })();
    const wasOn = !!($('#aif-toggle') && $('#aif-toggle').checked);
    card.innerHTML = `
      <label class="aif-switch" title="Ative sempre que tiver menos de 10 BB">
        <input id="aif-toggle" type="checkbox" ${wasOn?'checked':''}/>
        <span class="aif-slider"></span>
      </label>
      <div class="aif-line">All in / Fold (Ative sempre que tiver < 10 BB)</div>
    `;
    card.classList.toggle('aif-active', wasOn);
  }

  // ===== TTS (fala apenas "sugestão aposte tudo" / "sugestão desista") =====
  let lastSpokenKey = null;
  function speakSuggestion(kind){ // kind: 'allin' | 'fold'
    try{
      const phrase = kind === 'allin' ? 'sugestão , aposte tudo' : 'sugestão , desista';
      if (phrase === lastSpokenKey) return;
      lastSpokenKey = phrase;
      if (!('speechSynthesis' in window)) return;
      const s = speechSynthesis;
      s.cancel();
      const u = new SpeechSynthesisUtterance(phrase);
      const v = s.getVoices().find(v=>/pt(-|_)br/i.test(v.lang)) || s.getVoices().find(v=>/^pt/i.test(v.lang));
      if (v) u.voice = v;
      u.rate=1; u.pitch=1; u.volume=1;
      s.speak(u);
    }catch(_){}
  }

  // ===== Leitura das cartas (.cardsline #h0/#h1) =====
  const ORDER = 'AKQJT98765432';
  function extractRankFromSlot(slot){
    if (!slot) return null;
    let txt = (slot.textContent || '').toUpperCase().replace(/[♠♥♦♣\s]/g, '');
    const m = txt.match(/(10|[2-9]|[TJQKA])/);
    if (!m) return null;
    return m[1] === '10' ? 'T' : m[1];
  }
  function readHoleComboStrict(){
    const h0 = $('#h0'); const h1 = $('#h1');
    if (!h0 || !h1) return null;
    const r1 = extractRankFromSlot(h0);
    const r2 = extractRankFromSlot(h1);
    if (!r1 || !r2) return null;
    if (r1 === r2) return r1 + r2;
    return (ORDER.indexOf(r1) < ORDER.indexOf(r2)) ? (r1 + r2) : (r2 + r1);
  }
  function hasTwoCards(){ return !!readHoleComboStrict(); }

  // ===== Equity =====
  function readEquityPct(){
    const grids = $$('#pcalc-sugestao .raise-potodds div, #srp-box .raise-potodds div, .raise-potodds div');
    for (let i=0;i<grids.length;i++){
      const d = grids[i], t=(d.textContent||'').trim();
      if (/Equity\s*Ajustada/i.test(t) || /Equity\s*\(MC\)/i.test(t)){
        const v = d.nextElementSibling && d.nextElementSibling.querySelector('b');
        const m = v && (v.textContent||'').match(/([\d.,]+)\s*%/);
        if (m) return parseFloat(m[1].replace(',','.'));
      }
    }
    const b = $('#eq, #eqPct, b[data-eq], .eq-pct b, .eq b');
    const m = b && (b.textContent||'').match(/([\d.,]+)\s*%/);
    return m ? parseFloat(m[1].replace(',','.')) : NaN;
  }

  // ===== Decisão =====
  function decide(){
    const combo = readHoleComboStrict();
    const eq    = readEquityPct();
    if (combo && CFG.pushHands.has(combo)) return { pick:'allin', reason:`cartas ${combo} (push range)`, combo, eq };
    if (isFinite(eq) && eq >= CFG.equityThreshold) return { pick:'allin', reason:`equity ${eq.toFixed(1)}%`, combo, eq };
    return { pick:'fold', reason:`equity ${isFinite(eq)?eq.toFixed(1)+'%':'indisponível'}`, combo, eq };
  }

  // ===== Esconder/mostrar decisões nativas =====
  function hideNative(){
    const sels = [
      '.decision', '.decision.glow', '.decision.good', '.decision.warn', '.decision.ok',
      '#smart-rec-host .decision', '#pcalc-sugestao .decision', '#srp-box .decision',
      '.raise-suggest', '.suggestOut', '.pcalc-sugestao'
    ];
    sels.forEach(sel => {
      $$(sel).forEach(node => {
        if (!node.classList.contains('aif-decision')) {
          node.setAttribute('data-aif-hidden','1');
          node.style.setProperty('display','none','important');
        }
      });
    });
  }
  function showNative(){
    $$('[data-aif-hidden="1"]').forEach(n => { n.removeAttribute('data-aif-hidden'); n.style.removeProperty('display'); });
  }

  function removeAIFDecision(){ $$('.decision.aif-decision').forEach(el => el.remove()); }

  function mountPoint(){
    return $$('.body')[1] || $('#srp-box') || $('#pcalc-sugestao') || document.body;
  }

  // ===== Render (TTS fala "sugestão ...") =====
  function render(force=false){
    if (!document.body.classList.contains('aif-lock-toolbar')) return;
    hideNative();

    const st  = decide();
    const sig = `${st.pick}|${st.combo||'NA'}|${isFinite(st.eq)?st.eq.toFixed(1):'NA'}`;
    if (!force && sig === AIF.lastSig) return;
    AIF.lastSig = sig;

    removeAIFDecision();
    const box = document.createElement('div');
    box.className = 'decision aif-decision';

    if (st.pick === 'allin'){
      box.innerHTML = `<div class="decision-title ok">APOSTE TUDO</div>
        <div class="decision-detail">Modo tudo ou nada — ${st.reason}.</div>`;
      speakSuggestion('allin'); // <<< fala só "sugestão aposte tudo"
    } else {
      box.innerHTML = `<div class="decision-title warn">DESISTA</div>
        <div class="decision-detail">Modo tudo ou nada — ${st.reason}.</div>`;
      speakSuggestion('fold');  // <<< fala só "sugestão desista"
    }

    const mp = mountPoint();
    if (mp.firstChild) mp.insertBefore(box, mp.firstChild); else mp.appendChild(box);
  }

  // ===== Toolbar lock =====
  let tbGuard = null;
  function lockToolbar(on){
    const tb = $('#pcalc-toolbar'); if (!tb) return;
    if (on){
      tb.style.display='none';
      document.body.classList.add('aif-lock-toolbar');
      if (tbGuard) { try{tbGuard.disconnect();}catch(_){} }
      tbGuard = new MutationObserver(()=>{ if (tb.style.display !== 'none') tb.style.display='none'; });
      tbGuard.observe(tb, { attributes:true, attributeFilter:['style'] });
      AIF.observers.push(tbGuard);
    } else {
      document.body.classList.remove('aif-lock-toolbar');
      if (tbGuard) { try{tbGuard.disconnect();}catch(_){} }
      tbGuard = null;
      tb.style.removeProperty('display');
    }
  }

  // ===== Toggle =====
  const toggle = $('#aif-toggle');
  const card   = $('#aif-card');
  if (!toggle) { console.warn('[AIF] toggle não encontrado.'); return; }

  function setON(on, speak=true){
    toggle.checked = !!on;
    card && card.classList.toggle('aif-active', !!on);
    lockToolbar(!!on);
    if (on){
      if (speak) { try{ speechSynthesis.cancel(); }catch(_){}
        // opcional: anunciar ativação
        const s = speechSynthesis, u = new SpeechSynthesisUtterance('Modo tudo ou nada ativado');
        const v = s.getVoices().find(v=>/pt(-|_)br/i.test(v.lang)) || s.getVoices().find(v=>/^pt/i.test(v.lang));
        if (v) u.voice=v; u.rate=1; u.pitch=1; u.volume=1; s.speak(u);
      }
      render(true);
    } else {
      removeAIFDecision();
      showNative();
      AIF.lastSig = null;
      try { speechSynthesis.cancel(); } catch(_){}
      lastSpokenKey = null;
    }
  }
  toggle.addEventListener('change', () => setON(toggle.checked));

  // ===== Regra de visibilidade do botão (só aparece com cartas) =====
  function hasTwoCards(){ return !!readHoleComboStrict(); }
  function updateCardVisibility(){
    const hasCards = hasTwoCards();
    if (!wrap) return;
    if (hasCards){
      wrap.style.removeProperty('display');
    } else {
      wrap.style.display = 'none';
      if (toggle.checked) setON(false, false);
    }
  }

  // ===== Loops =====
  const idRender = setInterval(() => {
    if (document.body.classList.contains('aif-lock-toolbar')) render(false);
  }, CFG.pollMs);
  AIF.timers.push(idRender);

  const idCard = setInterval(() => { updateCardVisibility(); }, CFG.cardPollMs);
  AIF.timers.push(idCard);

  // ===== Inicializa =====
  updateCardVisibility();
  setON(!!toggle.checked, false);

  console.info('[AIF] TTS atualizado: "sugestão aposte tudo" / "sugestão desista". Botão só aparece com cartas selecionadas.');
})();
