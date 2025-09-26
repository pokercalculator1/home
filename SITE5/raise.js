// raise.js — "Tomei Raise" com switch e posição via checkboxes (sem fundo/borda nos rc-item)
// API: window.RAISE.init({ mountSelector, suggestSelector, onUpdateText, readState })
(function (g) {
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

  var state = {
    mounted: false,
    elements: {},
    tomeiRaise: false,
    pos: 'IP',
    raiseBB: null,
    callers: 0,
    stackBB: 100,
    _cfg: null
  };

  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function roundHalf(x){ return Math.round(x*2)/2; }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  function ensureCSS(){
    if ($('#raise-css-hook')) return;
    var css = ''
      + '.raise-bar{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}\n'
      + '.raise-sep{width:1px;height:26px;background:#ddd;margin:0 .5rem}\n'
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
      /* checkboxes simples */
      + '.raise-checks{display:flex;align-items:center;gap:1rem}\n'
      + '.rc-item{display:flex;align-items:center;gap:.35rem;cursor:pointer;font-size:.9rem;color:#e5e7eb}\n'
      + '.rc-item input{width:16px;height:16px;cursor:pointer}\n'
      + '.rc-item.active span{font-weight:600;color:#38bdf8}\n';
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

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

    return actionText + '\nStack efetivo: ~' + stackBB + ' BB.' + (shoveHint ? '\n' + shoveHint : '') + (posIndef ? '\n(Obs.: posição não marcada — usando IP padrão)' : '');
  }

  function renderControls(cfg){
    var mount = $(cfg.mountSelector);
    if (!mount) return null;
    var bar = el('div', 'raise-bar');

    // Switch Tomei Raise
    var switchWrap = el('div', 'raise-switch');
    var labelTxt = el('span', 'label'); labelTxt.textContent = 'Tomei Raise';
    var rsw = el('label', 'rsw');
    var chk = document.createElement('input'); chk.type='checkbox'; chk.id='chk-tomei-raise';
    var slider = el('span', 'slider');
    rsw.appendChild(chk); rsw.appendChild(slider);
    switchWrap.appendChild(labelTxt); switchWrap.appendChild(rsw);

    // separador
    var sep = el('div','raise-sep');

    // Posição: checkboxes
    var grpPos = el('div', 'raise-checks');
    var ipWrap  = el('label', 'rc-item'); var ipCb=document.createElement('input'); ipCb.type='checkbox'; var ipTxt=document.createElement('span'); ipTxt.textContent='Depois (IP)'; ipWrap.appendChild(ipCb); ipWrap.appendChild(ipTxt);
    var oopWrap = el('label', 'rc-item'); var oopCb=document.createElement('input'); oopCb.type='checkbox'; var oopTxt=document.createElement('span'); oopTxt.textContent='Antes (OOP)'; oopWrap.appendChild(oopCb); oopWrap.appendChild(oopTxt);
    grpPos.appendChild(ipWrap); grpPos.appendChild(oopWrap);

    // Inputs
    var inRaise   = el('div','raise-input'); inRaise.innerHTML='Raise (BB): <input id="inp-raise-bb" type="number" step="0.5" min="1">';
    var inCallers = el('div','raise-input'); inCallers.innerHTML='#Callers: <input id="inp-callers" type="number" step="1" min="0" value="0">';
    var inStack   = el('div','raise-input'); inStack.innerHTML='Stack (BB): <input id="inp-stack" type="number" step="1" min="1">';

    bar.appendChild(switchWrap);
    bar.appendChild(sep);
    bar.appendChild(grpPos);
    bar.appendChild(el('div','raise-sep'));
    bar.appendChild(inRaise);
    bar.appendChild(inCallers);
    bar.appendChild(inStack);
    mount.appendChild(bar);

    chk.checked = state.tomeiRaise;
    ipCb.checked  = (state.pos==='IP');
    oopCb.checked = (state.pos==='OOP');
    ipWrap.classList.toggle('active', ipCb.checked);
    oopWrap.classList.toggle('active', oopCb.checked);

    chk.addEventListener('change',function(){ state.tomeiRaise=chk.checked; updateSuggestion(cfg); });
    function sync(){ ipWrap.classList.toggle('active', ipCb.checked); oopWrap.classList.toggle('active', oopCb.checked); }
    ipCb.addEventListener('change',function(){ if(ipCb.checked){ oopCb.checked=false; state.pos='IP'; } else state.pos=null; sync(); updateSuggestion(cfg); });
    oopCb.addEventListener('change',function(){ if(oopCb.checked){ ipCb.checked=false; state.pos='OOP'; } else state.pos=null; sync(); updateSuggestion(cfg); });

    $('#inp-raise-bb',bar).addEventListener('input',function(){ var v=parseFloat(this.value); state.raiseBB=(isFinite(v)&&v>0?v:null); updateSuggestion(cfg); });
    $('#inp-callers',bar).addEventListener('input',function(){ var v=parseInt(this.value,10); state.callers=(isFinite(v)&&v>=0?v:0); updateSuggestion(cfg); });
    $('#inp-stack',bar).addEventListener('input',function(){ var v=parseInt(this.value,10); state.stackBB=(isFinite(v)&&v>0?v:state.stackBB); updateSuggestion(cfg); });

    return { bar,chk,ipCb,oopCb,ipWrap,oopWrap };
  }

  function updateSuggestion(cfg){
    var st = cfg.readState();
    var texto = buildSuggestion({
      maoLabel: st.maoLabel, categoria: st.categoria,
      stackBB: state.stackBB, raiseBB: state.raiseBB,
      callers: state.callers, pos: state.pos,
      tomeiRaise: state.tomeiRaise
    });
    if (typeof cfg.onUpdateText==='function') cfg.onUpdateText(texto,{});
    else { var sug=$(cfg.suggestSelector); if(sug) sug.innerText=texto; }
  }

  g.RAISE = {
    init: function(userCfg){ if(state.mounted)return; ensureCSS(); var cfg=Object.assign({},DEFAULTS,userCfg||{}); var els=renderControls(cfg); if(!els){console.warn('[raise] mountSelector não encontrado:',cfg.mountSelector);return;} state.elements=els; state.mounted=true; state._cfg=cfg; updateSuggestion(cfg); }
  };
})(window);
