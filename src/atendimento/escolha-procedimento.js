// ═══════════════════════════════════════════════════════════
// QUAL PROCEDIMENTO ESTE ATENDIMENTO PODE RECEBER
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// O catálogo não estava faltando — estava do outro lado de uma parede.
//
//   sigtap_procedimentos ... 219 procedimentos REAIS, competência 2026-08,
//                            código oficial, valores em centavos
//   at_procedimentos ....... o catálogo próprio do hospital
//
// O motor de conta (`montar-conta.js`) já cruza os dois: pega o preço do
// catálogo do hospital e, na falta, soma SH+SP do SIGTAP. Um código SIGTAP
// gravado em `procedimento_cod` já funciona ponta a ponta.
//
// O que faltava era TELA QUE DEIXASSE ESCOLHER UM. As telas que escolhem
// procedimento — inclusive o desfecho do PS — liam só `at_procedimentos`,
// que no banco do hospital está vazia. Duas tabelas para a mesma coisa, e
// a que a pessoa enxerga é a vazia.
//
// ⚠️ E NÃO SE RESOLVE COPIANDO UMA PARA A OUTRA.
// O SIGTAP é versionado por competência (muda por portaria, todo mês). Uma
// cópia envelheceria calada e passaria a divergir da tabela oficial — que
// é o defeito clássico de duas listas para o mesmo fato. Aqui elas são
// LIDAS juntas, e nenhuma vira cópia da outra.
//
// ⚠️ O QUE ESTÁ CARREGADO NÃO COBRE TUDO, E ISSO PRECISA APARECER.
// Os 219 são todos `via = 'aih'` (grupos 03 e 04): procedimentos de
// INTERNAÇÃO. Não há nenhuma linha de BPA — a produção ambulatorial. Uma
// alta de pronto-socorro sai por BPA, e oferecer um código de AIH para ela
// seria pior que oferecer nada: a conta iria com código de internação num
// episódio que não internou, e volta rejeitada.
//
// Por isso `avisoDeCatalogo` distingue "não tenho o que oferecer para esta
// via" de "não há catálogo" — não saber ≠ estar errado.
// ═══════════════════════════════════════════════════════════

import { resolverVia } from "./montar-conta.js";

const texto = v => String(v ?? "").trim();

/**
 * A via pela qual este episódio vai ser cobrado.
 *
 * 🔴 ISTO CHAMA `resolverVia`, E A PRIMEIRA VERSÃO NÃO CHAMAVA.
 * Eu tinha escrito aqui um `viaEsperada(desfecho)` que devolvia "aih" para
 * internação e "bpa" para todo o resto. Era uma segunda implementação,
 * pior, de uma regra que já existia em `montar-conta.js` — e repetia um
 * defeito que aquele arquivo já tinha consertado e documentado:
 *
 *   "Antes esta linha olhava só o `desfecho`, e o fechamento olhava só o
 *    `tipo_atendimento`: a internação eletiva era montada como BPA e
 *    fechada como AIH."
 *
 * Duas regras de via divergindo é o pior tipo de divergência: a tela
 * oferece procedimento de uma via e a conta fecha por outra, e ninguém
 * descobre até a produção voltar rejeitada.
 *
 * ⚠️ E É `resolverVia` QUEM SABE A RECEPÇÃO. Lá não existe desfecho — o
 * atendimento é aberto antes de qualquer desenlace. O que existe é
 * convênio e `tipo_atendimento`, que é exatamente do que ela vive.
 *
 * `procCatalogo` e `sigtapProc` não são passados de propósito: estamos
 * ESCOLHENDO o procedimento, então ainda não há um. `resolverVia` cai no
 * palpite pelo grupo do código (03/04 → AIH) e, na falta, em BPA.
 *
 * Devolve `null` quando não há convênio escolhido — e `null` aqui quer
 * dizer "ainda não dá para saber", nunca "nenhuma".
 */
export function viaDaEscolha({ atendimento = {}, convenio, desfecho } = {}) {
  return resolverVia({
    convenio,
    atendimento: { ...atendimento, desfecho: desfecho ?? atendimento?.desfecho },
  });
}

/**
 * Vias que o SIGTAP cobre. `tiss` e `direta` são convênio e particular:
 * lá a cobrança não é por tabela do SUS.
 */
export const VIAS_SUS = ["aih", "bpa", "apac"];

/** Via de uma linha do catálogo do hospital. Em branco = BPA, como a tela de Tabelas diz. */
const viaDoCatalogo = p => texto(p?.via_sus).toLowerCase() || "bpa";

/**
 * As opções que a tela pode oferecer, já unidas e sem repetição.
 *
 * Ordem deliberada: o catálogo do HOSPITAL primeiro. Ele é curado, tem
 * preço negociado e é onde o faturista reconhece os nomes; o SIGTAP é a
 * tabela inteira, e serve para quando o que se procura ainda não foi
 * cadastrado na casa.
 *
 * Quando o mesmo código está nos dois, vale o do hospital — mesma
 * precedência que `montar-conta.js` já usa para o preço. Duas fontes
 * discordando sobre o mesmo código seria pior que uma fonte só.
 */
