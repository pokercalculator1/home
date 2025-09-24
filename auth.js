
(function(){
  const LS_KEY = 'pcalc_auth_v1';

  function fmtDate(d){
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }
  function parseExpiry(str){
    if(!str) return null;
    let d=null;
    const s=String(str).trim();
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){ // DD/MM/YYYY
      const [dd,mm,yy]=s.split('/').map(Number);
      d = new Date(yy, mm-1, dd, 23,59,59,999);
    }else if(/^\d{4}-\d{2}-\d{2}$/.test(s)){ // YYYY-MM-DD
      const [yy,mm,dd]=s.split('-').map(Number);
      d = new Date(yy, mm-1, dd, 23,59,59,999);
    }
    return isNaN(d?.getTime()) ? null : d;
  }
  function today(){ return new Date(); }
  function normalizeName(n){ return String(n||'').trim().toLowerCase(); }

  function findUser(name){
    const list = (window.PCALC_USERS||[]);
    const key = normalizeName(name);
    return list.find(u => normalizeName(u.username) === key) || null;
  }
  function isExpired(user){
    if(!user || user.disabled) return true;
    const d = parseExpiry(user.expires);
    if(!d) return true; // sem data válida = bloqueia
    return today() > d;
  }

  function saveSession(u){
    localStorage.setItem(LS_KEY, JSON.stringify({
      username: u.username,
      expires:  u.expires
    }));
  }
  function loadSession(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj?.username) return null;
      const u = findUser(obj.username);
      if(!u) return null;
      if(isExpired(u)) return null;
      return u;
    }catch{ return null; }
  }
  function clearSession(){ localStorage.removeItem(LS_KEY); }

  // ========= UI Overlay =========
  function ensureStyles(){
    if(document.getElementById('authGateStyles')) return;
    const css = `
      .auth-overlay{position:fixed;inset:0;background:rgba(2,6,23,.75);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:100000}
      .auth-card{background:#111827;border:1px solid #1f2937;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.35);padding:18px;max-width:360px;width:92%}
      .auth-card h3{margin:0 0 8px;color:#e5e7eb;font-size:18px}
      .auth-card .mut{color:#94a3b8;margin-bottom:10px}
      .auth-field{display:flex;flex-direction:column;gap:6px;margin:10px 0}
      .auth-field label{color:#cbd5e1;font-size:13px}
      .auth-field input{background:#0b1324;border:1px solid #334155;border-radius:10px;color:#e5e7eb;padding:10px 12px;outline:none}
      .auth-actions{display:flex;gap:8px;margin-top:12px}
      .auth-btn{padding:10px 12px;border:1px solid #334155;background:#0b1324;color:#e5e7eb;border-radius:10px;cursor:pointer}
      .auth-btn.primary{background:#2563eb;border-color:#2563eb}
      .auth-err{color:#fca5a5;font-size:13px;margin-top:8px;min-height:18px}
      .auth-badge{position:fixed;right:10px;top:10px;background:#0b1324;color:#cbd5e1;border:1px solid #334155;border-radius:10px;padding:6px 10px;font-size:12px;z-index:99999}
      .auth-badge b{color:#e5e7eb}
      .auth-link{color:#93c5fd;cursor:pointer;margin-left:8px}
    `.trim();
    const tag = document.createElement('style');
    tag.id='authGateStyles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function showBadge(user){
    removeBadge();
    const div = document.createElement('div');
    div.className='auth-badge';
    div.innerHTML = `👤 <b>${user.username}</b> • expira: ${user.expires}
      <span class="auth-link" id="authLogout">sair</span>`;
    document.body.appendChild(div);
    document.getElementById('authLogout').onclick = ()=>{ clearSession(); mountGate(true); };
  }
  function removeBadge(){
    const el=document.querySelector('.auth-badge');
    if(el) el.remove();
  }

  function createOverlay(){
    ensureStyles();
    const wrap = document.createElement('div');
    wrap.className='auth-overlay';
    wrap.innerHTML = `
      <div class="auth-card">
        <h3>Bem Vindo ao Poker Calculator</h3>
        <div class="mut">Informe Seu Usuário Para Começar.</div>
        <div class="auth-field">
          <label>Usuário</label>
          <input id="authUser" type="text" placeholder="nome de usuário" autocomplete="username" />
        </div>
        <div class="auth-actions">
          <button class="auth-btn" id="authCancel">Cancelar</button>
          <button class="auth-btn primary" id="authGo">Entrar</button>
        </div>
        <div class="auth-err" id="authErr"></div>
        
      </div>
    `;
    document.body.appendChild(wrap);
    // Eventos
    wrap.querySelector('#authCancel').onclick = ()=>{ /* bloqueia uso */ };
    wrap.querySelector('#authGo').onclick = doLogin;
    const input = wrap.querySelector('#authUser');
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
    input.focus();
    return wrap;
  }

  function showOverlay(){
    removeOverlay();
    return createOverlay();
  }
  function removeOverlay(){
    const el=document.querySelector('.auth-overlay');
    if(el) el.remove();
  }

  function setErr(msg){
    const el=document.getElementById('authErr');
    if(el) el.textContent = msg || '';
  }

  function doLogin(){
    const name = (document.getElementById('authUser')?.value || '').trim();
    const u = findUser(name);
    if(!u){ setErr('Usuário não autorizado.'); return; }
    if(isExpired(u)){ setErr(`Acesso expirado em ${u.expires}.`); return; }
    saveSession(u);
    removeOverlay();
    showBadge(u);
  }

  // Revalidação periódica
  let timer=null;
  function startTick(){
    if(timer) clearInterval(timer);
    timer = setInterval(()=>{
      const u = loadSession();
      if(!u){
        clearInterval(timer); timer=null;
        mountGate(true);
      }
    }, 60*1000); // 1 min
  }

  // Montagem do gate
  function mountGate(forceOverlay){
    const u = loadSession();
    if(u){
      removeOverlay();
      showBadge(u);
      startTick();
    }else{
      if(forceOverlay || !document.querySelector('.auth-overlay')){
        showOverlay();
      }
      removeBadge();
      if(timer){ clearInterval(timer); timer=null; }
    }
  }

  // Expor uma API basiquinha (opcional)
  window.AuthGate = {
    mount: ()=> mountGate(false),
    logout: ()=> { clearSession(); mountGate(true); },
    current: ()=> loadSession()
  };

  // Init
  document.addEventListener('DOMContentLoaded', ()=> mountGate(false));
})();

