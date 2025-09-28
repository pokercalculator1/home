// raise.js — Pot Odds + chave de decisão com botão "Enviar"
// Agora: Equity (MC) atualiza SEMPRE (switch ON ou OFF), com reattach dinâmico + heartbeat.
// Fluxo do TTS: Ligar → preencher Pot/A pagar → Enviar → fala e desliga a chave.
(function (g) {
  var DEFAULTS = {
    mountSelector: '#pcalc-toolbar',
    suggestSelector: '#pcalc-sugestao',
    potOddsCompact: true,

    // chaves usuais no PC.state
    potKey: 'potAtual',
    toCallKey: 'toCall',
    equityKey: 'equityPct', // % pronta (fallback)
    winKey: 'win',          // 0..1 ou 0..100
    tieKey: 'tie',

    // ======= readState com prioridade: DOM Win/Tie > state Win/Tie > equityPct =======
    readState: function () {
      var PC = g.PC || g.PCALC || {};
      var st = PC.state || {};

      var ek  = DEFAULTS.equityKey || 'equityPct';
      var pk  = DEFAULTS.potKey     || 'potAtual';
      var tk  = DEFAULTS.toCallKey  || 'toCall';
      var wk  = DEFAULTS.winKey     || 'win';
      var tk2 = DEFAULTS.tieKey     || 'tie';

      function parseFlex(x){
        if(x==null) return NaN;
        var s = String(x).trim().replace('%','');
        var hasDot = s.includes('.'), hasComma = s.includes(',');
        if (hasDot && hasComma){
          if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',', '.');
          else s = s.replace(/,/g,'');
        } else if (hasComma){ s = s.replace(',', '.'); }
        var n = parseFloat(s);
        return isFinite(n) ? n : NaN;
      }
      // 1) tenta Win/Tie do state
      var winS = parseFlex(st[wk]);
      var tieS = parseFlex(st[tk2]);
      if (isFinite(winS) && winS > 1) winS /= 100;
      if (isFinite(tieS) && tieS > 1) tieS /= 100;
      var eqFromWT = (isFinite(winS) ? winS : NaN) + (isFinite(tieS) ? tieS/2 : 0);
      if (!isFinite(eqFromWT)) eqFromWT = NaN;
      else eqFromWT = Math.max(0, Math.min(1, eqFromWT)) * 100;

      // 2) tenta Win/Tie do DOM
      var eqFromDOM = (function(){
        if (typeof extractEquityFromDOM === 'function') {
          var v = extractEquityFromDOM(); // 0..100
          if (isFinite(v)) return v;
        }
        return NaN;
      })();

      // 3) equityPct do state (fallback)
      var eqFromState = Number(st[ek]); if (!isFinite(eqFromState)) eqFromState = NaN;

      // 4) prioridade
      var eqPct = NaN;
      if (isFinite(eqFromDOM))        eqPct = eqFromDOM;
      else if (isFinite(eqFromWT))    eqPct = eqFromWT;
      else if (isFinite(eqFromState)) eqPct = eqFromState;
      if (!isFinite(eqPct)) eqPct = 50;

      // pot/toCall (fichas)
      function num(x){ var n=Number(x); return isFinite(n)?n:NaN; }
      var potAtual = num(st[pk]); if(!isFinite(potAtual)) potAtual=0;
      var toCall   = num(st[tk]); if(!isFinite(toCall))   toCall=0;

      return {
        potAtual: potAtual,
        toCall: toCall,
        equityPct: +eqPct.toFixed(1),
        rakePct: num(st.rakePct) || 0,
        rakeCap: (st.rakeCap != null ? Number(st.rakeCap) : Infinity)
      };
    },
    onUpdateText: null
  };

  var state = {
    mounted: false,
    elements: {},
    injectDecision: false,     // switch ON/OFF
    lastPotOdds: null,
    _cfg: null,
    overrides: { potAtual: undefined, toCall: undefined, equityPct: undefined, rakePct: undefined, rakeCap: undefined },
    observers: [],
    lastSuggestSnapshot: null,

    // reattach dinâmico + controle de nós atuais
    domNodes: { eqBreakEl: null, eqBarEl: null, suggestOutEl: null },
    domObs:   { eqBreak: null, eqBar: null, suggestOut: null, body: null },

    // heartbeat para garantir atualização mesmo se o app trocar nós silenciosamente
    pollTimer: null,
    lastEqPctSeen: null,
    lastSelSignature: null
  };

  // ===== Utils
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function num(x){ var n=Number(x); return isFinite(n)?n:NaN; }
  function clamp01pct(p){ return Math.max(0, Math.min(100, +Number(p).toFixed(1))); }

  // parser pt/intl
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

  // ===== TTS helpers — fala apenas no clique do Enviar
  function ttsEnabled(){
    return !!(g.TTS && g.TTS.state && g.TTS.state.enabled && 'speechSynthesis' in g);
  }
  function ttsSayNow(text){
    if(!ttsEnabled()) return;
    try{ speechSynthesis.cancel(); }catch(_){}
    try{ g.TTS.speak(text); }catch(_){}
  }
  function inputsReady(ctx){
    var p = Number(ctx.potAtual||0), c = Number(ctx.toCall||0);
    return isFinite(p) && p > 0 && isFinite(c) && c > 0;
  }
  function ttsRaise(result){
    var phrase;
    switch (result.rec) {
      case 'Call': phrase = 'Sugestão: Pague o raise.'; break;
      case 'Fold': phrase = 'Sugestão: Desista do raise.'; break;
      default:     phrase = 'Sugestão: Pague.'; break;
    }
    ttsSayNow(phrase);
  }

  // ===== Estilos (switch + botão Enviar)
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
      + '.rsw{position:relative;display:inline-block;width:48px;height:26px}\n'
      + '.rsw input{opacity:0;width:0;height:0}\n'
      + '.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#475569;border-radius:26px;transition:.25s}\n'
      + '.slider:before{position:absolute;content:"";height:20px;width:20px;left:3px;top:3px;background:#0b1324;border-radius:50%;transition:.25s}\n'
      + '.rsw input:checked + .slider{background:#22c55e}\n'
      + '.rsw input:checked + .slider:before{transform:translateX(22px)}\n'
      + '.raise-send-btn{padding:.48rem .7rem;border:1px solid #334155;background:#0f172a;color:#e5e7eb;'
        + 'border-radius:.6rem;cursor:pointer;user-select:none}\n'
      + '.raise-send-btn:hover{border-color:#60a5fa}\n';
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

    // (1) Switch: Decisão do Raise
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

    // (3) Botão Enviar
    var sendBtn = el('button','raise-send-btn'); sendBtn.id='btn-raise-send'; sendBtn.type='button'; sendBtn.textContent='Enviar';

    bar.appendChild(injWrap);
    bar.appendChild(pots.potWrap);
    bar.appendChild(pots.callWrap);
    bar.appendChild(sendBtn);
    mount.appendChild(bar);

    // Estado inicial do switch
    injCb.checked = !!state.injectDecision;

    // Eventos
    injCb.addEventListener('change', function(){
      setInjectDecision(!!injCb.checked, { source:'user', restore:true });
    });
    if (pots.potInput) pots.potInput.addEventListener('input', function(){
      var v = Number(pots.potInput.value||0);
      state.overrides.potAtual = isFinite(v)?v:0;
      if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg); // atualiza card, sem falar/injetar
    });
    if (pots.callInput) pots.callInput.addEventListener('input', function(){
      var v = Number(pots.callInput.value||0);
      state.overrides.toCall = isFinite(v)?v:0;
      if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
    });
    sendBtn.addEventListener('click', onEnviar);

    return { injCb: injCb, potInput: pots.potInput, callInput: pots.callInput, sendBtn: sendBtn };
  }

  function setInjectDecision(flag, opts){
    opts = opts || {};
    state.injectDecision = !!flag;
    if (state.elements.injCb) state.elements.injCb.checked = state.injectDecision;

    if (!state.injectDecision){
      if (opts.source === 'user' && opts.restore){
        restoreDefaultSuggestion(); // usuário desligou manualmente → restaura MC
      }
    } else {
      if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
    }
  }

  // ===== Patch: injetar e restaurar no bloco principal
  function injectDecisionIntoMain(result, ctx){
    var host = document.getElementById('suggestOut');
    if (!host) return;

    if (state.lastSuggestSnapshot == null) {
      state.lastSuggestSnapshot = host.innerHTML;
    }

    var cls = (result.rec === 'Call') ? 'good' : (result.rec === 'Fold' ? 'bad' : 'warn');
    var glow = (result.rec === 'Call');

    host.innerHTML = `
      <div class="decision ${glow ? 'glow' : ''}">
        <div class="decision-title ${cls}">RAISE EQUITY: ${result.rec}</div>
        <div class="decision-detail">
          BE ${result.bePct}% | EQ ${result.equityPct}% &nbsp;•&nbsp;
          Pot ${Number(ctx.potAtual||0).toFixed(0)} | A pagar ${Number(ctx.toCall||0).toFixed(0)}
        </div>
      </div>
    `;
  }
  function restoreDefaultSuggestion(){
    var host = document.getElementById('suggestOut');
    if (host && state.lastSuggestSnapshot != null){
      host.innerHTML = state.lastSuggestSnapshot;
    }
    state.lastSuggestSnapshot = null;
  }

  // ===== Botão Enviar
  function onEnviar(){
    if (!state.injectDecision || !state._cfg) return;
    var ctx = buildCtxFromCurrent(state._cfg);
    if (!inputsReady(ctx)) return;

    var res = computeDecision(ctx);
    injectDecisionIntoMain(res, ctx);
    ttsRaise(res);

    // desliga a chavinha automaticamente, SEM restaurar MC (decisão permanece na tela)
    setInjectDecision(false, { source:'auto', restore:false });
  }

  // ===== Render do card compacto
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
  }

  function computeDecision(ctx){
    var potAtual = Number(ctx.potAtual || 0);
    var toCall   = Number(ctx.toCall   || 0);
    var equity   = Number(ctx.equityPct!= null ? ctx.equityPct : 50);
    var rakePct  = Number(ctx.rakePct  || 0);
    var rakeCap  = (ctx.rakeCap===Infinity || ctx.rakeCap==null) ? Infinity : Number(ctx.rakeCap);
    return decideVsRaise(potAtual, toCall, equity, rakePct, rakeCap);
  }

  function buildCtxFromCurrent(cfg){
    var st = cfg.readState();
    return {
      potAtual: (state.overrides.potAtual != null ? state.overrides.potAtual : st.potAtual),
      toCall:   (state.overrides.toCall   != null ? state.overrides.toCall   : st.toCall),
      equityPct:(state.overrides.equityPct!= null ? state.overrides.equityPct: st.equityPct),
      rakePct:  (state.overrides.rakePct  != null ? state.overrides.rakePct  : st.rakePct),
      rakeCap:  (state.overrides.rakeCap  != null ? state.overrides.rakeCap  : st.rakeCap)
    };
  }

  function updateSuggestion(cfg){
    var ctx = buildCtxFromCurrent(cfg);
    renderPotOddsUI(ctx, cfg);
  }

  // ===== Reattach dinâmico + Heartbeat =====
  function attachObserverTo(targetEl, kind){
    if (!g.MutationObserver || !targetEl) return;
    // desconecta anterior se trocou o nó
    if (kind==='eqBreak' && state.domNodes.eqBreakEl !== targetEl && state.domObs.eqBreak){
      try{ state.domObs.eqBreak.disconnect(); }catch(_){}
      state.domObs.eqBreak = null;
    }
    if (kind==='eqBar' && state.domNodes.eqBarEl !== targetEl && state.domObs.eqBar){
      try{ state.domObs.eqBar.disconnect(); }catch(_){}
      state.domObs.eqBar = null;
    }
    // cria/reattacha
    if (kind==='eqBreak' && !state.domObs.eqBreak){
      var mo1 = new MutationObserver(function(){
        if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      });
      mo1.observe(targetEl, { childList:true, subtree:true, characterData:true });
      state.domObs.eqBreak = mo1;
      state.domNodes.eqBreakEl = targetEl;
    }
    if (kind==='eqBar' && !state.domObs.eqBar){
      var mo2 = new MutationObserver(function(muts){
        if (muts.some(m => m.attributeName === 'style') && state._cfg)
          renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      });
      mo2.observe(targetEl, { attributes:true, attributeFilter:['style'] });
      state.domObs.eqBar = mo2;
      state.domNodes.eqBarEl = targetEl;
    }
  }

  function ensureDomObserversAttached(){
    attachObserverTo(document.getElementById('eqBreak'), 'eqBreak');
    attachObserverTo(document.getElementById('eqBarWin'), 'eqBar');

    var so = document.getElementById('suggestOut');
    if (so && !state.domObs.suggestOut && g.MutationObserver){
      var mo3 = new MutationObserver(function(){
        if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      });
      mo3.observe(so, { childList:true, subtree:true, characterData:true });
      state.domObs.suggestOut = mo3;
      state.domNodes.suggestOutEl = so;
    }
  }

  function startHeartbeat(){
    stopHeartbeat();
    state.pollTimer = setInterval(function(){
      if (!state._cfg) return;

      // 1) equity mudou?
      var eq = extractEquityFromDOM();
      var eqKey = isFinite(eq)? eq.toFixed(2) : 'NA';

      // 2) assinatura da seleção (pra reagir a trocar HH, flop/turn/river)
      var PC = g.PC || g.PCALC || {};
      var sel = (PC.state && Array.isArray(PC.state.selected)) ? PC.state.selected.join(',') : '';
      var sig = eqKey + '|' + sel;

      if (sig !== state.lastSelSignature){
        state.lastSelSignature = sig;
        renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      }
    }, 300);
  }
  function stopHeartbeat(){
    if (state.pollTimer){ clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  function attachDOMObservers(){
    detachDOMObservers();

    // tenta anexar imediatamente
    ensureDomObserversAttached();

    // observa o body para detectar criação/substituição de nós
    if (g.MutationObserver && document.body) {
      var moBody = new MutationObserver(function(){
        ensureDomObserversAttached();
      });
      moBody.observe(document.body, { childList:true, subtree:true });
      state.observers.push(moBody);
      state.domObs.body = moBody;
    }

    // heartbeat garante atualização mesmo se o app trocar nós silenciosamente
    startHeartbeat();

    // pings tardios extra
    [80, 300, 1200].forEach(function(ms){
      setTimeout(function(){
        ensureDomObserversAttached();
        if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      }, ms);
    });
  }

  function detachDOMObservers(){
    (state.observers||[]).forEach(function(mo){ try{ mo.disconnect(); }catch(_){ } });
    state.observers = [];
    // desconecta individuais
    ['eqBreak','eqBar','suggestOut','body'].forEach(function(k){
      if (state.domObs[k]) { try{ state.domObs[k].disconnect(); }catch(_){} state.domObs[k]=null; }
    });
    state.domNodes = { eqBreakEl: null, eqBarEl: null, suggestOutEl: null };
    stopHeartbeat();
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
        setInjectDecision(!!patch.useDecisionInjection, { source:'code', restore:false });
      }
      if ('potAtual'  in patch) state.overrides.potAtual  = (patch.potAtual==null?undefined:Number(patch.potAtual));
      if ('toCall'    in patch) state.overrides.toCall    = (patch.toCall==null?undefined:Number(patch.toCall));
      if ('equityPct' in patch) state.overrides.equityPct = (patch.equityPct==null?undefined:Number(patch.equityPct));
      if ('rakePct'   in patch) state.overrides.rakePct   = (patch.rakePct==null?undefined:Number(patch.rakePct));
      if ('rakeCap'   in patch) state.overrides.rakeCap   = (patch.rakeCap==null?undefined:Number(patch.rakeCap));

      if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
    },

    getRecommendation: function(){
      return state.lastPotOdds || null;
    }
  };

  g.RAISE = API;

})(window);
