// ═══════════════════════════════════════════════════════════
// A ALTA DA RECUPERAÇÃO PÓS-ANESTÉSICA — o escore de Aldrete
//
// 🔴 O QUE ESTÁ ERRADO HOJE: a alta da RPA é UM BOTÃO.
//
//     <button onClick={() => marcar(c, { status: "concluida",
//                                        rpa_saida_em: nowISO() })}>
//       Alta da RPA — concluir
//     </button>
//
// Nenhum parâmetro, nenhum critério, nenhum registro. O paciente sai da
// recuperação pós-anestésica — que é exatamente onde ele para de ser
// vigiado — porque alguém clicou. Depois da alta não há mais monitor, não
// há mais enfermagem 1:1, e as complicações da anestesia (depressão
// respiratória, obstrução de via aérea, hipotensão) acontecem justamente
// nessa janela.
//
// A CFM 2.174/2017 exige que o paciente permaneça em recuperação até
// recuperar a consciência, com ventilação e circulação estáveis, e que a
// alta seja dada por profissional habilitado — o que pressupõe critério
// REGISTRADO. A ficha de recuperação pós-anestésica é o terceiro documento
// que a CFM 1.638/2002 nomeia para o paciente operado, ao lado da descrição
// cirúrgica e da ficha anestésica.
//
// 💡 O ESCORE DE ALDRETE (Aldrete & Kroulik, 1970), na forma modificada que
// troca a cor da pele pela OXIMETRIA — porque oxímetro de pulso existe em
// toda sala de recuperação desde os anos 90, e "paciente corado" é
// observação, não medida.
//
// Cinco parâmetros, 0 a 2 cada, total de 0 a 10.
//
// ⚠️ O ESCORE É SERIADO, NÃO UMA FOTO. Avalia-se na chegada e a cada 10–15
// minutos até o paciente atingir o critério. Por isso é tabela com muitas
// linhas por cirurgia, e não cinco colunas em `cc_cirurgias`: a CURVA é o
// que mostra se o paciente está melhorando ou piorando, e um paciente que
// vai de 9 para 7 é uma emergência que uma foto esconderia.
//
// ⚠️ E O ESCORE NÃO DECIDE SOZINHO. Ele LIBERA; quem dá alta é pessoa. O
// sistema recusa a alta sem escore suficiente, mas nunca a dá
// automaticamente ao atingir 9 — isso tiraria do anestesista uma decisão
// que é dele por norma.
// ═══════════════════════════════════════════════════════════

/**
 * O total mínimo para a alta, e a razão do número.
 *
 * 9 é o corte da literatura e o que a maioria dos protocolos brasileiros
 * adota. Alguns aceitam 8; nenhum aceita um parâmetro ZERADO, e é por isso
 * que a regra abaixo tem DUAS condições e não só a soma — 8 pontos com
 * apneia (respiração 0) somam igual a 8 pontos bem distribuídos, e os dois
 * pacientes não têm nada em comum.
 */
export const ALDRETE_MINIMO = 9;

/**
 * Os cinco parâmetros, com a descrição de cada nota.
 *
 * O texto NÃO é enfeite: é o que a enfermagem lê para pontuar. "Atividade
 * 1" não quer dizer nada sozinho; "move dois membros" quer.
 */
export const ALDRETE_PARAMETROS = Object.freeze([
  {
    chave: "atividade", label: "Atividade motora",
    notas: [
      "Não move os membros voluntariamente nem ao comando",
      "Move DOIS membros voluntariamente ou ao comando",
      "Move os QUATRO membros voluntariamente ou ao comando",
    ],
  },
  {
    chave: "respiracao", label: "Respiração",
    notas: [
      "Apneia — não respira espontaneamente",
      "Dispneia, respiração superficial ou limitada",
      "Respira profundamente e TOSSE livremente",
    ],
  },
  {
    chave: "circulacao", label: "Circulação (pressão arterial)",
    notas: [
      "PA variando 50% ou mais do nível pré-anestésico",
      "PA variando de 20% a 49% do nível pré-anestésico",
      "PA variando até 20% do nível pré-anestésico",
    ],
  },
  {
    chave: "consciencia", label: "Consciência",
    notas: [
      "Não responde ao chamado",
      "Desperta ao ser chamado",
      "Completamente acordado",
    ],
  },
  {
    chave: "saturacao", label: "Saturação de O₂ (oximetria)",
    notas: [
      "SpO₂ abaixo de 90% MESMO com oxigênio suplementar",
      "Precisa de oxigênio para manter SpO₂ acima de 90%",
      "SpO₂ acima de 92% em ar ambiente",
    ],
  },
]);

export const ALDRETE_CHAVES = Object.freeze(ALDRETE_PARAMETROS.map(p => p.chave));

const nota = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : null;
};

