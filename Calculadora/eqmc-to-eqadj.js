// ===== patch-equidade-ajustada.js =====
// Substitui equity bruta pela ajustada (EqAdj) em todos os painéis e cálculos de BE

(function () {
  // Função que aplica penalização de acordo com o número de vilões
  function ajustarEquidade(eqBruta, vilaoCount) {
    // Exemplo de penalização: -4% por vilão além do primeiro
    const penalidade = Math.max(0, vilaoCount - 1) * 0.04;
    const eqAjustada = Math.max(0, eqBruta * (1 - penalidade));
    return +(eqAjustada * 100).toFixed(1); // retorna em %
  }

  // Atualiza todos os locais visuais de equity e BE
  function atualizarEquidadeAjustada() {
    try {
      const eqBrutaEl = document.querySelector('#eqMC, #equityMC, #equity-mc, .eq-mc');
      const eqAdjEl = document.querySelector('#eqAdj, #equityAdj, .eq-adj');
      const beEl = document.querySelector('#po-be, .po-be-value');

      // Detecta quantos vilões há (ajuste conforme seu script principal)
      const vilaoInput = document.querySelector('#inp-viloes, #numVilao, #vilaoCount');
      const vilaoCount = vilaoInput ? Number(vilaoInput.value || 1) : 1;

      // Captura a equidade bruta (MC)
      let eqBruta = 0;
      if (eqBrutaEl) {
        const txt = eqBrutaEl.textContent.replace('%', '').trim();
        eqBruta = parseFloat(txt) / 100;
      }

      if (!eqBruta || isNaN(eqBruta)) return;

      // Calcula equidade ajustada
      const eqAjustadaPct = ajustarEquidade(eqBruta, vilaoCount);

      // Substitui textos visuais
      if (eqBrutaEl) eqBrutaEl.textContent = `${eqAjustadaPct.toFixed(1)}%`;
      if (eqAdjEl) eqAdjEl.textContent = `${eqAjustadaPct.toFixed(1)}%`;

      // Calcula e atualiza BE baseado na equidade ajustada
      if (beEl) {
        // Fórmula padrão de BE: PotOdds / (1 + PotOdds)
        const potInput = document.querySelector('#inp-pot');
        const callInput = document.querySelector('#inp-call');
        if (potInput && callInput) {
          const pot = Number(potInput.value || 0);
          const call = Number(callInput.value || 0);
          if (pot > 0 && call > 0) {
            const potOdds = call / (pot + call);
            const bePct = (potOdds * 100).toFixed(1);
            beEl.textContent = `${bePct}%`;
          }
        }
      }
    } catch (err) {
      console.warn('Falha ao ajustar equidade:', err);
    }
  }

  // Reexecuta o patch sempre que Monte Carlo recalcula
  const observer = new MutationObserver(() => atualizarEquidadeAjustada());
  const alvo = document.body;
  if (alvo) observer.observe(alvo, { childList: true, subtree: true, characterData: true });

  // Atualiza a cada 1s também (segurança extra)
  setInterval(atualizarEquidadeAjustada, 1000);
})();
