// ═══════════════════════════════════════════════════════════
// MANUTENÇÃO DOS CATÁLOGOS — as regras do cadastro das tabelas
//
// `ficha.js` USA o catálogo. Este arquivo cuida de MANTER o catálogo, que
// é trabalho de outra pessoa (o analista comercial) e erra de outro jeito.
//
// POR QUE ISTO EXISTE COMO TELA, E NÃO COMO SQL
// Sem cadastro pela interface, cada convênio novo, cada plano renegociado e
// cada procedimento vira um pedido para quem tem acesso ao banco. Em
// hospital isso não escala e não é auditável: ninguém sabe quem mudou a
// tabela de preço nem quando. O MV resolve com o menu Tabelas, e o motivo
// é o mesmo.
//
// A REGRA QUE PERCORRE O ARQUIVO: DESATIVAR, NÃO APAGAR.
// Convênio, plano e procedimento aparecem em atendimentos já gravados.
// Apagar a linha quebraria a leitura de uma conta de meses atrás — o
// relatório passaria a mostrar código sem nome. `ativo = false` some das
// listas novas e preserva o que já foi registrado.
// ═══════════════════════════════════════════════════════════

import { DOMINIOS } from "./ficha.js";
// `centavos` mora no faturamento e resolve o ponto ambíguo do dinheiro. O
// catálogo pode importá-lo: `faturamento.js` não conhece este arquivo, então
// não há ciclo.
import { centavos } from "./faturamento.js";

/** Os tipos de convênio que o sistema entende. */
export const TIPOS_DE_CONVENIO = [
  { chave: "sus",        label: "SUS",
    dica: "Não tem carteira nem autorização. Exige CNS e o paciente nunca pode ser cobrado." },
  { chave: "convenio",   label: "Convênio / Operadora",
    dica: "Exige carteira; procedimento costuma exigir autorização. Fatura em guia TISS." },
  { chave: "particular", label: "Particular",
    dica: "O próprio paciente paga. Sem guia, sem glosa." },
];

/** As tabelas de origem dos procedimentos. */
export const TABELAS_DE_PROCEDIMENTO = [
  { chave: "sigtap",  label: "SIGTAP (SUS)" },
  { chave: "tuss",    label: "TUSS (convênios)" },
  { chave: "proprio", label: "Tabela própria" },
];

/**
 * O que a tela de Tabelas sabe manter.
 *
 * Os sete domínios entram gerados a partir de `DOMINIOS` (ficha.js) em vez
 * de repetidos aqui: duas listas com os mesmos nomes divergem, e aí um
 * campo aparece na ficha sem ter onde ser cadastrado.
 */
export const CATALOGOS = [
  { chave: "convenios",     tabela: "at_convenios",     label: "Convênios",
    dica: "Quem paga o atendimento. É o cadastro que decide o que a recepção precisa preencher." },
  { chave: "planos",        tabela: "at_planos",        label: "Planos",
    dica: "O desdobramento do convênio. É o plano que define acomodação e tabela de preço." },
  { chave: "procedimentos", tabela: "at_procedimentos", label: "Procedimentos",
    dica: "SIGTAP, TUSS ou tabela própria — com os CBOs que podem executar cada um." },
  ...DOMINIOS.map(d => ({ chave: d.chave, tabela: "at_dominios", dominio: d.chave, label: d.label, dica: d.dica })),
];

export const CATALOGO_POR_CHAVE = Object.fromEntries(CATALOGOS.map(c => [c.chave, c]));

