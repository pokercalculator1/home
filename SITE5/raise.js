// raise.js — Pot Odds sempre visível + switch para injetar decisão (Call/Fold/Indiferente) no texto padrão
// Lê equity (Win + Tie/2) de PC.state ou da UI sem alterar o app.js.
// API pública:
//   RAISE.init({ mountSelector, suggestSelector, onUpdateText, ...opts })
//   RAISE.setState({ potAtual, toCall, equityPct, rakePct, rakeCap, useDecisionInjection })
//   RAISE.getRecommendation()   // { bePct, equityPct, rec } do último cálculo
//   RAISE.setUsePotOdds(bool)   // mantém compat — não oculta o card
(function (g) {
  var DEFAULTS = {
    mountSelector: '#pcalc-toolbar',
    suggestSelector: '#pcalc-sugestao',
    potOddsCompact: true,

    // chaves usuais no PC.state (se existirem)
    potKey: 'potAtual',
    toCallKey: 'toCall',
    equityKey: 'equityPct', // % pronta
    winKey: 'win',          // 0..1 ou 0..100
    tieKey: 'tie',

    readState: function () {
      var PC = g.PC || g.PCALC || {};
      var st = PC.state || {};

      var eqPct = num(st[DEFAULTS.equityKey]); // 0..100
      if (!isFinite(eqPct)) {
        var winS = num(st[DEFAULTS.winKey]);
        var tieS = num(st[DEFAULTS.tieKey]);
        if (isFinite(winS)) {
          if (winS > 1) winS = winS/100;
          if (isFinite(tieS)) tieS = (tieS > 1 ? tieS/100 : tieS);
          eqPct = clamp01pct((winS + (isFinite(tieS)? tieS/2 : 0))*100);
        }
      }
      if (!isFinite(eqPct)) {
        var domEq = extractEquityFromDOM(); // 0..100
        if (isFinite(domEq)) eqPct = domEq;
      }
      if (!isFinite(eqPct)) eqPct = 50;

      var potAtual = num(st[DEFAULTS.potKey]); if(!isFinite(potAtual)) potAtual=0;
      var toCall   = num(st[DEFAULTS.toCallKey]); if(!isFinite(toCall)) toCall=0;

      return {
        potAtual: potAtual,
        toCall: toCall,
        equityPct: eqPct,
        rakePct: num(st.rakePct) || 0,
        rakeCap: (st.rakeCap != null ? Number(st.rakeCap) : Infinity)
      };
    },
    onUpdateText: null
  };

  var state = {
    mounted: false,
    elements: {},
    usePotOdds: true,          // compat; não oculta o card
    injectDecision: false,     // <<< switch (cinza/verde): se true injeta a decisão no texto padrão
    lastPotOdds: null,
    _cfg: null,
    overrides: { potAtual: undefined, toCall: undefined, equityPct: undefined, rakePct: undefined, rakeCap: undefined },
    observers: []
  };

  // ===== Utils
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function num(x){ var n=Number(x); return isFinite(n)?n:NaN; }
  function clamp01pct(p){ return Math.max(0, Math.min(100, +Number(p).toFixed(1))); }

  // parser pt/intl: “16.1”, “16,1”, “1.234,5”, “1,234.5”
  function parseFlexibleNumber(raw){
    if(raw==null) return NaN;
    var s = String(raw).trim(); if(!s) return NaN;
    var hasDot = s.includes('.'), hasComma = s.includes(',');
    if (hasDot && hasComma){
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',', '.');
      else s = s.replace(/,/g,'');
    } else if (hasComma){ s = s.replace(',', '.'); }
    var n = parseFloat(s); return isFinite(n)? n : NaN;
  }
  function matchPct(text, re){
    var m = (text||'').match(re);
    if (!m) return NaN;
    return parseFlexibleNumber(m[1]);
  }
  function extractEquityFromDOM(){
    var br = document.getElementById('eqBreak');
    if (br) {
      var txt = br.textContent || '';
      var win = matchPct(txt, /Win:\s*([\d.,]+)%/i);
      var tie = matchPct(txt, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(win)) {
        var eq = win + (isFinite(tie)? tie/2 : 0);
        return clamp01pct(eq);
      }
    }
    var bar = document.getElementById('eqBarWin');
    if (bar && bar.style && bar.style.width){
      var w = parseFlexibleNumber((bar.style.width||'').replace('%',''));
      if (isFinite(w)) return clamp01pct(w);
    }
    var nodes = Array.from(document.querySelectorAll('div,span,small,p,li,td,th'));
    var node = nodes.find(n => /Win:\s*[\d.,]+%/i.test(n.textContent||''));
    if (node){
      var t = node.textContent || '';
      var w2 = matchPct(t, /Win:\s*([\d.,]+)%/i);
      var t2 = matchPct(t, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(w2)) return clamp01pct(w2 + (isFinite(t2)? t2/2 : 0));
    }
    return NaN;
  }

  // ===== Pot Odds/Decisão
  function potOddsBE(potAtual, toCall, rakePct, rakeCap){
    potAtual = Number(potAtual||0);
    toCall   = Number(toCall||0);
    rakePct  = Number(rakePct||0);
    rakeCap  = (rakeCap==null)?Infinity:Number(rakeCap);
    var potFinal = potAtual + toCall;
    var rake = Math.min(potFinal * rakePct, rakeCap);
    var potFinalEfetivo = Math.max(0, potFinal - rake);
    var be = toCall / (potFinalEfetivo || 1); // 0..1
    return { be: be, bePct: +(be*100).toFixed(1), potFinal: potFinal, potFinalEfetivo: potFinalEfetivo, rake: rake };
  }
  function decideVsRaise(potAtual, toCall, equityPct, rakePct, rakeCap){
    var r = potOddsBE(potAtual, toCall, rakePct, rakeCap);
    var bePct = r.bePct;
    var eq    = Number(equityPct||0);
    var buffer = 3; // zona cinza ±3pp
    var rec = 'Indiferente';
    if(eq >= bePct + buffer) rec = 'Call';
    else if(eq <= bePct - buffer) rec = 'Fold';
    return {
      bePct: bePct,
      equityPct: +eq.toFixed(1),
      rec: rec,
      potFinal: r.potFinal,
      potFinalEfetivo: r.potFinalEfetivo,
      rake: r.rake
    };
  }

  // ===== Estilos (inclui a “chavinha” cinza/verde)
  function ensureCSS(){
    if ($('#raise-css-hook')) return;
    var css = ''
      + '#pcalc-toolbar{border:1px dashed #334155;border-radius:5px;padding:8px}\n'
      + '.raise-bar{display:flex;gap:.9rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}\n'
      + '.field{display:flex;align-items:center;gap:.6rem}\n'
      + '.fld-label{color:#93c5fd;font-weight:600;white-space:nowrap}\n'
      + '.input-modern input{width:110px;padding:.48rem .6rem;border:1px solid #334155;'
        + 'background:#0f172a;color:#e5e7eb;border-radius:.6rem;outline:0}\n'
      + '.raise-potodds.card{background:#0b1324;border:1px solid #22304a;border-radius:10px;padding:10px;line-height:1.2}\n'
      /* switch iOS-like */
      + '.rsw{position:relative;display:inline-block;width:48px;height:26px}\n'
      + '.rsw input{opacity:0;width:0;height:0}\n'
      + '.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#475569;border-radius:26px;transition:.25s}\n'
      + '.slider:before{position:absolute;content:"";height:20px;width:20px;left:3px;top:3px;background:#0b1324;border-radius:50%;transition:.25s}\n'
      + '.rsw input:checked + .slider{background:#22c55e}\n'
      + '.rsw input:checked + .slider:before{transform:translateX(22px)}\n';
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ===== UI
  function buildPotInputs(initialPot, initialCall){
    var potWrap = el('div','field');
    var potLbl  = el('span','fld-label'); potLbl.textContent='Pot (fichas):';
    var potInpW = el('div','input-modern'); potInpW.innerHTML='<input id="inp-pot" type="number" step="1" min="0" placeholder="ex: 1200">';
    potWrap.appendChild(potLbl); potWrap.appendChild(potInpW);

    var callWrap = el('div','field');
    var callLbl  = el('span','fld-label'); callLbl.textContent='A pagar (fichas):';
    var callInpW = el('div','input-modern'); callInpW.innerHTML='<input id="inp-call" type="number" step="1" min="0" placeholder="ex: 400">';
    callWrap.appendChild(callLbl); callWrap.appendChild(callInpW);

    var potInp  = potInpW.querySelector('input');
    var callInp = callInpW.querySelector('input');
    if (isFinite(initialPot) && initialPot>0) potInp.value = String(initialPot);
    if (isFinite(initialCall) && initialCall>0) callInp.value = String(initialCall);

    return { potWrap, callWrap, potInput: potInp, callInput: callInp };
  }

  function renderControls(cfg){
    var mount = $(cfg.mountSelector);
    if (!mount) return null;

    var bar = el('div', 'raise-bar');

    // (1) Switch: injetar decisão no texto padrão (cinza → verde)
    var injWrap = el('div','field');
    var injLbl  = el('span','fld-label'); injLbl.textContent = 'Decisão do Raise:';
    var injRsw  = el('label','rsw');
    var injCb   = document.createElement('input'); injCb.type='checkbox'; injCb.id='rsw-inject';
    var injSl   = el('span','slider');
    injRsw.appendChild(injCb); injRsw.appendChild(injSl);
    injWrap.appendChild(injLbl); injWrap.appendChild(injRsw);

    // (2) Pot/A pagar (fichas)
    var st0 = cfg.readState();
    var pots= buildPotInputs(st0.potAtual, st0.toCall);

    bar.appendChild(injWrap);
    bar.appendChild(pots.potWrap);
    bar.appendChild(pots.callWrap);
    mount.appendChild(bar);

    // Estado inicial do switch
    injCb.checked = !!state.injectDecision;

    // Eventos
    injCb.addEventListener('change', function(){
      state.injectDecision = !!injCb.checked;
      updateSuggestion(cfg);
    });
    if (pots.potInput) pots.potInput.addEventListener('input', function(){
      var v = Number(pots.potInput.value||0);
      state.overrides.potAtual = isFinite(v)?v:0;
      updateSuggestion(cfg);
    });
    if (pots.callInput) pots.callInput.addEventListener('input', function(){
      var v = Number(pots.callInput.value||0);
      state.overrides.toCall = isFinite(v)?v:0;
      updateSuggestion(cfg);
    });

    return { injCb: injCb, potInput: pots.potInput, callInput: pots.callInput };
  }

  function renderPotOddsUI(ctx, cfg){
    var out = $(cfg.suggestSelector);
    if(!out) return;
    var result = computeDecision(ctx);
    state.lastPotOdds = result;

    out.innerHTML = `
      <div class="raise-potodds card">
        <div style="font-weight:700;margin-bottom:6px">Pot Odds (vs Raise) — Compacto</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          <div>Pot (fichas)</div><div><b>${ctx.potAtual ? ctx.potAtual.toFixed(0) : '—'}</b></div>
          <div>A pagar (fichas)</div><div><b>${ctx.toCall ? ctx.toCall.toFixed(0) : '—'}</b></div>
          <div>BE (pot odds)</div><div><b>${result.bePct}%</b></div>
          <div>Equity (MC)</div><div><b>${result.equityPct}%</b></div>
          <div>Recomendação</div>
          <div><span id="po-rec" style="padding:2px 8px;border-radius:999px;border:1px solid #22304a">${result.rec}</span></div>
        </div>
      </div>`;
    var pill = out.querySelector('#po-rec');
    if (pill){
      var c = result.rec === 'Call' ? '#10b981' : (result.rec === 'Fold' ? '#ef4444' : '#f59e0b');
      pill.style.background = c + '22';
      pill.style.borderColor = c + '66';
      pill.style.color = '#e5e7eb';
    }

    // Se a chavinha estiver ligada, injeta no texto padrão do app
    if (state.injectDecision && typeof DEFAULTS.onUpdateText === 'function'){
      DEFAULTS.onUpdateText(`Raise Equity: ${result.rec} (BE ${result.bePct}% | EQ ${result.equityPct}%)`);
    }
  }

  function computeDecision(ctx){
    var potAtual = Number(ctx.potAtual || 0);
    var toCall   = Number(ctx.toCall   || 0);
    var equity   = Number(ctx.equityPct!= null ? ctx.equityPct : 50);
    var rakePct  = Number(ctx.rakePct  || 0);
    var rakeCap  = (ctx.rakeCap===Infinity || ctx.rakeCap==null) ? Infinity : Number(ctx.rakeCap);
    return decideVsRaise(potAtual, toCall, equity, rakePct, rakeCap);
  }

  function updateSuggestion(cfg){
    var st = cfg.readState();

    // overrides dos inputs em fichas
    var potAtual = (state.overrides.potAtual != null ? state.overrides.potAtual : st.potAtual);
    var toCall   = (state.overrides.toCall   != null ? state.overrides.toCall   : st.toCall);
    var equity   = (state.overrides.equityPct!= null ? state.overrides.equityPct: st.equityPct);
    var rakePct  = (state.overrides.rakePct  != null ? state.overrides.rakePct  : st.rakePct);
    var rakeCap  = (state.overrides.rakeCap  != null ? state.overrides.rakeCap  : st.rakeCap);

    var ctx = { potAtual, toCall, equityPct: equity, rakePct, rakeCap };
    renderPotOddsUI(ctx, cfg);
  }

  // Observa UI para reagir ao Monte Carlo
  function attachDOMObservers(){
    detachDOMObservers();
    var br = document.getElementById('eqBreak');
    if (br && g.MutationObserver){
      var mo1 = new MutationObserver(function(){ if (state._cfg) updateSuggestion(state._cfg); });
      mo1.observe(br, { childList:true, subtree:true, characterData:true });
      state.observers.push(mo1);
    }
    var bar = document.getElementById('eqBarWin');
    if (bar && g.MutationObserver){
      var mo2 = new MutationObserver(function(muts){
        if (muts.some(m => m.attributeName === 'style') && state._cfg) updateSuggestion(state._cfg);
      });
      mo2.observe(bar, { attributes:true, attributeFilter:['style'] });
      state.observers.push(mo2);
    }
    [50, 250, 750].forEach(function(ms){
      setTimeout(function(){ if (state._cfg) updateSuggestion(state._cfg); }, ms);
    });
  }
  function detachDOMObservers(){
    (state.observers||[]).forEach(function(mo){ try{ mo.disconnect(); }catch(_){ } });
    state.observers = [];
  }

  // ===== API
  var API = {
    init: function(userCfg){
      if (state.mounted) return;
      ensureCSS();
      var cfg = {};
      userCfg = userCfg || {};
      for (var k in DEFAULTS) cfg[k] = DEFAULTS[k];
      for (var k2 in userCfg)   cfg[k2] = userCfg[k2];

      var els = renderControls(cfg);
      if (!els){
        console.warn('[raise] mountSelector nao encontrado:', cfg.mountSelector);
        return;
      }
      state.elements = els;
      state.mounted  = true;
      state._cfg     = cfg;

      attachDOMObservers();
      updateSuggestion(cfg);
    },

    setState: function(patch){
      patch = patch || {};

      if ('useDecisionInjection' in patch) {
        state.injectDecision = !!patch.useDecisionInjection;
        if (state.elements.injCb) state.elements.injCb.checked = state.injectDecision;
      }
      if ('potAtual'  in patch) state.overrides.potAtual  = (patch.potAtual==null?undefined:Number(patch.potAtual));
      if ('toCall'    in patch) state.overrides.toCall    = (patch.toCall==null?undefined:Number(patch.toCall));
      if ('equityPct' in patch) state.overrides.equityPct = (patch.equityPct==null?undefined:Number(patch.equityPct));
      if ('rakePct'   in patch) state.overrides.rakePct   = (patch.rakePct==null?undefined:Number(patch.rakePct));
      if ('rakeCap'   in patch) state.overrides.rakeCap   = (patch.rakeCap==null?undefined:Number(patch.rakeCap));

      if (state._cfg) updateSuggestion(state._cfg);
    },

    getRecommendation: function(){
      return state.lastPotOdds || null;
    },

    setUsePotOdds: function(flag){
      state.usePotOdds = !!flag; // compat
      if (state._cfg) updateSuggestion(state._cfg);
    }
  };

  g.RAISE = API;

})(window);
