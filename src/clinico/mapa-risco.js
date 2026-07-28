// Mapa de risco de enfermagem por leito — agregação pura (sem rede, sem React),
// testável. Reduz as escalas dos pacientes internados à ÚLTIMA de cada tipo por
// leito e monta as linhas do painel-semáforo (Braden, Morse, flebite + LPP),
// ordenadas do mais grave ao menos grave, para a enfermagem priorizar.

const ORD = { vermelho: 0, laranja: 1, amarelo: 2, verde: 3 };
// As escalas que compõem o mapa de RISCO (não o de consciência/sedação).
export const RISCO_TIPOS = ["braden", "morse", "flebite"];

// Por prontuário, a última aplicação de cada tipo de escala. Assume a lista já
// ordenada por aferido_em desc (a carga faz isso) — a primeira vista de cada
// (prontuário, tipo) é a mais recente.
export function ultimaPorProntuarioTipo(escalas) {
  const m = {};
  (escalas || []).forEach(e => {
    if (!e || !e.prontuario || !e.tipo) return;
    (m[e.prontuario] ||= {});
    if (!m[e.prontuario][e.tipo]) m[e.prontuario][e.tipo] = e;
  });
  return m;
}

// Pior nível entre uma lista de níveis (vermelho > laranja > amarelo > verde).
export function piorNivel(niveis) {
  return ["vermelho", "laranja", "amarelo", "verde"].find(n => (niveis || []).includes(n)) || null;
}

// Monta as linhas do mapa a partir dos leitos OCUPADOS + escalas + LPP ativas.
// Cada linha: leito, setor, iniciais, prontuário, as 3 escalas de risco, o
// resumo de LPP e o pior nível (para cor e ordenação).
export function montarMapaRisco(leitosOcupados, escalas, lpp) {
  const porP = ultimaPorProntuarioTipo(escalas);
  const lppPorP = {};
  (lpp || []).forEach(l => { if (l?.prontuario) (lppPorP[l.prontuario] ||= []).push(l); });

  return (leitosOcupados || []).map(le => {
    const p = le.prontuario;
    const esc = porP[p] || {};
    const lppList = lppPorP[p] || [];
    const niveis = RISCO_TIPOS.map(t => esc[t] && esc[t].nivel).filter(Boolean);
    if (lppList.length) niveis.push(lppList.some(l => l.presente_admissao === false) ? "vermelho" : "laranja");
    return {
      leito: le.identificacao, setor: le.setor || null,
      iniciais: le.iniciais || null, prontuario: p,
      braden: esc.braden || null, morse: esc.morse || null, flebite: esc.flebite || null,
      lpp: { total: lppList.length, adquiridas: lppList.filter(l => l.presente_admissao === false).length },
      pior: piorNivel(niveis),
    };
  }).sort((a, b) => (ORD[a.pior] ?? 9) - (ORD[b.pior] ?? 9));
}
