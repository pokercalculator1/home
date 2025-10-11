// PATCH: "Houve Ação?" controla visibilidade + Botão Enviar para ação original e força o texto "OK"
(function () {
  function $(s, r){ return (r||document).querySelector(s); }
  function setDisp(el, show){ if (!el) return; el.style.display = show ? '' : 'none'; }

  // --- TTS helpers (usa seu TTS se disponível) ---
  function ttsEnabled(){
    try { return !!(window.TTS && window.TTS.state && window.TTS.state.enabled && 'speechSynthesis' in window); }
    catch(_) { return false; }
  }
  function ttsSay(text){
    if (!text) return;
    if (!ttsEnabled()) return;
    try { speechSynthesis.cancel(); } catch(_){}
    try { window.TTS.speak(text); } catch(_){}
  }

  // Extrai a recomendação do #srp-box (tenta alguns seletores comuns)
  function getSRPText(){
    const box = $('#srp-box');
    if (!box) return '';
    // 1) badge/pílula padrão
    let n = box.querySelector('#po-rec');
    if (n && n.textContent.trim()) return n.textContent.trim();
    // 2) título de decisão
    n = box.querySelector('.decision-title, .rec-title, [data-role="rec-title"]');
    if (n && n.textContent.trim()) return n.textContent.trim();
    // 3) texto bruto (limpo)
    const raw = box.textContent || '';
    return raw.replace(/\s+/g,' ').trim();
  }

  // Observa mudanças no #srp-box para falar sempre que atualizar (só quando ligado)
  let srpObserver = null;
  function ensureSRPObserver(){
    if (srpObserver) return;
    const box = $('#srp-box');
    if (!box || !window.MutationObserver) return;
    srpObserver = new MutationObserver(() => {
      const cb = $('#rsw-inject');
      if (cb && cb.checked) {
        const txt = getSRPText();
        if (txt) ttsSay('Sugestão: ' + txt + '.');
      }
    });
    srpObserver.observe(box, { childList:true, subtree:true, characterData:true });
  }

  // Aplica o estado visual de acordo com o toggle
  function applyState(checked){
    setDisp($('#smart-rec-host'), checked); // ON: mostra, OFF: esconde
    setDisp($('#pcalc-sugestao'), false);   // mantém oculto mesmo quando ON
    setDisp($('#suggestOut'), !checked);    // ON: esconde, OFF: mostra

    if (checked) {
      const txt = getSRPText();
      if (txt) ttsSay('Sugestão: ' + txt + '.');
      ensureSRPObserver();
    }
  }

  // Força estado inicial DESLIGADO e coerência com RAISE
  function forceDefaultOff(){
    const cb = $('#rsw-inject');
    if (cb) cb.checked = false;
    if (window.RAISE && typeof RAISE.setState === 'function') {
      RAISE.setState({ useDecisionInjection: false });
    }
    applyState(false);
  }

  function bind(){
    // Lógica original do toggle
    const cb = $('#rsw-inject');
    if (cb && !cb._srpBound){
      cb.addEventListener('change', () => applyState(!!cb.checked));
      cb._srpBound = true;
      applyState(!!cb.checked);
    }

    const sendBtn = $('#btn-raise-send');
    if (sendBtn) {
        // Parte 1: Garante que o clique SÓ execute nossa função
        if (!sendBtn._sendBound) {
            sendBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();

                const potInput = $('#inp-pot');
                const callInput = $('#inp-call');
                if (potInput) potInput.value = '';
                if (callInput) callInput.value = '';

                forceDefaultOff();
            }, true);
            sendBtn._sendBound = true;
        }

        // Parte 2: Força o texto do botão a ser sempre "OK"
        if (!sendBtn._textObserverBound) {
            const observer = new MutationObserver(() => {
                // Se o texto for diferente de "OK", força a correção.
                if (sendBtn.textContent !== 'OK') {
                    sendBtn.textContent = 'OK';
                }
            });
            // Inicia o observador para vigiar o botão
            observer.observe(sendBtn, { childList: true });
            // Define o texto inicial correto e marca como "ligado"
            sendBtn.textContent = 'OK';
            sendBtn._textObserverBound = true;
        }
    }

    ensureSRPObserver();
  }

  // Boot
  forceDefaultOff();
  bind();

  // Reforça com MutationObserver (caso elementos montem depois)
  const mo = new MutationObserver(() => { bind(); });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  // Alguns ticks iniciais para estabilizar
  let tries = 0;
  const t = setInterval(() => {
    bind();
    if (++tries > 40) clearInterval(t);
  }, 250);

  console.log('[patch] Controle total do botão OK: Ação original bloqueada e texto fixado em "OK".');
})();
