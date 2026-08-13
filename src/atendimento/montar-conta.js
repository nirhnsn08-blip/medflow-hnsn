// ═══════════════════════════════════════════════════════════
// MONTAR A CONTA DO PRONTUÁRIO — o diferencial da Fase 4
//
// Puro: não sabe o que é React nem banco. Recebe o que ACONTECEU no
// episódio (o procedimento da ficha, a permanência da internação, a
// medicação que foi de fato administrada) e PROPÕE a conta — a lista de
// itens que o faturamento revisaria, em vez de digitar um a um.
//
// POR QUE ISTO EXISTE
// Hoje a conta do Adauam (`faturamento.js` / `Faturamento.jsx`) nasce vazia
// e cada item entra à mão por `acrescentarItem`. Redigitar o que já está no
// prontuário é onde nasce o código trocado, a diária esquecida e a conta que
// sai menor do que o atendimento foi. Este motor lê o episódio e devolve a
// conta já montada; um humano confere e confirma. É PROPOSTA, não gravação.
//
// ALIMENTA A CONTA DO ADAUAM, NÃO UMA PARALELA
// Cada item sai no formato que `camposDoItem` já entende (tipo, código,
// descrição, quantidade, valor unitário, executante…). O que este arquivo
// acrescenta — `origem` e `fonte` — são enfeite de tela: dizem de ONDE do
// prontuário o item veio, e `camposDoItem` os descarta na gravação. Assim a
// mesma proposta serve para a tela do Atendimento e para a auditoria do
// Faturamento, e o que é gravado continua sendo a conta única do episódio.
//
// TRÊS PRINCÍPIOS HERDADOS (de faturamento.js e sigtap.js)
//   1. FALTA DE DADO É SILÊNCIO, NÃO PREÇO INVENTADO. O pacote de valores do
//      SIGTAP (R$ do DATASUS) ainda não entrou. Um item sem preço entra com
//      valor `null` — que é "ninguém cadastrou", diferente de R$ 0,00. A
//      conta fecha; o total sai menor e a tela avisa que o catálogo é que
//      está incompleto, não a produção. Inventar um valor de diária faria a
//      conta MENTIR, e a mentira só apareceria na conferência do fechamento.
//   2. A INTERNAÇÃO MANDA NA VIA. Internou pelo SUS, é AIH — por mais que o
//      procedimento principal seja ambulatorial no SIGTAP. O sinal de
//      internação é `desfecho === "internacao"`.
//   3. SUS NÃO COBRA DO PACIENTE. Todo item proposto nasce com
//      `cobrar_do_paciente: false`. A conta que se monta sozinha nunca é a
//      que aponta para o bolso de quem foi atendido.
//
// O QUE ESTE MOTOR NÃO FAZ: gravar, fechar, ou decidir por um humano. Ele
// propõe e aponta o que anteciparia uma glosa; quem confere e fecha é a
// tela, com `validarFechamento` de faturamento.js.
// ═══════════════════════════════════════════════════════════

import {
  centavos, totalDaConta, VIAS, viaDeFaturamento, competenciaDe,
} from "./faturamento.js";
import {
  codigoLimpo, codigoFormatado, montarProcedimento, viaDoProcedimento, viaPorGrupo,
  permanenciaEmDias, avaliarPermanencia, avaliarGlosa, temImpedimento,
} from "./sigtap.js";

// ── item proposto (o formato do camposDoItem + a origem para a tela) ──

/**
 * Um item da conta, já no molde que `camposDoItem` consome.
 *
 * `origem` e `fonte` são metadados de tela e NÃO existem no banco —
 * `camposDoItem` só copia as chaves que conhece, então eles viajam até a
 * revisão e somem na gravação. `cobrar_do_paciente` nasce sempre `false`:
 * a conta montada do prontuário não é a que cobra de quem foi atendido.
 */
function item({
  tipo, codigo = null, descricao = null, quantidade = 1, valorUnitario = null,
  executante = null, executanteCbo = null, dataExecucao = null, origem, fonte,
}) {
  return {
    tipo,
    codigo,
    descricao,
    quantidade,
    valor_unitario: valorUnitario,
    executante,
    executante_cbo: executanteCbo,
    data_execucao: dataExecucao,
    cobrar_do_paciente: false,
    origem,
    fonte,
  };
}