export function opcoesDeProcedimento({ procedimentos = [], sigtap = [], desfecho, convenio, atendimento } = {}) {
  const via = viaDaEscolha({ atendimento, convenio, desfecho });

  // Sem convênio escolhido ainda, `resolverVia` devolve `null`: não dá para
  // saber, então se oferece TUDO, com a fonte à vista. Filtrar por um palpite
  // esconderia da pessoa justamente o que ela precisa ver para decidir.
  const filtraPorVia = via != null;

  const doHospital = (Array.isArray(procedimentos) ? procedimentos : [])
    .filter(p => texto(p?.codigo) && (!filtraPorVia || !VIAS_SUS.includes(via) || viaDoCatalogo(p) === via))
    .map(p => ({
      codigo: texto(p.codigo),
      nome: texto(p.nome),
      via: via || viaDoCatalogo(p),
      fonte: "hospital",
      tabela: texto(p.tabela) || null,
    }));

  const vistos = new Set(doHospital.map(o => o.codigo));

  // ⚠️ SIGTAP é a tabela do SUS. Em `tiss` (convênio) ou `direta`
  // (particular) a cobrança não é por ela, e oferecer código do SUS ali
  // produziria conta que o convênio não reconhece.
  //
  // Isso sai DE GRAÇA do filtro de via logo abaixo: nenhuma linha do SIGTAP
  // tem via `tiss` nem `direta`, então nenhuma casa. Havia aqui um
  // `cabeSigtap` explícito, e uma mutação mostrou que ele era redundante —
  // desligá-lo não quebrava teste nenhum. Guarda que nunca dispara é peso
  // morto que o próximo leitor tem de entender antes de poder mexer.
  const doSigtap = (Array.isArray(sigtap) ? sigtap : [])
    .filter(s => texto(s?.codigo) && (!filtraPorVia || texto(s?.via).toLowerCase() === via))
    .filter(s => !vistos.has(texto(s.codigo)))
    .map(s => ({
      codigo: texto(s.codigo),
      nome: texto(s.nome),
      via: texto(s.via).toLowerCase(),
      fonte: "sigtap",
      competencia: texto(s.competencia) || null,
    }));

  return [...doHospital, ...doSigtap];
}

/**
 * Filtra por código ou nome, para a pessoa achar entre centenas.
 *
 * Sem isto a tela ofereceria 219 opções num `<select>`, que na prática é o
 * mesmo que não oferecer: ninguém rola 219 linhas com o paciente saindo.
 */
export function filtrarProcedimentos(opcoes = [], busca) {
  const q = texto(busca).toLowerCase();
  if (!q) return opcoes;
  return (Array.isArray(opcoes) ? opcoes : [])
    .filter(o => `${o.codigo} ${o.nome}`.toLowerCase().includes(q));
}

/**
 * Por que a lista está vazia — que não é a mesma coisa que "não há nada".
 *
 * 🔴 O TERCEIRO ESTADO OUTRA VEZ. Lista vazia pode significar duas coisas
 * MUITO diferentes:
 *
 *   · o hospital ainda não cadastrou nada e o SIGTAP não foi carregado;
 *   · há catálogo, mas nenhum item serve para a via DESTE episódio.
 *
 * O segundo é o caso real hoje: as 219 linhas carregadas são todas de AIH,
 * e uma alta de pronto-socorro sai por BPA. Dizer só "nenhum procedimento
 * cadastrado" mandaria alguém cadastrar o que já existe — ou, pior,
 * escolher um código de internação para um atendimento que não internou.
 *
 * Devolve `null` quando há o que oferecer: aviso que aparece sempre não é
 * lido.
 */
const ROTULO_VIA = {
  aih: "AIH (internação)",
  bpa: "BPA (produção ambulatorial)",
  apac: "APAC (alta complexidade)",
  tiss: "TISS (convênio)",
  direta: "particular",
};

export function avisoDeCatalogo({ opcoes = [], procedimentos = [], sigtap = [], desfecho, convenio, atendimento } = {}) {
  if (opcoes.length) return null;

  const via = viaDaEscolha({ atendimento, convenio, desfecho });
  const temAlgumCatalogo = (procedimentos?.length || 0) > 0 || (sigtap?.length || 0) > 0;

  if (!temAlgumCatalogo) {
    return `Nenhum procedimento cadastrado. Cadastre em ATENDIMENTO › Tabelas, ou carregue a tabela SIGTAP da competência.`;
  }

  if (via && !VIAS_SUS.includes(via) && (procedimentos?.length || 0) === 0) {
    return `Este atendimento sai por ${ROTULO_VIA[via] || via}, e o hospital ainda não tem procedimentos próprios ` +
           `(TUSS ou tabela própria) cadastrados. A tabela SIGTAP não serve aqui — a cobrança não é por tabela do SUS.`;
  }

  return `Há catálogo carregado, mas nenhum procedimento de ${ROTULO_VIA[via] || via || "nenhuma via conhecida"} — ` +
         `que é a via deste atendimento. Escolher um código de outra via faria a conta voltar rejeitada. ` +
         `Cadastre o procedimento em ATENDIMENTO › Tabelas ou carregue a competência do SIGTAP que cobre esta via.`;
}

/** Como a opção aparece na lista: código, nome e de onde veio. */
export function rotuloDaOpcao(o = {}) {
  const base = `${texto(o.codigo)} — ${texto(o.nome) || "sem nome"}`;
  return o.fonte === "sigtap" ? `${base} · SIGTAP${o.competencia ? ` ${o.competencia}` : ""}` : base;
}
