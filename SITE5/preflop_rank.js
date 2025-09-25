
/*!
 * Preflop Rank 169 – módulo simples para ranking de mãos (1..169)
 * - Usa sua lista (em texto) e gera: PF.RANK169 (array) e PF.RANK_INDEX (mapa)
 * - API:
 *     PF.normalize2(r1, s1, r2, s2) -> "AKs", "QJo", "77"
 *     PF.rankOf(handStr)            -> número 1..169 (ou null se não achar)
 *     PF.tierOf(rankNum)            -> rótulo do tier (Premium, Muito fortes, ...)
 *     PF.describe(handStr)          -> { hand:"AKs", rank:4, tier:"Premium" }
 */

(function (g) {
  const PF = g.PF || (g.PF = {});

  // --- Helpers básicos ---
  const RANK_ORDER = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
  const RSET = new Set(RANK_ORDER);
  const SUITS = ['s','o']; // para notação; pares não têm 's' nem 'o'

  function isPairTag(tag){ return tag.length===2 && tag[0]===tag[1] && RSET.has(tag[0]); }
  function isSuitedTag(tag){ return tag.length===3 && tag[2]==='s'; }
  function isOffTag(tag){ return tag.length===3 && tag[2]==='o'; }

  // Normaliza (r1,s1,r2,s2) -> "AKs" / "QJo" / "77"
  // r = 'A','K','Q','J','T','9'...'2'; s = 'h','d','c','s'
  PF.normalize2 = function(r1, s1, r2, s2){
    r1 = String(r1||'').toUpperCase();
    r2 = String(r2||'').toUpperCase();
    if(!RSET.has(r1) || !RSET.has(r2)) return null;
    // ordena por força de rank (A>K>...>2)
    const i1 = RANK_ORDER.indexOf(r1), i2 = RANK_ORDER.indexOf(r2);
    let hi=r1, lo=r2, sh=s1, sl=s2;
    if(i2 < i1){ hi=r2; lo=r1; sh=s2; sl=s1; }

    if(hi===lo) return hi+lo; // par

    // suited?
    const suited = sh && sl && sh===sl;
    return hi+lo+(suited?'s':'o');
  };

  // ------------- SUA LISTA 1..169 -------------
  // Cole aqui sua lista EXACTA (um por linha, na ordem do melhor para o pior).
  // Pode colar as seções que você mandou (Premium, Muito fortes, etc).
  // O validador abaixo vai:
  //   1) Normalizar pares/sooted/offsuit (corrigir coisas como "44o" -> "44")
  //   2) Remover duplicados mantendo a primeira ocorrência
  //   3) Avisar se faltarem ou sobrarem mãos até fechar 169
  const USER_LIST_TEXT = `
AA
KK
QQ
AKs
JJ
AQs
AKo
TT
AJs
KQs

AJo
KJs
ATs
KTs
QJs
A9s
AQo
99
QTs
JTs

KQo
88
A8s
K9s
T9s
A7s
A5s
A4s
A6s
J9s
Q9s
A3s
KJo
A2s
77
K8s
T8s
98s
QJo
J8s

K7s
66
87s
K6s
Q8s
97s
76s
KTo
T7s
55
J7s
65s
86s
Q9o
54s
ATo
44
75s
64s
K5s

33
Q7s
53s
JTo
43s
22
K4s
Q6s
T9o
87o
K3s
J6s
Q5s
76o
K2s
97o
T6s
65o
98o
96s
Q4s
85s
J5s
T5s
Q3s
54o
75o
64o
J4s
Q2s

53o
T4s
J3s
43o
J2s
86o
T3s
96o
T2s
84s
95s
63s
74s
52s
42s
32s
93s
92s
82s
72s
K9o
Q8o
J9o
T8o
87o
76o
65o
54o
K8o
Q7o
J8o
T7o
97o
75o
64o
53o

K7o
Q6o
J7o
T6o
96o
85o
74o
63o
52o
42o
32o
K6o
Q5o
J6o
T5o
95o
84o
73o
62o
K5o
Q4o
J5o
T4o
94o
83o
72o
K4o
Q3o
J4o
T3o
93o
82o
K3o
Q2o
J3o
T2o
92o
83o
72o
`.trim();

  // --- validador + normalizador da lista do usuário ---
  const CANONICALS = (() => {
    const arr = [];
    // pares
    for(const r of RANK_ORDER) arr.push(r+r);
    // suited (combinações hi > lo)
    for(let i=0;i<RANK_ORDER.length;i++){
      for(let j=i+1;j<RANK_ORDER.length;j++){
        arr.push(RANK_ORDER[i]+RANK_ORDER[j]+'s');
      }
    }
    // offsuit
    for(let i=0;i<RANK_ORDER.length;i++){
      for(let j=i+1;j<RANK_ORDER.length;j++){
        arr.push(RANK_ORDER[i]+RANK_ORDER[j]+'o');
      }
    }
    return new Set(arr); // total 169
  })();

  function fixToken(tok){
    tok = tok.replace(/\s+/g,'').toUpperCase();
    if(!tok) return null;
    // Corrigir pares escritos como "44o" ou "77s" -> "44"
    if(/^[AKQJT2-9]{2}[so]$/.test(tok) && tok[0]===tok[1]) tok = tok.slice(0,2);
    // Validar final
    if(isPairTag(tok)) return tok;
    if(isSuitedTag(tok) || isOffTag(tok)){
      const hi = tok[0], lo = tok[1], t = tok[2];
      if(!RSET.has(hi) || !RSET.has(lo)) return null;
      // garantir ordem hi>lo
      const ihi = RANK_ORDER.indexOf(hi), ilo = RANK_ORDER.indexOf(lo);
      if(ihi===ilo) return hi+hi; // fallback par
      const A = ihi < ilo ? hi+lo : lo+hi;
      const norm = A + t;
      return CANONICALS.has(norm) ? norm : null;
    }
    // Caso par simples tipo "TT", "77"
    if(/^[AKQJT2-9]{2}$/.test(tok) && tok[0]===tok[1]) return tok;
    return null;
  }

  // Monta lista canônica sem duplicatas, na ordem do usuário
  const rawLines = USER_LIST_TEXT.split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean);
  const seen = new Set();
  const RANK169 = [];
  const problems = { invalid:[], dup:[] };

  for(const line of rawLines){
    const tok = fixToken(line);
    if(!tok){
      problems.invalid.push(line);
      continue;
    }
    if(seen.has(tok)){
      problems.dup.push(tok);
      continue;
    }
    seen.add(tok);
    RANK169.push(tok);
  }

  // Se faltar, completar com as mãos que não apareceram (acrescenta no final)
  if(RANK169.length < 169){
    for(const h of CANONICALS){
      if(!seen.has(h)){
        RANK169.push(h);
        seen.add(h);
      }
    }
  }
  // Se sobrar (>169), corta e avisa
  if(RANK169.length > 169){
    console.warn('[PF] Lista excedeu 169; truncando. Tamanho:', RANK169.length);
    RANK169.length = 169;
  }

  // Log de problemas de entrada
  if(problems.invalid.length){
    console.warn('[PF] Entradas inválidas normalizadas/ignoradas:', problems.invalid);
  }
  if(problems.dup.length){
    console.warn('[PF] Duplicadas ignoradas (mantida a 1ª ocorrência):', problems.dup);
  }
  if(RANK169.length!==169){
    console.warn('[PF] Atenção: após normalização, tamanho != 169 =>', RANK169.length);
  }

  // Mapa mão -> posição (1..169)
  const RANK_INDEX = Object.fromEntries(RANK169.map((h,i)=>[h, i+1]));

  // Tiers sugeridos (suas faixas)
  function tierOfPosition(p){
    if(p>=1 && p<=10)   return 'Premium (1–10)';
    if(p<=20)           return 'Muito fortes (11–20)';
    if(p<=40)           return 'Fortes (21–40)';
    if(p<=60)           return 'Sólidas (41–60)';
    if(p<=90)           return 'Médias (61–90)';
    if(p<=130)          return 'Fracas (91–130)';
    return 'Lixo total (131–169)';
  }

  // API pública
  PF.RANK169     = RANK169;
  PF.RANK_INDEX  = RANK_INDEX;
  PF.rankOf      = handStr => RANK_INDEX[handStr] ?? null;
  PF.tierOf      = tierOfPosition;
  PF.describe    = handStr => {
    const rank = PF.rankOf(handStr);
    return { hand:handStr, rank, tier: rank ? tierOfPosition(rank) : null };
  };

})(window);