// ── VIA ─────────────────────────────────────────────────────

/**
 * Por qual via esta conta sai.
 *
 * Particular e convênio saem direto do tipo do convênio (reaproveita a regra
 * do faturamento.js). O SUS tem prioridade própria:
 *   1. Internou (`desfecho === "internacao"`) → AIH, acima de tudo.
 *   2. Senão, a via do procedimento: o cadastro do hospital (`via_sus`)
 *      vale primeiro; na falta, o SIGTAP (instrumento de registro ou palpite
 *      pelo grupo, via `viaDoProcedimento`).
 *   3. Na dúvida, BPA — a via da maioria esmagadora da produção.
 */
export function resolverVia({ convenio, atendimento, procCatalogo, sigtapProc } = {}) {
  const tipo = convenio?.tipo;
  if (!tipo) return null;
  if (tipo === "particular") return "direta";
  if (tipo === "convenio") return "tiss";

  // SUS
  if (atendimento?.desfecho === "internacao") return "aih";
  const cad = String(procCatalogo?.via_sus ?? "").trim().toLowerCase();
  if (cad === "aih" || cad === "apac" || cad === "bpa") return cad;
  if (sigtapProc) {
    const v = viaDoProcedimento(sigtapProc);
    if (v) return v;
  }
  // Sem SIGTAP carregado, o palpite pelo grupo ainda vale — ele sai do
  // próprio código da ficha, sem depender de nenhum objeto montado. É o que
  // deixa esta função certa mesmo chamada sozinha (03/04 → AIH; resto → BPA).
  const vg = viaPorGrupo(atendimento?.procedimento_cod);
  if (vg) return vg;
  // Sem procedimento nenhum, a via ainda pode ser SUS pela fonte pagadora;
  // BPA é o destino honesto até alguém dizer o procedimento.
  return "bpa";
}

// ── ITEM: procedimento principal ────────────────────────────

/**
 * O ato que nomeia a conta — e, na AIH, o que justifica a internação.
 *
 * Vem do `procedimento_cod` da ficha, cruzado com dois catálogos: o do
 * hospital (`at_procedimentos`, que tem o preço) e o SIGTAP (que tem o nome
 * oficial). Se o código não está em nenhum, o item entra assim mesmo — com
 * o código, sem nome e sem preço — porque sumir com o procedimento seria pior
 * que mostrá-lo incompleto.
 */
function itemProcedimentoPrincipal({ atendimento, codPrinc, procCatalogo, sigRow }) {
  const avisos = [];
  if (!codPrinc) {
    avisos.push("Atendimento sem procedimento principal — é ele que nomeia a conta e, na AIH, justifica a internação.");
    return { item: null, avisos };
  }

  const nome = procCatalogo?.nome || sigRow?.nome || null;

  // Preço: o catálogo do hospital manda; na falta, o valor do SIGTAP —
  // SH+SP, dos valores reais das AIHs do SUS. É o valor-base do ato; a
  // diária segue informativa, sem duplicar, porque o SH já cobre a
  // permanência padrão (só o que passa da média é diária a maior).
  let valor = procCatalogo?.valor_sus ?? null; // em reais
  let fonteValor = valor != null ? "catálogo do hospital" : null;
  if (valor == null) {
    const sh = numOuNull(sigRow?.valor_sh);
    const sp = numOuNull(sigRow?.valor_sp);
    if (sh != null || sp != null) {
      valor = ((sh ?? 0) + (sp ?? 0)) / 100; // centavos → reais
      fonteValor = "SIGTAP (SH+SP)";
    }
  }

  if (!procCatalogo && !sigRow) {
    avisos.push(`Procedimento ${codigoFormatado(codPrinc) || codPrinc} não está em nenhum catálogo (nem no do hospital, nem no SIGTAP) — entra sem nome e sem preço.`);
  } else if (valor == null) {
    avisos.push(`Procedimento ${codigoFormatado(codPrinc) || codPrinc} ainda sem valor — o SIGTAP não trouxe SH/SP para ele, então o total sai menor do que é.`);
  }

  return {
    item: {
      ...item({
        tipo: "procedimento",
        codigo: codPrinc,
        descricao: nome,
        quantidade: 1,
        valorUnitario: valor,
        executante: atendimento?.medico ?? null,
        executanteCbo: atendimento?.medico_cbo ?? null,
        dataExecucao: soData(atendimento?.chegada_em),
        origem: "Procedimento principal do atendimento",
        fonte: "ps_atendimentos.procedimento_cod",
      }),
      fonteValor,
    },
    avisos,
  };
}

