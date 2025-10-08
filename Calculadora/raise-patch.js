
// ==== PATCH CASH | TORNEIO | PERSONALIZADO + "POT ou All-in (auto)" ====
// This file depends on elements created by your main raise.js UI (range-box, rp-* ids, inp-eff, inp-bb).

(function(){
  if (!window || !window.RAISE) return;

  // CSS extra (segment control + collapse)
  (function addPatchCSS(){
    if (document.getElementById('raise-patch-css')) return;
    var sty = document.createElement('style');
    sty.id = 'raise-patch-css';
    sty.textContent =
      '.seg{display:flex;gap:.5rem;background:#0b1324;border:1px solid #22304a;border-radius:.6rem;padding:.25rem;margin-bottom:6px}'
    + '.seg-item{display:flex;align-items:center}'
    + '.seg-item input{display:none}'
    + '.seg-item span{padding:.35rem .6rem;border-radius:.5rem;cursor:pointer}'
    + '.seg-item input:checked+span{background:#1f2937;border:1px solid #334155}'
    + '.range-box.collapsed{display:none}';
    document.head.appendChild(sty);
  })();

  // helpers
  function q(sel, root){ return (root||document).querySelector(sel); }
  function on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }
  function setVal(el, v){
    if(!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function setCheck(el, v){
    if(!el) return;
    el.checked = !!v;
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }

  // cria o seletor Cash/Torneio/Personalizado
  function ensureModeSeg(){
    var mount = q('#pcalc-toolbar');
    if (!mount) return null;
    if (q('.seg[data-role="mode"]', mount)) return q('.seg[data-role="mode"]', mount);

    var seg = document.createElement('div');
    seg.className = 'seg';
    seg.dataset.role = 'mode';
    seg.innerHTML = ''
      + '<label class="seg-item"><input type="radio" name="pcalc-mode" value="cash" checked><span>Cash</span></label>'
      + '<label class="seg-item"><input type="radio" name="pcalc-mode" value="tournament"><span>Torneio</span></label>'
      + '<label class="seg-item"><input type="radio" name="pcalc-mode" value="custom"><span>Personalizado</span></label>';
    mount.insertBefore(seg, mount.firstChild);

    Array.from(seg.querySelectorAll('input[name="pcalc-mode"]')).forEach(function(r){
      on(r,'change', function(){
        applyPreset(this.value);
        toggleRangeBox(this.value);
      });
    });
    return seg;
  }

  // garante que a opção "POT ou All-in (auto)" exista no select Low
  function ensureAutoOption(){
    var box = q('.range-box'); if (!box) return;
    var lowSel = q('#rp-low-act', box); if (!lowSel) return;
    var has = Array.from(lowSel.options).some(function(o){ return o.textContent === 'Aposte POT ou All-in (auto)'; });
    if (!has){
      var opt = document.createElement('option');
      opt.textContent = 'Aposte POT ou All-in (auto)';
      lowSel.insertBefore(opt, lowSel.firstChild);
    }
  }

  // presets
  function applyPreset(mode){
    var box = q('.range-box'); if (!box) return;
    ensureAutoOption();

    var en    = q('#rp-en', box);
    var lowI  = q('#rp-low', box);
    var highI = q('#rp-high', box);
    var lowEn = q('#rp-low-en', box);
    var midEn = q('#rp-mid-en', box);
    var highEn= q('#rp-high-en', box);
    var lowAct= q('#rp-low-act', box);
    var midAct= q('#rp-mid-act', box);
    var highAct= q('#rp-high-act', box);

    if (mode === 'tournament'){
      setCheck(en, true);
      setVal(lowI, 15); setVal(highI, 40);
      setCheck(lowEn, true); setCheck(midEn, true); setCheck(highEn, true);
      setVal(lowAct, 'Aposte grande / All-in');
      setVal(midAct, 'Aposte 75–100%');
      setVal(highAct,'Aposte 50–75%');
      return;
    }
    if (mode === 'custom'){
      return; // não mexe no que o usuário setou
    }
    // CASH (default)
    setCheck(en, true);
    setVal(lowI, 20); setVal(highI, 60);
    setCheck(lowEn, true); setCheck(midEn, true); setCheck(highEn, true);
    setVal(lowAct, 'Aposte POT ou All-in (auto)');
    setVal(midAct, 'Aposte 50–75%');
    setVal(highAct,'Aposte 40–60%');
    autoLow();
  }

  // colapsa/mostra a caixa de faixas conforme o modo
  function toggleRangeBox(mode){
    var box = q('.range-box'); if (!box) return;
    if (mode === 'custom') box.classList.remove('collapsed');
    else box.classList.add('collapsed');
  }

  // calcula Efetivo(BB)
  function effBB(){
    var eff = Number((q('#inp-eff')||{}).value || NaN);
    var bb  = Number((q('#inp-bb') ||{}).value || NaN);
    if (!isFinite(eff) || !isFinite(bb) || bb <= 0) return NaN;
    return +(eff / bb).toFixed(1);
  }

  // converte "POT ou All-in (auto)" -> ação real baseada em Efetivo(BB)
  function autoLow(){
    var box = q('.range-box'); if (!box) return;
    var lowSel = q('#rp-low-act', box); if (!lowSel) return;
    if (lowSel.value !== 'Aposte POT ou All-in (auto)') return;

    var ebb = effBB();
    if (!isFinite(ebb)) return;
    var target = (ebb <= 12) ? 'Aposte grande / All-in' : 'Aposte 75–100%';
    if (lowSel.value !== target){
      setVal(lowSel, target);
    }
  }

  // listeners para manter "auto"
  function wireAutoLow(){
    ['input','change'].forEach(function(ev){
      on(q('#inp-eff'), ev, autoLow);
      on(q('#inp-bb'),  ev, autoLow);
    });
    var box = q('.range-box');
    if (box){
      on(q('#rp-low-act', box), 'change', autoLow);
    }
  }

  // boot
  function boot(){
    ensureModeSeg();
    applyPreset('cash');
    toggleRangeBox('cash');
    wireAutoLow();
  }

  // espera UI pronta
  var tries = 0;
  var t = setInterval(function(){
    if (document.querySelector('.range-box')){
      clearInterval(t);
      try { boot(); } catch(e){ console.warn('[raise-patch] erro no boot:', e); }
    }
    if (++tries > 60) clearInterval(t);
  }, 250);

})();
