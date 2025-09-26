// pcalc-gto.js — mínimo, com preload + suggestFlopLikeGTO + suggestFlopAuto
(function (g) {
  "use strict";
  const PC = g.PCALC || (g.PCALC = {});
  const GTO = PC.GTO || (PC.GTO = {});

  // === caminhos dos JSONs (ajuste se necessário) ===
  const MAP_URL  = "/data/flop_to_class_map_22100.json";
  const PACK_URL = "/packs/pack_SRP_BTNvsBB_100bb_rules.json";

  // === estado ===
  let _ready = false;
  let _mapFlopToClass = null;     // Map("As|Kh|7d" -> "A-K-7__two-tone_hi-mid")
  let _pack = null;               // objeto do pack
  let _bucketToTemplate = null;   // Map(bucket_id -> templateKey)
  let _templates = null;          // pack.templates
  const _suitOrder = { s:0, h:1, d:2, c:3 };

  // === utils ===
  const rChar = r => r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r);
  const cardToStr = c => rChar(c.r||c.rank) + (c.s||c.suit);
  function sortCardsDesc(cards){
    return [...cards].sort((a,b)=>{
      const ra=(a.r||a.rank), rb=(b.r||b.rank);
      if(ra!==rb) return rb-ra;
      const sa=(a.s||a.suit), sb=(b.s||b.suit);
      return _suitOrder[sa]-_suitOrder[sb];
    });
  }
  const flopKey = (b3) => sortCardsDesc(b3).map(cardToStr).join("|");

  // === preload resiliente ===
  GTO.preload = async function preload(){
    if(_ready) return true;
    try {
      const [mapJson, packJson] = await Promise.all([
        fetch(MAP_URL).then(r=>r.ok?r.json():{map:[]}),
        fetch(PACK_URL).then(r=>r.ok?r.json():{buckets:[],templates:{}})
      ]);

      _mapFlopToClass = new Map();
      if (mapJson && Array.isArray(mapJson.map)) {
        for (const row of mapJson.map) {
          _mapFlopToClass.set(row.flop.join("|"), row.class_id);
        }
      }

      _pack = packJson || { buckets:[], templates:{} };
      _templates = _pack.templates || {};
      _bucketToTemplate = new Map((_pack.buckets||[]).map(b=>[b.bucket_id, b.template]));
      _ready = true;
      return true;
    } catch(e){
      // safe mode
      _mapFlopToClass = new Map();
      _pack = { buckets:[], templates:{} };
      _templates = {};
      _bucketToTemplate = new Map();
      _ready = true;
      return false;
    }
  };

  // === detecção de features da mão vs flop ===
  function hasFlushDraw(hero, board){
    const all = hero.concat(board);
    const cnt = { s:0,h:0,d:0,c:0 };
    for(const c of all) cnt[c.s||c.suit]++;
    return cnt.s>=4 || cnt.h>=4 || cnt.d>=4 || cnt.c>=4;
  }
  function hasBackdoorFD(hero, board){
    const all = hero.concat(board);
    const cnt = { s:0,h:0,d:0,c:0 };
    for(const c of all) cnt[c.s||c.suit]++;
    return cnt.s===3 || cnt.h===3 || cnt.d===3 || cnt.c===3;
  }
  function uniq(arr){ return [...new Set(arr)]; }
  function ranksSorted(all){
    return sortCardsDesc(all).map(c=>c.r||c.rank);
  }
  function hasOESD(hero, board){
    const rs = uniq(ranksSorted(hero.concat(board))).sort((a,b)=>a-b);
    const rsA = rs.includes(14) ? uniq(rs.concat([1])).sort((a,b)=>a-b) : rs;
    const f = arr=>{
      for(let i=0;i<arr.length-3;i++){
        const w = arr.slice(i,i+4);
        if(w[3]-w[0]===3 && new Set(w).size===4) return true;
      }
      return false;
    };
    return f(rs) || f(rsA);
  }
  function hasGutshot(hero, board){
    const rs = uniq(ranksSorted(hero.concat(board))).sort((a,b)=>a-b);
    const rsA = rs.includes(14) ? uniq(rs.concat([1])).sort((a,b)=>a-b) : rs;
    const f = arr=>{
      for(let i=0;i<arr.length-4;i++){
        const w = arr.slice(i,i+5);
        if(w[4]-w[0]===4){
          const set = new Set(arr);
          let miss=0;
          for(let k=w[0]; k<=w[4]; k++) if(!set.has(k)) miss++;
          if(miss===1) return true;
        }
      }
      return false;
    };
    return f(rs)||f(rsA);
  }
  function pairCategoryWithBoard(hero, board){
    if (typeof PC.evalBest === "function") {
      const E = PC.evalBest(hero, board);
      if (E && typeof E.cat === "number") return E.cat; // 2=TwoPair, 3=Trips, 4=Straight, 5=Flush...
    }
    // fallback simples
    const counts = {};
    ranksSorted(hero.concat(board)).forEach(r=>counts[r]=(counts[r]||0)+1);
    const arr = Object.values(counts).sort((a,b)=>b-a);
    if (arr[0]>=3) return 3;
    if (arr[0]===2 && arr[1]===2) return 2;
    if (arr[0]===2) return 1;
    return 0;
  }
  function hasTopPairOrOverpair(hero, board){
    const br = ranksSorted(board);
    const hr = ranksSorted(hero);
    const top = br[0];
    const boardPairs = (br[0]===br[1] || br[1]===br[2] || br[0]===br[2]);
    const tp = hr.some(r=>r===top);
    const op = !boardPairs && (hr[0]===hr[1]) && hr[0] > top;
    return tp || op;
  }
  function twoOvercards(hero, board){
    const br = ranksSorted(board);
    const hr = ranksSorted(hero);
    return hr[0]>br[0] && hr[1]>br[0];
  }
  function heroFeatureTag(hero, board){
    const cat = pairCategoryWithBoard(hero, board);
    if (cat>=2) return "value_nuts";
    if (hasTopPairOrOverpair(hero, board)) return "value_top";
    const fd   = hasFlushDraw(hero, board);
    const oesd = hasOESD(hero, board);
    const bdfd = hasBackdoorFD(hero, board);
    const twoO = twoOvercards(hero, board);
    if (fd && (oesd || twoO)) return "draw_nut";
    if (fd || oesd) return "draw_good";
    if (hasGutshot(hero,board) || bdfd) return "draw_weak";
    if (twoO) return "overcards";
    return "air";
  }

  // === função principal (spot BTN vs BB SRP 100bb) ===
  GTO.suggestFlopLikeGTO = async function ({ spot="SRP_BTNvsBB_100bb", hero, board }){
    await GTO.preload();

    const flop3 = (board||[]).slice(0,3);
    if (!Array.isArray(flop3) || flop3.length<3) {
      return { ok:false, reason:"flop-incompleto" };
    }
    if (!_mapFlopToClass || !_bucketToTemplate || !_templates) {
      return { ok:false, reason:"pack-nao-carregado" };
    }

    const key = flopKey(flop3);
    const bucketId = _mapFlopToClass.get(key);
    if (!bucketId) return { ok:false, reason:"bucket-nao-encontrado", key };

    const tplKey = _bucketToTemplate.get(bucketId);
    const template = _templates[tplKey];
    if (!template) return { ok:false, reason:"template-nao-encontrado", bucketId, tplKey };

    const tag = heroFeatureTag(hero, flop3);
    const freqs = template.rules[tag] || template.rules["air"] || { bet33:0, bet66:0, check:1 };
    const best = Object.entries(freqs).sort((a,b)=>b[1]-a[1])[0][0];

    return {
      ok: true,
      source: "gto-like-pack",
      spot,
      bucketId,
      template: template.name,
      feature: tag,
      freqs,
      action: best
    };
  };

  // === roteador automático (não precisa informar posição na UI) ===
  GTO.suggestFlopAuto = async function ({ hero, board }){
    const st = PC.state || {};
    const pos = st.pos || "";
    const callers = Number(st.callers || 0);
    const raiseBB = Number(st.raiseBB || 0);
    const headsUpFlop = callers === 1;
    const heroIsBB = pos === "BB";
    const isSRP = raiseBB > 0;

    // caso "correto"
    if (isSRP && headsUpFlop && !heroIsBB) {
      return GTO.suggestFlopLikeGTO({ spot:"SRP_BTNvsBB_100bb", hero, board });
    }

    // fallback permissivo: se há flop e herói não é BB, assume IP vs BB
    const flopOk = Array.isArray(board) && board.length >= 3;
    if (flopOk && pos && pos !== "BB") {
      return GTO.suggestFlopLikeGTO({ spot:"SRP_BTNvsBB_100bb", hero, board });
    }

    return { ok:false, reason:"spot-not-supported:UNIVERSAL_SAFE", spot:"UNIVERSAL_SAFE" };
  };

})(window);