// ── ITEM: permanência (diárias) ─────────────────────────────

/**
 * A janela da internação.
 *
 * A permanência da AIH é a estadia no LEITO, e não a passagem pelo PS — por
 * isso o chamador passa `internacao: { admissao, alta }` da melhor fonte que
 * tiver (as datas do leito). Na falta delas, e SÓ quando o desfecho foi
 * internação, cai-se na chegada→desfecho do próprio atendimento como ponto
 * de partida — marcado como `estimada`, para a tela poder dizer que veio do
 * PS e pedir confirmação. Nunca se inventa internação onde não houve.
 */
export function janelaInternacao({ atendimento, internacao } = {}) {
  // A fonte explícita (as datas do leito) manda: usa admissão E alta como
  // vieram. Alta `null` aqui é "internação em curso" — e NÃO pode cair no
  // desfecho do PS, senão a estadia em aberto ganharia uma alta que é só a
  // hora em que o paciente saiu do pronto-socorro para o leito.
  if (internacao?.admissao != null) {
    return { admissao: internacao.admissao, alta: internacao.alta ?? null, estimada: false };
  }
  // Sem fonte do leito, e só se o desfecho foi internação: estima pela
  // passagem no PS (marcada como estimativa — a passagem não é a estadia).
  const internou = atendimento?.desfecho === "internacao";
  return {
    admissao: internou ? atendimento?.chegada_em ?? null : null,
    alta: internou ? atendimento?.desfecho_em ?? null : null,
    estimada: internou,
  };
}

/**
 * Escolhe a janela de internação a partir das fontes do LEITO — para a conta
 * usar a permanência REAL da estadia, não a passagem pelo pronto-socorro (que
 * é o que a estimativa mede, e não é a mesma coisa).
 *
 * Prioridade:
 *   1. Leito OCUPADO do episódio (ligado por `ps_atendimento_id`) → internação
 *      em CURSO: admissão exata, sem alta (as diárias fecham na alta).
 *   2. Saída de leito (`leitos_saidas`) do mesmo prontuário cujo início casa
 *      com o episódio — a internação começa quando o paciente deixa o PS.
 *      Traz admissão E alta, logo, diárias. O vínculo é por prontuário+período
 *      (a saída não guarda o atendimento), por isso a tela mostra a fonte.
 *   3. Nada → `null`: o motor cai na estimativa pelo PS, marcada como tal.
 */
export function escolherInternacao({ leitoAtivo, saidas = [], atendimento } = {}) {
  if (leitoAtivo?.data_internacao) {
    return { admissao: soData(leitoAtivo.data_internacao), alta: null, fonte: "leito-ativo" };
  }
  const chegada = soData(atendimento?.chegada_em);
  if (chegada) {
    const candidatas = (Array.isArray(saidas) ? saidas : [])
      .map((s) => ({ ini: soData(s.data_internacao), alta: soData(s.data_alta) }))
      .filter((s) => {
        if (!s.ini || s.ini < chegada) return false; // começou antes da chegada = outro episódio
        const d = permanenciaEmDias(chegada, s.ini);
        return d != null && d <= 7;                  // internação dentro da janela do episódio
      })
      .sort((a, b) => (a.ini < b.ini ? -1 : a.ini > b.ini ? 1 : 0));
    const m = candidatas[0];
    if (m) return { admissao: m.ini, alta: m.alta, fonte: "saida-leito" };
  }
  return null;
}