/**
 * O total, ou `null` quando algum parâmetro não foi pontuado.
 *
 * ⚠️ `null`, nunca uma soma parcial. Quatro parâmetros somando 8 não é "8":
 * é um escore incompleto, e tratá-lo como 8 deixaria a alta a um ponto de
 * distância de um paciente que ninguém terminou de avaliar.
 */
export function totalAldrete(av = {}) {
  let soma = 0;
  for (const c of ALDRETE_CHAVES) {
    const n = nota(av[c]);
    if (n == null) return null;
    soma += n;
  }
  return soma;
}

/** Os parâmetros que ainda não foram pontuados. */
export function faltamPontuar(av = {}) {
  return ALDRETE_PARAMETROS.filter(p => nota(av[p.chave]) == null);
}

/** Os parâmetros ZERADOS — cada um deles é, sozinho, um motivo para não ter alta. */
export function zerados(av = {}) {
  return ALDRETE_PARAMETROS.filter(p => nota(av[p.chave]) === 0);
}

/**
 * Esta avaliação libera a alta? `null` = libera; string = por que não.
 *
 * Devolve a FRASE, e não um booleano, porque quem está na recuperação
 * precisa saber o que falta melhorar — não que "não pode".
 */
export function motivoParaNaoDarAlta(av = {}) {
  const faltam = faltamPontuar(av);
  if (faltam.length) {
    return `Escore incompleto: falta pontuar ${faltam.map(p => p.label.toLowerCase()).join(", ")}. `
         + "Escore pela metade não é escore baixo — é paciente que ninguém terminou de avaliar.";
  }
  const zero = zerados(av);
  if (zero.length) {
    return `${zero.map(p => p.label).join(" e ")} com nota ZERO. `
         + "Nenhum parâmetro zerado tem alta, por maior que seja a soma — "
         + "8 pontos com apneia somam o mesmo que 8 pontos bem distribuídos, e os dois pacientes não têm nada em comum.";
  }
  const t = totalAldrete(av);
  if (t < ALDRETE_MINIMO) {
    return `Aldrete ${t} de 10 — o mínimo para alta é ${ALDRETE_MINIMO}. `
         + "Reavalie em 10 a 15 minutos; a recuperação é onde a complicação da anestesia aparece.";
  }
  return null;
}

/** Atalho de leitura: esta avaliação libera? */
export function liberaAlta(av = {}) {
  return motivoParaNaoDarAlta(av) === null;
}

/**
 * A avaliação mais recente de uma série.
 *
 * ⚠️ A mais recente pelo RELÓGIO, não a última da lista: a carga ordena
 * por `criado_em`, mas quem monta a lista na tela pode concatenar.
 */
export function ultimaAvaliacao(linhas = []) {
  if (!Array.isArray(linhas) || !linhas.length) return null;
  return [...linhas].sort((a, b) =>
    new Date(b.criado_em || 0) - new Date(a.criado_em || 0))[0];
}

/**
 * 🔴 A CURVA, que é o que uma foto esconde.
 *
 * Um paciente que foi de 9 para 7 está PIORANDO, e isso é emergência —
 * mesmo que 7 pareça "quase lá" para quem só vê o número de agora.
 * Devolve `null` quando há uma avaliação só (não há tendência a declarar).
 */
export function tendencia(linhas = []) {
  const ord = (Array.isArray(linhas) ? [...linhas] : [])
    .filter(l => totalAldrete(l) != null)
    .sort((a, b) => new Date(a.criado_em || 0) - new Date(b.criado_em || 0));
  if (ord.length < 2) return null;
  const anterior = totalAldrete(ord[ord.length - 2]);
  const atual = totalAldrete(ord[ord.length - 1]);
  if (atual < anterior) return { sentido: "piorando", de: anterior, para: atual };
  if (atual > anterior) return { sentido: "melhorando", de: anterior, para: atual };
  return { sentido: "estável", de: anterior, para: atual };
}

/** A linha para gravar. O `total` é calculado pelo BANCO (coluna gerada). */
export function linhaDaAvaliacao({ cirurgia, av = {}, observacao = "", assinatura = null } = {}) {
  const linha = { cirurgia_id: cirurgia?.id ?? null };
  for (const c of ALDRETE_CHAVES) linha[c] = nota(av[c]);
  linha.observacao = String(observacao ?? "").trim() || null;
  linha.assinatura = String(assinatura ?? "").trim() || null;
  return linha;
}

/** Uma linha de texto da avaliação, para a trilha na tela. */
export function resumoDaAvaliacao(l) {
  if (!l) return null;
  const t = totalAldrete(l);
  const zero = zerados(l);
  return `Aldrete ${t == null ? "incompleto" : `${t}/10`}`
    + (zero.length ? ` · ZERO em ${zero.map(p => p.label.toLowerCase()).join(", ")}` : "")
    + (l.observacao ? ` · ${l.observacao}` : "");
}
