// PATCH: "Houve Ação?" controla visibilidade + Botão Enviar para ação original e força o texto "OK"
// VERSÃO FINAL 5: Restaura o "vigia" que força o texto do botão a ser sempre "OK".
(function () {
    function $(s, r) { return (r || document).querySelector(s); }
    function setDisp(el, show) { if (!el) return; el.style.display = show ? '' : 'none'; }

    // --- Funções de TTS e Leitura (sem alterações) ---
    function ttsSay(text) {
        if (!text || text === '—' || text === 'Sem dados suficientes') return;
        try {
            if (window.TTS && window.TTS.state && window.TTS.state.enabled) {
                speechSynthesis.cancel();
                window.TTS.speak(text);
            }
        } catch (e) {}
    }
    function getSRPText() {
        const label = $('#srp-label');
        return label ? label.textContent.trim() : '';
    }
    let srpObserver = null;
    function ensureSRPObserver() {
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
        srpObserver.observe(box, { childList: true, subtree: true, characterData: true });
    }

    // --- Lógica Principal de Controle da Interface ---
    function applyState(checked) {
        setDisp($('#smart-rec-host'), checked);
        setDisp($('#pcalc-sugestao'), !checked);
        setDisp($('#suggestOut'), !checked);

        if (checked) {
            ensureSRPObserver();
            setTimeout(() => {
                const txt = getSRPText();
                if (txt) ttsSay('Sugestão: ' + txt + '.');
            }, 250);
        }
    }

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

    let cardWatcherActive = false;
    function watchHeroCardsAndToggleToolbar() {
        if (cardWatcherActive) return;
        const card0 = $('#h0');
        const card1 = $('#h1');
        const toolbar = $('#pcalc-toolbar');
        if (!card0 || !card1 || !toolbar) return;

        const checkCardsAndToggle = () => {
            const bothCardsFilled = card0.classList.contains('filled') && card1.classList.contains('filled');
            setDisp(toolbar, bothCardsFilled);
        };

        const observer = new MutationObserver(checkCardsAndToggle);
        observer.observe(card0, { attributes: true, attributeFilter: ['class'] });
        observer.observe(card1, { attributes: true, attributeFilter: ['class'] });

        checkCardsAndToggle();
        cardWatcherActive = true;
        console.log('[patch] Vigia das cartas do herói ativado.');
    }

    function bind() {
        watchHeroCardsAndToggleToolbar();

        const cb = $('#rsw-inject');
        if (cb && !cb._srpBound) {
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
            // Parte 1: Intercepta o clique (sem alterações)
            if (!sendBtn._sendBound) {
                sendBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    resetAndTurnOff();
                }, true);
                sendBtn._sendBound = true;
            }

            // ================== CÓDIGO RESTAURADO ==================
            // Parte 2: Força o texto do botão a ser sempre "OK"
            if (!sendBtn._textObserverBound) {
                const observer = new MutationObserver(() => {
                    if (sendBtn.textContent !== 'OK') {
                        sendBtn.textContent = 'OK';
                    }
                });
                observer.observe(sendBtn, { childList: true, characterData: true });
                sendBtn.textContent = 'OK'; // Força o texto inicial
                sendBtn._textObserverBound = true;
                console.log('[patch] Vigia do texto do botão OK restaurado.');
            }
            // =======================================================
        }
    }

    // --- INICIALIZAÇÃO DO SCRIPT ---
    resetAndTurnOff();
    bind();
    const mo = new MutationObserver(() => bind());
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
