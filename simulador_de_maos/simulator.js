(() => {
  const q = (s, r=document) => r.querySelector(s);
  const PC = window.PCALC;
  if (!PC) {
    console.error("pcalc-core.js não carregado.");
    return;
  }

  let placar = {};
  let totalRounds = 0;
  let currentRound = 0;

  // === Renderiza o placar + contador ===
  function renderPlacar(players) {
    const s = q("#scoreArea");
    if (!s) return;

    let html = "";
    players.forEach((_, i) => {
      const nome = i === 0 ? "Hero" : `Vilão ${i}`;
      const classe = i === 0 ? "score-item hero" : "score-item";
      html += `
        <div class="${classe}">
          <div class="score-name">${nome}</div>
          <div class="score-points">${placar[i] || 0}</div>
        </div>`;
    });

    // contador de rodadas restantes
    const restantes = Math.max(totalRounds - currentRound, 0);
    html += `
      <div class="score-item counter">
        <div class="score-name">Rodadas restantes</div>
        <div class="score-points">${restantes > 0 ? restantes : "🏁"}</div>
      </div>`;

    s.innerHTML = html;
  }

  // === Mostra resultado ===
  function showResult(text) {
    const r = q("#resultArea");
    if (!r) return;
    r.innerHTML = `
      <div style="text-align:center;margin-top:10px;">
        <div style="font-size:16px;font-weight:bold;color:#22c55e;">${text}</div>
      </div>`;
  }

  // === Cálculo de vencedor ===
  function playRound(players, board) {
    if (!players?.length || board.length !== 5) return;
    currentRound++;

    const results = [];
    players.forEach((hand, i) => {
      if (!hand[0] || !hand[1]) return;
      const cards = [...hand, ...board];
      const evalRes = PC.evalBest(cards);
      results.push({ i, evalRes });
    });
    if (results.length === 0) return;

    results.sort((a, b) => PC.cmpEval(b.evalRes, a.evalRes));
    const best = results[0].evalRes;
    const winners = results.filter(r => PC.cmpEval(r.evalRes, best) === 0).map(r => r.i);

    winners.forEach(w => (placar[w] = (placar[w] || 0) + 1));

    const catName = PC.CAT_NAME[best.cat] || "Desconhecida";
    const msg = winners.length > 1
      ? `Empate (${catName})`
      : `${winners[0] === 0 ? "Hero" : "Vilão " + winners[0]} venceu com ${catName}!`;

    showResult(msg);
    renderPlacar(players);

    if (currentRound === totalRounds) {
      setTimeout(() => showPodium(players), 1200);
    }
  }

  // === Reset ===
  function resetPlacar() {
    placar = {};
    totalRounds = 0;
    currentRound = 0;
    const s = q("#scoreArea"); if (s) s.innerHTML = "";
    const r = q("#resultArea"); if (r) r.innerHTML = "";
    const modal = q("#podiumModal"); if (modal) modal.remove();
  }

  window.MultiSim = window.MultiSim || {};
  window.MultiSim.playRound = playRound;
  window.MultiSim.resetPlacar = resetPlacar;
  window.MultiSim.setRounds = (n) => totalRounds = n;

  // === Modal de pódio final ===
  function showPodium(players) {
    const modal = document.createElement("div");
    modal.id = "podiumModal";
    modal.innerHTML = `
      <div class="podium-back">
        <div class="podium-content">
          <h2>🏆 Resultado Final</h2>
          <div id="podiumList"></div>
          <button id="closePodium" class="btn primary">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const list = modal.querySelector("#podiumList");
    const arr = Object.entries(placar).map(([i, p]) => ({ i: parseInt(i), p }));
    arr.sort((a, b) => b.p - a.p);

    const nomes = players.map((_, i) => (i === 0 ? "Hero" : `Vilão ${i}`));

    let html = "";
    arr.slice(0, 4).forEach((x, idx) => {
      const rank = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "4º";
      const classe = idx === 0 ? "first" : idx === 1 ? "second" : idx === 2 ? "third" : "";
      html += `
        <div class="podium-item ${classe}" style="animation-delay:${idx * 0.2}s">
          <div class="podium-rank">${rank}</div>
          <div class="podium-name">${nomes[x.i]}</div>
          <div class="podium-score">${x.p || 0} vitória${x.p === 1 ? "" : "s"}</div>
        </div>`;
    });

    list.innerHTML = html;
    modal.style.display = "flex";
    modal.querySelector("#closePodium").onclick = () => modal.remove();
  }
})();
