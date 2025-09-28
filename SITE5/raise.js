// raise.js — "Tomei Raise" com mini calculadora de Pot Odds no lugar do "3x"
// API pública (mantida e expandida):
//   window.RAISE.init({ mountSelector, suggestSelector, onUpdateText, readState })
//   window.RAISE.setState(patch)                 // { tomeiRaise, pos, raiseBB, callers, stackBB, ... }
//   window.RAISE.getRecommendation()             // texto ou último cálculo de Pot Odds
//   window.RAISE.setUsePotOdds(bool)             // novo: liga/desliga mini calculadora

(function (g) {
  // ================== Config ==================
  var DEFAULTS = {
    mountSelector: '#pcalc-toolbar',
    suggestSelector: '#pcalc-sugestao',
    readState: function () {
      var PC = g.PC || g.PCALC || {};
      var st = PC.state || {};
      return {
        maoLabel: st.maoLabel || st.mao || '',
        categoria: st.maoCategoria || 'premium (top 20)',
        stackBB: Number(st.stackBB || st.stack || 100),
        callers: Number(st.callers || 0),

        // Pot Odds (se o app já prover; senão o usuário digita no UI)
        potAtual: Number(st.potAtual || st.pot || 0),
        toCall: Number(st.toCall || st.chamar || 0),
        equityPct: Number(st.equityPct || st.eq || 50),
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
    pos: 'IP',        // 'IP' | 'OOP' | null (quando desmarcado)
    raiseBB: null,    // tamanho do raise do vilão (BB)
    callers: 0,       // nº de callers entre agressor e você
    stackBB: 100,     // stack efetivo (BB)
    usePotOdds: true, // NOVO: mostra mini calculadora quando tomeiRaise = true
    lastPotOdds: null, // guarda último cálculo para getRecommendation()
    _cfg: null
  };

  // ================== Utils ==================
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function roundHalf(x){ return Math.round(x*2)/2; }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  // Pot Odds helpers
  function potOddsBE(potAtual, toCall, rakePct, rakeCap){
    potAtual = Number(potAtual||0);
    toCall   = Number(toCall||0);
    rakePct  = Number(rakePct||0);
    rakeCap  = (rakeCap==null)?Infinity:Number(rakeCap);
    var potFinal = potAtual + toCall;
    var rake = Math.min(potFinal * rakePct, rakeCap);
    var potFinalEfetivo = Math.max(0, potFinal - rake);
    var be = toCall / (potFinalEfetivo || 1); // break-even (0..1)
    return { be: be, bePct: be*100, potFinal: potFinal, potFinalEfetivo: potFinalEfetivo, rake: rake };
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
      bePct: +bePct.toFixed(1),
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
      /* borda no toolbar */
      + '#pcalc-toolbar{border:1px dashed #334155;border-radius:5px;padding:8px}\n'
      + '.raise-bar{display:flex;gap:.9rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}\n'
      + '.field{display:flex;align-items:center;gap:.5rem}\n'
      + '.fld-label{color:#93c5fd;font-weight:600;white-space:nowrap}\n'
      /* inputs modernos */
      + '.input-modern{position:relative}\n'
      + '.input-modern input{width:60px;padding:.48rem .6rem;border:1px solid #334155;'
        + 'background:#0f172a;color:#e5e7eb;border-radius:.6rem;outline:0;transition:border-color .15s, box-shadow .15s}\n'
      + '.input-modern input::placeholder{color:#64748b}\n'
      + '.input-modern input:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(96,165,250,.15)}\n'
      /* switch */
      + '.raise-switch{display:inline-flex;align-items:center;gap:.45rem}\n'
      + '.raise-switch .label{font-weight:700;color:#e5e7eb}\n'
      + '.rsw{position:relative;display:inline-block;width:48px;height:24px}\n'
      + '.rsw input{opacity:0;width:0;height:0}\n'
      + '.rsw .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#475569;transition:.25s;border-radius:24px}\n'
      + '.rsw .slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#0b1324;transition:.25s;border-radius:50%}\n'
      + '.rsw input:checked + .slider{background:#22c55e}\n'
      + '.rsw input:checked + .slider:before{transform:translateX(24px)}\n'
      /* callers inline (menu) */
      + '.callers-inline{display:flex;align-items:center;gap:.5rem}\n'
      + '.menu-btn{display:inline-flex;align-items:center;gap:.5rem;padding:.45rem .6rem;'
        + 'background:#0f172a;color:#e5e7eb;border:1px solid #334155;border-radius:.6rem;cursor:pointer;user-select:none;min-width:60px;justify-content:center}\n'
      + '.menu-btn:hover{border-color:#60a5fa}\n'
      + '.menu-btn:focus{outline:0;box-shadow:0 0 0 3px rgba(96,165,250,.15)}\n'
      + '.menu-panel{position:absolute;margin-top:.35rem;min-width:140px;'
        + 'background:#0b1324;border:1px solid #334155;border-radius:.6rem;box-shadow:0 18px 45px rgba(0,0,0,.35);'
        + 'padding:.35rem;display:none;z-index:9999}\n'
      + '.menu-panel.open{display:block}\n'
      + '.menu-item{padding:.4rem .55rem;border-radius:.5rem;color:#e5e7eb;cursor:pointer;display:flex;align-items:center;gap:.5rem}\n'
      + '.menu-item:hover{background:#1e293b}\n'
      + '.menu-item .dot{width:10px;height:10px;border-radius:50%;background:#475569}\n'
      + '.menu-item.active .dot{background:#38bdf8}\n'
      /* posição (IP/OOP) — em linha própria, centralizado */
      + '.pos-wrap{display:flex;align-items:center;gap:.6rem;flex-basis:100%;justify-content:center}\n'
      + '.pos-legend{color:#e5e7eb;font-weight:700}\n'
      + '.raise-checks{display:flex;align-items:center;gap:1rem}\n'
      + '.rc-item{display:flex;align-items:center;gap:.35rem;cursor:pointer;font-size:.9rem;color:#e5e7eb}\n'
      + '.rc-item input{width:16px;height:16px;cursor:pointer}\n'
      + '.rc-item.active span{font-weight:700;color:#38bdf8}\n'
      /* Mini calculadora Pot Odds */
      + '.raise-potodds.card{background:#0b1324;border:1px solid #22304a;border-radius:10px;padding:10px;line-height:1.2}\n'
      + '.raise-potodds .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}\n'
      + '.raise-potodds input{background:#0f1a30;color:#e5e7eb;border:1px solid #22304a;border-radius:8px;padding:6px}\n'
    ;
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ================== Lógica da recomendação (fallback 3x) ==================
  function buildSuggestion(ctx){
    var maoLabel = ctx.maoLabel || ctx.categoria || '';
    var stackBB  = Number(ctx.stackBB || 100);
    var callers  = Number(ctx.callers || 0);
    var R        = Number(ctx.raiseBB || 0);
    var posIn    = ctx.pos;
    var pos      = posIn || 'IP';
    var posIndef = (posIn == null);

    var threeBetMulti = (pos === 'IP') ? 3.0 : 3.8;
    var squeezeBase   = (pos === 'IP') ? 4.0 : 4.7;
    var squeezePerCaller = 1.0;

    var shoveHint = null;
    if (stackBB <= 20){
      shoveHint = 'Stack curto (<=20BB): considere all-in (jam) com AA–QQ e AK; evite call.\n'
                + 'Se a mão for média (pares médios/baixos, AJs-ATs), prefira fold ou 3-bet/fold.';
      threeBetMulti = (pos === 'IP') ? 2.8 : 3.2;
      squeezeBase   = (pos === 'IP') ? 3.5 : 4.2;
    } else if (stackBB <= 35){
      threeBetMulti -= 0.2;
      squeezeBase   -= 0.2;
    }

    var tomei = !!ctx.tomeiRaise;
    var isSqueeze = tomei && callers > 0;

    var sizeText = '';
    if (R > 0){
      if (isSqueeze){
        var sizSq = roundHalf(R * (squeezeBase + callers * squeezePerCaller));
        sizeText = '**Squeeze: ~' + sizSq + ' BB**';
      } else {
        var siz3 = roundHalf(R * threeBetMulti);
        sizeText = '**3-bet: ~' + siz3 + ' BB**';
      }
    } else {
      sizeText = isSqueeze
        ? '**Squeeze: ~' + squeezeBase + 'x o raise + 1x R por caller**.'
        : '**3-bet: ~' + threeBetMulti.toFixed(1) + 'x o raise**.';
    }

    var actionText = '';
    if (!tomei){
      actionText = 'Sem raise antes.\n-> Mão ' + maoLabel + ' — Abra 2.5–3 BB.';
    } else {
      if (isSqueeze){
        actionText = 'Houve raise e ' + callers + ' caller(s) antes de você.\n-> ' + sizeText;
      } else {
        actionText = 'Houve raise antes (' + pos + ').\n-> ' + sizeText;
      }
    }

    return actionText
      + '\nStack efetivo: ~' + stackBB + ' BB.'
      + (shoveHint ? '\n' + shoveHint : '')
      + (posIndef ? '\n(Obs.: posição não marcada — usando IP padrão)' : '');
  }

  // ================== UI helpers ==================
  function buildCallersInline(current){
    // container inline: label + botão
    var wrap = el('div','field callers-inline');
    var lbl  = el('span','fld-label'); lbl.textContent = 'Nº callers:';
    var btn  = el('button','menu-btn'); btn.type='button'; btn.textContent = (current||0);

    // painel flutuante ancorado ao botão
    var holder = el('div'); holder.style.position = 'relative';
    var panel  = el('div','menu-panel');

    for (var i=0;i<=8;i++){
      var it = el('div','menu-item' + (i===current ? ' active' : ''));
      var dot = el('span','dot'); it.appendChild(dot);
      var tx  = document.createTextNode(i===0 ? '0 (nenhum)' : String(i));
      it.appendChild(tx);
      (function(v,item){
        item.addEventListener('click', function(){
          state.callers = v;
          btn.textContent = v;
          var act = panel.querySelector('.menu-item.active');
          if (act) act.classList.remove('active');
          item.classList.add('active');
          panel.classList.remove('open');
          if (state._cfg) updateSuggestion(state._cfg);
        });
      })(i,it);
      panel.appendChild(it);
    }

    btn.addEventListener('click', function(e){
      e.stopPropagation();
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        panel.style.left = '0';
        panel.style.top  = '100%';
      }
    });
    document.addEventListener('click', function(){
      panel.classList.remove('open');
    });

    holder.appendChild(btn);
    holder.appendChild(panel);
    wrap.appendChild(lbl);
    wrap.appendChild(holder);

    return { wrap:wrap, btn:btn, panel:panel };
  }

  // ================== UI / Montagem ==================
  function renderControls(cfg){
    var mount = $(cfg.mountSelector);
    if (!mount) return null;

    var bar = el('div', 'raise-bar');

    // (1) Switch Tomei Raise
    var switchWrap = el('div', 'raise-switch');
    var labelTxt = el('span', 'label'); labelTxt.textContent = 'Tomei Raise';
    var rsw = el('label', 'rsw');
    var chk = document.createElement('input'); chk.type='checkbox'; chk.id='chk-tomei-raise';
    var slider = el('span', 'slider');
    rsw.appendChild(chk); rsw.appendChild(slider);
    switchWrap.appendChild(labelTxt); switchWrap.appendChild(rsw);

    // (2) Raise (BB)
    var raiseField = el('div','field');
    var rLabel  = el('span','fld-label'); rLabel.textContent='Raise (BB):';
    var rWrap   = el('div','input-modern'); rWrap.innerHTML='<input id="inp-raise-bb" type="number" step="0.5" min="1" placeholder="ex: 3">';
    raiseField.appendChild(rLabel); raiseField.appendChild(rWrap);

    // (3) Stack (BB)
    var stackField = el('div','field');
    var sLabel  = el('span','fld-label'); sLabel.textContent='Stack (BB):';
    var sWrap   = el('div','input-modern'); sWrap.innerHTML='<input id="inp-stack" type="number" step="1" min="1" placeholder="ex: 100">';
    stackField.appendChild(sLabel); stackField.appendChild(sWrap);

    // (4) Nº de callers (inline)
    var callers = buildCallersInline(state.callers);

    // (5) Posição com legenda clara (centralizada em linha própria)
    var posWrap = el('div','pos-wrap');
    var posLegend = el('span','pos-legend');
    posLegend.textContent = 'Você está antes ou depois do agressor?';
    var grpPos = el('div','raise-checks');

    var ipWrap  = el('label', 'rc-item');
    var ipCb    = document.createElement('input'); ipCb.type='checkbox';
    var ipTxt   = document.createElement('span'); ipTxt.textContent='Depois (IP)';
    ipWrap.appendChild(ipCb); ipWrap.appendChild(ipTxt);

    var oopWrap = el('label', 'rc-item');
    var oopCb   = document.createElement('input'); oopCb.type='checkbox';
    var oopTxt  = document.createElement('span'); oopTxt.textContent='Antes (OOP)';
    oopWrap.appendChild(oopCb); oopWrap.appendChild(oopTxt);

    grpPos.appendChild(ipWrap); grpPos.appendChild(oopWrap);
    posWrap.appendChild(posLegend);
    posWrap.appendChild(grpPos);

    // Montagem na ordem: switch | raise | stack | callers | (linha) posição
    bar.appendChild(switchWrap);
    bar.appendChild(raiseField);
    bar.appendChild(stackField);
    bar.appendChild(callers.wrap);
    bar.appendChild(posWrap);
    mount.appendChild(bar);

    // Estado inicial
    chk.checked = state.tomeiRaise;

    ipCb.checked  = (state.pos==='IP');
    oopCb.checked = (state.pos==='OOP');
    ipWrap.classList.toggle('active', ipCb.checked);
    oopWrap.classList.toggle('active', oopCb.checked);

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
      syncPosVisual();
      updateSuggestion(cfg);
    });
    oopCb.addEventListener('change',function(){
      if(oopCb.checked){ ipCb.checked=false; state.pos='OOP'; }
      else { state.pos=null; }
      syncPosVisual();
      updateSuggestion(cfg);
    });

    var raiseInput = $('#inp-raise-bb', bar);
    var stackInput = $('#inp-stack', bar);

    if (raiseInput) raiseInput.addEventListener('input', function(){
      var v = parseFloat(raiseInput.value);
      state.raiseBB = (isFinite(v) && v > 0) ? v : null;
      updateSuggestion(cfg);
    });
    if (stackInput) stackInput.addEventListener('input', function(){
      var v = parseInt(stackInput.value, 10);
      state.stackBB = (isFinite(v) && v > 0) ? v : state.stackBB;
      updateSuggestion(cfg);
    });

    // Prefill inicial
    var st = cfg.readState();
    if (st.stackBB) { state.stackBB = st.stackBB; if (stackInput && !stackInput.value) stackInput.value = st.stackBB; }
    if (typeof st.callers === 'number') {
      state.callers = clamp(st.callers, 0, 8);
      callers.btn.textContent = state.callers;
      var act = callers.panel.querySelector('.menu-item.active'); if (act) act.classList.remove('active');
      var items = callers.panel.querySelectorAll('.menu-item');
      if (items[state.callers]) items[state.callers].classList.add('active'); // índice 0..8
    }

    return {
      bar: bar, chk: chk,
      ipCb: ipCb, oopCb: oopCb, ipWrap: ipWrap, oopWrap: oopWrap,
      raiseInput: raiseInput, stackInput: stackInput,
      callersBtn: callers.btn, callersPanel: callers.panel
    };
  }

  // ============== Render do bloco de sugestão ==============
  function renderPotOddsUI(ctx, cfg){
    var out = $(cfg.suggestSelector);
    if(!out) return;

    // valores iniciais (do estado/app), editáveis pelo usuário
    var potAtual = (ctx.potAtual != null) ? ctx.potAtual : '';
    var toCall   = (ctx.toCall   != null) ? ctx.toCall   : '';
    var equity   = (ctx.equityPct!= null) ? ctx.equityPct: '';
    var rakePct  = (ctx.rakePct  != null) ? ctx.rakePct  : 0;
    var rakeCap  = (ctx.rakeCap  != null) ? ctx.rakeCap  : '';

    var result = decideVsRaise(potAtual, toCall, equity, rakePct, rakeCap);
    state.lastPotOdds = result;

    out.innerHTML = `
      <div class="raise-potodds card">
        <div style="font-weight:700;margin-bottom:6px">Pot Odds (vs Raise)</div>

        <div class="grid">
          <label style="display:flex;flex-direction:column;gap:4px">
            <span>Pot atual</span>
            <input id="po-pot" type="number" min="0" step="0.1" value="${potAtual}">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">
            <span>To call</span>
            <input id="po-call" type="number" min="0" step="0.1" value="${toCall}">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">
            <span>Equity %</span>
            <input id="po-eq" type="number" min="0" max="100" step="0.1" value="${equity}">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">
            <span>Rake % (opcional)</span>
            <input id="po-rake" type="number" min="0" max="0.2" step="0.005" value="${rakePct}">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px">
            <span>Rake Cap (opcional)</span>
            <input id="po-cap" type="number" min="0" step="0.1" value="${(rakeCap===Infinity)?'':rakeCap}">
          </label>
        </div>

        <div id="po-out" style="margin-top:10px;font-size:14px">
          <div>BE (pot odds): <b>${result.bePct}%</b></div>
          <div>Equity: <b>${result.equityPct}%</b></div>
          <div>Recomendação: <span id="po-rec" style="padding:2px 8px;border-radius:999px;border:1px solid #22304a">${result.rec}</span></div>
        </div>
      </div>
    `;

    function recolor(recEl, rec){
      var c = rec === 'Call' ? '#10b981' : (rec === 'Fold' ? '#ef4444' : '#f59e0b');
      recEl.style.background = c + '22';
      recEl.style.borderColor = c + '66';
      recEl.style.color = '#e5e7eb';
    }
    recolor(out.querySelector('#po-rec'), result.rec);

    // listeners para recalcular ao editar campos
    var $pot  = out.querySelector('#po-pot');
    var $call = out.querySelector('#po-call');
    var $eq   = out.querySelector('#po-eq');
    var $rk   = out.querySelector('#po-rake');
    var $cap  = out.querySelector('#po-cap');

    function recompute(){
      var potVal  = Number($pot.value || 0);
      var callVal = Number($call.value || 0);
      var eqVal   = Number($eq.value || 0);
      var rkVal   = Number($rk.value || 0);
      var capVal  = $cap.value === '' ? Infinity : Number($cap.value || 0);

      var outCalc = decideVsRaise(potVal, callVal, eqVal, rkVal, capVal);
      state.lastPotOdds = outCalc;

      var outBox = out.querySelector('#po-out');
      if(outBox){
        outBox.innerHTML =
          `<div>BE (pot odds): <b>${outCalc.bePct}%</b></div>
           <div>Equity: <b>${outCalc.equityPct}%</b></div>
           <div>Recomendação: <span id="po-rec" style="padding:2px 8px;border-radius:999px;border:1px solid #22304a">${outCalc.rec}</span></div>`;
        var pill2 = out.querySelector('#po-rec');
        if(pill2) recolor(pill2, outCalc.rec);
      }

      if(typeof DEFAULTS.onUpdateText === 'function'){
        DEFAULTS.onUpdateText(`PotOdds: BE ${outCalc.bePct}% | EQ ${outCalc.equityPct}% → ${outCalc.rec}`);
      }
    }

    [$pot,$call,$eq,$rk,$cap].forEach(function(el){
      if(el) el.addEventListener('input', recompute);
    });

    // callback inicial
    if(typeof DEFAULTS.onUpdateText === 'function'){
      DEFAULTS.onUpdateText(`PotOdds: BE ${result.bePct}% | EQ ${result.equityPct}% → ${result.rec}`);
    }
  }

  function renderDefaultRecommendation(ctx, cfg){
    // fallback: mostra a msg padrão (ex.: “3x o raise”) quando a calculadora está desligada
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
    var ctx = {
      maoLabel: st.maoLabel,
      categoria: st.categoria,
      stackBB: state.stackBB,
      raiseBB: state.raiseBB,
      callers: state.callers,
      pos: state.pos,
      tomeiRaise: state.tomeiRaise,

      // Pot Odds
      potAtual: st.potAtual,
      toCall: st.toCall,
      equityPct: st.equityPct,
      rakePct: st.rakePct,
      rakeCap: st.rakeCap,
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
      if ('pos' in patch)       state.pos = (patch.pos === 'OOP' ? 'OOP' : (patch.pos === 'IP' ? 'IP' : null));
      if ('raiseBB' in patch)   state.raiseBB = (patch.raiseBB > 0 ? Number(patch.raiseBB) : null);
      if ('callers' in patch)   state.callers = clamp(parseInt(patch.callers || 0, 10), 0, 8);
      if ('stackBB' in patch)   state.stackBB = clamp(parseInt(patch.stackBB || 100, 10), 1, 1000);

      // também aceita setState para Pot Odds (opcional)
      if ('potAtual' in patch)   ; // valores são usados via readState; UI permite editar
      if ('toCall' in patch)     ;
      if ('equityPct' in patch)  ;
      if ('rakePct' in patch)    ;
      if ('rakeCap' in patch)    ;

      // sync visual
      var els = state.elements || {};
      if (els.chk) els.chk.checked = !!state.tomeiRaise;

      if (els.ipCb && els.oopCb && els.ipWrap && els.oopWrap){
        els.ipCb.checked  = (state.pos === 'IP');
        els.oopCb.checked = (state.pos === 'OOP');
        els.ipWrap.classList.toggle('active', els.ipCb.checked);
        els.oopWrap.classList.toggle('active', els.oopCb.checked);
      }

      if (els.callersBtn && els.callersPanel){
        els.callersBtn.textContent = state.callers;
        var act = els.callersPanel.querySelector('.menu-item.active'); if (act) act.classList.remove('active');
        var items = els.callersPanel.querySelectorAll('.menu-item');
        if (items[state.callers]) items[state.callers].classList.add('active');
      }

      if (state._cfg) updateSuggestion(state._cfg);
    },

    getRecommendation: function(){
      // Se PotOdds estiver ativo e houver último cálculo, devolve isso;
      if (state.usePotOdds && state.lastPotOdds){
        return { type: 'potodds', data: state.lastPotOdds };
      }
      // Caso contrário, retorna o texto padrão (3x, squeeze etc.)
      var cfg = state._cfg || DEFAULTS;
      var st  = cfg.readState();
      return buildSuggestion({
        maoLabel: st.maoLabel,
        categoria: st.categoria,
        stackBB: state.stackBB,
        raiseBB: state.raiseBB,
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
