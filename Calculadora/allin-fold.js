
(() => {
  // ===== encerra versões antigas =====
  if (window.__AIF && typeof window.__AIF.cleanup === 'function') {
    try { window.__AIF.cleanup(); } catch(_) {}
  }

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from((r||document).querySelectorAll(s));

  // ===== Config =====
  const CFG = {
    // Push range <10BB — suited-aware
    pushHands: new Set([
      // Pairs 22+
      "22","33","44","55","66","77","88","99","TT","JJ","QQ","KK","AA",

      // A suited A2s–A9s + ATs+
      "A2s","A3s","A4s","A5s","A6s","A7s","A8s","A9s","ATs","AJs","AQs","AKs",

      // Broadways suited
      "KQs","KJs","KTs","QJs","QTs","JTs",

      // K/Q/J9 suited
      "K9s","Q9s","J9s",

      // Suited connectors
      "T9s","98s","87s","76s","65s",

      // Offsuit (conservador)
      "AKo","AQo","AJo","ATo","KQo","QJo","JTo"
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
      if (AIF_ND_OBS){ try{AIF_ND_OBS.disconnect();}catch(_){}; AIF_ND_OBS = null; }
      if (AIF_ANCHOR && AIF_ANCHOR.parentNode){ AIF_ANCHOR.parentNode.removeChild(AIF_ANCHOR); }
      AIF_ANCHOR = null;
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
        <div class="aif-line">All in / Fold (Ative sempre que tiver &lt; 10 BB)</div>
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
      <div class="aif-line">All in / Fold (Ative sempre que tiver &lt; 10 BB)</div>
    `;
    card.classList.toggle('aif-active', wasOn);
  }

  // ===== helpers de posicionamento/escopo =====
  function getRightBody() {
    const bodies = $$('.body');
    return bodies[1] || document.body;
  }
  function findNativeDecision(){
    const rb = getRightBody();
    const cand = rb.querySelector('.decision:not(.aif-decision)');
    return cand || null;
  }

  // ===== Âncora invisível antes da .decision nativa =====
  let AIF_ANCHOR = null;
  let AIF_ND_OBS = null;

  function ensureAnchor(cb){
    const rb = getRightBody();
    const nd = findNativeDecision();
    if (nd){
      if (!AIF_ANCHOR){
        AIF_ANCHOR = document.createElement('div');
        AIF_ANCHOR.id = 'aif-anchor';
        AIF_ANCHOR.style.display = 'none';
        nd.parentNode.insertBefore(AIF_ANCHOR, nd); // ANTES da nativa
      }
      if (typeof cb === 'function') cb(AIF_ANCHOR);
      return;
    }
    if (AIF_ND_OBS) return;
    AIF_ND_OBS = new MutationObserver(() => {
      const nd2 = findNativeDecision();
      if (nd2){
        if (!AIF_ANCHOR){
          AIF_ANCHOR = document.createElement('div');
          AIF_ANCHOR.id = 'aif-anchor';
          AIF_ANCHOR.style.display = 'none';
          nd2.parentNode.insertBefore(AIF_ANCHOR, nd2);
        }
        try { AIF_ND_OBS.disconnect(); } catch(_){}
        AIF_ND_OBS = null;
        if (typeof cb === 'function') cb(AIF_ANCHOR);
      }
    });
    AIF_ND_OBS.observe(rb, {childList:true, subtree:true});
  }

  function hideNativeDecision(){
    const nd = findNativeDecision();
    if (nd){
      nd.setAttribute('data-aif-hidden','1');
      nd.style.setProperty('display','none','important');
    }
  }
  function showNativeDecision(){
    const nd = findNativeDecision();
    if (nd){
      nd.style.removeProperty('display');
      nd.removeAttribute('data-aif-hidden');
    }
  }
  function removeAIFDecision(){ $$('.decision.aif-decision').forEach(el => el.remove()); }

  // ===== TTS (fala curta) =====
  let lastSpokenKey = null;
  function speakSuggestion(kind){
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

  // ===== Suited-aware leitura das cartas =====
  const ORDER = 'AKQJT98765432';
  const SUIT_RE = /[♠♥♦♣]/;
  const SUIT_MAP = { '♠':'s', '♥':'h', '♦':'d', '♣':'c' };

  function parseSlotCard(slot){
    if (!slot) return null;
    const txt = (slot.textContent || '').trim().toUpperCase();
    const rm = txt.match(/(10|[2-9]|[TJQKA])/);
    if (!rm) return null;
    const rank = (rm[1] === '10') ? 'T' : rm[1];
    const sm = txt.match(SUIT_RE);
    const suit = sm ? SUIT_MAP[sm[0]] : null;
    return { rank, suit };
  }
  function canonicalCombo(c1, c2){
    if (!c1 || !c2) return null;
    if (c1.rank === c2.rank) return c1.rank + c2.rank;
    const rA = ORDER.indexOf(c1.rank);
    const rB = ORDER.indexOf(c2.rank);
    const [hi, lo] = (rA <= rB) ? [c1, c2] : [c2, c1];
    const suitedKnown = (hi.suit && lo.suit);
    const suffix = suitedKnown ? (hi.suit === lo.suit ? 's' : 'o') : '';
    return hi.rank + lo.rank + suffix; // AKs / AKo / AK
  }
  function readHoleComboStrict(){
    const c1 = parseSlotCard($('#h0'));
    const c2 = parseSlotCard($('#h1'));
    return canonicalCombo(c1, c2);
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

  function inPushRange(combo){
    if (!combo) return false;
    if (CFG.pushHands.has(combo)) return true;
    if (combo.length === 2) { // "AK" sem s/o -> testa ambos
      const s = combo + 's';
      const o = combo + 'o';
      if (CFG.pushHands.has(s) || CFG.pushHands.has(o)) return true;
    }
    return false;
  }

  // ===== Decisão =====
  function decide(){
    const combo = readHoleComboStrict();
    const eq    = readEquityPct();

    if (inPushRange(combo)) {
      return { pick:'allin', reason:`cartas ${combo} (push range)`, combo, eq };
    }
    if (isFinite(eq) && eq >= CFG.equityThreshold) {
      return { pick:'allin', reason:`equity ${eq.toFixed(1)}%`, combo, eq };
    }
    return { pick:'fold', reason:`equity ${isFinite(eq)?eq.toFixed(1)+'%':'indisponível'}`, combo, eq };
  }

  // ===== Toolbar lock + política de visibilidade =====
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
      // <<< não libera automaticamente: respeita regra "precisa ter cartas"
      setToolbarVisibility();
    }
  }

  // NOVO: Só mostra toolbar quando MODO OFF e há 2 cartas
  function setToolbarVisibility(){
    const tb = $('#pcalc-toolbar'); if (!tb) return;
    const modeOn = document.body.classList.contains('aif-lock-toolbar');
    const show = !modeOn && hasTwoCards();
    if (show){
      tb.style.removeProperty('display');
    } else {
      tb.style.display = 'none';
    }
  }

  // ===== Render: só quando existir anchor (garante posição) =====
  function render(force=false){
    if (!document.body.classList.contains('aif-lock-toolbar')) return;

    ensureAnchor(() => {
      const comboPresent = hasTwoCards();

      const st  = comboPresent ? decide() : null;
      const sig = comboPresent
        ? `${st.pick}|${st.combo||'NA'}|${isFinite(st.eq)?st.eq.toFixed(1):'NA'}`
        : 'nocards';

      if (!force && sig === AIF.lastSig) return;
      AIF.lastSig = sig;

      removeAIFDecision();

      const box = document.createElement('div');
      box.className = 'decision aif-decision';

      if (!comboPresent){
        box.innerHTML = `
          <div class="decision-title ok">AGUARDANDO CARTAS</div>
          <div class="decision-detail">Selecione suas cartas para gerar a recomendação do modo tudo ou nada.</div>
        `;
      } else if (st.pick === 'allin'){
        box.innerHTML = `<div class="decision-title ok">APOSTE TUDO</div>
          <div class="decision-detail">Modo tudo ou nada — ${st.reason}.</div>`;
        speakSuggestion('allin');
      } else {
        box.innerHTML = `<div class="decision-title warn">DESISTA</div>
          <div class="decision-detail">Modo tudo ou nada — ${st.reason}.</div>`;
        speakSuggestion('fold');
      }

      if (AIF_ANCHOR && AIF_ANCHOR.parentNode){
        AIF_ANCHOR.parentNode.insertBefore(box, AIF_ANCHOR.nextSibling);
        hideNativeDecision();
      }
    });
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
      if (speak) {
        try{ speechSynthesis.cancel(); }catch(_){}
        const s = speechSynthesis, u = new SpeechSynthesisUtterance('Modo tudo ou nada ativado');
        const v = s.getVoices().find(v=>/pt(-|_)br/i.test(v.lang)) || s.getVoices().find(v=>/^pt/i.test(v.lang));
        if (v) u.voice=v; u.rate=1; u.pitch=1; u.volume=1; s.speak(u);
      }
      ensureAnchor(() => { render(true); });
    } else {
      removeAIFDecision();
      showNativeDecision();
      AIF.lastSig = null;
      try { speechSynthesis.cancel(); } catch(_){}
      lastSpokenKey = null;

      if (AIF_ND_OBS){ try{AIF_ND_OBS.disconnect();}catch(_){}; AIF_ND_OBS = null; }
      if (AIF_ANCHOR && AIF_ANCHOR.parentNode){ AIF_ANCHOR.parentNode.removeChild(AIF_ANCHOR); }
      AIF_ANCHOR = null;

      // aplica política de visibilidade da toolbar ao desligar
      setToolbarVisibility();
    }
  }
  toggle.addEventListener('change', () => setON(toggle.checked));

  // ===== Painel do toggle sempre visível =====
  function updateCardVisibility(){
    if (!wrap) return;
    wrap.style.removeProperty('display');
  }

  // ===== Loop: render do AIF quando ON =====
  const idRender = setInterval(() => {
    if (document.body && document.body.classList.contains('aif-lock-toolbar')) render(false);
  }, CFG.pollMs);
  AIF.timers.push(idRender);

  // ===== NOVO: ticker para controlar a toolbar quando MODO OFF =====
  const idCardWatch = setInterval(() => {
    // só aplica quando modo All-in/Fold está DESLIGADO
    if (!document.body.classList.contains('aif-lock-toolbar')) {
      setToolbarVisibility();
    }
  }, CFG.cardPollMs);
  AIF.timers.push(idCardWatch);

  // Se existir botão "Limpar tudo", garanta que a toolbar siga a regra ao limpar
  if (btnClear){
    btnClear.addEventListener('click', () => {
      setTimeout(setToolbarVisibility, 0);
    });
  }

  updateCardVisibility();

  // ===== Inicializa =====
  setON(!!($('#aif-toggle') && $('#aif-toggle').checked), false);
  // aplica regra inicial (se estiver OFF e sem cartas, barra fica oculta)
  setToolbarVisibility();

  console.info('[AIF] ON — toolbar escondida no modo ON; no modo OFF só aparece com 2 cartas.');
})();
