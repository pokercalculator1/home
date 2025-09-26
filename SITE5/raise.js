// raise.js — "Tomei Raise" com layout reorganizado e callers inline
// API: window.RAISE.init({ mountSelector, suggestSelector, onUpdateText, readState })
//      window.RAISE.setState({ tomeiRaise, pos, raiseBB, callers, stackBB })
//      window.RAISE.getRecommendation()
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
        callers: Number(st.callers || 0)
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
    _cfg: null
  };

  // ================== Utils ==================
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function roundHalf(x){ return Math.round(x*2)/2; }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  function ensureCSS(){
    if ($('#raise-css-hook')) return;
    var css = ''
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
        + 'background:#0f172a;color:#e5e7eb;border:1px solid #334155;border-radius:.6rem;cursor:pointer;user-select:none}\n'
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
      /* posição (IP/OOP) */
      + '.pos-wrap{display:flex;align-items:center;gap:.6rem}\n'
      + '.pos-legend{color:#e5e7eb;font-weight:700}\n'
      + '.raise-checks{display:flex;align-items:center;gap:1rem}\n'
      + '.rc-item{display:flex;align-items:center;gap:.35rem;cursor:pointer;font-size:.9rem;color:#e5e7eb}\n'
      + '.rc-item input{width:16px;height:16px;cursor:pointer}\n'
      + '.rc-item.active span{font-weight:700;color:#38bdf8}\n';
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ================== Lógica da recomendação ==================
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
    var lbl  = el('span','fld-label'); lbl.textContent = 'Nº de callers:';
    var btn  = el('button','menu-btn'); btn.type='button'; btn.textContent = (current||0) + ' selecionado';

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
          btn.textContent = v + ' selecionado';
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
      // posiciona o painel logo abaixo do botão
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

    // (5) Posição com legenda clara
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

    // Montagem na ordem solicitada: switch | raise | stack | callers | posição
    bar.appendChild(switchWrap);
    bar.appendChild(el('div','raise-sep'));
    bar.appendChild(raiseField);
    bar.appendChild(el('div','raise-sep'));
    bar.appendChild(stackField);
    bar.appendChild(el('div','raise-sep'));
    bar.appendChild(callers.wrap);
    bar.appendChild(el('div','raise-sep'));
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

    // Prefill inicial a partir do app (se houver)
    var st = cfg.readState();
    if (st.stackBB) { state.stackBB = st.stackBB; if (stackInput && !stackInput.value) stackInput.value = st.stackBB; }
    if (typeof st.callers === 'number') {
      state.callers = clamp(st.callers, 0, 8);
      callers.btn.textContent = state.callers + ' selecionado';
      // marcar ativo no menu
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

  function updateSuggestion(cfg){
    var st = cfg.readState();
    var texto = buildSuggestion({
      maoLabel: st.maoLabel,
      categoria: st.categoria,
      stackBB: state.stackBB,
      raiseBB: state.raiseBB,
      callers: state.callers,
      pos: state.pos,
      tomeiRaise: state.tomeiRaise
    });

    if (typeof cfg.onUpdateText === 'function'){
      cfg.onUpdateText(texto, {});
    } else {
      var out = $(cfg.suggestSelector);
      if (out) out.innerText = texto;
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

      // sync visual básicos
      var els = state.elements || {};
      if (els.chk) els.chk.checked = !!state.tomeiRaise;

      if (els.ipCb && els.oopCb && els.ipWrap && els.oopWrap){
        els.ipCb.checked  = (state.pos === 'IP');
        els.oopCb.checked = (state.pos === 'OOP');
        els.ipWrap.classList.toggle('active', els.ipCb.checked);
        els.oopWrap.classList.toggle('active', els.oopCb.checked);
      }

      if (els.callersBtn && els.callersPanel){
        els.callersBtn.textContent = state.callers + ' selecionado';
        var act = els.callersPanel.querySelector('.menu-item.active'); if (act) act.classList.remove('active');
        var items = els.callersPanel.querySelectorAll('.menu-item');
        if (items[state.callers]) items[state.callers].classList.add('active');
      }

      if (state._cfg) updateSuggestion(state._cfg);
    },

    getRecommendation: function(){
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
    }
  };

  g.RAISE = API;

})(window);
