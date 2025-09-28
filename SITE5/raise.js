// raise.js — "Tomei Raise" com Equity automático sem mexer no app.js
// Lê equity da UI (Win/Tie/Lose) via DOM e observa mudanças para atualizar.
// API pública:
//   window.RAISE.init({ mountSelector, suggestSelector, onUpdateText, readState, ...opts })
//   window.RAISE.setState(patch)
//   window.RAISE.getRecommendation()
//   window.RAISE.setUsePotOdds(bool)
(function (g) {
  // ================== Config ==================
  var DEFAULTS = {
    mountSelector: '#pcalc-toolbar',
    suggestSelector: '#pcalc-sugestao',

    // === Opções/UI ===
    potOddsCompact: true,   // mostra só BE/Equity/Decisão
    // chaves usuais no PC.state (se existirem, ainda serão usadas)
    potKey: 'potAtual',
    toCallKey: 'toCall',
    equityKey: 'equityPct', // se o app já preencher (0..100)
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

      // ---------- Equity prioridade: 1) equityPct do state 2) win/tie do state 3) DOM ----------
      var eqPct = toNum(st[ek]);

      if (!isFinite(eqPct)) {
        var win = toNum(st[wk]);
        var tie = toNum(st[tk]);
        if (isFinite(win) && isFinite(tie)) {
          // normaliza caso venham em %
          if (win > 1 || tie > 1) { win = win / 100; tie = tie / 100; }
          eqPct = (win + 0.5 * tie) * 100;
        }
      }

      if (!isFinite(eqPct)) {
        // tenta extrair da UI (sem tocar no app.js)
        var domEq = extractEquityFromDOM();
        if (isFinite(domEq)) eqPct = domEq;
      }

      if (!isFinite(eqPct)) eqPct = 50; // fallback seguro

      // ---------- Pot / To call em FICHAS ----------
      var potAtual = toNum(st[pk]);   if (!isFinite(potAtual)) potAtual = 0;
      var toCall   = toNum(st[ck]);   if (!isFinite(toCall))   toCall   = 0;

      return {
        maoLabel: st.maoLabel || st.mao || '',
        categoria: st.maoCategoria || 'premium (top 20)',
        callers: Number(st.callers || 0),

        potAtual: potAtual,
        toCall: toCall,
        equityPct: eqPct,
        rakePct: toNum(st.rakePct) || 0,
        rakeCap: (st.rakeCap != null ? Number(st.rakeCap) : Infinity),
        spr: (st.spr != null ? Number(st.spr) : undefined),
        players: Number(st.players || 2),
        wasPotControl: !!st.wasPotControl
      };
    },
    onUpdateText: null
  };

  // ================== Estado ==================
  var state = {
    mounted: false,
    elements: {},
    tomeiRaise: false,
    pos: 'IP',            // 'IP' | 'OOP' | null (contexto textual)
    callers: 0,           // contexto
    usePotOdds: true,
    lastPotOdds: null,
    _cfg: null,
    // Overrides vindos via setState() ou inputs
    overrides: { potAtual: undefined, toCall: undefined, equityPct: undefined, rakePct: undefined, rakeCap: undefined },
    // Observers DOM
    observers: []
  };

  // ================== Utils ==================
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function toNum(x){ var n = Number(x); return isFinite(n) ? n : NaN; }

  // ---- Extrair Equity da UI sem mexer no app.js ----
  function extractEquityFromDOM(){
    // 1) #eqBreak: "<small><b>Win:</b> 97.0%</small> <small><b>Tie:</b> 0.0%</small> ..."
    var br = document.getElementById('eqBreak');
    if (br) {
      var txt = br.textContent || '';
      var win = matchPct(txt, /Win:\s*([\d.,]+)%/i);
      var tie = matchPct(txt, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(win) && isFinite(tie)) return +(win + tie/2).toFixed(1);
    }

    // 2) #eqBarWin width: "97.0%"
    var bar = document.getElementById('eqBarWin');
    if (bar && bar.style && bar.style.width){
      var w = parseFloat((bar.style.width||'').replace(',', '.'));
      if (isFinite(w)) return +w.toFixed(1);
    }

    // 3) Varredura geral por nós com "Win:" e "Tie:"
    var nodes = Array.from(document.querySelectorAll('div,span,small,p,li,td,th'));
    var node = nodes.find(n => /Win:\s*[\d.,]+%/i.test(n.textContent||''));
    if (node){
      var t = node.textContent || '';
      var win2 = matchPct(t, /Win:\s*([\d.,]+)%/i);
      var tie2 = matchPct(t, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(win2) && isFinite(tie2)) return +(win2 + tie2/2).toFixed(1);
    }

    return NaN;
  }
  function matchPct(text, re){
    var m = (text||'').match(re);
    if (!m) return NaN;
    var raw = String(m[1]).replace(/\./g,'').replace(',','.');
    var n = parseFloat(raw);
    return isFinite(n) ? n : NaN;
  }

  // ---- Pot Odds ----
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
      + '.field{display:flex;align-items:center;gap:.5rem}\n'
      + '.fld-label{color:#93c5fd;font-weight:600;white-space:nowrap}\n'
      + '.input-modern input{width:110px;padding:.48rem .6rem;border:1px solid #334155;'
        + 'background:#0f172a;color:#e5e7eb;border-radius:.6rem;outline:0}\n'
      + '.raise-checks{display:flex;align-items:center;gap:1rem}\n'
      + '.rc-item{display:flex;align-items:center;gap:.35rem;cursor:pointer;font-size:.9rem;color:#e5e7eb}\n'
      + '.rc-item input{width:16px;height:16px;cursor:pointer}\n'
      + '.rc-item.active span{font-weight:700;color:#38bdf8}\n'
      + '.raise-potodds.card{background:#0b1324;border:1px solid #22304a;border-radius:10px;padding:10px;line-height:1.2}\n';
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ================== Fallback textual ==================
  function buildSuggestion(ctx){
    var maoLabel = ctx.maoLabel || ctx.categoria || '';
    var posIn    = ctx.pos;
    var pos      = posIn || 'IP';
    var posIndef = (posIn == null);
    var callers  = Number(ctx.callers || 0);

    var actionText = 'Sem cálculo de pot odds.\n'
      + '→ Contexto: ' + (ctx.tomeiRaise ? 'Houve raise antes' : 'Sem raise antes')
      + (callers>0? (' + ' + callers + ' caller(s)'):'') + ' (' + pos + ').\n'
      + '→ Mão: ' + (maoLabel || '—') + '.';
    return actionText + (posIndef ? '\n(Obs.: posição não marcada — usando IP padrão)' : '');
  }

  // ================== UI helpers ==================
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

  // ================== UI / Montagem ==================
  function renderControls(cfg){
    var mount = $(cfg.mountSelector);
    if (!mount) return null;

    var bar = el('div', 'raise-bar');

    // (1) Switch Tomei Raise
    var switchWrap = el('div', 'field');
    var lblTxt = el('span', 'fld-label'); lblTxt.textContent = 'Tomei Raise';
    var rsw = el('label', 'rc-item');
    var chk = document.createElement('input'); chk.type='checkbox'; chk.id='chk-tomei-raise';
    var chkTxt  = document.createElement('span'); chkTxt.textContent='Ativar calculadora de Pot Odds';
    rsw.appendChild(chk); rsw.appendChild(chkTxt);
    switchWrap.appendChild(lblTxt); switchWrap.appendChild(rsw);

    // (2) Posição (opcional p/ contexto)
    var posWrap = el('div','field');
    var posLbl  = el('span','fld-label'); posLbl.textContent = 'Posição:';
    var posGrp  = el('div','raise-checks');

    var ipWrap  = el('label', 'rc-item');
    var ipCb    = document.createElement('input'); ipCb.type='checkbox';
    var ipTxt   = document.createElement('span'); ipTxt.textContent='Depois (IP)';
    ipWrap.appendChild(ipCb); ipWrap.appendChild(ipTxt);

    var oopWrap = el('label', 'rc-item');
    var oopCb   = document.createElement('input'); oopCb.type='checkbox';
    var oopTxt  = document.createElement('span'); oopTxt.textContent='Antes (OOP)';
    oopWrap.appendChild(oopCb); oopWrap.appendChild(oopTxt);

    posGrp.appendChild(ipWrap); posGrp.appendChild(oopWrap);
    posWrap.appendChild(posLbl); posWrap.appendChild(posGrp);

    // (3) Nº de callers
    var callersWrap = el('div','field');
    var cLabel  = el('span','fld-label'); cLabel.textContent='Nº callers:';
    var cInpW   = el('div','input-modern'); cInpW.innerHTML='<input id="inp-callers" type="number" step="1" min="0" max="8" placeholder="0">';
    callersWrap.appendChild(cLabel); callersWrap.appendChild(cInpW);
    var callersInput = cInpW.querySelector('input');

    // (4) Calculadora: Pot / A pagar (FICHAS)
    var st0   = cfg.readState();
    var pots  = buildPotInputs(st0.potAtual, st0.toCall);

    // Montagem
    bar.appendChild(switchWrap);
    bar.appendChild(posWrap);
    bar.appendChild(callersWrap);
    bar.appendChild(pots.potWrap);
    bar.appendChild(pots.callWrap);
    mount.appendChild(bar);

    // Estado inicial
    chk.checked = state.tomeiRaise;

    ipCb.checked  = (state.pos==='IP');
    oopCb.checked = (state.pos==='OOP');
    ipWrap.classList.toggle('active', ipCb.checked);
    oopWrap.classList.toggle('active', oopCb.checked);

    if (typeof state.callers === 'number') callersInput.value = String(state.callers);

    // Eventos
    chk.addEventListener('change',function(){ state.tomeiRaise=chk.checked; updateSuggestion(cfg); });
    function syncPosVisual(){
      ipWrap.classList.toggle('active', ipCb.checked);
      oopWrap.classList.toggle('active', oopCb.checked);
    }
    ipCb.addEventListener('change',function(){
      if(ipCb.checked){ oopCb.checked=false; state.pos='IP'; }
      else { state.pos=null; }
      syncPosVisual(); updateSuggestion(cfg);
    });
    oopCb.addEventListener('change',function(){
      if(oopCb.checked){ ipCb.checked=false; state.pos='OOP'; }
      else { state.pos=null; }
      syncPosVisual(); updateSuggestion(cfg);
    });

    callersInput.addEventListener('input', function(){
      var v = parseInt(callersInput.value||'0',10);
      state.callers = clamp(isFinite(v)?v:0,0,8);
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
      bar: bar, chk: chk,
      ipCb: ipCb, oopCb: oopCb, ipWrap: ipWrap, oopWrap: oopWrap,
      callersInput: callersInput,
      potInput: pots.potInput, callInput: pots.callInput
    };
  }

  // ============== Render do bloco de sugestão ==============
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

  function renderDefaultRecommendation(ctx, cfg){
    var out = $(cfg.suggestSelector);
    var texto = buildSuggestion(ctx);
    if (typeof cfg.onUpdateText === 'function'){
      cfg.onUpdateText(texto, {});
    } else if (out){
      out.innerText = texto;
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
      maoLabel: st.maoLabel,
      categoria: st.categoria,
      callers: state.callers,
      pos: state.pos,
      tomeiRaise: state.tomeiRaise,
      potAtual: potAtual,
      toCall: toCall,
      equityPct: equity,
      rakePct: rakePct,
      rakeCap: rakeCap,
      spr: st.spr,
      players: st.players,
      wasPotControl: st.wasPotControl
    };

    if (ctx.tomeiRaise && state.usePotOdds){
      renderPotOddsUI(ctx, cfg);
    } else {
      renderDefaultRecommendation(ctx, cfg);
    }
  }

  // ---- Observa a UI do app para reagir ao término do Monte Carlo ----
  function attachDOMObservers(){
    detachDOMObservers();

    var br = document.getElementById('eqBreak');
    if (br && g.MutationObserver){
      var mo1 = new MutationObserver(function(){
        // Quando Win/Tie/Lose mudarem, refaz a leitura/significado de equity
        if (state._cfg) updateSuggestion(state._cfg);
      });
      mo1.observe(br, { childList:true, subtree:true, characterData:true });
      state.observers.push(mo1);
    }

    var bar = document.getElementById('eqBarWin');
    if (bar && g.MutationObserver){
      var mo2 = new MutationObserver(function(muts){
        // Se style.width mudar, atualiza
        var refresh = muts.some(m => m.attributeName === 'style');
        if (refresh && state._cfg) updateSuggestion(state._cfg);
      });
      mo2.observe(bar, { attributes:true, attributeFilter:['style'] });
      state.observers.push(mo2);
    }

    // Fallback leve: um ping tardio para casos em que o DOM troca inteiro
    setTimeout(function(){ if (state._cfg) updateSuggestion(state._cfg); }, 50);
    setTimeout(function(){ if (state._cfg) updateSuggestion(state._cfg); }, 250);
    setTimeout(function(){ if (state._cfg) updateSuggestion(state._cfg); }, 750);
  }
  function detachDOMObservers(){
    (state.observers||[]).forEach(function(mo){ try{ mo.disconnect(); }catch(_){ } });
    state.observers = [];
  }

  // ================== API pública ==================
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

      attachDOMObservers(); // >>> OUVE mudanças na UI do app (Win/Tie/Lose/barra)

      updateSuggestion(cfg);
    },

    setState: function(patch){
      patch = patch || {};
      if ('tomeiRaise' in patch) state.tomeiRaise = !!patch.tomeiRaise;
      if ('pos' in patch)        state.pos = (patch.pos === 'OOP' ? 'OOP' : (patch.pos === 'IP' ? 'IP' : null));
      if ('callers' in patch)    state.callers = clamp(parseInt(patch.callers || 0, 10), 0, 8);

      // Overrides aceitos (em fichas)
      if ('potAtual'  in patch) state.overrides.potAtual  = (patch.potAtual==null?undefined:Number(patch.potAtual));
      if ('toCall'    in patch) state.overrides.toCall    = (patch.toCall==null?undefined:Number(patch.toCall));
      if ('equityPct' in patch) state.overrides.equityPct = (patch.equityPct==null?undefined:Number(patch.equityPct));
      if ('rakePct'   in patch) state.overrides.rakePct   = (patch.rakePct==null?undefined:Number(patch.rakePct));
      if ('rakeCap'   in patch) state.overrides.rakeCap   = (patch.rakeCap==null?undefined:Number(patch.rakeCap));

      // sync mínimo de UI (se existir)
      var els = state.elements || {};
      if (els.ipCb && els.oopCb && els.ipWrap && els.oopWrap){
        els.ipCb.checked  = (state.pos === 'IP');
        els.oopCb.checked = (state.pos === 'OOP');
        els.ipWrap.classList.toggle('active', els.ipCb.checked);
        els.oopWrap.classList.toggle('active', els.oopCb.checked);
      }
      if (els.callersInput) els.callersInput.value = String(state.callers);
      if (els.potInput && state.overrides.potAtual!=null)  els.potInput.value  = String(state.overrides.potAtual||0);
      if (els.callInput && state.overrides.toCall!=null)    els.callInput.value = String(state.overrides.toCall||0);

      if (state._cfg) updateSuggestion(state._cfg);
    },

    getRecommendation: function(){
      if (state.usePotOdds && state.lastPotOdds){
        return { type: 'potodds', data: state.lastPotOdds };
      }
      var cfg = state._cfg || DEFAULTS;
      var st  = cfg.readState();
      return buildSuggestion({
        maoLabel: st.maoLabel,
        categoria: st.categoria,
        callers: state.callers,
        pos: state.pos,
        tomeiRaise: state.tomeiRaise
      });
    },

    setUsePotOdds: function(flag){
      state.usePotOdds = !!flag;
      if (state._cfg) updateSuggestion(state._cfg);
    }
  };

  g.RAISE = API;

})(window);
