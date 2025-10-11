// PATCH: "Houve Ação?" controla visibilidade + Botão Enviar para ação original e força o texto "OK"
// VERSÃO FINAL 2: Corrige o TTS para voltar a funcionar e ler apenas a linha de recomendação.
(function () {
  function $(s, r){ return (r||document).querySelector(s); }
  function setDisp(el, show){ if (!el) return; el.style.display = show ? '' : 'none'; }

  // --- Funções de TTS ---
  function ttsEnabled(){
    try { return !!(window.TTS && window.TTS.state && window.TTS.state.enabled && 'speechSynthesis' in window); }
    catch(_) { return false; }
  }
  function ttsSay(text){
    if (!text || text === '—' || text === 'Sem dados suficientes') return;
    if (!ttsEnabled()) return;
    try { speechSynthesis.cancel(); } catch(_){}
    try { window.TTS.speak(text); } catch(_){}
  }

  // --- FUNÇÃO getSRPText CORRIGIDA ---
  // Agora ela busca APENAS o texto dentro do #srp-label
  function getSRPText(){
    const label = $('#srp-label');
    return label ? label.textContent.trim() : '';
  }

  // Observa mudanças no #srp-box para falar sempre que atualizar
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
    console.log('[patch] Vigia do TTS ativado.');
  }

  // --- FUNÇÃO applyState CORRIGIDA ---
  // A lógica do TTS foi restaurada aqui
  function applyState(checked){
    setDisp($('#smart-rec-host'), checked);
    setDisp($('#pcalc-sugestao'), false);
    setDisp($('#suggestOut'), !checked);

    if (checked) {
      // Garante que o "vigia" do TTS seja ativado ao ligar a chave
      ensureSRPObserver();
      // Tenta ler a sugestão inicial (se já houver uma)
      setTimeout(() => {
        const txt = getSRPText();
        if (txt) ttsSay('Sugestão: ' + txt + '.');
      }, 250); // Um pequeno delay para dar tempo do painel carregar
    }
  }
  
  // --- LÓGICA CENTRAL DE RESET (sem alterações) ---
  function forceBeDisplayToZero() {
    try {
      const potOddsContainer = $('#pcalc-sugestao .raise-potodds.card');
      if (!potOddsContainer) return;
      const labels = Array.from(potOddsContainer.querySelectorAll(':scope div'));
      for (const label of labels) {
        if ((label.textContent || '').trim().toLowerCase() === 'be (pot odds)') {
          const valDiv = label.nextElementSibling;
          if (valDiv) {
            const bTag = valDiv.querySelector('b');
            if (bTag && bTag.textContent !== '0.0%') bTag.textContent = '0.0%';
          }
          break; 
        }
      }
    } catch (e) {}
  }
  function resetAndTurnOff() {
    const potInput = $('#inp-pot');
    const callInput = $('#inp-call');
    if (potInput) potInput.value = '';
    if (callInput) callInput.value = '';
    const cb = $('#rsw-inject');
    if (cb) cb.checked = false;
    applyState(false);
    forceBeDisplayToZero();
  }

  function bind(){
    const cb = $('#rsw-inject');
    if (cb && !cb._srpBound){
      cb.addEventListener('change', () => {
        const isChecked = !!cb.checked;
        applyState(isChecked);
        const potInput = $('#inp-pot');
        const callInput = $('#inp-call');
        if (isChecked) {
          if (potInput) potInput.value = '0';
          if (callInput) callInput.value = '0';
          forceBeDisplayToZero(); 
        } else {
          if (potInput) potInput.value = '';
          if (callInput) callInput.value = '';
          forceBeDisplayToZero();
        }
      });
      cb._srpBound = true;
    }

    const sendBtn = $('#btn-raise-send');
    if (sendBtn) {
        if (!sendBtn._sendBound) {
            sendBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                resetAndTurnOff();
            }, true);
            sendBtn._sendBound = true;
        }
        if (!sendBtn._textObserverBound) {
            const observer = new MutationObserver(() => {
                if (sendBtn.textContent !== 'OK') sendBtn.textContent = 'OK';
            });
            observer.observe(sendBtn, { childList: true });
            sendBtn.textContent = 'OK';
            sendBtn._textObserverBound = true;
        }
    }
  }

  // --- INICIALIZAÇÃO DO SCRIPT ---
  resetAndTurnOff();
  bind();

  const mo = new MutationObserver(() => { bind(); });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  let tries = 0;
  const t = setInterval(() => {
    bind();
    if (++tries > 40) clearInterval(t);
  }, 250);

  console.log('[patch] TTS corrigido e ciclo de uso completo.');
})();
