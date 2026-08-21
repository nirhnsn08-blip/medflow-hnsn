// ═══════════════════════════════════════════════════════════
// FATURAMENTO — a conta do atendimento
//
// Puro: não sabe o que é React nem banco. Transforma o que foi feito
// (procedimento, material, medicamento) na CONTA do episódio, e diz por
// qual via ela sai.
//
// O QUE ESTA FASE FAZ, E O QUE NÃO FAZ
// Faz: a conta existir, acumular itens com quantidade e valor, saber a via
// (BPA, APAC, AIH, TISS, cobrança direta), fechar por competência e recusar
// o que impediria o pagamento.
//
// NÃO faz — e é deliberado, não esquecimento: gerar o ARQUIVO de remessa.
// BPA-I/BPA-C, SISAIH01 e o XML do TISS têm layout versionado, mudam por
// portaria e por versão da operadora, e passam por homologação. Escrever
// um gerador contra um layout que ninguém conferiu produziria arquivo que
// o DATASUS rejeita inteiro — e a rejeição chega no fim do mês, quando não
// há mais o que corrigir. O que existe aqui é a conta certa; o arquivo vem
// quando alguém tiver em mãos o layout que o HNSN transmite hoje.
//
// A REGRA MAIS DURA DO ARQUIVO: SUS NÃO COBRA DO PACIENTE.
// Não é configuração, é lei. Um item marcado para cobrança direta numa
// conta SUS é RECUSADO — não avisado. É a única coisa aqui que se recusa a
// gravar, porque o erro dela cai sobre o paciente, e não sobre o hospital.
//
// DINHEIRO EM CENTAVOS, sempre. `0.1 + 0.2` em ponto flutuante é
// `0.30000000000000004`, e uma conta com trinta itens acumula diferença
// que ninguém consegue explicar na conferência. Converte-se para inteiro,
// soma-se inteiro, formata-se no fim.
// ═══════════════════════════════════════════════════════════

import { conferirFicha, TIPOS_CONVENIO, tipoDoConvenio, conferirCbo } from "./ficha.js";
import { GRAVIDADES } from "./sigtap.js";

// ── DINHEIRO ────────────────────────────────────────────────

/**
 * Valor em reais → centavos inteiros. `null` quando não há valor.
 *
 * `null` e 0 são coisas MUITO diferentes aqui: 0 é "de graça" e `null` é
 * "ninguém cadastrou o preço". Imprimir R$ 0,00 no lugar de "sem preço"
 * faria a conta fechar zerada com cara de conta fechada.
 */
export function centavos(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  }

  const s = String(valor).trim().replace(/\s|R\$/gi, "");
  if (!s) return null;

  // O PONTO É AMBÍGUO NUM CAMPO DE DINHEIRO, e errar aqui multiplica a
  // conta por cem. "1.234,56" é padrão brasileiro (ponto = milhar);
  // "10.50" é o que sai de teclado numérico e de planilha (ponto =
  // decimal). A regra que desempata:
  //   • tem vírgula → padrão BR: ponto é milhar, vírgula é decimal;
  //   • sem vírgula, UM ponto com 1 ou 2 dígitos depois → decimal;
  //   • qualquer outro caso → o ponto é milhar.
  // Um "10.50" lido como mil e cinquenta reais seria um item cobrado cem
  // vezes a mais, e o erro só apareceria na conferência do fechamento.
  let normal;
  if (s.includes(",")) {
    normal = s.replace(/\./g, "").replace(",", ".");
  } else {
    const partes = s.split(".");
    normal = (partes.length === 2 && partes[1].length <= 2) ? s : s.replace(/\./g, "");
  }

  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Centavos → "R$ 1.234,56". `null` vira "—", nunca "R$ 0,00". */
