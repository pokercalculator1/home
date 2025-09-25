function rankPreflop169(){
  const order = [14,13,12,11,10,9,8,7,6,5,4,3,2];
  const chenScore = PC.chenScore; // se existir
  const out = [];

  for (let i = 0; i < order.length; i++){
    for (let j = 0; j < order.length; j++){
      const hi = order[i], lo = order[j];
      // diagonal = pares
      if (i === j){
        const norm = `${RANK_PRINT(hi)}${RANK_PRINT(hi)}`;
        const s = chenScore ? chenScore({pair:hi}) : (10 + (hi-2)/2);
        out.push({ norm, chen: s });
      } else if (i < j){
        // triângulo superior = suited (ex.: AKs)
        const normS = `${RANK_PRINT(hi)}${RANK_PRINT(lo)}s`;
        const s1 = chenScore ? chenScore({hi,lo,suited:true}) : (6 + (hi+lo)/30 + 1.5);
        out.push({ norm:normS, chen:s1 });
      } else {
        // triângulo inferior = offsuit (ex.: AKo)
        const normO = `${RANK_PRINT(hi)}${RANK_PRINT(lo)}o`;
        const s2 = chenScore ? chenScore({hi,lo,suited:false}) : (6 + (hi+lo)/30);
        out.push({ norm:normO, chen:s2 });
      }
    }
  }
  out.sort((a,b)=> b.chen - a.chen);
  return out; // 169 únicas
}
