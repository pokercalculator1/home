// login-guard.js
(function(){
  const AUTH_URL   = 'users.json';
  const TICK_MS    = 10000;
  const SESS_KEY   = 'pcalc_session';
  const OVERLAY_ID = 'pcalc-login-overlay';
  const BADGE_ID   = 'pcalc-user-badge';

  let USER_MAP = {};
  let _lastFetchOk = false;

  function parseExpiry(str){
    if(!str) return null;
    const s = String(str).trim();
    let d = null;
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
      const [dd,mm,yy] = s.split('/').map(Number);
      d = new Date(yy, mm-1, dd, 23,59,59,999);
    }else if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      const [yy,mm,dd] = s.split('-').map(Number);
      d = new Date(yy, mm-1, dd, 23,59,59,999);
    }
    return isNaN(d?.getTime()) ? null : d;
  }
  function now(){ return new Date(); }

  function sessGet(){
    try{ return JSON.parse(localStorage.getItem(SESS_KEY)||'null'); }catch(e){ return null; }
  }
  function sessSet(u, exp, extra){
    const obj = { u, exp, extra: extra||null, t: Date.now() };
    localStorage.setItem(SESS_KEY, JSON.stringify(obj));
    return obj;
  }
  function sessClear(){ localStorage.removeItem(SESS_KEY); }

  async function fetchWhitelist(){
    try{
      const url = `${AUTH_URL}${AUTH_URL.includes('?') ? '&' : '?'}_=${Date.now()}`;
      const res = await fetch(url, { cache:'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const norm = {};
      for(const [user, val] of Object.entries(data||{})){
        if(val && typeof val === 'object'){
          const {exp, ...extra} = val;
          norm[user] = { exp: exp || null, ...extra };
        }else{
          norm[user] = { exp: val || null };
        }
      }
      USER_MAP = norm;
      _lastFetchOk = true;
    }catch(err){
      console.error('[AUTH] Erro ao carregar JSON:', err);
      _lastFetchOk = false;
    }
  }
  function getUserRecord(u){
    const rec = USER_MAP[u];
    if(!rec) return null;
    return rec && typeof rec === 'object' ? rec : {exp: rec};
  }
  function isUserAllowed(u){
    if(!u) return false;
    return !!USER_MAP[u];
  }
  function isSessionValid(){
    const s = sessGet();
    if(!s || !s.u || !s.exp) return false;
    const rec = getUserRecord(s.u);
    if(!rec) return false;
    const d = parseExpiry(s.exp);
    if(!d) return false;
    return now() <= d;
  }

  // ===== NOVO LAYOUT: botão 👤 + painel (popover) =====
  function ensureBadge(){
    if(!isSessionValid()) { removeBadge(); return; }

    let wrap = document.getElementById(BADGE_ID);
    const s = sessGet();
    const extra = s?.extra || {};
    const extraBits = [];
    if(extra?.plano) extraBits.push(`Plano: ${extra.plano}`);
    if(extra?.valor) extraBits.push(`Valor: ${extra.valor}`);

    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = BADGE_ID;
      wrap.style.cssText = `
        position:absolute; right:12px; top:24px; z-index:100001;
        display:flex; flex-direction:column; align-items:flex-end; gap:6px;
      `;
      document.body.appendChild(wrap);

      // Botão circular com ícone 👤
      const btn = document.createElement('button');
      btn.id = 'pcalc-prof-btn';
      btn.setAttribute('aria-label','Perfil');
      btn.style.cssText = `
        width:48px;height:48px;border-radius:999px;border:1px solid #334155;
        background:#0b1324;color:#e5e7eb;cursor:pointer;
        box-shadow:0 10px 24px rgba(0,0,0,.35);
        display:grid; place-items:center; font-size:22px;
      `;
      btn.innerText = '👤';
      wrap.appendChild(btn);

      // Painel (popover) oculto por padrão
      const panel = document.createElement('div');
      panel.id = 'pcalc-prof-panel';
      panel.style.cssText = `
        display:none; min-width:240px; max-width:86vw;
        background:#111827;border:1px solid #1f2937;border-radius:12px;
        color:#cbd5e1; box-shadow:0 16px 36px rgba(0,0,0,.45);
        padding:12px; transform:translateY(-6px);
      `;
      wrap.appendChild(panel);

      // Fecha ao clicar fora
      document.addEventListener('click', (e)=>{
        const open = panel.style.display === 'block';
        if(!open) return;
        if(!wrap.contains(e.target)) panel.style.display = 'none';
      });

      // Toggle no clique do botão
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
      });
    }

    // (re)preenche os dados do painel
    const panel = document.getElementById('pcalc-prof-panel');
    if(panel){
      panel.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px">
          <div style="width:36px;height:36px;border-radius:999px;display:grid;place-items:center;
                      background:#0b1324;border:1px solid #334155;font-size:18px">👤</div>
          <div>
            <div style="color:#e5e7eb;font-weight:600">${s.u}</div>
            <div class="mut" style="color:#9ca3af;font-size:12px">Expira: ${s.exp}</div>
          </div>
        </div>
        ${extraBits.length ? `<div style="font-size:12px; color:#9ca3af; margin:6px 0">${extraBits.join(' • ')}</div>` : ''}
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px">
          <button id="pcalc-logout" class="btn"
            style="background:#ef4444;border:1px solid #ef4444;color:#fff;border-radius:10px;padding:8px 10px;cursor:pointer">
            Sair
          </button>
        </div>
      `;

      // wire do logout
      const logoutEl = panel.querySelector('#pcalc-logout');
      if(logoutEl){
        logoutEl.onclick = (e)=>{
          e.preventDefault();
          sessClear();
          removeBadge();
          showOverlay();
        };
      }
    }
  }
  function removeBadge(){
    const w = document.getElementById(BADGE_ID);
    if(w) w.remove();
  }

  function overlayHtml(){
    return `
      <div style="background:#111827;border:1px solid #1f2937;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.35);padding:18px;max-width:360px;width:92%">
        <h3 style="margin:0 0 8px;color:#e5e7eb;font-size:18px;text-align:center">Entrar</h3>
        <div style="color:#94a3b8;margin-bottom:10px;text-align:center">Informe seu usuário</div>
        <input id="pcalcLoginUser" type="text" placeholder="Digite seu Usuário" style="width:100%;background:#0b1324;color:#e5e7eb;border:1px solid #334155;border-radius:10px;padding:8px">
        <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
          <button id="pcalcLoginBtn" class="btn" style="background:#2563eb;border-color:#2563eb;color:#fff;border:1px solid #2563eb;border-radius:10px;padding:8px 10px;cursor:pointer;width: 24%;margin-left: 38%;">Entrar</button>
        </div>
        <div id="pcalcLoginErr" style="color:#fca5a5;margin-top:8px;min-height:18px"></div>
      </div>
    `;
  }
  function showOverlay(){
    let ov = document.getElementById(OVERLAY_ID);
    if(ov){ ov.innerHTML = overlayHtml(); wireOverlay(ov); return ov; }
    ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.78);backdrop-filter:blur(2px);display:grid;place-items:center;z-index:100000';
    ov.innerHTML = overlayHtml();
    document.body.appendChild(ov);
    wireOverlay(ov);
    return ov;
  }
  function wireOverlay(ov){
    const inp = ov.querySelector('#pcalcLoginUser');
    const btn = ov.querySelector('#pcalcLoginBtn');
    const err = ov.querySelector('#pcalcLoginErr');

    async function doLogin(){
      const u = (inp.value||'').trim();
      if(!u){ err.textContent='Informe o usuário.'; return; }
      if(!isUserAllowed(u)){ err.textContent='Usuário não cadastrado.'; return; }
      const rec = getUserRecord(u);
      const exp = rec?.exp;
      const d = parseExpiry(exp);
      if(!d){ err.textContent='Data de expiração inválida (JSON).'; return; }
      if(now()>d){ err.textContent=`Acesso expirado em ${exp}.`; return; }
      sessSet(u, exp, rec);
      err.textContent='';
      hideOverlay();
      ensureBadge();
      if(typeof __pcalc_start_app__ === 'function' && !window.__PCALC_APP_STARTED__){
        window.__PCALC_APP_STARTED__ = true;
        __pcalc_start_app__();
      }
    }
    btn.addEventListener('click', doLogin);
    inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doLogin(); });
  }
  function hideOverlay(){
    const ov = document.getElementById(OVERLAY_ID);
    if(ov) ov.remove();
  }

  async function guardTick(){
    await fetchWhitelist();
    const valid = isSessionValid();
    if(valid){
      hideOverlay();
      ensureBadge();
      if(typeof __pcalc_start_app__ === 'function' && !window.__PCALC_APP_STARTED__){
        window.__PCALC_APP_STARTED__ = true;
        __pcalc_start_app__();
      }
    }else{
      showOverlay();
      removeBadge();
    }
  }

  async function authInit(){
    await fetchWhitelist();
    const valid = isSessionValid();
    if(valid){
      hideOverlay();
      ensureBadge();
      if(typeof __pcalc_start_app__ === 'function' && !window.__PCALC_APP_STARTED__){
        window.__PCALC_APP_STARTED__ = true;
        __pcalc_start_app__();
      }
    }else{
      showOverlay();
    }
    setInterval(guardTick, TICK_MS);
  }

  document.addEventListener('DOMContentLoaded', authInit);
})();