export function reais(cent) {
  if (cent === null || cent === undefined) return "—";
  return (cent / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── COMPETÊNCIA ─────────────────────────────────────────────

/**
 * O mês de referência da conta: "2026-07".
 *
 * Sai da string ISO por fatia, sem passar por `new Date`. `new Date("2026-07-01")`
 * é meia-noite UTC e no Brasil volta para junho — a conta do dia 1º cairia
 * na competência do mês anterior, que é justamente a que já foi fechada e
 * transmitida.
 */
export function competenciaDe(data) {
  const s = String(data ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(0, 7) : null;
}

/** "2026-07" → "Jul/2026". */
export function competenciaLabel(comp) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(comp ?? ""));
  if (!m) return "—";
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[Number(m[2]) - 1]}/${m[1]}`;
}

// ── VIA DE FATURAMENTO ──────────────────────────────────────

/**
 * Por onde esta conta sai.
 *
 * `exigeAutorizacao` na APAC e na AIH não é detalhe burocrático: sem
 * autorização prévia, o procedimento de alta complexidade e a internação
 * simplesmente não são pagos, e o hospital descobre no processamento.
 */
export const VIAS = {
  bpa: {
    label: "BPA", nome: "Boletim de Produção Ambulatorial",
    quem: "Produção ambulatorial do SUS — consulta, exame e procedimento de baixa e média complexidade.",
    exigeCns: true, exigeAutorizacao: false, cobraDoPaciente: false,
  },
  apac: {
    label: "APAC", nome: "Autorização de Procedimento de Alta Complexidade",
    quem: "Procedimento de alta complexidade ou custo. Precisa de autorização prévia e tem validade.",
    exigeCns: true, exigeAutorizacao: true, cobraDoPaciente: false,
  },
  aih: {
    label: "AIH", nome: "Autorização de Internação Hospitalar",
    quem: "Internação pelo SUS. O caráter (eletivo ou urgência) é campo obrigatório da AIH.",
    exigeCns: true, exigeAutorizacao: true, cobraDoPaciente: false,
  },
  tiss: {
    label: "TISS", nome: "Guia TISS",
    quem: "Operadora de saúde. O padrão TISS é obrigatório na troca com a operadora (ANS).",
    exigeCns: false, exigeAutorizacao: false, cobraDoPaciente: true,
  },
  direta: {
    label: "Direta", nome: "Cobrança direta",
    quem: "Particular. O próprio paciente paga; não há guia nem glosa.",
    exigeCns: false, exigeAutorizacao: false, cobraDoPaciente: true,
  },
};

/**
 * Qual via este atendimento segue.
 *
 * A via SUS vem do CADASTRO do procedimento (`via_sus`), e não de regra
 * escrita aqui. Quais procedimentos são APAC muda por portaria, várias
 * vezes por ano — cravar a lista em código faria cada atualização do SIGTAP
 * virar um release. Sem cadastro, cai em BPA, que é a via da maioria
 * esmagadora da produção ambulatorial.
 *
 * A internação vem antes de tudo: internou pelo SUS, é AIH, por mais que o
 * procedimento principal seja ambulatorial no SIGTAP.
 */
export function viaDeFaturamento({ convenio, atendimento, procedimento } = {}) {
  const tipo = convenio?.tipo;
  if (!tipo) return null;
  if (tipo === "particular") return "direta";
  if (tipo === "convenio") return "tiss";

  // SUS
  if (atendimento?.tipo_atendimento === "eletivo" || atendimento?.internacao === true) return "aih";
  const via = String(procedimento?.via_sus ?? "").trim().toLowerCase();
  if (via === "apac" || via === "aih" || via === "bpa") return via;
  return "bpa";
}

// ── ITENS ───────────────────────────────────────────────────

/** O que entra numa conta. */
export const TIPOS_ITEM = [
  { chave: "procedimento", label: "Procedimento", dica: "O ato: consulta, exame, cirurgia." },
  { chave: "material",     label: "Material",     dica: "O que foi consumido — gaze, sonda, órtese." },
  { chave: "medicamento",  label: "Medicamento",  dica: "O que foi administrado." },
  { chave: "diaria",       label: "Diária",       dica: "Permanência em leito." },
  { chave: "taxa",         label: "Taxa",         dica: "Sala, equipamento, gasoterapia." },
];

export const TIPO_ITEM_POR_CHAVE = Object.fromEntries(TIPOS_ITEM.map(t => [t.chave, t]));

/**
 * O total da conta, em centavos.
 *
 * `semPreco` conta os itens que não têm valor cadastrado. Sem esse número a
 * conta pareceria fechada e menor do que é — o gestor leria como
 * faturamento baixo, e não como catálogo incompleto.
 */
export function totalDaConta(itens = []) {
  let total = 0;
  let semPreco = 0;
  for (const i of itens) {
    if (i?.cancelado) continue;
    const unit = centavos(i?.valor_unitario);
    const qtd = Number(i?.quantidade);
    if (unit === null || !Number.isFinite(qtd)) { semPreco += 1; continue; }
    total += unit * qtd;
  }
  return { totalCentavos: total, semPreco, total: reais(total) };
}

/**
 * Pode acrescentar este item?
 *
 * O único ERRO que não é sobre o hospital: cobrar do paciente numa conta
 * SUS. Os outros protegem o pagamento; este protege a pessoa.
 */
export function conferirItem({ conta, item = {}, via } = {}) {
  const erros = [];
  const avisos = [];

  if (conta && !STATUS_CONTA[conta.status]?.recebeItem) {
    erros.push(`A conta está ${STATUS_CONTA[conta.status]?.label?.toLowerCase() || conta.status}. Conta que já foi fechada não recebe item novo — reabra antes, para o acréscimo ficar com data e autor.`);
  }

  if (!TIPO_ITEM_POR_CHAVE[item.tipo]) erros.push("Informe o tipo do item.");
  if (!String(item.codigo ?? "").trim() && !String(item.descricao ?? "").trim()) {
    erros.push("Informe ao menos o código ou a descrição do item.");
  }

  const qtd = Number(item.quantidade);
  if (!Number.isFinite(qtd) || qtd <= 0) erros.push("A quantidade tem que ser maior que zero.");

  const viaCfg = VIAS[via];
  if (item.cobrar_do_paciente === true && viaCfg && !viaCfg.cobraDoPaciente) {
    erros.push(
      "Atendimento pelo SUS não pode ser cobrado do paciente, em nenhuma hipótese e por nenhum item. " +
      "Se o material não é coberto, o caminho é a conta do hospital — nunca o bolso de quem foi atendido.");
  }

  if (centavos(item.valor_unitario) === null) {
    avisos.push("Item sem preço cadastrado. A conta fecha, mas este item entra sem valor — o total sai menor do que é.");
  }

  return { ok: erros.length === 0, erros, avisos };
}

// ── ESTADO DA CONTA ─────────────────────────────────────────

/**
 * Os estados da conta.
 *
 * `faturada` não volta a receber item: a partir dela existe um arquivo
 * transmitido, e mexer no que já foi enviado é como a conta e a remessa
 * passam a contar histórias diferentes. Correção depois de faturada é
 * assunto de glosa, que é outro fluxo.
 */
export const STATUS_CONTA = {
  aberta:    { label: "Aberta",    recebeItem: true,  fechavel: true },
  fechada:   { label: "Fechada",   recebeItem: false, fechavel: false, reabrivel: true },
  faturada:  { label: "Faturada",  recebeItem: false, fechavel: false, reabrivel: false },
  glosada:   { label: "Glosada",   recebeItem: false, fechavel: false, reabrivel: false },
  cancelada: { label: "Cancelada", recebeItem: false, fechavel: false, reabrivel: false },
};

/**
 * A conta pode ser fechada?
 *
 * Reaproveita `conferirFicha`, que já sabe cobrar carteira, autorização,
 * CNS e CBO — a ficha administrativa e a conta cobram as MESMAS coisas, e
 * duas listas de exigência divergiriam na primeira mudança de regra.
 *
 * Aqui as pendências ALTAS da ficha viram ERRO, e não aviso. É a diferença
 * entre os dois momentos: no balcão, pendência não pode segurar paciente;
 * no fechamento da conta, ela é exatamente o que vai fazer a produção ser
 * rejeitada, e ninguém está esperando na frente.
 */
export function validarFechamento({
  conta, itens = [], paciente, convenio, plano, atendimento, procedimento, medico, catalogos = {},
  glosa = [], hoje = new Date(),
} = {}) {
  const erros = [];
  const avisos = [];

  // ── PRÉ-GLOSA ────────────────────────────────────────────
  // O impedimento é determinístico: o SUS NÃO PAGA assim (sexo ou faixa
  // etária incompatível com o procedimento). Fechar mesmo assim não é uma
  // escolha de risco — é transmitir uma AIH que volta rejeitada, e a
  // rejeição só aparece no processamento do mês seguinte, quando refazer
  // já custa competência.
  //
  // Por isso é ERRO e não aviso, e por isso NÃO existe override: não há
  // justificativa que faça o SUS pagar. O caminho é corrigir o cadastro do
  // paciente ou o procedimento — que é justamente o que o impedimento está
  // dizendo estar errado.
  //
  // `atencao` continua aviso: permanência acima da média e CID atípico são
  // pagáveis com justificativa, e recusar aí travaria produção legítima.
  for (const a of glosa) {
    if (a?.gravidade === GRAVIDADES.IMPEDIMENTO) erros.push(`Impedimento de glosa: ${a.texto}`);
    else if (a?.texto) avisos.push(a.texto);
  }

  if (!conta?.id) erros.push("Conta inválida.");
  else if (!STATUS_CONTA[conta.status]?.fechavel) {
    erros.push(`Esta conta já está ${STATUS_CONTA[conta.status]?.label?.toLowerCase() || conta.status}.`);
  }

  const ativos = itens.filter(i => !i?.cancelado);
  if (!ativos.length) {
    erros.push("Conta sem nenhum item. Fechar uma conta vazia transmite produção zero e some com o atendimento do faturamento.");
  }

  const via = viaDeFaturamento({ convenio, atendimento, procedimento });
  if (!via) {
    erros.push("Sem fonte pagadora não há conta. Informe o convênio no atendimento antes de fechar.");
  }

  // As exigências administrativas, reaproveitadas da ficha.
  const conf = conferirFicha({
    paciente, convenio, plano, ficha: atendimento || {}, procedimento, medico, catalogos, hoje,
  });
  for (const a of conf.avisos) {
    (a.gravidade === "alta" ? erros : avisos).push(a.texto);
  }

  const viaCfg = VIAS[via];
  if (viaCfg?.exigeAutorizacao && !String(atendimento?.autorizacao_senha ?? "").trim()
      && !String(atendimento?.guia_numero ?? "").trim()) {
    erros.push(`${viaCfg.nome} exige autorização prévia. Sem o número, o procedimento não é pago — e isso só aparece no processamento.`);
  }

  const { semPreco } = totalDaConta(ativos);
  if (semPreco > 0) {
    avisos.push(`${semPreco} item(ns) sem preço cadastrado. A conta fecha, mas o valor sai menor do que é — o catálogo é que está incompleto, não a produção.`);
  }

  return { ok: erros.length === 0, erros, avisos, via };
}

/**
 * O resumo da conta para a tela e para o fechamento.
 *
 * `porTipo` existe porque é assim que a conferência é feita no faturamento:
 * procedimento com procedimento, material com material. Uma lista única de
 * trinta linhas não se confere.
 */
export function resumoDaConta({ conta, itens = [], convenio, atendimento, procedimento } = {}) {
  const ativos = itens.filter(i => !i?.cancelado);
  const via = viaDeFaturamento({ convenio, atendimento, procedimento });
  const { totalCentavos, semPreco } = totalDaConta(ativos);

  const porTipo = TIPOS_ITEM.map(t => {
    const meus = ativos.filter(i => i.tipo === t.chave);
    const soma = meus.reduce((s, i) => {
      const u = centavos(i.valor_unitario);
      return u === null ? s : s + u * Number(i.quantidade || 0);
    }, 0);
    return { ...t, quantidade: meus.length, totalCentavos: soma, total: reais(soma) };
  }).filter(t => t.quantidade > 0);

  return {
    via,
    viaLabel: VIAS[via]?.label || "—",
    viaNome: VIAS[via]?.nome || "Sem fonte pagadora",
    status: conta?.status || "aberta",
    statusLabel: STATUS_CONTA[conta?.status || "aberta"]?.label || conta?.status,
    competencia: conta?.competencia || competenciaDe(atendimento?.chegada_em),
    itens: ativos.length,
    semPreco,
    totalCentavos,
    total: reais(totalCentavos),
    porTipo,
    // O paciente pode ser cobrado nesta conta? É a resposta que a recepção
    // dá quando ele pergunta no balcão — e errar para o lado do "pode" é
    // cobrar de quem tem direito a não pagar.
    cobraDoPaciente: !!VIAS[via]?.cobraDoPaciente,
  };
}

// ── GRAVAÇÃO ────────────────────────────────────────────────

/** O corpo da conta. */
export function camposDaConta(dados = {}) {
  const texto = v => {
    const s = typeof v === "string" ? v.trim() : v;
    return s === "" || s === undefined ? null : s;
  };
  return {
    atendimento_id: dados.atendimento_id ?? null,
    prontuario: texto(dados.prontuario),
    convenio_id: dados.convenio_id || null,
    plano_id: dados.plano_id || null,
    via: texto(dados.via),
    competencia: texto(dados.competencia),
    status: STATUS_CONTA[dados.status] ? dados.status : "aberta",
    observacao: texto(dados.observacao),
  };
}

/**
 * O corpo de um item.
 *
 * `valor_total` é gravado junto, e não deixado para calcular na leitura: o
 * preço da tabela muda, e a conta de março precisa continuar contando a
 * história de março. É a mesma razão pela qual o CBO do profissional é
 * congelado no atendimento.
 */
export function camposDoItem(dados = {}) {
  const texto = v => {
    const s = typeof v === "string" ? v.trim() : v;
    return s === "" || s === undefined ? null : s;
  };
  const unit = centavos(dados.valor_unitario);
  const qtd = Number(dados.quantidade);
  const quantidade = Number.isFinite(qtd) && qtd > 0 ? qtd : 1;
  return {
    conta_id: dados.conta_id ?? null,
    tipo: TIPO_ITEM_POR_CHAVE[dados.tipo] ? dados.tipo : "procedimento",
    codigo: texto(dados.codigo),
    descricao: texto(dados.descricao),
    quantidade,
    valor_unitario: unit === null ? null : unit / 100,
    valor_total: unit === null ? null : (unit * quantidade) / 100,
    executante: texto(dados.executante),
    executante_cbo: texto(dados.executante_cbo),
    data_execucao: texto(dados.data_execucao),
    observacao: texto(dados.observacao),
    cancelado: dados.cancelado === true,
  };
}

export { TIPOS_CONVENIO, tipoDoConvenio, conferirCbo };
