// raise.js — "Tomei Raise" com switch e posição via checkboxes
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
    pos: 'IP',        // 'IP' | 'OOP' | null (quando ambas checkboxes desmarcadas)
    raiseBB: null,    // tamanho do raise do vilão (em BB)
    callers: 0,       // numero de callers entre agressor e você
    stackBB: 100,     // stack efetivo em BB
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
      + '.raise-bar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}\n'
      + '.raise-sep{width:1px;height:26px;background:#ddd;margin:0 .25rem}\n'
      + '.raise-group{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}\n'
      + '.raise-input{display:flex;gap:.35rem;align-items:center;font-size:.92rem}\n'
      + '.raise-input input{width:80px;padding:.35rem .4rem;border:1px solid #bbb;border-radius:.4rem}\n'
      /* switch styles */
      + '.raise-switch{display:inline-flex;align-items:center;gap:.45rem}\n'
      + '.raise-switch .label{font-weight:600}\n'
      + '.rsw{position:relative;display:inline-block;width:48px;height:24px}\n'
      + '.rsw input{opacity:0;width:0;height:0}\n'
      + '.rsw .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#cbd5e1;transition:.25s;border-radius:24px}\n'
      + '.rsw .slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#fff;transition:.25s;border-radius:50%}\n'
      + '.rsw input:checked + .slider{background:#22c55e}\n'
      + '.rsw input:checked + .slider:before{transform:translateX(24px)}\n'
      /* checkbox estilo chip */
      + '.raise-checks{display:flex;align-items:center;gap:.75rem}\n'
      + '.rc-item{display:flex;align-items:center;gap:.35rem;padding:.25rem .45rem;border:1px solid #bbb;border-radius:.5rem;background:#fff;cursor:pointer}\n'
      + '.rc-item input{width:16px;height:16px}\n'
      + '.rc-item.active{background:#e9eefc;border-color:#5b76f7}\n';
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
    var posIn    = ctx.pos;                    // pode ser null
    var pos      = posIn || 'IP';              // default para cálculo
    var posIndef = (posIn == null);            // aviso suave

    // tamanhos base
    var threeBetMulti = (pos === 'IP') ? 3.0 : 3.8;
    var squeezeBase   = (pos === 'IP') ? 4.0 : 4.7;
    var squeezePerCaller = 1.0;

    // ajuste por stack curto
    var shoveHint = null;
    if (stackBB <= 20){
      shoveHint = 'Stack curto (<=20BB): considere all-in (jam) com AA–QQ e AK; evite call.\n'
                + 'Se a mão for média (pares médios/baixos, AJs-ATs), prefira fold ou 3-bet/fold.';
      threeBetMulti = (pos === 'IP') ? 2.8 : 3.2;
      squeezeBase   = (pos === 'IP') ? 3.5 : 4.2;
    } else if (stackBB <= 35){
      threeBetMulti = threeBetMulti - 0.2;
      squeezeBase   = squeezeBase - 0.2;
    }

    var tomei = !!ctx.tomeiRaise;
    var isSqueeze = tomei && callers > 0;

    // Sizing recomendado
    var sizeText = '';
    if (R > 0){
      if (isSqueeze){
        var sizSq = roundHalf(R * (squeezeBase + callers * squeezePerCaller));
        sizeText = '**Squeeze: ~' + sizSq + ' BB** (aprox. ' + squeezeBase + 'x R'
                 + (callers>0 ? ' + ' + callers + 'x R por caller' : '') + ').';
      } else {
        var siz3 = roundHalf(R * threeBetMulti);
        sizeText = '**3-bet: ~' + siz3 + ' BB** (aprox. ' + threeBetMulti.toFixed(1) + 'x o raise).';
      }
    } else {
      sizeText = isSqueeze
        ? '**Squeeze: ~' + squeezeBase + 'x o raise + 1x R por caller**.'
        : '**3-bet: ~' + threeBetMulti.toFixed(1) + 'x o raise**.';
    }

    // heurística simples por categoria
    var cat = String(ctx.categoria || '').toLowerCase();
    var premiumLike = /(premium|aa|kk|qq|ak|aqs)/.test(cat) || /(AA|KK|QQ|AKs|AKo|AQs)/i.test(String(ctx.maoLabel||''));

    var actionText = '';
    if (!tomei){
      actionText = 'Sem raise antes.\n'
                 + '-> Mao ' + maoLabel + ' — Abra 2.5–3 BB.';
    } else {
      if (isSqueeze){
        actionText = 'Houve raise e ' + callers + ' call' + (callers>1?'ers':'') + ' antes de voce (spot de squeeze).\n'
                   + '-> ' + sizeText + '\n'
                   + '-> Valor: Premium + (JJ/TT, AQs, KQs).\n'
                   + '-> Light: A5s–A2s, broadways suited.';
      } else {
        if (premiumLike){
          actionText = 'Houve raise antes (' + pos + ').\n'
                     + '-> ' + sizeText + '\n'
                     + '-> Plano: 3-bet por valor; vs 4-bet continue com AA/KK/QQ/AK.';
        } else if (/forte|jj|tt|ajs|kqs/i.test(cat + String(ctx.maoLabel||''))) {
          actionText = 'Houve raise antes (' + pos + ').\n'
                     + '-> ' + sizeText + '\n'
                     + '-> Plano: Mix CALL/3-bet (mais 3-bet OOP; mais call IP contra opens tardios).';
        } else if (/media|99|88|77|66|55|44|33|22|ajo|kqo|ats|a5s|a4s|a3s|a2s|98s|87s|76s|qjs|kjs|jts/i.test(cat + String(ctx.maoLabel||''))) {
          actionText = 'Houve raise antes (' + pos + ').\n'
                     + '-> IP: mais CALL; OOP: selecione 3-bet light boas ou fold.\n'
                     + sizeText;
        } else {
          actionText = 'Houve raise antes (' + pos + ').\n'
                     + '-> Range marginal: Fold na maioria dos casos.'
                     + (R ? '' : ' Eventualmente 3-bet light vs steal muito alto.');
        }
      }
    }

    var stackNote = 'Stack efetivo: ~' + stackBB + ' BB.';
    var shoveNote = shoveHint ? '\n' + shoveHint : '';
    var posNote   = posIndef ? '\n(Obs.: posição não marcada — usando IP como padrão para sizings.)' : '';
    return actionText + '\n' + stackNote + shoveNote + posNote;
  }

  // ================== UI / Montagem ==================
  function renderControls(cfg){
    var mount = $(cfg.mountSelector);
    if (!mount) return null;

    var bar = el('div', 'raise-bar');

    // Switch Tomei Raise
    var switchWrap = el('div', 'raise-switch');
    var labelTxt = el('span', 'label'); labelTxt.appendChild(document.createTextNode('Tomei Raise'));
    var rsw = el('label', 'rsw');
    var chk = document.createElement('input'); chk.type = 'checkbox'; chk.id = 'chk-tomei-raise';
    var slider = el('span', 'slider');
    rsw.appendChild(chk); rsw.appendChild(slider);
    switchWrap.appendChild(labelTxt); switchWrap.appendChild(rsw);

    // POSIÇÃO: checkboxes
    var grpPos = el('div', 'raise-checks');

    var ipWrap  = el('label', 'rc-item');
    var ipCb    = document.createElement('input'); ipCb.type='checkbox'; ipCb.id='pos-ip';
    var ipTxt   = document.createElement('span'); ipTxt.textContent='Depois (IP)';
    ipWrap.appendChild(ipCb); ipWrap.appendChild(ipTxt);

    var oopWrap = el('label', 'rc-item');
    var oopCb   = document.createElement('input'); oopCb.type='checkbox'; oopCb.id='pos-oop';
    var oopTxt  = document.createElement('span'); oopTxt.textContent='Antes (OOP)';
    oopWrap.appendChild(oopCb); oopWrap.appendChild(oopTxt);

    grpPos.appendChild(ipWrap); grpPos.appendChild(oopWrap);

    // Inputs
    var inRaise = el('div', 'raise-input');
    inRaise.innerHTML = 'Raise (BB): <input id="inp-raise-bb" type="number" step="0.5" min="1" placeholder="ex: 3">';

    var inCallers = el('div', 'raise-input');
    inCallers.innerHTML = '#Callers: <input id="inp-callers" type="number" step="1" min="0" value="0">';

    var inStack = el('div', 'raise-input');
    inStack.innerHTML = 'Stack (BB): <input id="inp-stack" type="number" step="1" min="1" placeholder="ex: 100">';

    // Monta
    bar.appendChild(switchWrap);
    bar.appendChild(grpPos);
    bar.appendChild(el('div', 'raise-sep'));
    bar.appendChild(inRaise);
    bar.appendChild(inCallers);
    bar.appendChild(inStack);
    mount.appendChild(bar);

    // Estado visual inicial
    chk.checked = state.tomeiRaise;

    ipCb.checked  = (state.pos === 'IP');
    oopCb.checked = (state.pos === 'OOP');
    ipWrap.classList.toggle('active', ipCb.checked);
    oopWrap.classList.toggle('active', oopCb.checked);

    // Eventos
    chk.addEventListener('change', function(){
      state.tomeiRaise = chk.checked;
      updateSuggestion(cfg);
    });

    function syncPosVisual(){
      ipWrap.classList.toggle('active', ipCb.checked);
      oopWrap.classList.toggle('active', oopCb.checked);
    }
    ipCb.addEventListener('change', function(){
      if (ipCb.checked){
        oopCb.checked = false;
        state.pos = 'IP';
      } else {
        state.pos = null; // sem posição definida
      }
      syncPosVisual();
      updateSuggestion(cfg);
    });
    oopCb.addEventListener('change', function(){
      if (oopCb.checked){
        ipCb.checked = false;
        state.pos = 'OOP';
      } else {
        state.pos = null;
      }
      syncPosVisual();
      updateSuggestion(cfg);
    });

    var raiseInput   = $('#inp-raise-bb', bar);
    var callersInput = $('#inp-callers', bar);
    var stackInput   = $('#inp-stack', bar);

    if (raiseInput) raiseInput.addEventListener('input', function(){
      var v = parseFloat(raiseInput.value);
      state.raiseBB = (isFinite(v) && v > 0) ? v : null;
      updateSuggestion(cfg);
    });
    if (callersInput) callersInput.addEventListener('input', function(){
      var v = parseInt(callersInput.value, 10);
      state.callers = (isFinite(v) && v >= 0) ? v : 0;
      updateSuggestion(cfg);
    });
    if (stackInput) stackInput.addEventListener('input', function(){
      var v = parseInt(stackInput.value, 10);
      state.stackBB = (isFinite(v) && v > 0) ? v : state.stackBB;
      updateSuggestion(cfg);
    });

    // Prefill inicial a partir do seu app (se houver)
    var st = cfg.readState();
    if (st.stackBB) { state.stackBB = st.stackBB; if (stackInput && !stackInput.value) stackInput.value = st.stackBB; }
    if (typeof st.callers === 'number' && callersInput) { state.callers = st.callers; callersInput.value = st.callers; }

    return {
      bar: bar, chk: chk,
      ipWrap: ipWrap, oopWrap: oopWrap, ipCb: ipCb, oopCb: oopCb,
      raiseInput: raiseInput, callersInput: callersInput, stackInput: stackInput
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

  // ================== API ==================
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
      if ('callers' in patch)   state.callers = clamp(parseInt(patch.callers || 0, 10), 0, 9);
      if ('stackBB' in patch)   state.stackBB = clamp(parseInt(patch.stackBB || 100, 10), 1, 1000);

      // sync visual
      var els = state.elements || {};
      if (els.chk) els.chk.checked = !!state.tomeiRaise;
      if (els.ipCb && els.oopCb && els.ipWrap && els.oopWrap){
        els.ipCb.checked  = (state.pos === 'IP');
        els.oopCb.checked = (state.pos === 'OOP');
        els.ipWrap.classList.toggle('active', els.ipCb.checked);
        els.oopWrap.classList.toggle('active', els.oopCb.checked);
      }
      if (els.callersInput && isFinite(state.callers)) els.callersInput.value = state.callers;

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

  g.RAISE = API; // exporta

})(window);
