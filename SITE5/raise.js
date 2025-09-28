// raise.js — "Tomei Raise" com Equity automático (win+0.5*tie) e calculadora em FICHAS
// API pública:
//   window.RAISE.init({ mountSelector, suggestSelector, onUpdateText, readState, ...opts })
//   window.RAISE.setState(patch)                 // aceita { tomeiRaise, pos, callers, potAtual, toCall, equityPct, rakePct, rakeCap, ... }
//   window.RAISE.getRecommendation()             // texto padrão ou último cálculo de Pot Odds
//   window.RAISE.setUsePotOdds(bool)             // liga/desliga mini calculadora
(function (g) {
  // ================== Config ==================
  var DEFAULTS = {
    mountSelector: '#pcalc-toolbar',
    suggestSelector: '#pcalc-sugestao',

    // === Opções ===
    potOddsCompact: true,   // true = só mostra BE/Equity/Decisão (sem inputs)
    potKey: 'potAtual',     // chave em PC.state do pote (FICHAS) antes da sua ação
    toCallKey: 'toCall',    // chave em PC.state do valor a pagar (FICHAS)
    equityKey: 'equityPct', // se já vem em %
    winKey: 'win',          // se vier 0..1 (Monte Carlo), equity = (win + 0.5*tie)*100
    tieKey: 'tie',

    readState: function () {
      var PC = g.PC || g.PCALC || {};
      var st = PC.state || {};

      // coleta chaves configuráveis
      var ek  = DEFAULTS.equityKey || 'equityPct';
      var pk  = DEFAULTS.potKey     || 'potAtual';
      var ck  = DEFAULTS.toCallKey  || 'toCall';
      var wk  = DEFAULTS.winKey     || 'win';
      var tk  = DEFAULTS.tieKey     || 'tie';

      // ---------- Equity automático ----------
      var eqPct = Number(st[ek]);
      if (!isFinite(eqPct)) {
        var win = Number(st[wk]); 
        var tie = Number(st[tk]);
        if (isFinite(win) && isFinite(tie)) {
          eqPct = (win + 0.5 * tie) * 100;
        }
      }
      if (!isFinite(eqPct)) eqPct = 50; // fallback

      // ---------- Pot / To call em FICHAS ----------
      var potAtual = Number(st[pk]);   if (!isFinite(potAtual)) potAtual = 0;
      var toCall   = Number(st[ck]);   if (!isFinite(toCall))   toCall   = 0;

      return {
        maoLabel: st.maoLabel || st.mao || '',
        categoria: st.maoCategoria || 'premium (top 20)',
        // stackBB e raiseBB não são mais usados na calculadora de pot odds
        callers: Number(st.callers || 0),

        potAtual: potAtual,
        toCall: toCall,
        equityPct: eqPct,
        rakePct: Number(st.rakePct || 0),
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
    pos: 'IP',            // 'IP' | 'OOP' | null (mantido para textos de 3-bet fallback)
    callers: 0,           // nº de callers entre agressor e você (mantido p/ fallback)
    usePotOdds: true,     // mostra mini calculadora quando tomeiRaise = true
    lastPotOdds: null,
    _cfg: null,
    // Overrides vindos via setState() ou inputs da calculadora
    overrides: {
      potAtual: undefined,
      toCall: undefined,
      equityPct: undefined,
      rakePct: undefined,
      rakeCap: undefined
    }
  };

  // ================== Utils ==================
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function roundHalf(x){ return Math.round(x*2)/2; }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  // Pot Odds (unidade-agnóstica; se pot/toCall estão na mesma unidade (fichas), funciona)
  function potOddsBE(potAtual, toCall, rakePct, rakeCap){
    potAtual = Number(potAtual||0);
    toCall   = Number(toCall||0);
    rakePct  = Number(rakePct||0);
    rakeCap  = (rakeCap==null)?Infinity:Number(rakeCap);
    var potFinal = potAtual + toCall;
    var rake = Math.min(potFinal * rakePct, rakeCap);
    var potFinalEfetivo = Math.max(0, potFinal - rake);
    var be = toCall / (potFinalEfetivo || 1); // break-even (0..1)
    return { be: be, bePct: +(be*100).toFixed(1), potFinal: potFinal, potFinalEfetivo: potFinalEfetivo, rake: rake };
  }
  function decideVsRaise(potAtual, toCall, equityPct, rakePct, rakeCap){
    var r = potOddsBE(potAtual, toCall, rakePct, rakeCap);
    var bePct = r.bePct;
    var eq    = Number(equityPct||0);
    var buffer = 3; // zona cinza +/-3pp
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
      + '.input-modern{position:relative}\n'
      + '.input-modern input{width:90px;padding:.48rem .6rem;border:1px solid #334155;'
        + 'background:#0f172a;color:#e5e7eb;border-radius:.6rem;outline:0;transition:border-color .15s, box-shadow .15s}\n'
      + '.input-modern input::placeholder{color:#64748b}\n'
      + '.input-modern input:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(96,165,250,.15)}\n'
      + '.raise-checks{display:flex;align-items:center;gap:1rem}\n'
      + '.rc-item{display:flex;align-items:center;gap:.35rem;cursor:pointer;font-size:.9rem;color:#e5e7eb}\n'
      + '.rc-item input{width:16px;height:16px;cursor:pointer}\n'
      + '.rc-item.active span{font-weight:700;color:#38bdf8}\n'
      + '.raise-potodds.card{background:#0b1324;border:1px solid #22304a;border-radius:10px;padding:10px;line-height:1.2}\n'
    ;
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ================== Lógica da recomendação (fallback simples) ==================
  function buildSuggestion(ctx){
    var maoLabel = ctx.maoLabel || ctx.categoria || '';
    var posIn    = ctx.pos;
    var pos      = posIn || 'IP';
    var posIndef = (posIn == null);
    var callers  = Number(ctx.callers || 0);

    // Fallback textual quando não estamos mostrando pot odds
    var actionText = 'Sem cálculo de pot odds.\n'
      + '→ Contexto: ' + (ctx.tomeiRaise ? 'Houve raise antes' : 'Sem raise antes') + (callers>0? (' + ' + callers + ' caller(s)'):'') + ' (' + pos + ').\n'
      + '→ Mão: ' + (maoLabel || '—') + '.';
    return actionText + (posIndef ? '\n(Obs.: posição não marcada — usando IP padrão)' : '');
  }

  // ================== UI helpers ==================
  function buildPotInputs(initialPot, initialCall){
    var wrap = el('div','field');
    // Pot (fichas)
    var potWrap = el('div','field');
    var potLbl  = el('span','fld-label'); potLbl.textContent='Pot (fichas):';
    var potInpW = el('div','input-modern'); potInpW.innerHTML='<input id="inp-pot" type="number" step="1" min="0" placeholder="ex: 1200">';
    potWrap.appendChild(potLbl); potWrap.appendChild(potInpW);

    // A pagar (fichas)
    var callWrap = el('div','field');
    var callLbl  = el('span','fld-label'); callLbl.textContent='A pagar (fichas):';
    var callInpW = el('div','input-modern'); callInpW.innerHTML='<input id="inp-call" type="number" step="1" min="0" placeholder="ex: 400">';
    callWrap.appendChild(callLbl); callWrap.appendChild(callInpW);

    // Prefill
    var potInp  = potInpW.querySelector('input');
    var callInp = callInpW.querySelector('input');
    if (isFinite(initialPot) && initialPot>0) potInp.value = String(initialPot);
    if (isFinite(initialCall) && initialCall>0) callInp.value = String(initialCall);

    return {
      group: [potWrap, callWrap],
      potInput: potInp,
      callInput: callInp
    };
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

    // (2) Posição (mantido) — útil para textos fallback
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

    // (3) Nº de callers (mantido para contexto)
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
    pots.group.forEach(function(n){ bar.appendChild(n); });
    mount.appendChild(bar);

    // Estado inicial
    chk.checked = state.tomeiRaise;

    ipCb.checked  = (state.pos==='IP');
    oopCb.checked = (state.pos==='OOP');
    ipWrap.classList.toggle('active', ipCb.checked);
    oopWrap.classList.toggle('active', oopCb.checked);

    if (typeof state.callers === 'number') callersInput.value = String(state.callers);

    // Eventos
    chk.addEventListener('change',function(){
      state.tomeiRaise=chk.checked; updateSuggestion(cfg);
    });
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

    // modo editável (opcional) — aqui manteríamos inputs extras, mas você pediu compacto
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
    // Lê PC.state
    var st = cfg.readState();

    // Aplica overrides digitados na calculadora (se houver)
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
      // Pot Odds
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

      // sync visual mínimo
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
