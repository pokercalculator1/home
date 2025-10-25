(() => {
  const q = (s, r=document) => r.querySelector(s);
  if (!window.PCALC) { console.warn("⚠️ pcalc-core.js não carregado."); return; }
  if (!window.players) { console.warn("⚠️ players não encontrado em window. Abra a página completa."); return; }

  // =========================
  // 1) Toggle Turbo (UI)
  // =========================
  if (!q('#btnTurbo')) {
    const btn = document.createElement('button');
    btn.id = 'btnTurbo';
    btn.textContent = 'Turbo: OFF';
    btn.style.marginLeft = '8px';
    btn.style.background = '#22c55e';
    btn.style.color = '#000';
    btn.style.borderRadius = '6px';
    btn.style.padding = '6px 12px';
    btn.style.fontWeight = 'bold';
    const resetBtn = q('#btnReset');
    if (resetBtn) resetBtn.after(btn);
    btn.addEventListener('click', () => {
      window.turboMode = !window.turboMode;
      btn.textContent = window.turboMode ? 'Turbo: ON' : 'Turbo: OFF';
      btn.style.background = window.turboMode ? '#facc15' : '#22c55e';
    });
  }
  if (typeof window.turboMode === 'undefined') window.turboMode = false;

  // =========================
  // 2) Modal de Pódio (UI)
  // =========================
  function closeAnyPodium() {
    const prev = q('#podiumModal');
    if (prev) prev.remove();
  }

  function ensurePodiumStyles() {
    if (q('#podiumModalStyle')) return;
    const css = document.createElement('style');
    css.id = 'podiumModalStyle';
    css.textContent = `
      #podiumModal { position: fixed; inset: 0; display: none; z-index: 99999; }
      #podiumModal .podium-back {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.80); animation: pm-fade .35s ease;
      }
      #podiumModal .podium-content {
        background: #111827; border: 1px solid #334155; border-radius: 14px; width: min(560px, 90vw);
        padding: 18px 22px; box-shadow: 0 0 30px rgba(250,204,21,0.25);
        animation: pm-pop .38s ease;
      }
      #podiumModal h2 { color: #facc15; text-align: center; margin: 0 0 10px; }
      #podiumList { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 16px; }
      .podium-item { display: grid; grid-template-columns: 56px 1fr auto; align-items: center;
        gap: 10px; background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 10px 12px;
        opacity: 0; transform: translateY(8px); animation: pm-slide .4s ease forwards;
      }
      .podium-item.first { box-shadow: 0 0 18px rgba(250,204,21,0.20); }
      .podium-rank { font-size: 24px; text-align: center; }
      .podium-name { font-weight: 700; color: #e5e7eb; }
      .podium-score { font-weight: 700; color: #facc15; }
      #closePodium.btn.primary {
        background: #22c55e; color: #000; border: none; padding: 8px 14px;
        border-radius: 8px; font-weight: 700; cursor: pointer; width: 100%;
      }
      #closePodium.btn.primary:hover { filter: brightness(1.08); }
      @keyframes pm-fade { from{opacity:0} to{opacity:1} }
      @keyframes pm-pop { from{transform:scale(.97); opacity:0} to{transform:scale(1); opacity:1} }
      @keyframes pm-slide { to{opacity:1; transform:translateY(0)} }
    `;
    document.head.appendChild(css);
  }

  function showPodiumTurbo(counts, playersLen) {
    closeAnyPodium();
    ensurePodiumStyles();

    const modal = document.createElement('div');
    modal.id = 'podiumModal';
    modal.innerHTML = `
      <div class="podium-back">
        <div class="podium-content">
          <h2>🏆 Resultado Final</h2>
          <div id="podiumList"></div>
          <button id="closePodium" class="btn primary">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Monta ranking
    const arr = Array.from({length: playersLen}, (_, i) => ({ i, p: counts[i] || 0 }));
    arr.sort((a,b) => b.p - a.p);

    const list = modal.querySelector('#podiumList');
    let html = '';
    arr.forEach((x, idx) => {
      const rank = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}º`;
      const classe = idx === 0 ? 'first' : idx === 1 ? 'second' : idx === 2 ? 'third' : '';
      const nome = x.i === 0 ? 'Hero' : `Vilão ${x.i}`;
      html += `
        <div class="podium-item ${classe}" style="animation-delay:${idx * 0.08}s">
          <div class="podium-rank">${rank}</div>
          <div class="podium-name">${nome}</div>
          <div class="podium-score">${x.p} vitória${x.p === 1 ? '' : 's'}</div>
        </div>`;
    });
    list.innerHTML = html;

    // abrir/fechar
    modal.style.display = 'block';
    modal.querySelector('#closePodium').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target.classList.contains('podium-back')) modal.remove(); });
    window.addEventListener('keydown', function esc(ev){ if(ev.key==='Escape'){ modal.remove(); window.removeEventListener('keydown', esc); } });
  }

  // =========================
  // 3) Runner TURBO
  // =========================
  const PC = window.PCALC;

  function runTurbo(qtd) {
    const ps = window.players;
    if (!ps?.length) { alert('Gere jogadores antes!'); return; }
    if (ps.some(p => !p[0] || !p[1])) { alert('Todos os jogadores precisam ter cartas!'); return; }

    // limpa placar visual para não confundir
    const score = q('#scoreArea'); if (score) score.innerHTML = '';
    const result = q('#resultArea'); if (result) result.innerHTML = '<div style="text-align:center;color:#93c5fd">Processando Turbo...</div>';

    const deckBase = PC.makeDeck();
    const counts = new Array(ps.length).fill(0);

    // Pré-index rápido para remoção de cartas escolhidas
    const chosenIds = new Set();
    ps.flat().forEach(c => { if (c) chosenIds.add(`${c.r}${c.s}`); });

    // Loop principal — sem render e sem await
    for (let rodada = 0; rodada < qtd; rodada++) {
      // clona baralho e remove escolhidas
      const deck = [];
      for (let i = 0; i < deckBase.length; i++) {
        const c = deckBase[i];
        if (!chosenIds.has(`${c.r}${c.s}`)) deck.push(c);
      }

      // 5 cartas do board
      const b = [];
      for (let i = 0; i < 5; i++) {
        const idx = (Math.random() * deck.length) | 0;
        b.push(deck[idx]);
        deck[idx] = deck[deck.length - 1];
        deck.pop();
      }

      // avalia mãos
      let best = null;
      let bestList = null; // quem empata
      for (let i = 0; i < ps.length; i++) {
        const h = ps[i];
        if (!h[0] || !h[1]) continue;
        const ev = PC.evalBest(h[0] && h[1] ? [h[0], h[1], b[0], b[1], b[2], b[3], b[4]] : b);
        if (!best) { best = ev; bestList = [i]; }
        else {
          const cmp = PC.cmpEval(ev, best);
          if (cmp > 0) { best = ev; bestList = [i]; }
          else if (cmp === 0) { bestList.push(i); }
        }
      }
      if (bestList) for (let k = 0; k < bestList.length; k++) counts[bestList[k]]++;
    }

    if (result) result.innerHTML = ''; // limpa
    showPodiumTurbo(counts, ps.length);
  }

  // =========================
  // 4) Intercepta "Iniciar Auto"
  // =========================
  const btnAuto = q('#btnAuto');
  if (btnAuto) {
    const originalHandler = btnAuto.onclick; // captura handler atual (do seu script)
    btnAuto.onclick = () => {
      const qtd = parseInt(q('#numRounds')?.value || '0', 10) || 0;
      if (window.turboMode) {
        runTurbo(qtd);
      } else if (typeof originalHandler === 'function') {
        // volta para o fluxo normal do seu app
        originalHandler.call(btnAuto);
      } else {
        // fallback: dispara click nativo (caso handler tenha sido adicionado via addEventListener)
        const ev = new Event('click', { bubbles: true });
        btnAuto.dispatchEvent(ev);
      }
    };
  }

  console.log('%c⚡ Turbo + Pódio centralizado pronto!', 'color:#facc15;font-weight:700;');
})();
