// raise.js — Pot Odds + Equity (MC) + "Equity (AJUSTADA)" espelhada do painel
// Autor: ChatGPT — 2025-10-09
// Este arquivo é auto-contido e NÃO quebra seu layout: só adiciona a linha "Equity (AJUSTADA)".
// Requisitos de UI (IDs opcionais, mas recomendados):
//   #rsw-inject (checkbox "Houve Ação?"), #inp-pot (número Pot), #inp-call (número A pagar), #btn-raise-send (button)
// Você também pode usar apenas a API: window.RaisePotOdds.update({ potAtual, toCall })

(function (g) {
  'use strict';

  // =========================
  // Utilitários
  // =========================
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmtInt = v => Number.isFinite(v) ? Math.round(v).toString() : '—';
  const fmtPct = v => Number.isFinite(v) ? (v*100).toFixed(1) + '%' : '—';

  // =========================
  // Leitura da EqAdj do DOM
  // =========================
  // Procura por um nó que contenha "EqAdj xx.x%"
  function findEqAdjNode(root=document) {
    const nodes = root.querySelectorAll('.decision-detail, .metric, .stat-line, p, div, li, span');
    for (const el of nodes) {
      if (/EqAdj\s*[\d.,]+\s*%/i.test(el.textContent || '')) return el;
    }
    return null;
  }

  // Extrai o número (0–1) a partir do texto "EqAdj xx.x%"
  function parseEqAdj(node) {
    if (!node) return NaN;
    const m = (node.textContent || '').match(/EqAdj\s*([\d.,]+)\s*%/i);
    if (!m) return NaN;
    const v = parseFloat(m[1].replace(',', '.'));
    return Number.isFinite(v) ? v/100 : NaN;
  }

  // Lê Equity (MC) se existir em alguma variável global comum
  function readEqMC() {
    // Tente variáveis comuns do seu app
    const candidates = [
      g.eqMC, g.equityMC, g.eq_mc, g.eqBruta, g.equity, g.eq, g.eqMonteCarlo
    ].map(v => (typeof v === 'number' ? v : NaN));
    const hit = candidates.find(Number.isFinite);
    if (Number.isFinite(hit)) return clamp(hit, 0, 1);

    // Fallback: tentar raspar alguma "% (MC)" que você exiba em outro lugar
    const mcNode = $$('.decision-detail, .metric, .stat-line, div, span, li, p')
      .find(el => /Equity\s*\(MC\)\s*[: ]/i.test(el.textContent || ''));
    if (mcNode) {
      const m = mcNode.textContent.match(/([\d.,]+)\s*%/);
      if (m) {
        const v = parseFloat(m[1].replace(',', '.'))/100;
        if (Number.isFinite(v)) return clamp(v, 0, 1);
      }
    }
    return NaN;
  }

  // =========================
  // Cálculo Pot Odds + Recomendação
  // =========================
  function computePotOdds(pot, call) {
    const P = Number(pot);
    const C = Number(call);
    if (!(P >= 0) || !(C >= 0) || (P+ C) <= 0) {
      return { be: NaN, bePct: '—' };
    }
    const be = C / (P + C); // Break-even
    return { be, bePct: fmtPct(be) };
  }

  function decideRecommendation(eq, be) {
    if (!Number.isFinite(eq) || !Number.isFinite(be)) return { label: '—', color: '#888' };

    const edge = eq - be; // margem sobre o BE
    // Regras simples e claras:
    // edge >= +3pp -> Pague/Aposte
    // -3pp < edge < +3pp -> Marginal / Indiferente
    // edge <= -3pp -> Desista
    if (edge >= 0.03) return { label: 'Pague a aposta', color: '#10b981' };      // verde
    if (edge <= -0.03) return { label: 'Desista', color: '#ef4444' };           // vermelho
    return { label: 'Decisão marginal', color: '#f59e0b' };                      // amarelo
  }

  // =========================
  // Render do Cartão
  // =========================
  // Cria/atualiza o cartão dentro de um contêiner "natural":
  // 1) primeiro tenta um contêiner ao lado da EqAdj original
  // 2) senão usa body
  function getHost() {
    const src = findEqAdjNode();
    if (src && src.parentElement) return src.parentElement;
    return document.body;
  }

  // Constrói (ou atualiza) o HTML do cartão
  function renderPanel(ctx) {
    const host = getHost();
    if (!host) return;

    // Lê EqAdj do DOM (espelho)
    const src = findEqAdjNode();
    const eqAdj = parseEqAdj(src); // 0–1 ou NaN
    const eqMC = readEqMC();       // 0–1 ou NaN

    const pot = Number(ctx?.potAtual);
    const call = Number(ctx?.toCall);

    const { be, bePct } = computePotOdds(pot, call);

    // Escolha de equity para decisão do Pot Odds: se tiver ajustada, priorize
    const eqForDecision = Number.isFinite(eqAdj) ? eqAdj : (Number.isFinite(eqMC) ? eqMC : NaN);

    const rec = decideRecommendation(eqForDecision, be);

    // Monta/acha o contêiner do cartão
    let out = $('#raise-potodds-out', host);
    if (!out) {
      out = document.createElement('div');
      out.id = 'raise-potodds-out';
      host.appendChild(out);
    }

    // HTML do cartão (não removemos nada do host além de atualizar nosso próprio nó)
    const eqMCLabel = Number.isFinite(eqMC) ? fmtPct(eqMC) : '—';
    const eqAdjLabel = Number.isFinite(eqAdj) ? fmtPct(eqAdj) : '—';

    out.innerHTML = `
      <div class="raise-potodds card" style="background:#0b1324;border:1px solid #22304a;border-radius:10px;padding:10px;line-height:1.2">
        <div style="font-weight:700;margin-bottom:6px">Informações do Pot Odd</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          <div>Pot (fichas)</div><div><b>${fmtInt(pot)}</b></div>
          <div>A pagar (fichas)</div><div><b>${fmtInt(call)}</b></div>
          <div>BE (pot odds)</div><div><b>${bePct}</b></div>
          <div>Equity (MC)</div><div><b>${eqMCLabel}</b></div>
          ${Number.isFinite(eqAdj) ? `
            <div>Equity (AJUSTADA)</div><div><b>${eqAdjLabel}</b></div>
          ` : ``}
          <div>Recomendação</div>
          <div><span id="po-rec" style="padding:2px 8px;border-radius:999px;border:1px solid #22304a">${rec.label}</span></div>
        </div>
      </div>`;

    const pill = out.querySelector('#po-rec');
    if (pill) {
      pill.style.background = rec.color + '22';
      pill.style.borderColor = rec.color + '66';
      pill.style.color = '#e5e7eb';
    }
  }

  // =========================
  // Observer: re-render quando EqAdj muda
  // =========================
  let eqObserver = null;

  function watchEqAdj() {
    try { eqObserver?.disconnect(); } catch {}
    const src = findEqAdjNode();
    if (!src) return;
    eqObserver = new MutationObserver(() => {
      // Quando o texto "EqAdj xx.x%" mudar, re-renderiza usando o contexto atual
      renderPanel(currentCtx);
    });
    eqObserver.observe(src, { characterData: true, childList: true, subtree: true });
  }

  // =========================
  // Bind dos inputs opcionais (Houve Ação?, Pot, A pagar)
  // =========================
  function readCtxFromInputs() {
    const pot = Number($('#inp-pot')?.value);
    const call = Number($('#inp-call')?.value);
    return {
      potAtual: Number.isFinite(pot) ? pot : NaN,
      toCall: Number.isFinite(call) ? call : NaN
    };
  }

  function wireInputs() {
    const rsw = $('#rsw-inject');
    const pot = $('#inp-pot');
    const call = $('#inp-call');
    const btn = $('#btn-raise-send');

    const trigger = () => {
      const ctx = readCtxFromInputs();
      // só calcula se “Houve Ação?” estiver marcado (se existir o switch)
      if (!rsw || rsw.checked) {
        window.RaisePotOdds.update(ctx);
      }
    };

    [rsw, pot, call].forEach(el => el && el.addEventListener('change', trigger));
    btn && btn.addEventListener('click', trigger);
  }

  // =========================
  // API pública
  // =========================
  let currentCtx = { potAtual: NaN, toCall: NaN };

  const API = {
    init(ctx) {
      if (ctx && typeof ctx === 'object') currentCtx = { ...currentCtx, ...ctx };
      wireInputs();
      watchEqAdj();           // observa a EqAdj para auto-atualizar
      renderPanel(currentCtx); // render inicial
    },
    update(ctx) {
      if (ctx && typeof ctx === 'object') currentCtx = { ...currentCtx, ...ctx };
      // sempre que atualizar, revalida observador (caso o app troque o nó da EqAdj)
      watchEqAdj();
      renderPanel(currentCtx);
    }
  };

  // expõe global
  g.RaisePotOdds = API;

  // Auto-init leve (não quebra se os inputs não existirem)
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => API.init(readCtxFromInputs()))
    : API.init(readCtxFromInputs());

})(window);
