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

const texto = v => String(v ?? "").trim();

/**
 * A via pela qual este episódio vai ser cobrado.
 *
 * Internação sai por AIH; o resto do que o pronto-socorro faz sai por BPA
 * (produção ambulatorial). APAC é alta complexidade e não se deduz do
 * desfecho — quem sabe é o procedimento, então ela não entra aqui.
 */
export function viaEsperada(desfecho) {
  return texto(desfecho) === "internacao" ? "aih" : "bpa";
}

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
export function opcoesDeProcedimento({ procedimentos = [], sigtap = [], desfecho, convenio } = {}) {
  const via = viaEsperada(desfecho);

  // ⚠️ SIGTAP é a tabela do SUS. Num convênio ou particular, a cobrança é
  // por TUSS ou tabela própria, e oferecer código do SUS ali produziria
  // uma conta que o convênio não reconhece. Sem convênio escolhido ainda,
  // não se sabe — e aí se oferece tudo, com a fonte à vista.
  const tipo = texto(convenio?.tipo).toLowerCase();
  const cabeSigtap = !tipo || tipo === "sus";

  const doHospital = (Array.isArray(procedimentos) ? procedimentos : [])
    .filter(p => texto(p?.codigo) && viaDoCatalogo(p) === via)
    .map(p => ({
      codigo: texto(p.codigo),
      nome: texto(p.nome),
      via,
      fonte: "hospital",
      tabela: texto(p.tabela) || null,
    }));

  const vistos = new Set(doHospital.map(o => o.codigo));

  const doSigtap = !cabeSigtap ? [] : (Array.isArray(sigtap) ? sigtap : [])
    .filter(s => texto(s?.codigo) && texto(s?.via).toLowerCase() === via)
    .filter(s => !vistos.has(texto(s.codigo)))
    .map(s => ({
      codigo: texto(s.codigo),
      nome: texto(s.nome),
      via,
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
export function avisoDeCatalogo({ opcoes = [], procedimentos = [], sigtap = [], desfecho, convenio } = {}) {
  if (opcoes.length) return null;

  const via = viaEsperada(desfecho);
  const rotulo = via === "aih" ? "AIH (internação)" : "BPA (produção ambulatorial)";
  const temAlgumCatalogo = (procedimentos?.length || 0) > 0 || (sigtap?.length || 0) > 0;

  if (!temAlgumCatalogo) {
    return `Nenhum procedimento cadastrado. Cadastre em ATENDIMENTO › Tabelas, ou carregue a tabela SIGTAP da competência.`;
  }

  const tipo = texto(convenio?.tipo).toLowerCase();
  if (tipo && tipo !== "sus" && (procedimentos?.length || 0) === 0) {
    return `Este convênio não é SUS, e o hospital ainda não tem procedimentos próprios (TUSS ou tabela própria) cadastrados. ` +
           `A tabela SIGTAP não serve aqui — o convênio não reconhece código do SUS.`;
  }

  return `Há catálogo carregado, mas nenhum procedimento de ${rotulo} — que é a via deste atendimento. ` +
         `Escolher um código de outra via faria a conta voltar rejeitada. ` +
         `Cadastre o procedimento em ATENDIMENTO › Tabelas ou carregue a competência do SIGTAP que cobre esta via.`;
}

/** Como a opção aparece na lista: código, nome e de onde veio. */
export function rotuloDaOpcao(o = {}) {
  const base = `${texto(o.codigo)} — ${texto(o.nome) || "sem nome"}`;
  return o.fonte === "sigtap" ? `${base} · SIGTAP${o.competencia ? ` ${o.competencia}` : ""}` : base;
}
