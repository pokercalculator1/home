/* ======== Patch: usar EqAdj no card lateral (auto) ======== */
(() => {
  const $ = (q, r=document) => r.querySelector(q);
  const $$= (q, r=document) => Array.from(r.querySelectorAll(q));

  // parse número em %, aceitando 12,3% ou 12.3%
  const toNumPct = (s) => {
    if (s == null) return NaN;
    const x = String(s).trim().replace('%','')
      .replace(/\.(?=\d{3}(?:\D|$))/g,'')      // 1.234 -> 1234
      .replace(/,(\d{1,2})(?!\d)/g, '.$1');    // 12,3 -> 12.3
    const n = parseFloat(x);
    return Number.isFinite(n) ? n : NaN;
  };
  const fmtPct = v => Number.isFinite(v) ? v.toFixed(1) + '%' : '—';

  // 1) Lê EqAdj de qualquer lugar da página
  function readEqAdjFromDOM() {
    // procura algo como "EqAdj 6.2%" / "EqAdj: 41,2%"
    const nodes = $$('div,span,small,p,li,td,th,strong,b,em');
    for (const el of nodes) {
      const t = (el.textContent || '').trim();
      const m = t.match(/EqAdj\s*[:=]?\s*([\d.,]+)%/i);
      if (m) {
        const v = toNumPct(m[1]);
        if (Number.isFinite(v)) return v; // em %
      }
    }
    // fallback: em .decision-detail
    const dd = $('.decision-detail');
    if (dd) {
      const m = (dd.textContent||'').match(/EqAdj\s*[:=]?\s*([\d.,]+)%/i);
      if (m) {
        const v = toNumPct(m[1]);
        if (Number.isFinite(v)) return v;
      }
    }
    return NaN;
  }

  // 2) Encontra o card lateral de Pot Odds
  function findPotCard() {
    // layout mais comum
    let host = $('#pcalc-sugestao');
    if (!host) {
      // fallback: procura um bloco que contenha "Informações do Pot Odd"
      host = $$('section,div,article').find(el =>
        /informações do pot odd/i.test((el.textContent||'').toLowerCase())
      );
    }
    if (!host) return null;

    // o card costuma ser um filho com grid e título
    let card = host.querySelector('.raise-potodds.card');
    if (!card) {
      card = $$('div,section,article', host).find(el =>
        /informações do pot odd/i.test((el.textContent||'').toLowerCase())
      );
    }
    return card || null;
  }

  // 3) Atualiza/insere a linha de Equity do card para usar EqAdj
  function applyEqAdjToCard(eqAdjPct, card) {
    if (!card) return;

    // Título → "EqAdj × BE (teste)"
    const titleEl = card.firstElementChild;
    if (titleEl) titleEl.textContent = 'EqAdj × BE (teste)';

    // container em grid (normalmente 2º filho)
    const grid = card.children[1] || card;

    // a) esconda linhas antigas de equity (MC ou MC×Multi×Wet)
    const labelCells = $$('.raise-potodds.card div, .raise-potodds.card span', card);
    for (const el of labelCells) {
      const txt = (el.textContent||'').trim();
      if (/^Equity\s*\((?:MC|MC×Multi×Wet|EqAdj)\)/i.test(txt)) {
        // se for uma célula "label", tente pegar a próxima (valor)
        const row = el.parentElement;
        if (row) {
          // se for a label antiga, vamos reaproveitar a linha depois; por ora marca para remoção
          row.dataset._oldEquity = '1';
        }
      }
    }
    // remove linhas antigas marcadas
    $$('.raise-potodds.card [data-_oldEquity="1"]', card).forEach(n => n.remove());

    // b) tente achar uma linha "Equity" existente (genérica)
    let equityLabelCell = Array.from(grid.children).find(n => /Equity/i.test((n.textContent||'').trim()));
    let valueCell = null;

    // estratégia: se a grid é pareada (label, valor, label, valor...), vamos inserir um novo par
    const row = document.createElement('div');
    const rowVal = document.createElement('div');
    row.textContent = 'Equity (EqAdj)';
    rowVal.innerHTML = `<b>${fmtPct(eqAdjPct)}</b>`;

    // insere perto do BE, se possível
    const cells = Array.from(grid.children);
    const beIdx = cells.findIndex(n => /BE\s*\(pot\s*odds\)/i.test((n.textContent||'').trim()));
    if (beIdx >= 0) {
      // BE ocupa label+valor => inserir após esse par
      const insertPos = Math.min(cells.length, beIdx + 2);
      if (insertPos >= cells.length) {
        grid.appendChild(row);
        grid.appendChild(rowVal);
      } else {
        grid.insertBefore(row, grid.children[insertPos]);
        grid.insertBefore(rowVal, grid.children[insertPos+1]);
      }
    } else {
      // fallback: adiciona no fim
      grid.appendChild(row);
      grid.appendChild(rowVal);
    }

    // marca o card como "patcheado"
    card.dataset.eqadjApplied = '1';
  }

  // 4) Loop de atualização — só troca quando o EqAdj já existir
  let lastApplied = '';
  function tick() {
    const card = findPotCard();
    if (!card) return;

    const eqAdj = readEqAdjFromDOM(); // em %
    if (!Number.isFinite(eqAdj)) {
      // ainda não apareceu EqAdj — não faz nada, mantém MC até aparecer
      return;
    }

    const sig = eqAdj.toFixed(2);
    if (sig === lastApplied && card.dataset.eqadjApplied === '1') return;

    // antes de aplicar, restaura conteúdo original se já tínhamos patcheado
    if (!card.dataset._snap) card.dataset._snap = card.innerHTML;

    // limpa linhas "Equity (...)" existentes (para evitar duplicar)
    const oldRows = Array.from((card.children[1] || card).children)
      .filter(n => /Equity/i.test((n.textContent||'').trim()));
    oldRows.forEach(n => n.remove());

    applyEqAdjToCard(eqAdj, card);
    lastApplied = sig;

    console.log('[EqAdj×BE] aplicado:', sig + '%');
  }

  // 5) Observa mudanças para reaplicar (MC costuma aparecer antes do EqAdj)
  const mo = new MutationObserver(() => { try { tick(); } catch(e) {} });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });

  const iv = setInterval(tick, 300);
  tick();

  // util pra desligar e restaurar o card
  window.__EQADJ_PATCH_OFF__ = () => {
    clearInterval(iv);
    mo.disconnect();
    const card = findPotCard();
    if (card && card.dataset._snap) {
      card.innerHTML = card.dataset._snap;
      delete card.dataset._snap;
      delete card.dataset.eqadjApplied;
    }
    console.log('EqAdj×BE patch: OFF (restaurado)');
  };
})();
