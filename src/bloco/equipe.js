// ═══════════════════════════════════════════════════════════
// A EQUIPE CIRÚRGICA — a regra, fora da tela
//
// 🔴 A equipe era `cirurgiao text` e `anestesista text`: um SOBRENOME. E o
// `anestesista` nunca teve um único input no sistema inteiro — coluna morta
// desde o schema, igual ao que `src/acesso/cbo.js` conta sobre `profiles.cbo`.
//
// O que um sobrenome impede, em três frentes:
//
//   💰 FATURAMENTO. `at_conta_itens` já tem `executante` E `executante_cbo`:
//      o esquema da conta sempre esperou CBO por item. E `cbo.js` é direto
//      sobre o custo — "CBO errado causa a rejeição que este campo existe
//      para evitar, e rejeição no SISAIH01/BPA não é glosa: derruba o
//      registro inteiro e só aparece no processamento do mês seguinte".
//      Na guia TISS cada membro entra com conselho e GRAU DE PARTICIPAÇÃO,
//      e é o grau que define o percentual pago.
//
//   🔎 RASTREABILIDADE. "Silva" não identifica profissional nenhum. O
//      projeto já tem `assinaturaDe()` montando nome + conselho + registro
//      para nove telas do PEP (CFM 2.299/2021, COFEN 754/2024).
//
//   📊 ESCALA. "Produtividade por cirurgião" agrupava por DIGITAÇÃO:
//      "Silva", "silva", "Dr. Silva" e "Silva " são quatro cirurgiões
//      diferentes no painel que a direção usa para discutir escala.
//
// ⚠️ O QUE É CARIMBADO E O QUE É REFERÊNCIA. Nome, conselho, registro e CBO
// são copiados NO ATO para `cc_equipe`. O cadastro muda — o profissional
// troca de CBO, renova o conselho, sai do hospital — e quem operou aquele
// paciente naquele dia não pode mudar junto. `profissional_username` fica
// como referência fraca, sem FK: serve para ligar ao cadastro quando ele
// existe, e não impede registrar o cirurgião externo que opera aqui sem ter
// login.
// ═══════════════════════════════════════════════════════════

const texto = v => String(v ?? "").trim();

/**
 * Os papéis da sala, na ordem em que a equipe se apresenta no Time Out
 * ("toda a equipe se apresentou pelo nome e função").
 *
 * `fatura` marca quem entra na conta como executante — é o que separa o
 * ato cobrável do ato de apoio. `unico` marca o papel que não se repete.
 */
export const PAPEIS_EQUIPE = Object.freeze([
  { chave: "cirurgiao",         label: "Cirurgião(ã)",        fatura: true,  unico: true,
    dica: "O responsável pelo ato. Um por cirurgia." },
  { chave: "primeiro_auxiliar", label: "1º auxiliar",         fatura: true,  unico: false,
    dica: "Entra na conta com grau de participação próprio." },
  { chave: "segundo_auxiliar",  label: "2º auxiliar",         fatura: true,  unico: false },
  { chave: "anestesista",       label: "Anestesista",         fatura: true,  unico: false,
    dica: "Cobra honorário próprio e responde pela ficha anestésica." },
  { chave: "instrumentador",    label: "Instrumentador(a)",   fatura: false, unico: false },
  { chave: "circulante",        label: "Circulante",          fatura: false, unico: false,
    dica: "Quem conduz o checklist e a contagem de compressas." },
  { chave: "perfusionista",     label: "Perfusionista",       fatura: false, unico: false },
]);

export const PAPEL_POR_CHAVE = Object.freeze(
  Object.fromEntries(PAPEIS_EQUIPE.map(p => [p.chave, p])));

/** Caráter da cirurgia. Exigido na AIH, e separa os indicadores. */
export const CARATER = Object.freeze([
  { chave: "eletivo",    label: "Eletivo" },
  { chave: "urgencia",   label: "Urgência" },
  { chave: "emergencia", label: "Emergência" },
]);

/**
 * O nome que de fato vai para o registro.
 *
 * ⚠️ UMA FONTE SÓ, e isso não é zelo: a conferência e a gravação liam o
 * nome de lugares diferentes — a primeira do campo digitado, a segunda do
 * perfil escolhido. Com um profissional do cadastro selecionado, o campo
 * digitado fica vazio (e desabilitado), então a conferência recusava
 * "informe o nome" para um membro que tinha nome. Duas leituras do mesmo
 * dado divergem; é a mesma família da taxonomia duplicada.
 */
export function nomeDoMembro({ perfil = null, nome = "" } = {}) {
  return texto(perfil?.name || perfil?.nome || nome);
}

/**
 * O que falta para acrescentar este membro. `null` = pode gravar.
 *
 * `jaNaEquipe` é a lista atual, para pegar o segundo cirurgião ANTES de o
 * banco recusar — a trava existe lá (índice único parcial), e aqui existe
 * para a pessoa descobrir sem levar erro vermelho.
 */
