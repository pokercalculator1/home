(() => {
  const q = (s, r = document) => r.querySelector(s);

  // =========================
  // 🏆 Mostrar Podium Final
  // =========================
  window.mostrarPodium = function (resultados) {
    // Remove podium anterior
    const antigo = document.getElementById("podium");
    if (antigo) antigo.remove();

    // Espera a área principal existir
    const area = document.querySelector("#multi-sim");
    if (!area) {
      setTimeout(() => mostrarPodium(resultados), 100);
      return;
    }

    // Cria o elemento podium
    const podium = document.createElement("div");
    podium.id = "podium";
    podium.style.cssText = `
      position: relative;
      margin: 20px auto;
      text-align: center;
      background: #111827;
      border: 1px dashed #22c55e;
      border-radius: 10px;
      padding: 16px;
      width: fit-content;
      max-width: 90%;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      z-index: 999;
    `;

    const titulo = document.createElement("h3");
    titulo.textContent = "🏆 Resultado Final";
    titulo.style.color = "#22c55e";
    titulo.style.marginBottom = "10px";
    podium.appendChild(titulo);

    resultados.forEach((r, i) => {
      const linha = document.createElement("div");
      linha.textContent = `${i + 1}º ${r.nome} - ${r.equity}%`;
      linha.style.color = i === 0 ? "#22c55e" : "#e5e7eb";
      linha.style.fontWeight = i === 0 ? "700" : "400";
      podium.appendChild(linha);
    });

    area.appendChild(podium);
    podium.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // =========================
  // 🔄 Reset Podium
  // =========================
  window.removerPodium = function () {
    const p = document.getElementById("podium");
    if (p) p.remove();
  };

  // =========================
  // 💡 Mock MultiSim (caso ainda não exista)
  // =========================
  if (!window.MultiSim) window.MultiSim = {};

  window.MultiSim.playRound = function (players, board) {
    // Simula cálculo de equity
    const resultados = players.map((p, i) => ({
      nome: i === 0 ? "Hero" : `Vilão ${i}`,
      equity: (Math.random() * 100).toFixed(1),
    }));

    // Ordena do maior para menor
    resultados.sort((a, b) => b.equity - a.equity);

    // Chama o podium com pequeno delay para garantir renderização
    setTimeout(() => mostrarPodium(resultados), 150);
  };

  window.MultiSim.resetPlacar = function () {
    removerPodium();
  };
})();