/** Código canônico: sem espaço nas pontas, maiúsculo, sem acento. */
export const normalizarCodigo = v =>
  String(v ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/**
 * As vias SUS que um procedimento pode seguir.
 *
 * Só as três do SUS: TISS e cobrança direta saem do TIPO DO CONVÊNIO, não do
 * cadastro do procedimento — oferecê-las aqui faria alguém marcar "TISS" num
 * procedimento e esperar que isso mudasse a via de um atendimento SUS.
 *
 * Em branco é uma escolha legítima e o padrão: sem cadastro, a regra cai em
 * BPA, que é a via da maioria esmagadora da produção ambulatorial.
 */
export const VIAS_SUS = [
  { chave: "bpa",  label: "BPA — produção ambulatorial" },
  { chave: "apac", label: "APAC — alta complexidade (exige autorização)" },
  { chave: "aih",  label: "AIH — internação (exige autorização)" },
];

/**
 * O valor da tabela em REAIS, ou `null`.
 *
 * `null` e `0` são coisas diferentes e a coluna existe para distinguir: a
 * migração diz com todas as letras que nulo é "ninguém cadastrou" e zero é
 * "de graça". A tela imprime "—" para o primeiro e R$ 0,00 para o segundo,
 * e o contador `semPreco` da conta depende disso para não fechar uma conta
 * zerada com cara de conta fechada.
 *
 * Reaproveita `centavos`, que já resolve o ponto ambíguo do dinheiro
 * ("10.50" é dez e cinquenta; "1.234,56" é mil duzentos e trinta e quatro) —
 * a coluna é `numeric(12,2)`, em reais, então divide no fim.
 */
export function valorSusEmReais(valor) {
  const c = centavos(valor);
  return c === null ? null : c / 100;
}

/**
 * Como um tipo de atendimento CONTA no indicador de produção.
 *
 * 🔴 POR QUE ISTO NÃO É O PRÓPRIO CÓDIGO
 * A migração da fase 2 planta `extras: {"conta_como":"primeira"}` nos tipos
 * de sistema, com um comentário dizendo que é isso que o indicador usa. E
 * nada no código lia `extras`: `producaoDoDia` comparava o código direto
 * com a string "primeira_consulta".
 *
 * O efeito é o modo de falhar mais caro deste módulo — o silencioso. Um
 * tipo novo cadastrado pela tela ("primeira consulta de especialidade",
 * "retorno pós-operatório") entra INVISÍVEL ao indicador: soma zero, não
 * aparece em coluna nenhuma do relatório do mês, e não erra em lugar
 * nenhum. Quem cadastrou acha que cadastrou.
 *
 * O código continua servindo de recuo, e é o que mantém o comportamento
 * atual em banco que ainda não tenha `extras` preenchido.
 */
export const CONTA_COMO = [
  { chave: "primeira", label: "Primeira consulta", dica: "Entra na coluna de 1ª consulta da produção — é o que a pactuação separa." },
  { chave: "retorno",  label: "Retorno",           dica: "Entra como retorno. O SUS não paga retorno no prazo como consulta nova." },
  { chave: "urgencia", label: "Urgência",          dica: "Não entra em nenhuma das duas colunas." },
  { chave: "exame",    label: "Exame",             dica: "Não entra em nenhuma das duas colunas." },
];

export function contaComo(codigo, tiposDeAtendimento = []) {
  const cod = String(codigo ?? "").trim();
  if (!cod) return null;
  const linha = (Array.isArray(tiposDeAtendimento) ? tiposDeAtendimento : [])
    .find(t => String(t?.codigo ?? "").trim() === cod);
  const doCadastro = String(linha?.extras?.conta_como ?? "").trim();
  if (doCadastro) return doCadastro;
  // Recuo: os códigos que a migração plantou. Mantém o comportamento antigo
  // em banco sem `extras`, e sem ele esta mudança apagaria a produção de
  // quem já usa os tipos de sistema.
  if (cod === "primeira_consulta") return "primeira";
  if (CONTA_COMO.some(c => c.chave === cod)) return cod;
  return null;
}

/** CBO só tem dígitos. Aceita a lista separada por vírgula, ponto e vírgula ou espaço. */
export function lerCbos(texto) {
  return String(texto ?? "")
    .split(/[,;\s]+/)
    .map(c => c.replace(/\D/g, ""))
    .filter(Boolean);
}

/**
 * Confere um cadastro antes de gravar.
 *
 * `existentes` serve só para a checagem de código repetido. Código duplicado
 * não é detalhe: o atendimento guarda o CÓDIGO, não o id, então dois
 * convênios com o mesmo código tornam impossível saber, depois, qual
 * atendimento era de qual.
 */
export function validarCatalogo(chave, dados = {}, existentes = []) {
  const erros = [];
  const avisos = [];
  const cat = CATALOGO_POR_CHAVE[chave];
  if (!cat) return { ok: false, erros: ["Catálogo desconhecido."], avisos };

  const codigo = normalizarCodigo(dados.codigo);
  const nome = String(dados.nome ?? "").trim();

  if (!codigo) erros.push("Informe o código.");
  if (!nome) erros.push("Informe o nome.");

  // O próprio registro não conflita consigo mesmo na edição.
  const repetido = existentes.some(e =>
    String(e.id) !== String(dados.id ?? "") && normalizarCodigo(e.codigo) === codigo && codigo);
  if (repetido) {
    erros.push(`Já existe um registro com o código ${codigo}. O atendimento guarda o código, não o id — dois iguais tornam impossível saber depois qual era qual.`);
  }

  if (chave === "convenios") {
    if (!TIPOS_DE_CONVENIO.some(t => t.chave === dados.tipo)) {
      erros.push("Escolha o tipo do convênio.");
    }
    if (dados.tipo === "sus") {
      // Não é erro: a tela simplesmente ignora essas flags no SUS. Mas quem
      // marcou precisa saber que não vai valer, senão fica esperando um
      // comportamento que não vem.
      if (dados.exige_carteira || dados.exige_autorizacao) {
        avisos.push("No SUS não existe carteira nem autorização de operadora. Estas marcações não terão efeito.");
      }
      if (!String(dados.registro_ans ?? "").trim()) {
        // silêncio proposital: SUS não tem registro na ANS
      }
    }
    if (dados.tipo === "convenio" && !String(dados.registro_ans ?? "").trim()) {
      avisos.push("Sem registro ANS. Ele é exigido no cabeçalho da guia TISS — vale preencher antes do primeiro faturamento.");
    }
  }

  if (chave === "planos" && !dados.convenio_id) {
    erros.push("Escolha a qual convênio este plano pertence.");
  }

  if (chave === "procedimentos") {
    if (!TABELAS_DE_PROCEDIMENTO.some(t => t.chave === dados.tabela)) {
      erros.push("Escolha a tabela de origem do procedimento.");
    }
    const cbos = lerCbos(dados.cbos_compativeis);
    if (!cbos.length) {
      avisos.push("Sem CBOs compatíveis. Sem essa lista o sistema não consegue avisar quando o profissional escolhido vai fazer a produção ser rejeitada.");
    } else if (cbos.some(c => c.length !== 6)) {
      avisos.push("Algum CBO não tem 6 dígitos. Confira — CBO errado reprova atendimento que estava certo.");
    }

    // Valor: digitou algo que não vira número? Isso é ERRO, não aviso —
    // gravar `null` calado faria a tela mostrar "—" e a pessoa achar que
    // cadastrou o preço.
    const valorBruto = String(dados.valor_sus ?? "").trim();
    if (valorBruto && valorSusEmReais(dados.valor_sus) === null) {
      erros.push(`"${valorBruto}" não é um valor. Use 10,50 ou 10.50 — e deixe em branco se ainda não há preço de tabela.`);
    }
    // Via em branco NÃO gera aviso, de propósito. Sem cadastro a regra cai
    // em BPA, que é a via da maioria esmagadora da produção ambulatorial —
    // ou seja, em branco é o caso NORMAL. Avisar no caso normal é a mesma
    // fadiga de alarme que o resto do módulo combate: dispararia em quase
    // todo procedimento e ensinaria a ignorar a lista onde mora "algum CBO
    // não tem 6 dígitos". A consequência de deixar em branco é dita no
    // próprio campo, na tela, que é informação e não alarme.
  }

  return { ok: erros.length === 0, erros, avisos };
}

/**
 * O corpo a gravar, já normalizado.
 *
 * Devolve só as colunas da tabela de destino. Mandar chave a mais faz o
 * PostgREST recusar o INSERT inteiro — em silêncio, que é como esse defeito
 * já chegou em produção neste sistema uma vez.
 */
export function corpoDoCatalogo(chave, dados = {}) {
  const cat = CATALOGO_POR_CHAVE[chave];
  const base = {
    codigo: normalizarCodigo(dados.codigo),
    nome: String(dados.nome ?? "").trim(),
    ativo: dados.ativo !== false,
  };
  if (dados.id) base.id = dados.id;

  if (chave === "convenios") {
    return {
      ...base,
      tipo: dados.tipo || "convenio",
      // No SUS as duas exigências são falsas por construção, não por
      // configuração — assim nem chegam gravadas erradas no banco.
      exige_carteira: dados.tipo === "sus" ? false : dados.exige_carteira !== false,
      exige_autorizacao: dados.tipo === "sus" ? false : dados.exige_autorizacao === true,
      registro_ans: String(dados.registro_ans ?? "").trim() || null,
      observacao: String(dados.observacao ?? "").trim() || null,
    };
  }
  if (chave === "planos") {
    return {
      ...base,
      convenio_id: dados.convenio_id,
      acomodacao: String(dados.acomodacao ?? "").trim() || null,
      coparticipacao: dados.coparticipacao === true,
    };
  }
  if (chave === "procedimentos") {
    return {
      ...base,
      tabela: dados.tabela || "sigtap",
      cbos_compativeis: lerCbos(dados.cbos_compativeis),
      // Estes dois existiam no banco desde a fase de faturamento e o
      // `corpoDoCatalogo` não os mandava — então a única forma de cadastrar
      // preço e via era pelo SQL Editor, e a via muda por PORTARIA, várias
      // vezes por ano. Era exatamente o que o cabeçalho da migração dizia
      // que a tela existia para evitar.
      valor_sus: valorSusEmReais(dados.valor_sus),
      via_sus: VIAS_SUS.some(v => v.chave === dados.via_sus) ? dados.via_sus : null,
    };
  }
  // Domínios: a linha carrega de qual lista ela é.
  const corpo = {
    ...base,
    dominio: cat?.dominio || chave,
    ordem: Number(dados.ordem) || 0,
  };
  // `extras` só existe, por ora, para o `conta_como` do tipo de atendimento.
  // Mandar `{}` nos outros domínios sobrescreveria de graça o que o banco
  // já tem — então só vai quando há o que dizer.
  if (chave === "tipo_atendimento") {
    const cc = CONTA_COMO.some(c => c.chave === dados.conta_como) ? dados.conta_como : null;
    corpo.extras = cc ? { ...(dados.extras || {}), conta_como: cc } : (dados.extras || {});
  }
  return corpo;
}