export function conferirMembro({ papel, perfil = null, nome, jaNaEquipe = [] } = {}) {
  const p = PAPEL_POR_CHAVE[texto(papel)];
  if (!p) return "Escolha a função desta pessoa na sala.";
  if (nomeDoMembro({ perfil, nome }).length < 2) return "Informe o nome de quem está na sala.";
  if (p.unico && (jaNaEquipe || []).some(m => m?.papel === p.chave)) {
    return `Já há um ${p.label.toLowerCase()} nesta cirurgia. Dois significaria que ninguém é o responsável — ` +
           "e é o responsável que responde pelo ato. Troque o atual, se for o caso.";
  }
  return null;
}

/**
 * A linha de equipe, com nome/conselho/CBO CARIMBADOS do perfil escolhido.
 *
 * Aceita perfil do cadastro ou nome digitado à mão (cirurgião externo). O
 * que não se sabe fica NULO: inventar CBO aqui seria pior que a ausência,
 * porque CBO errado derruba o registro inteiro no processamento.
 */
export function linhaDeEquipe({ cirurgia, papel, perfil = null, nome = "", grau = "" } = {}) {
  const p = PAPEL_POR_CHAVE[texto(papel)];
  return {
    cirurgia_id: cirurgia?.id,
    papel: p?.chave || null,
    profissional_username: perfil?.username || null,
    nome: nomeDoMembro({ perfil, nome }),
    conselho: texto(perfil?.conselho) || null,
    registro_conselho: texto(perfil?.registro_conselho) || null,
    uf_conselho: texto(perfil?.uf_conselho) || null,
    cbo: texto(perfil?.cbo) || null,
    grau_participacao: texto(grau) || null,
  };
}

/**
 * O que a equipe desta cirurgia impede de faturar. Lista de frases.
 *
 * Avisa, não trava: a cirurgia acontece antes de a conta existir, e barrar
 * o registro do ato por campo de faturamento inverteria a prioridade. O que
 * não pode é alguém descobrir a falta no processamento do mês seguinte.
 */
export function pendenciasDeFaturamento(equipe = []) {
  const lista = Array.isArray(equipe) ? equipe : [];
  const avisos = [];
  const cirurgiao = lista.find(m => m?.papel === "cirurgiao");

  if (!cirurgiao) {
    avisos.push("Sem cirurgião registrado: a conta não tem executante, e sem executante o procedimento não é pago.");
  } else if (!texto(cirurgiao.cbo)) {
    avisos.push(`Cirurgião ${cirurgiao.nome} sem CBO. Rejeição no SISAIH01/BPA não é glosa — derruba o registro inteiro, ` +
                "e só aparece no processamento do mês seguinte.");
  }

  const semCbo = lista.filter(m => PAPEL_POR_CHAVE[m?.papel]?.fatura && !texto(m?.cbo) && m?.papel !== "cirurgiao");
  if (semCbo.length) {
    avisos.push(`${semCbo.length} membro(s) que entram na conta estão sem CBO: ${semCbo.map(m => m.nome).join(", ")}.`);
  }

  const semConselho = lista.filter(m => PAPEL_POR_CHAVE[m?.papel]?.fatura && !texto(m?.registro_conselho));
  if (semConselho.length) {
    avisos.push(`${semConselho.length} membro(s) sem registro de conselho — a guia TISS pede conselho e UF de cada um.`);
  }
  return avisos;
}

/**
 * A equipe em uma linha, para o cartão da cirurgia.
 *
 * O cirurgião primeiro, sempre: é quem responde. Os demais na ordem dos
 * papéis, não na ordem em que foram digitados.
 */
export function resumoDaEquipe(equipe = []) {
  const lista = Array.isArray(equipe) ? equipe : [];
  if (!lista.length) return null;
  const ordem = PAPEIS_EQUIPE.map(p => p.chave);
  return [...lista]
    .sort((a, b) => ordem.indexOf(a?.papel) - ordem.indexOf(b?.papel))
    .map(m => `${PAPEL_POR_CHAVE[m?.papel]?.label || m?.papel}: ${m?.nome}`)
    .join(" · ");
}

/**
 * O procedimento escolhido do catálogo vira código + nome.
 *
 * Mantém os dois: o código é o que fatura, o nome é o que a sala lê. Antes
 * só havia o nome, digitado à mão.
 */
export function procedimentoEscolhido(catalogo = [], codigo) {
  const c = texto(codigo);
  if (!c) return null;
  const achado = (Array.isArray(catalogo) ? catalogo : []).find(p => texto(p?.codigo) === c);
  return achado ? { codigo: texto(achado.codigo), nome: texto(achado.nome) } : null;
}
