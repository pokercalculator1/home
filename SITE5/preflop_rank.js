// preflop_rank.js — adapter: carrega preflop169.json e expõe window.PF
(function (g) {
  const JSON_URL = './preflop169.json'; // ajuste se necessário

  // Tiers pelo seu critério
  function tierFromRank(r){
    if(r>=1   && r<=10)   return 'Premium';
    if(r>=11  && r<=20)   return 'Muito fortes';
    if(r>=21  && r<=40)   return 'Fortes';
    if(r>=41  && r<=60)   return 'Sólidas';
    if(r>=61  && r<=90)   return 'Médias';
    if(r>=91  && r<=130)  return 'Fracas';
    if(r>=131 && r<=169)  return 'Lixo total';
    return '';
  }

  // Normaliza para a tag canônica tipo "AKs", "QJo", "77"
  function toTag(r1Char, s1, r2Char, s2){
    const order = '23456789TJQKA';
    const up = (x)=>String(x||'').toUpperCase();
    let a = up(r1Char), b = up(r2Char);
    // ordena por força (A>K>…>2)
    if(order.indexOf(a) < order.indexOf(b)){ const t=a; a=b; b=t; }
    if(a === b) return a+a; // par: "77"
    const suited = String(s1||'').toLowerCase() && String(s2||'').toLowerCase() && (s1===s2);
    return a + b + (suited ? 's' : 'o');
  }

  // Aceita 3 formatos de JSON:
  // 1) ["AA","KK","QQ","AKs", ...]                 // array de mãos em ordem (1..169)
  // 2) [{hand:"AKs", rank:4, tier:"Premium"}, ...] // objetos
  // 3) {"AKs":4, "AA":1, ...}                      // mapa hand->rank
  function buildIndex(data){
    const rankByHand = {};
    // Formato 1: array de strings
    if(Array.isArray(data) && data.length && typeof data[0] === 'string'){
      data.forEach((hand, i)=>{ rankByHand[hand.toUpperCase()] = i+1; });
      return rankByHand;
    }
    // Formato 2: array de objetos
    if(Array.isArray(data) && data.length && typeof data[0] === 'object'){
      data.forEach((o)=>{
        if(o && o.hand){
          const h = String(o.hand).toUpperCase();
          if(o.rank!=null) rankByHand[h] = Number(o.rank);
        }
      });
      return rankByHand;
    }
    // Formato 3: objeto simples
    if(data && typeof data === 'object'){
      for(const k in data){
        rankByHand[String(k).toUpperCase()] = Number(data[k]);
      }
      return rankByHand;
    }
    throw new Error('Formato do preflop169.json não reconhecido');
  }

  // Expõe uma PF "stub" imediatamente (evita erro de referência)
  g.PF = {
    _ready: false,
    readyPromise: null,
    normalize2: (r1, s1, r2, s2)=> toTag(r1, s1, r2, s2),
    describe: (tag)=>({ hand: String(tag||'').toUpperCase(), rank: undefined, tier: '' })
  };

  g.PF.readyPromise = fetch(JSON_URL, { cache: 'no-store' })
    .then(r => {
      if(!r.ok) throw new Error('Falha ao carregar '+JSON_URL);
      return r.json();
    })
    .then(json => {
      const rankByHand = buildIndex(json);
      g.PF.describe = (tag)=>{
        const h = String(tag||'').toUpperCase();
        const rank = rankByHand[h];
        return { hand: h, rank, tier: rank ? tierFromRank(rank) : '' };
      };
      g.PF._ready = true;
      // avisa a UI que pode re-renderizar o pré-flop
      setTimeout(()=>{ g.dispatchEvent(new CustomEvent('PF:ready')); }, 0);
    })
    .catch(err => {
      console.error('[PF] erro carregando JSON:', err);
    });

})(window);
