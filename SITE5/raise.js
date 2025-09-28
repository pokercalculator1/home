// raise.js — "Tomei Raise" com Equity automática (Win + Tie/2) e calculadora em FICHAS
// Sem tocar no app.js: lê Win/Tie da UI ou de PC.state.
// API pública:
//   window.RAISE.init({ mountSelector, suggestSelector, onUpdateText, readState, ...opts })
//   window.RAISE.setState(patch)                 // { tomeiRaise, potAtual, toCall, equityPct, rakePct, rakeCap }
//   window.RAISE.getRecommendation()             // último cálculo de Pot Odds (quando ligado) ou texto padrão
//   window.RAISE.setUsePotOdds(bool)             // liga/desliga mini calculadora
(function (g) {
  // ===== Config =====
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

      var ek  = DEFAULTS.equityKey || 'equityPct';
      var pk  = DEFAULTS.potKey     || 'potAtual';
      var ck  = DEFAULTS.toCallKey  || 'toCall';
      var wk  = DEFAULTS.winKey     || 'win';
      var tk  = DEFAULTS.tieKey     || 'tie';

      // 1) equityPct direta (0..100)
      var eqPct = toNum(st[ek]);

      // 2) senão, usa win/tie do state (aceita 0..1 ou 0..100)
      if (!isFinite(eqPct)) {
        var winS = toNum(st[wk]);
        var tieS = toNum(st[tk]);
        if (isFinite(winS)) {
          if (winS > 1) winS = winS/100;
          if (isFinite(tieS)) tieS = (tieS > 1 ? tieS/100 : tieS);
          var eqFromState = (winS + (isFinite(tieS)? tieS/2 : 0)) * 100;
          eqPct = clamp01pct(eqFromState);
        }
      }

      // 3) se ainda não deu, extrai da UI (DOM) — Win + Tie/2
      if (!isFinite(eqPct)) {
        var domEq = extractEquityFromDOM(); // % (0..100)
        if (isFinite(domEq)) eqPct = domEq;
      }

      // 4) fallback
      if (!isFinite(eqPct)) eqPct = 50;

      // Pot/ToCall em fichas
      var potAtual = toNum(st[pk]);   if (!isFinite(potAtual)) potAtual = 0;
      var toCall   = toNum(st[ck]);   if (!isFinite(toCall))   toCall   = 0;

      return {
        potAtual: potAtual,
        toCall: toCall,
        equityPct: eqPct,
        rakePct: toNum(st.rakePct) || 0,
        rakeCap: (st.rakeCap != null ? Number(st.rakeCap) : Infinity)
      };
    },
    onUpdateText: null
  };

  // ===== Estado =====
  var state = {
    mounted: false,
    elements: {},
    tomeiRaise: false,   // agora controlado via botão toggle
    usePotOdds: true,
    lastPotOdds: null,
    _cfg: null,
    overrides: { potAtual: undefined, toCall: undefined, equityPct: undefined, rakePct: undefined, rakeCap: undefined },
    observers: []
  };

  // ===== Utils =====
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function clamp01pct(p){ return Math.max(0, Math.min(100, +Number(p).toFixed(1))); }
  function toNum(x){ var n = Number(x); return isFinite(n) ? n : NaN; }

  // Parser robusto: "16.1", "16,1", "1.234,5", "1,234.5"
  function parseFlexibleNumber(raw){
    if(raw==null) return NaN;
    var s = String(raw).trim();
    if(!s) return NaN;
    var hasDot = s.indexOf('.') >= 0;
    var hasComma = s.indexOf(',') >= 0;

    if (hasDot && hasComma){
      // último separador é o decimal
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g,'').replace(',', '.'); // 1.234,5 → 1234.5
      } else {
        s = s.replace(/,/g,''); // 1,234.5 → 1234.5
      }
    } else if (hasComma){
      s = s.replace(',', '.');  // 16,1 → 16.1
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }
  function matchPct(text, re){
    var m = (text||'').match(re);
    if (!m) return NaN;
    return parseFlexibleNumber(m[1]);
  }

  // Extrai equity da UI: Win + Tie/2
  function extractEquityFromDOM(){
    // 1) #eqBreak: "Win: X% ... Tie: Y% ..."
    var br = document.getElementById('eqBreak');
    if (br) {
      var txt = br.textContent || '';
      var win = matchPct(txt, /Win:\s*([\d.,]+)%/i);
      var tie = matchPct(txt, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(win)) {
        var eq = win + (isFinite(tie) ? tie/2 : 0);
        return clamp01pct(eq);
      }
    }
    // 2) barra de Win
    var bar = document.getElementById('eqBarWin');
    if (bar && bar.style && bar.style.width){
      var w = parseFlexibleNumber((bar.style.width||'').replace('%',''));
      if (isFinite(w)) return clamp01pct(w); // se não tiver Tie na UI, melhor que nada
    }
    // 3) varredura geral (fallback)
    var nodes = Array.from(document.querySelectorAll('div,span,small,p,li,td,th'));
    var node = nodes.find(n => /Win:\s*[\d.,]+%/i.test(n.textContent||''));
    if (node){
      var t = node.textContent || '';
      var win2 = matchPct(t, /Win:\s*([\d.,]+)%/i);
      var tie2 = matchPct(t, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(win2)) {
        var eq2 = win2 + (isFinite(tie2) ? tie2/2 : 0);
        return clamp01pct(eq2);
      }
    }
    return NaN;
  }

  // Pot Odds
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
      + '.toggle-btn{display:inline-flex;align-items:center;gap:.5rem;border:1px solid #334155;'
        + 'background:#0f172a;color:#e5e7eb;border-radius:.7rem;padding:.5rem .75rem;cursor:pointer;user-select:none}\n'
      + '.toggle-btn.on{background:#14532d;border-color:#166534}\n'
      + '.toggle-dot{width:10px;height:10px;border-radius:50%;background:#475569}\n'
      + '.toggle-btn.on .toggle-dot{background:#10b981}\n';
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ===== UI helpers =====
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

  // ===== UI / Montagem =====
  function renderControls(cfg){
    var mount = $(cfg.mountSelector);
    if (!mount) return null;

    var bar = el('div', 'raise-bar');

    // (1) Botão Toggle: Tomei Raise
    var raiseWrap = el('div','field');
    var lblTxt = el('span','fld-label'); lblTxt.textContent = 'Situação:';
    var btn = el('button','toggle-btn'); btn.type='button';
    btn.innerHTML = '<span class="toggle-dot"></span><span id="tg-label">Sem Raise</span>';
    raiseWrap.appendChild(lblTxt); raiseWrap.appendChild(btn);

    // (2) Calculadora: Pot / A pagar (FICHAS)
    var st0   = cfg.readState();
    var pots  = buildPotInputs(st0.potAtual, st0.toCall);

    // Montagem
    bar.appendChild(raiseWrap);
    bar.appendChild(pots.potWrap);
    bar.appendChild(pots.callWrap);
    mount.appendChild(bar);

    // Estado inicial do botão
    syncToggleVisual(btn, state.tomeiRaise);

    // Eventos
    btn.addEventListener('click', function(){
      state.tomeiRaise = !state.tomeiRaise;
      syncToggleVisual(btn, state.tomeiRaise);
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

    return {
      bar: bar,
      toggleBtn: btn,
      potInput: pots.potInput,
      callInput: pots.callInput
    };
  }

  function syncToggleVisual(btn, on){
    if(!btn) return;
    btn.classList.toggle('on', !!on);
    var lab = btn.querySelector('#tg-label');
    if(lab) lab.textContent = on ? 'Tomei Raise' : 'Sem Raise';
  }

  // ===== Render =====
  function renderPotOddsUI(ctx, cfg){
    var out = $(cfg.suggestSelector);
    if(!out) return;

    var potAtual = Number(ctx.potAtual || 0);
    var toCall   = Number(ctx.toCall   || 0);
    var equity   = Number(ctx.equityPct!= null ? ctx.equityPct : 50);
    var rakePct  = Number(ctx.rakePct  || 0);
    var rakeCap  = (ctx.rakeCap===Infinity || ctx.rakeCap==null) ? Infinity : Number(ctx.rakeCap);

    var result = decideVsRaise(potAtual, toCall, equity, rakePct, rakeCap);
    state.lastPotOdds = result;

    if (DEFAULTS.potOddsCompact) {
      out.innerHTML = `
        <div class="raise-potodds card">
          <div style="font-weight:700;margin-bottom:6px">Pot Odds (vs Raise) — Compacto</div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
            <div>Pot (fichas)</div><div><b>${potAtual ? potAtual.toFixed(0) : '—'}</b></div>
            <div>A pagar (fichas)</div><div><b>${toCall ? toCall.toFixed(0) : '—'}</b></div>
            <div>BE (pot odds)</div><div><b>${result.bePct}%</b></div>
            <div>Equity (MC)</div><div><b>${result.equityPct}%</b></div>
            <div>Recomendação</div>
            <div><span id="po-rec" style="padding:2px 8px;border-radius:999px;border:1px solid #22304a">${result.rec}</span></div>
          </div>
        </div>
      `;
      var pill = out.querySelector('#po-rec');
      if (pill){
        var c = result.rec === 'Call' ? '#10b981' : (result.rec === 'Fold' ? '#ef4444' : '#f59e0b');
        pill.style.background = c + '22';
        pill.style.borderColor = c + '66';
        pill.style.color = '#e5e7eb';
      }
      if(typeof DEFAULTS.onUpdateText === 'function'){
        DEFAULTS.onUpdateText(`PotOdds: BE ${result.bePct}% | EQ ${result.equityPct}% → ${result.rec}`);
      }
      return;
    }
  }

  function renderOff(ctx, cfg){
    var out = $(cfg.suggestSelector);
    if(!out) return;
    out.innerHTML = `
      <div class="raise-potodds card">
        <div style="font-weight:700;margin-bottom:6px">Sem raise</div>
        <div class="mut">Ative <b>"Tomei Raise"</b> para ver Pot Odds desta mão.</div>
      </div>
    `;
    if(typeof DEFAULTS.onUpdateText === 'function'){
      DEFAULTS.onUpdateText('Sem raise — Pot Odds desligado');
    }
  }

  function updateSuggestion(cfg){
    var st = cfg.readState();

    // overrides dos inputs em fichas
    var potAtual = (state.overrides.potAtual != null ? state.overrides.potAtual : st.potAtual);
    var toCall   = (state.overrides.toCall   != null ? state.overrides.toCall   : st.toCall);
    var equity   = (state.overrides.equityPct!= null ? state.overrides.equityPct: st.equityPct);
    var rakePct  = (state.overrides.rakePct  != null ? state.overrides.rakePct  : st.rakePct);
    var rakeCap  = (state.overrides.rakeCap  != null ? state.overrides.rakeCap  : st.rakeCap);

    var ctx = {
      tomeiRaise: state.tomeiRaise,
      potAtual: potAtual,
      toCall: toCall,
      equityPct: equity,
      rakePct: rakePct,
      rakeCap: rakeCap
    };

    if (ctx.tomeiRaise && state.usePotOdds){
      renderPotOddsUI(ctx, cfg);
    } else {
      renderOff(ctx, cfg);
    }
  }

  // Observa a UI do app para reagir ao término do Monte Carlo
  function attachDOMObservers(){
    detachDOMObservers();

    var br = document.getElementById('eqBreak');
    if (br && g.MutationObserver){
      var mo1 = new MutationObserver(function(){
        if (state._cfg) updateSuggestion(state._cfg);
      });
      mo1.observe(br, { childList:true, subtree:true, characterData:true });
      state.observers.push(mo1);
    }

    var bar = document.getElementById('eqBarWin');
    if (bar && g.MutationObserver){
      var mo2 = new MutationObserver(function(muts){
        var refresh = muts.some(m => m.attributeName === 'style');
        if (refresh && state._cfg) updateSuggestion(state._cfg);
      });
      mo2.observe(bar, { attributes:true, attributeFilter:['style'] });
      state.observers.push(mo2);
    }

    // pings tardios, caso o DOM re-renderize por completo
    [50, 250, 750].forEach(function(ms){
      setTimeout(function(){ if (state._cfg) updateSuggestion(state._cfg); }, ms);
    });
  }
  function detachDOMObservers(){
    (state.observers||[]).forEach(function(mo){ try{ mo.disconnect(); }catch(_){ } });
    state.observers = [];
  }

  // ===== API pública =====
  var API = {
    init: function(userCfg){
      if (state.mounted) return;
      ensureCSS();
      var cfg = {};
      userCfg = userCfg || {};
      var k;
      for (k in DEFAULTS) cfg[k] = DEFAULTS[k];
      for (k in userCfg)   cfg[k] = userCfg[k];

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
      if ('tomeiRaise' in patch) state.tomeiRaise = !!patch.tomeiRaise;

      // Overrides aceitos (em fichas)
      if ('potAtual'  in patch) state.overrides.potAtual  = (patch.potAtual==null?undefined:Number(patch.potAtual));
      if ('toCall'    in patch) state.overrides.toCall    = (patch.toCall==null?undefined:Number(patch.toCall));
      if ('equityPct' in patch) state.overrides.equityPct = (patch.equityPct==null?undefined:Number(patch.equityPct));
      if ('rakePct'   in patch) state.overrides.rakePct   = (patch.rakePct==null?undefined:Number(patch.rakePct));
      if ('rakeCap'   in patch) state.overrides.rakeCap   = (patch.rakeCap==null?undefined:Number(patch.rakeCap));

      // sync botão (se existir)
      var els = state.elements || {};
      if (els.toggleBtn) syncToggleVisual(els.toggleBtn, state.tomeiRaise);
      if (els.potInput && state.overrides.potAtual!=null)  els.potInput.value  = String(state.overrides.potAtual||0);
      if (els.callInput && state.overrides.toCall!=null)    els.callInput.value = String(state.overrides.toCall||0);

      if (state._cfg) updateSuggestion(state._cfg);
    },

    getRecommendation: function(){
      if (state.usePotOdds && state.lastPotOdds){
        return { type: 'potodds', data: state.lastPotOdds };
      }
      return 'Sem raise — Pot Odds desligado';
    },

    setUsePotOdds: function(flag){
      state.usePotOdds = !!flag;
      if (state._cfg) updateSuggestion(state._cfg);
    }
  };

  g.RAISE = API;

})(window);