/**
 * As diárias, e a leitura da permanência contra a média do SIGTAP.
 *
 * Só vale para AIH: diária é conceito de internação. A diária entra com
 * quantidade = dias e valor `null` (o valor da diária vem no pacote do
 * DATASUS; até lá, inventá-lo faria a conta mentir). A comparação com a
 * média não RECUSA — pede justificativa (é o item 4 do cabeçalho do SIGTAP).
 */
function itensPermanencia({ via, admissao, alta, sigtapProc }) {
  const avisos = [];
  if (via !== "aih") return { itens: [], permanencia: null, avisos };

  if (!admissao) {
    avisos.push("Internação pela AIH sem data de admissão — a permanência não pôde ser calculada, e é ela que vira diária e glosa.");
    return { itens: [], permanencia: null, avisos };
  }
  if (!alta) {
    avisos.push("Internação em curso (sem alta) — as diárias se fecham na alta. Até lá, a conta fica sem a permanência.");
    return { itens: [], permanencia: null, avisos };
  }

  const dias = permanenciaEmDias(admissao, alta);
  if (dias == null) {
    avisos.push("Datas de internação inconsistentes (alta antes da admissão) — permanência não calculada.");
    return { itens: [], permanencia: null, avisos };
  }

  const permanencia = avaliarPermanencia(sigtapProc || {}, dias);
  const itens = [];
  if (dias >= 1) {
    itens.push(item({
      tipo: "diaria",
      codigo: null,
      descricao: "Diária hospitalar — permanência",
      quantidade: dias,
      valorUnitario: null,
      dataExecucao: soData(alta),
      origem: `Permanência: ${dias} ${dias === 1 ? "diária" : "diárias"}, ${dataBR(admissao)} → ${dataBR(alta)}`,
      fonte: "internação: admissão → alta",
    }));
  } else {
    avisos.push("Admissão e alta no mesmo dia — confira se cabe diária ou hospital-dia antes de fechar.");
  }
  return { itens, permanencia, avisos };
}

// ── ITEM: medicação administrada ────────────────────────────

/**
 * O que foi de fato administrado — não o que foi prescrito.
 *
 * Bilha o realizado: `status === "administrado"` (o padrão quando o campo
 * não veio). Agrupa por medicamento, porque a conta cobra "dipirona 3×" e
 * não três linhas de dipirona. Valor `null`: em AIH o medicamento em geral
 * está embutido no procedimento, e o que é separadamente cobrável depende do
 * pacote do SIGTAP — até lá, entra sem preço, para conferência.
 */
function itensMedicacao(administracoes) {
  const dadas = (Array.isArray(administracoes) ? administracoes : [])
    .filter((a) => (a?.status || "administrado") === "administrado");

  const grupos = new Map();
  for (const a of dadas) {
    const nome = String(a?.medicamento_nome ?? "").trim();
    const chave = String(a?.medicamento_id ?? nome).trim().toLowerCase();
    if (!chave) continue;
    const g = grupos.get(chave) || { nome, medicamentoId: a?.medicamento_id ?? null, n: 0, ultima: null };
    g.n += 1;
    if (!g.nome && nome) g.nome = nome;
    const quando = a?.administrado_em || a?.criado_em || null;
    if (quando && (!g.ultima || quando > g.ultima)) g.ultima = quando;
    grupos.set(chave, g);
  }

  return [...grupos.values()].map((g) =>
    item({
      tipo: "medicamento",
      codigo: g.medicamentoId != null ? String(g.medicamentoId) : null,
      descricao: g.nome || "(medicamento sem nome)",
      quantidade: g.n,
      valorUnitario: null,
      dataExecucao: soData(g.ultima),
      origem: `Medicação administrada e checada (${g.n}×)`,
      fonte: "ps_administracoes (status administrado)",
    })
  );
}

// ── WORKLIST ────────────────────────────────────────────────

