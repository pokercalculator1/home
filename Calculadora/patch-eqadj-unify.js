// ===== patch-eqadj-unify.js =====
// Objetivo: mostrar SEMPRE a Equidade Ajustada (EqAdj) onde antes aparecia a equity bruta,
// e garantir que decisões possam ler esse valor ajustado.
// Uso: incluir após seus scripts (raise.js/pcalc-core.js/potodds.js).

(function (g) {
  // ---------- CONFIG: seletores de origem (EqAdj já correta) e destinos ----------
  const SOURCE_SELECTORS = [
    '#eqAdj', '#equityAdj', '.eq-adj',
    // Linha tipo: <div class="decision-detail">EqAdj 53.8% em 50–70%</div>
    '.decision-detail'
  ];

  const DEST_EQ_SELECTORS = [
    '#eqMC', '#equityMC', '#equity-mc', '.eq-mc',  // “Equity (MC)”
    '#po-eq', '.po-eq-value', '#eq-potodds'        // equity mostrada no bloco de pot odds, se houver
  ];

  const BE_SELECTORS = ['#po-be', '.po-be-value']; // onde o BE é exibido

  // Caso você queira aplicar uma penalização manual se não existir EqAdj na UI:
  // (ex.: 4% por vilão extra além do primeiro). Fica como fallback.
  function fallbackAjuste(eqBrutaDec, vilaoCount) {
    const pen = Math.max(0, (vilaoCount || 1) - 1) * 0.04;
    return Math.max(0, eqBrutaDec * (1 - pen));
  }

  function parsePercent(text) {
    if (!text) return null;
    const m = (text.match(/(-?\d+(?:[.,]\d+)?)\s*%/) || [])[1];
    if (!m) return null;
    return Number(String(m).replace(',', '.'));
  }

  // Lê número de vilões de vários lugares comuns
  function readVilaoCount() {
    const el = document.querySelector('#inp-viloes, #numVilao, #vilaoCount, #callers, [data-callers]');
    if (!el) return 1;
    const v = el.getAttribute('data-callers') ?? el.value ?? el.textContent;
    const n = Number(String(v).trim());
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  // Tenta obter EqAdj diretamente da UI (prioritário)
  function getEqAdjFromUI() {
    for (const sel of SOURCE_SELECTORS) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        // Caso ".decision-detail" contenha “EqAdj XX.X%”
        const pct = parsePercent(el.textContent || '');
        if (pct != null && /eqadj/i.test(el.textContent)) {
          return pct / 100; // decimal
        }
        // Caso seja um span direto com %
        if (el !== document.body) {
          const pct2 = parsePercent(el.textContent || '');
          if (pct2 != null && (/#eqadj|equityadj|eq-adj/i).test(sel)) {
            return pct2 / 100;
          }
        }
      }
    }
    return null;
  }

  // Se EqAdj não estiver visível, tenta derivar de equity MC e aplica penalização fallback
  function getEqAdjFallback() {
    // equity bruta (MC) em decimal
    let eqBruta = null;
    for (const sel of ['#eqMC', '#equityMC', '#equity-mc', '.eq-mc']) {
      const el = document.querySelector(sel);
      if (el) {
        const pct = parsePercent(el.textContent || '');
        if (pct != null) { eqBruta = pct / 100; break; }
      }
    }
    // Tentativa por estado global (se sua app expõe)
    if (eqBruta == null) {
      try {
        const st = (g.PCALC && g.PCALC.state) || g.PC?.state || {};
        if (typeof st.eqMC === 'number') eqBruta = st.eqMC; // já decimal
        else if (typeof st.equity === 'number') eqBruta = st.equity;
      } catch {}
    }
    if (eqBruta == null) return null;

    const vil = readVilaoCount();
    return fallbackAjuste(eqBruta, vil);
  }

  function fmtPct(dec) {
    return `${(dec * 100).toFixed(1)}%`;
  }

  function setText(el, text) {
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
  }

  function updateBE() {
    const potEl = document.querySelector('#inp-pot');
    const callEl = document.querySelector('#inp-call');
    if (!potEl || !callEl) return;

    const pot = Number(potEl.value || 0);
    const call = Number(callEl.value || 0);
    if (!(pot > 0 && call > 0)) return;

    // BE = call / (pot + call)
    const be = call / (pot + call);
    for (const sel of BE_SELECTORS) {
      document.querySelectorAll(sel).forEach(el => setText(el, (be * 100).toFixed(1) + '%'));
    }
  }

  // Expõe o valor “efetivo” para decisões em outros módulos
  function publishEqEffective(eqDec) {
    g.PC_EQ_ADJ = g.PC_EQ_ADJ || {};
    g.PC_EQ_ADJ.value = eqDec;           // decimal (0–1)
    g.dispatchEvent?.(new CustomEvent('pc_equity_change', { detail: { eq: eqDec, kind: 'adjusted' } }));
    // Opcional: acoplar no state, se existir
    try {
      if (g.PCALC && g.PCALC.state) g.PCALC.state.eqEffective = eqDec;
    } catch {}
  }

  let lastApplied = null;

  function applyOnce() {
    // 1) Fonte: tenta pegar EqAdj da UI; se não achar, usa fallback
    let eqAdjDec = getEqAdjFromUI();
    if (eqAdjDec == null) {
      eqAdjDec = getEqAdjFallback();
    }
    if (eqAdjDec == null || !Number.isFinite(eqAdjDec)) return;

    // Evita trabalho desnecessário
    if (lastApplied != null && Math.abs(eqAdjDec - lastApplied) < 1e-4) {
      updateBE(); // Ainda atualiza BE se pot/call mudou
      return;
    }
    lastApplied = eqAdjDec;

    // 2) Escreve EqAdj em todos os locais de equity (unificando UI)
    for (const sel of DEST_EQ_SELECTORS) {
      document.querySelectorAll(sel).forEach(el => setText(el, fmtPct(eqAdjDec)));
    }
    // Também reforça nas próprias fontes (mantém tudo consistente)
    for (const sel of SOURCE_SELECTORS) {
      document.querySelectorAll(sel).forEach(el => {
        // só altera onde já tem %
        if (/%/.test(el.textContent || '')) {
          // Se for a linha “EqAdj XX.X% em ...”, substitui só o primeiro %
          const m = el.textContent.match(/(EqAdj.*?)(-?\d+(?:[.,]\d+)?)\s*%(.*)/i);
          if (m) {
            el.textContent = `${m[1]}${(eqAdjDec * 100).toFixed(1)}%${m[3]}`;
          } else {
            setText(el, fmtPct(eqAdjDec));
          }
        }
      });
    }

    // 3) Atualiza BE (continua sendo função de pot/call)
    updateBE();

    // 4) Publica para decisões/lógica
    publishEqEffective(eqAdjDec);
  }

  // Observers para reagir a mudanças na UI
  const mo = new MutationObserver(() => applyOnce());
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // Inputs que influenciam BE
  ['#inp-pot', '#inp-call', '#inp-viloes', '#numVilao', '#vilaoCount', '#callers']
    .forEach(sel => {
      const el = document.querySelector(sel);
      el?.addEventListener?.('input', () => applyOnce());
      el?.addEventListener?.('change', () => applyOnce());
    });

  // Tenta aplicar periodicamente como fallback
  setInterval(applyOnce, 500);

  // Primeira aplicação
  applyOnce();
})(window);