/**
 * A lista de trabalho do faturamento: as internações e o estado da conta de
 * cada uma. Junta o episódio (ps_atendimentos) com a conta (at_contas) por
 * `atendimento_id` e diz o que precisa de ação.
 *
 * A ordem é a ordem de TRABALHO, não a cronológica: primeiro o que ainda não
 * tem conta (é o que se monta), depois a conta aberta (a revisar/fechar),
 * por fim o que já está fechado ou faturado. Dentro de cada grupo, o mais
 * recente no topo. Uma conta cancelada não conta — o episódio volta a
 * aparecer como "sem conta", que é a verdade.
 */
export function montarWorklist(internacoes = [], contas = []) {
  const porAtend = new Map();
  for (const c of Array.isArray(contas) ? contas : []) {
    if (!c || c.status === "cancelada") continue;
    porAtend.set(String(c.atendimento_id), c);
  }
  const rows = (Array.isArray(internacoes) ? internacoes : []).map((a) => {
    const conta = porAtend.get(String(a.id)) || null;
    return { ...a, conta, situacao: conta ? conta.status : "sem-conta" };
  });
  const peso = { "sem-conta": 0, aberta: 1, fechada: 2, glosada: 2, faturada: 3 };
  return rows.sort((x, y) => {
    const px = peso[x.situacao] ?? 5;
    const py = peso[y.situacao] ?? 5;
    if (px !== py) return px - py;
    return String(y.chegada_em || "").localeCompare(String(x.chegada_em || "")); // recente primeiro
  });
}

// ── O MOTOR ─────────────────────────────────────────────────

/**
 * Monta a conta proposta a partir do episódio.
 *
 * Entradas (o chamador carrega e passa; o motor não toca o banco):
 *   • atendimento   — a linha de ps_atendimentos (procedimento_cod, cid,
 *                     chegada_em, desfecho, desfecho_em, medico, idade…).
 *   • convenio      — a linha do convênio do atendimento (tem `.tipo`).
 *   • procedimentos — catálogo at_procedimentos (código → nome, valor_sus).
 *   • sigtapProcs   — linhas de sigtap_procedimentos (média, via, faixas).
 *   • administracoes— linhas de ps_administracoes do episódio.
 *   • paciente      — para sexo/idade da glosa (opcional; na falta, cala).
 *   • internacao    — { admissao, alta } das datas do leito (opcional).
 *
 * Devolve a via, o CID, a permanência lida, os itens propostos (cada um com
 * a sua origem), o total em centavos com a contagem de sem-preço, a pré-glosa
 * e a lista de avisos para o humano resolver antes de fechar.
 */
export function montarContaDoProntuario({
  atendimento,
  convenio = null,
  procedimentos = [],
  sigtapProcs = [],
  administracoes = [],
  paciente = null,
  internacao = null,
} = {}) {
  if (!atendimento?.id) {
    return {
      ok: false, atendimentoId: null, via: null, itens: [], glosa: [],
      temImpedimento: false, avisos: ["Sem atendimento não há conta."], prontas: false,
    };
  }

  const avisos = [];

  // Cruza o código principal com os dois catálogos.
  const idxProc = indexarPorCodigo(procedimentos);
  const idxSig = indexarPorCodigo(sigtapProcs);
  const codPrinc = codigoLimpo(atendimento.procedimento_cod);
  const procCatalogo = codPrinc ? idxProc.get(codPrinc) || null : null;
  const sigRow = codPrinc ? idxSig.get(codPrinc) || null : null;
  // O procedimento SIGTAP normalizado alimenta a permanência e a glosa.
  const sigProc = sigRow ? montarSig(sigRow) : (codPrinc ? montarProcedimento({ codigo: codPrinc }) : null);

  const via = resolverVia({ convenio, atendimento, procCatalogo, sigtapProc: sigProc });
  if (!via) avisos.push("Sem fonte pagadora no atendimento — sem convênio não há conta nem via. Informe o convênio antes de montar.");

  const itens = [];

  // 1) Procedimento principal.
  const prc = itemProcedimentoPrincipal({ atendimento, codPrinc, procCatalogo, sigRow });
  if (prc.item) itens.push(prc.item);
  avisos.push(...prc.avisos);

  // 2) Permanência → diárias.
  const janela = janelaInternacao({ atendimento, internacao });
  const perm = itensPermanencia({ via, admissao: janela.admissao, alta: janela.alta, sigtapProc: sigProc });
  itens.push(...perm.itens);
  avisos.push(...perm.avisos);
  if (perm.permanencia?.dias != null && janela.estimada) {
    avisos.push("Permanência estimada pela passagem no pronto-socorro (chegada → desfecho) — confirme com as datas do leito antes de fechar.");
  }

  // 3) Medicação administrada.
  itens.push(...itensMedicacao(administracoes));

  // CID principal — carrega a conta e alimenta a compatibilidade da glosa.
  const cid = normalizarCid(atendimento.cid);
  if (via === "aih" && !cid) {
    avisos.push("Internação sem CID principal — a AIH exige o diagnóstico que a justifica.");
  }

  // Total (em centavos, com a contagem do que não tem preço).
  const { totalCentavos, semPreco, total } = totalDaConta(itens);
  if (semPreco > 0) {
    avisos.push(`${semPreco} ${semPreco === 1 ? "item" : "itens"} sem preço — o total sai menor do que é até o pacote de valores do DATASUS entrar no SIGTAP.`);
  }

  // Pré-glosa: o que anteciparia uma recusa (permanência, sexo, idade, CID).
  const glosa = avaliarGlosa({
    proc: sigProc,
    paciente: { sexo: paciente?.sexo ?? null, idade: numOuNull(atendimento?.idade) ?? numOuNull(paciente?.idade) },
    cidPrincipal: cid,
    permanenciaDias: perm.permanencia?.dias ?? null,
  });
  const impedida = temImpedimento(glosa);

  if (itens.length === 0) {
    avisos.push("Nada a faturar ainda — o episódio não tem procedimento, permanência nem medicação administrada.");
  }

  return {
    ok: true,
    atendimentoId: atendimento.id,
    prontuario: atendimento.prontuario ?? null,
    via,
    viaLabel: VIAS[via]?.label ?? "—",
    viaNome: VIAS[via]?.nome ?? "Sem fonte pagadora",
    cobraDoPaciente: !!VIAS[via]?.cobraDoPaciente,
    cid,
    competencia: competenciaDe(atendimento.chegada_em),
    permanencia: perm.permanencia,
    itens,
    total,
    totalCentavos,
    semPreco,
    glosa,
    temImpedimento: impedida,
    avisos,
    // "prontas" = dá para montar e conferir. NÃO é "pode fechar": o
    // fechamento tem as suas próprias travas em validarFechamento (carteira,
    // autorização, CNS…), que dependem de dados que este motor não recebe.
    prontas: itens.length > 0 && !!via && !impedida,
  };
}

// ── internos ────────────────────────────────────────────────

function indexarPorCodigo(lista) {
  const m = new Map();
  for (const row of Array.isArray(lista) ? lista : []) {
    const c = codigoLimpo(row?.codigo);
    if (c && !m.has(c)) m.set(c, row);
  }
  return m;
}

/** Linha crua de sigtap_procedimentos → procedimento normalizado do motor. */
function montarSig(row) {
  return montarProcedimento({
    codigo: row.codigo,
    nome: row.nome,
    via: row.via,
    mediaPermanencia: row.media_permanencia,
    valorSh: row.valor_sh,
    valorSp: row.valor_sp,
    valorSa: row.valor_sa,
    sexo: row.sexo,
    idadeMin: row.idade_min,
    idadeMax: row.idade_max,
    cids: row.cids,
    cbos: row.cbos,
  });
}

/** ISO/timestamp → "AAAA-MM-DD" (só a data), ou `null`. */
function soData(v) {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** ISO → "DD/MM/AAAA" para a legenda de origem. */
function dataBR(v) {
  const s = soData(v);
  if (!s) return "—";
  const [a, m, d] = s.split("-");
  return `${d}/${m}/${a}`;
}

/** CID em letras/números maiúsculos, sem pontuação. `null` se vazio. */
function normalizarCid(cid) {
  const t = String(cid ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t || null;
}

function numOuNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// centavos é reexportado para quem monta a tela a partir daqui não precisar
// importar de dois módulos só para formatar o total.
export { centavos };
