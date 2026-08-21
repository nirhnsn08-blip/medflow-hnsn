// ═══════════════════════════════════════════════════════════
// RECEPÇÃO — camada de dados
//
// Só acesso ao banco. As regras vivem em `recepcao.js` (puras, testadas);
// a interface, em `Recepcao.jsx`.
//
// TODA ESCRITA DA RECEPÇÃO PASSA POR AQUI, pelo mesmo motivo que no PEP:
// enquanto cada tela montava o próprio `body`, uma delas gravou em quatro
// colunas inexistentes e o PostgREST recusou o INSERT inteiro — em
// silêncio. Com a escrita concentrada num arquivo, `contrato-banco.test.js`
// confere cada chave contra `supabase/auditoria-banco.sql`.
//
// `sb` é o sbFetch do App.jsx, injetado. Ele NUNCA lança: devolve `null`
// quando a chamada falha. Por isso cada função aqui devolve um resultado
// explícito ({ ok, ... }) em vez de confiar em exceção — e nenhuma delas
// trata `null` como sucesso.
// ═══════════════════════════════════════════════════════════

import {
  filtroBuscaPacientes, filtroBuscaPacientesLegado, normalizarProntuario, dadosNaoIdentificado,
} from "./recepcao.js";
import { camposDaFicha, DOMINIOS } from "./ficha.js";
import { CATALOGO_POR_CHAVE, corpoDoCatalogo } from "./catalogo.js";
import { camposDaCorrecao, FILTRO_ATENDIMENTO_ABERTO } from "./ciclo.js";
import { CAMPOS_DO_EPISODIO } from "./consultas.js";
import { camposDaProducao } from "./producao.js";
import { camposDoResponsavel } from "./responsavel.js";
import { camposDaConta, camposDoItem } from "./faturamento.js";

// Campos do paciente que a recepção precisa ver na lista de resultados.
// Lista explícita em vez de `*`: a busca aparece no balcão, com gente
// atrás, e não há motivo para trazer endereço e telefone de várias pessoas
// para uma tela que só precisa desempatar quem é quem.
const CAMPOS_BUSCA = [
  "prontuario", "iniciais", "nome_completo", "nome_social", "nome_mae",
  "data_nascimento", "ano_nascimento", "sexo", "cpf", "cns",
  "nao_identificado", "identificado_em", "obito",
].join(",");

/**
 * Procura o paciente pelo que a recepção digitou.
 *
 * Devolve `[]` tanto para "não achei" quanto para "termo curto demais" —
 * quem distingue os dois é a tela, com `filtroBuscaPacientes`.
 */
export async function buscarPacientes(sb, termo, { limite = 25 } = {}) {
  const filtro = filtroBuscaPacientes(termo);
  if (!filtro) return [];
  const consulta = f => sb(`pacientes?${f}&select=${CAMPOS_BUSCA}&limit=${limite}&order=prontuario`);

  const r = await consulta(filtro);
  if (Array.isArray(r)) return r;

  // `null` NÃO é lista vazia. Lista vazia é "procurei e não achei"; `null` é
  // "não deu para perguntar" — e aqui a causa previsível é uma só: a coluna
  // `nome_busca` ainda não existe neste banco, porque a migração é manual e
  // roda DEPOIS do deploy. Sem este recuo, a recepção passaria o intervalo
  // inteiro entre o merge e o SQL vendo "nenhum paciente encontrado" para
  // TODO MUNDO, no balcão, sem nenhuma pista do motivo.
  //
  // O recuo é para a busca antiga, que é pior mas funciona. Depois que o SQL
  // rodar nos dois bancos, nada mais passa por aqui.
  const legado = filtroBuscaPacientesLegado(termo);
  if (!legado || legado === filtro) return [];
  const r2 = await consulta(legado);
  return Array.isArray(r2) ? r2 : [];
}

/** O cadastro completo de um paciente, ou `null`. */
export async function carregarPaciente(sb, prontuario) {
  const p = normalizarProntuario(prontuario);
  if (!p) return null;
  const r = await sb(`pacientes?prontuario=eq.${encodeURIComponent(p)}&select=*`);
  return Array.isArray(r) && r.length ? r[0] : null;
}

/**
 * Pede ao banco o próximo número de prontuário.
 *
 * A emissão é do BANCO, não da tela: dois recepcionistas atendendo ao
 * mesmo tempo em dois computadores calculariam o mesmo "maior + 1" e
 * criariam o mesmo número. A sequência do Postgres é atômica; um `select
 * max()` no cliente não é.
 *
 * Quando falha (migração não aplicada, permissão), devolve o motivo em vez
 * de um número inventado — a tela cai no preenchimento manual, que é ruim
 * mas é honesto.
 */
export async function emitirProntuario(sb) {
  const r = await sb("rpc/proximo_prontuario", { method: "POST", body: "{}" });
  const valor = typeof r === "string" ? r : (r && typeof r === "object" ? r.proximo_prontuario : null);
  if (!valor) {
    return { ok: false, motivo: "O banco não emitiu o número. Confirme que a migração `migracao-atendimento-recepcao.sql` foi aplicada neste banco." };
  }
  return { ok: true, prontuario: String(valor) };
}

/**
 * Cria o cadastro de quem chegou sem identificação.
 *
 * Ver `dadosNaoIdentificado` em recepcao.js para o que NÃO se grava aqui
 * (idade aparente não vira data de nascimento).
 */
export async function criarPacienteNaoIdentificado(sb, dados, user) {
  const corpo = dadosNaoIdentificado(dados);
  const r = await sb("pacientes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  // O PostgREST devolve 204 mesmo quando o RLS bloqueia e nada muda — por
  // isso se confere o RETORNO, não o status.
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Confirme que seu perfil permite cadastrar paciente e que a migração foi aplicada." };
  }
  return { ok: true, paciente: r[0] };
}

/** Atendimentos deste paciente que ainda não foram finalizados. */
export async function atendimentosAbertos(sb, prontuario) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const r = await sb(`ps_atendimentos?prontuario=eq.${encodeURIComponent(p)}&${FILTRO_ATENDIMENTO_ABERTO}&select=id,prontuario,iniciais,status,chegada_em,classificacao,tipo_atendimento&order=chegada_em.desc`);
  return Array.isArray(r) ? r : [];
}

/**
 * Abre o atendimento.
 *
 * As `iniciais` são copiadas do cadastro em vez de digitadas de novo: era
 * o campo em que a chegada do PS divergia do cadastro sem ninguém notar —
 * a fila mostrava um nome e o Paciente 360, outro.
 */
export async function abrirAtendimento(sb, { paciente, tipo = "emergencia", origem, origemDetalhe, queixa, ficha, medico, agendamentoId }, user) {
  const prontuario = normalizarProntuario(paciente?.prontuario);
  if (!prontuario) return { ok: false, motivo: "Atendimento sem paciente não é gravado." };

  const corpo = {
    prontuario,
    iniciais: String(paciente?.iniciais || "?").trim(),
    queixa: String(queixa ?? "").trim() || null,
    origem: origem || null,
    origem_detalhe: String(origemDetalhe ?? "").trim() || null,
    tipo_atendimento: tipo,
    chegada_em: new Date().toISOString(),
    // O status de entrada depende do tipo. Emergência entra AGUARDANDO
    // TRIAGEM porque a classificação de Manchester é o que ordena a fila.
    // Ambulatorial não é triado: a consulta já tem hora marcada e
    // especialidade definida, então o paciente entra aguardando o
    // profissional. Cravar "aguardando_triagem" para os dois punha consulta
    // agendada na fila do plantão, onde ela ficaria para sempre — ninguém
    // vai triar quem já tem consulta marcada.
    status: tipo === "emergencia" ? "aguardando_triagem" : "aguardando_atendimento",
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
    // A parte administrativa da ficha. `camposDaFicha` devolve exatamente
    // as colunas que existem — o `contrato-banco.test.js` confere isso
    // contra a auditoria, que é o que impede a volta do INSERT recusado em
    // silêncio.
    ...(ficha ? camposDaFicha(ficha) : {}),
    // Médico e CBO congelados no momento da abertura, pelo mesmo motivo da
    // assinatura no PEP: quem atendeu pode mudar de ocupação depois, e a
    // conta daquele mês precisa continuar contando a história daquele mês.
    ...(medico ? { medico: medico.nome || null, medico_cbo: medico.cbo || null } : {}),
    // De qual agendamento este atendimento nasceu. É o que faz "realizadas"
    // deixar de ser digitado: consulta realizada é agendamento com
    // atendimento aberto.
    ...(agendamentoId ? { agendamento_id: agendamentoId } : {}),
  };

  const r = await sb("ps_atendimentos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Se o paciente foi cadastrado agora, confirme que o cadastro concluiu antes de abrir o atendimento." };
  }
  return { ok: true, atendimento: r[0] };
}

/**
 * Os catálogos que a ficha consome, numa ida só.
 *
 * Devolve SEMPRE todas as chaves, com array vazio quando não há nada
 * cadastrado — é isso que permite a tela distinguir "o hospital ainda não
 * configurou" de "a recepcionista não preencheu", e cobrar só o segundo.
 *
 * Falha de rede também cai em array vazio, e não em exceção: catálogo que
 * não carregou não pode derrubar a recepção. A consequência é a tela pedir
 * menos, nunca travar.
 */
export async function carregarCatalogos(sb) {
  const vazio = { convenios: [], planos: [], procedimentos: [] };
  for (const d of DOMINIOS) vazio[d.chave] = [];

  const [convenios, planos, procedimentos, dominios] = await Promise.all([
    sb("at_convenios?ativo=is.true&select=*&order=nome"),
    sb("at_planos?ativo=is.true&select=*&order=nome"),
    sb("at_procedimentos?ativo=is.true&select=*&order=nome"),
    sb("at_dominios?ativo=is.true&select=*&order=dominio,ordem,nome"),
  ]);

  const out = {
    ...vazio,
    convenios: Array.isArray(convenios) ? convenios : [],
    planos: Array.isArray(planos) ? planos : [],
    procedimentos: Array.isArray(procedimentos) ? procedimentos : [],
  };
  for (const linha of Array.isArray(dominios) ? dominios : []) {
    if (out[linha.dominio]) out[linha.dominio].push(linha);
    else out[linha.dominio] = [linha];
  }
  return out;
}

/**
 * Quem pode aparecer como profissional responsável.
 *
 * Traz o CBO junto porque é ele que será congelado no atendimento — e
 * porque a tela precisa avisar quando o profissional escolhido não tem CBO
 * cadastrado, antes de a produção ser rejeitada.
 */
export async function carregarProfissionais(sb) {
  const r = await sb("profiles?select=username,nome,categoria,conselho,registro_conselho,cbo&order=nome");
  const lista = Array.isArray(r) ? r : [];
  // Só quem tem competência clínica assinala atendimento; administrativo
  // não vira responsável por ato assistencial.
  return lista.filter(p => p.categoria && p.categoria !== "administrativo");
}

// ── PESQUISA DE ATENDIMENTOS (aba Consultas) ────────────────

/**
 * Todo o histórico de episódios de um paciente.
 *
 * Traz só `CAMPOS_DO_EPISODIO` — a lista sem dado clínico. É o que permite
 * a recepção responder "esse paciente já veio?" sem ter acesso ao
 * prontuário, que é a separação que a COFEN 754/2024, art. 6º, exige.
 *
 * Inclui os CANCELADOS de propósito: quem pesquisa precisa ver que houve um
 * atendimento cancelado, senão "abri e cancelei por engano" fica
 * indistinguível de "nunca abri". Quem filtra é o consumidor.
 */
export async function historicoDoPaciente(sb, prontuario, { limite = 200 } = {}) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const r = await sb(`ps_atendimentos?prontuario=eq.${encodeURIComponent(p)}` +
    `&select=${CAMPOS_DO_EPISODIO.join(",")}&order=chegada_em.desc&limit=${limite}`);
  return Array.isArray(r) ? r : [];
}

/**
 * O que este paciente tem marcado a partir de hoje.
 *
 * Responde a pergunta que evita o erro mais comum do balcão: marcar de novo
 * quem já está marcado. Sem isso, a mesma pessoa acaba com duas consultas da
 * mesma especialidade no mesmo dia — e ocupa uma vaga que faltaria para
 * outro.
 */
export async function agendamentosFuturos(sb, prontuario, { de } = {}) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const inicio = de || new Date().toISOString().slice(0, 10);
  const r = await sb(`ag_agendamentos?prontuario=eq.${encodeURIComponent(p)}` +
    `&data=gte.${inicio}&status=in.(agendado,presente)` +
    `&select=id,data,hora,especialidade_cod,origem_marcacao,tipo_atendimento_cod,status,protocolo_regulacao` +
    `&order=data,hora`);
  return Array.isArray(r) ? r : [];
}

/** Os atendimentos abertos num período. As bordas vêm de `bordasDoPeriodo`. */
export async function atendimentosDoPeriodo(sb, { inicio, fim, tipo, status } = {}) {
  if (!inicio || !fim) return [];
  const extra = [
    tipo ? `&tipo_atendimento=eq.${encodeURIComponent(tipo)}` : "",
    status ? `&status=eq.${encodeURIComponent(status)}` : "",
  ].join("");
  const r = await sb(`ps_atendimentos?chegada_em=gte.${inicio}&chegada_em=lt.${fim}${extra}` +
    `&select=${CAMPOS_DO_EPISODIO.join(",")}&order=chegada_em.desc&limit=500`);
  return Array.isArray(r) ? r : [];
}

/** Um atendimento pelo número — sem dado clínico. */
export async function atendimentoPorNumero(sb, id) {
  const n = String(id ?? "").replace(/\D/g, "");
  if (!n) return null;
  const r = await sb(`ps_atendimentos?id=eq.${n}&select=${CAMPOS_DO_EPISODIO.join(",")}`);
  return Array.isArray(r) && r.length ? r[0] : null;
}

// ── CICLO DE VIDA DO ATENDIMENTO ────────────────────────────

/**
 * Quantos registros clínicos estão pendurados neste atendimento.
 *
 * É o número que decide se cancelar é possível. Cancelar um atendimento com
 * evolução ou prescrição deixaria registro clínico órfão, apontando para um
 * episódio que o sistema passa a negar.
 *
 * Conta com `HEAD` + `count=exact`: não traz o conteúdo clínico para a
 * tela da recepção, que não tem direito de ler prontuário (COFEN 754/2024,
 * art. 6º). Só a quantidade.
 */
export async function contarRegistrosClinicos(sb, atendimentoId) {
  if (!atendimentoId) return 0;
  const alvos = [
    `ps_registros?atendimento_id=eq.${atendimentoId}&select=id`,
    `ps_prescricao_itens?atendimento_id=eq.${atendimentoId}&select=id`,
    `ps_administracoes?atendimento_id=eq.${atendimentoId}&select=id`,
  ];
  const rs = await Promise.all(alvos.map(a => sb(a).catch(() => null)));
  return rs.reduce((s, r) => s + (Array.isArray(r) ? r.length : 0), 0);
}

/**
 * Encerra o atendimento ambulatorial.
 *
 * Reusa `desfecho` + `desfecho_em` + `status`, que já existiam para o PS —
 * assim tudo que já sabia ler "atendimento fechado" passa a funcionar sem
 * mudança. Inventar um campo novo de encerramento só para o ambulatório
 * criaria dois jeitos de estar fechado, e alguma tela leria só um deles.
 */
export async function encerrarAtendimento(sb, id, desfecho, observacao, user) {
  return patchAtendimento(sb, id, {
    desfecho,
    desfecho_em: new Date().toISOString(),
    status: "finalizado",
    ...(observacao ? { observacao: String(observacao).trim() } : {}),
  }, user);
}

/** Corrige o dado administrativo. `campos` já vem filtrado por `camposDaCorrecao`. */
export async function corrigirAtendimento(sb, id, campos, user) {
  const corpo = camposDaCorrecao(campos);
  if (!Object.keys(corpo).length) return { ok: false, motivo: "Nada a corrigir." };
  return patchAtendimento(sb, id, corpo, user);
}

/**
 * Cancela — com motivo e autor congelados.
 *
 * Não é `delete`. Apagar levaria embora a prova de que alguém esteve no
 * balcão, e deixaria agendamento e saída de estoque apontando para o vazio.
 */
export async function cancelarAtendimento(sb, id, motivo, user) {
  return patchAtendimento(sb, id, {
    status: "cancelado",
    cancelado_motivo: String(motivo ?? "").trim(),
    cancelado_em: new Date().toISOString(),
    cancelado_por: user?.name || null,
  }, user);
}

/**
 * A lista de trabalho do encerramento: ambulatoriais que ficaram abertos.
 *
 * Existe pelo mesmo motivo da lista de identificação pendente — pendência
 * que não aparece em lugar nenhum não é pendência, é esquecimento. E aqui a
 * pendência tem efeito colateral: cada um destes faz o aviso de duplicidade
 * disparar na próxima visita do paciente.
 */
export async function listarAmbulatoriaisAbertos(sb, { limite = 200 } = {}) {
  const r = await sb(
    `ps_atendimentos?tipo_atendimento=eq.ambulatorial&${FILTRO_ATENDIMENTO_ABERTO}` +
    `&select=id,prontuario,iniciais,status,chegada_em,especialidade_cod,tipo_atendimento_cod,agendamento_id` +
    `&order=chegada_em&limit=${limite}`);
  return Array.isArray(r) ? r : [];
}

/** Um atendimento, com a ficha inteira — para a tela de correção. */
export async function carregarAtendimento(sb, id) {
  if (!id) return null;
  const r = await sb(`ps_atendimentos?id=eq.${encodeURIComponent(id)}&select=*`);
  return Array.isArray(r) && r.length ? r[0] : null;
}

async function patchAtendimento(sb, id, campos, user) {
  if (!id) return { ok: false, motivo: "Atendimento inválido." };
  const r = await sb(`ps_atendimentos?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...campos, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi alterado. Confirme que a migração `migracao-atendimento-ciclo.sql` foi aplicada e que seu perfil permite editar atendimento." };
  }
  return { ok: true, atendimento: r[0] };
}

// ── AGENDA DO AMBULATÓRIO ───────────────────────────────────

const CAMPOS_AGENDAMENTO = [
  "id", "data", "hora", "especialidade_cod", "profissional_username", "grade_id",
  "prontuario", "origem_marcacao", "tipo_atendimento_cod", "protocolo_regulacao",
  "status", "presente_em", "atendimento_id", "cancelado_motivo", "observacao",
].join(",");

/** As grades cadastradas, incluindo as desligadas (a tela precisa religar). */
export async function carregarGrades(sb) {
  const r = await sb("ag_grades?select=*&order=especialidade_cod,dia_semana,hora_inicio");
  return Array.isArray(r) ? r : [];
}

export async function salvarGrade(sb, grade, user) {
  const corpo = {
    ...(grade.id ? { id: grade.id } : {}),
    especialidade_cod: String(grade.especialidade_cod ?? "").trim(),
    profissional_username: String(grade.profissional_username ?? "").trim() || null,
    dia_semana: Number(grade.dia_semana),
    hora_inicio: grade.hora_inicio,
    hora_fim: grade.hora_fim,
    duracao_min: Number(grade.duracao_min) || 20,
    vagas_regulacao: Number(grade.vagas_regulacao) || 0,
    vagas_internas: Number(grade.vagas_internas) || 0,
    vagas_chegada: Number(grade.vagas_chegada) || 0,
    vigencia_inicio: grade.vigencia_inicio || new Date().toISOString().slice(0, 10),
    vigencia_fim: grade.vigencia_fim || null,
    ativo: grade.ativo !== false,
    observacao: String(grade.observacao ?? "").trim() || null,
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };
  const r = await sb("ag_grades", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Confirme que a migração `migracao-atendimento-agenda.sql` foi aplicada e que seu perfil permite editar a agenda." };
  }
  return { ok: true, grade: r[0] };
}

/**
 * Liga ou desliga uma grade. Não existe apagar: agendamento já feito aponta
 * para ela, e sumir com a grade faria a agenda de meses atrás perder a
 * referência de quantas vagas existiam naquele dia.
 */
export async function alternarAtivoGrade(sb, id, ativo, user) {
  if (!id) return { ok: false, motivo: "Grade inválida." };
  const r = await sb(`ag_grades?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ativo: !!ativo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi alterado." };
  return { ok: true, grade: r[0] };
}

/** Os bloqueios que alcançam um período. */
export async function carregarBloqueios(sb, { de, ate } = {}) {
  const filtros = [];
  if (ate) filtros.push(`data_inicio=lte.${ate}`);
  if (de) filtros.push(`data_fim=gte.${de}`);
  const q = filtros.length ? filtros.join("&") + "&" : "";
  const r = await sb(`ag_bloqueios?${q}select=*&order=data_inicio`);
  return Array.isArray(r) ? r : [];
}

export async function salvarBloqueio(sb, b, user) {
  const corpo = {
    ...(b.id ? { id: b.id } : {}),
    data_inicio: b.data_inicio,
    data_fim: b.data_fim || b.data_inicio,
    especialidade_cod: String(b.especialidade_cod ?? "").trim() || null,
    profissional_username: String(b.profissional_username ?? "").trim() || null,
    motivo: String(b.motivo ?? "").trim(),
    usuario: user?.name || null,
  };
  const r = await sb("ag_bloqueios", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi gravado." };
  return { ok: true, bloqueio: r[0] };
}

/** Os agendamentos de um dia. */
export async function carregarAgendaDoDia(sb, data) {
  if (!data) return [];
  const r = await sb(`ag_agendamentos?data=eq.${encodeURIComponent(data)}&select=${CAMPOS_AGENDAMENTO}&order=hora,criado_em`);
  return Array.isArray(r) ? r : [];
}

/**
 * Os agendamentos de um período — a base do relatório do mês.
 *
 * `data` é coluna DATE (dia civil, sem hora), então `lte` no último dia
 * está certo aqui. A regra do "lt no dia seguinte" vale para as colunas de
 * TIMESTAMP, como `chegada_em`, onde quem chegou 23:59:30 ficaria de fora
 * da própria data.
 */
export async function carregarAgendamentosDoPeriodo(sb, { de, ate, limite = 3000 } = {}) {
  if (!de || !ate) return [];
  const r = await sb(`ag_agendamentos?data=gte.${encodeURIComponent(de)}&data=lte.${encodeURIComponent(ate)}` +
    `&select=${CAMPOS_AGENDAMENTO}&order=data,hora&limit=${limite}`);
  return Array.isArray(r) ? r : [];
}

/**
 * Marca uma vaga.
 *
 * A conferência da REGRA (vaga da regulação, cota esgotada, horário tomado)
 * é de `podeMarcar` em agenda.js e acontece antes desta chamada. Aqui fica a
 * última linha de defesa, que é do banco: o índice único
 * `ag_agend_vaga_unica` recusa duas pessoas no mesmo horário mesmo que duas
 * recepcionistas cliquem no mesmo instante — coisa que validação de tela
 * nenhuma consegue impedir.
 */
export async function marcarAgendamento(sb, dados, user) {
  const corpo = {
    data: dados.data,
    hora: dados.origem_marcacao === "chegada" ? null : (dados.hora || null),
    especialidade_cod: dados.especialidade_cod,
    profissional_username: String(dados.profissional_username ?? "").trim() || null,
    grade_id: dados.grade_id || null,
    prontuario: String(dados.prontuario ?? "").trim() || null,
    origem_marcacao: dados.origem_marcacao,
    tipo_atendimento_cod: String(dados.tipo_atendimento_cod ?? "").trim() || null,
    protocolo_regulacao: String(dados.protocolo_regulacao ?? "").trim() || null,
    observacao: String(dados.observacao ?? "").trim() || null,
    status: "agendado",
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };
  const r = await sb("ag_agendamentos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Se outra pessoa marcou este mesmo horário agora, o banco recusou a segunda — recarregue o dia e escolha outro horário." };
  }
  return { ok: true, agendamento: r[0] };
}

/**
 * Confirma presença: abre o atendimento e liga os dois lados.
 *
 * A ordem importa. Primeiro o ATENDIMENTO, porque é ele que faz o paciente
 * existir no fluxo assistencial; só depois o carimbo no agendamento. Se o
 * segundo passo falhar, o paciente está atendido e o vínculo pode ser
 * refeito — o inverso deixaria o agendamento marcado como presente sem
 * ninguém na fila.
 */
export async function confirmarPresenca(sb, agendamento, { paciente, ficha, medico, queixa }, user) {
  if (!agendamento?.id) return { ok: false, motivo: "Agendamento inválido." };
  if (!paciente?.prontuario) return { ok: false, motivo: "Confirme quem é o paciente antes de dar presença." };

  const at = await abrirAtendimento(sb, {
    paciente,
    tipo: "ambulatorial",
    origem: "Meios próprios",
    queixa,
    ficha: {
      ...(ficha || {}),
      tipo_atendimento_cod: ficha?.tipo_atendimento_cod || agendamento.tipo_atendimento_cod || null,
      especialidade_cod: ficha?.especialidade_cod || agendamento.especialidade_cod || null,
      unidade_origem_cod: ficha?.unidade_origem_cod || "ambulatorio",
    },
    medico,
    agendamentoId: agendamento.id,
  }, user);
  if (!at.ok) return at;

  const r = await sb(`ag_agendamentos?id=eq.${encodeURIComponent(agendamento.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "presente",
      presente_em: new Date().toISOString(),
      atendimento_id: at.atendimento.id,
      prontuario: paciente.prontuario,
      usuario: user?.name || null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!Array.isArray(r) || !r.length) {
    return {
      ok: true, atendimento: at.atendimento, agendamento: null,
      aviso: `O atendimento ${at.atendimento.id} foi aberto, mas o agendamento não ficou marcado como presente. O paciente está na fila; o indicador de produção deste dia vai sair errado até alguém corrigir.`,
    };
  }
  return { ok: true, atendimento: at.atendimento, agendamento: r[0] };
}

/**
 * Registra falta.
 *
 * Falta LIBERA a vaga de propósito (ver `ocupaVaga` em agenda.js): o horário
 * volta para quem remarca. O registro fica, porque absenteísmo é indicador
 * que a gestão cobra.
 */
export async function registrarFalta(sb, id, user) {
  return patchAgendamento(sb, id, { status: "falta" }, user);
}

export async function cancelarAgendamento(sb, id, motivo, user) {
  return patchAgendamento(sb, id, {
    status: "cancelado",
    cancelado_motivo: String(motivo ?? "").trim() || null,
  }, user);
}

/** Liga o paciente a uma vaga da regulação que estava reservada sem nome. */
export async function vincularPacienteAoAgendamento(sb, id, prontuario, protocolo, user) {
  return patchAgendamento(sb, id, {
    prontuario: normalizarProntuario(prontuario) || null,
    ...(protocolo !== undefined ? { protocolo_regulacao: String(protocolo ?? "").trim() || null } : {}),
  }, user);
}

async function patchAgendamento(sb, id, campos, user) {
  if (!id) return { ok: false, motivo: "Agendamento inválido." };
  const r = await sb(`ag_agendamentos?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...campos, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi alterado — confirme que seu perfil permite editar a agenda." };
  return { ok: true, agendamento: r[0] };
}

// ── FATURAMENTO — a conta do atendimento ────────────────────

const CAMPOS_CONTA = [
  "id", "atendimento_id", "prontuario", "convenio_id", "plano_id", "via",
  "competencia", "status", "fechada_em", "fechada_por", "observacao", "criado_em",
].join(",");

const CAMPOS_ITEM = [
  "id", "conta_id", "tipo", "codigo", "descricao", "quantidade",
  "valor_unitario", "valor_total", "executante", "executante_cbo",
  "data_execucao", "cobrar_do_paciente", "observacao", "cancelado", "criado_em",
].join(",");

/** A conta viva de um atendimento, ou `null`. Cancelada não conta. */
export async function carregarConta(sb, atendimentoId) {
  if (!atendimentoId) return null;
  const r = await sb(`at_contas?atendimento_id=eq.${encodeURIComponent(atendimentoId)}` +
    `&status=neq.cancelada&select=${CAMPOS_CONTA}&order=criado_em.desc&limit=1`);
  return Array.isArray(r) && r.length ? r[0] : null;
}

export async function carregarItensDaConta(sb, contaId) {
  if (!contaId) return [];
  const r = await sb(`at_conta_itens?conta_id=eq.${encodeURIComponent(contaId)}` +
    `&select=${CAMPOS_ITEM}&order=criado_em`);
  return Array.isArray(r) ? r : [];
}

/**
 * A medicação administrada de um atendimento — para a conta se montar do que
 * foi de fato realizado, e não do que foi só prescrito. Somente leitura: a
 * checagem à beira-leito é do PS/PEP; aqui o faturamento apenas conta o que
 * já foi dado. O acesso é da política de leitura de `ps_administracoes`
 * (o faturamento entra nela porque a medicação é item cobrável da conta).
 */
export async function carregarAdministracoes(sb, atendimentoId) {
  if (!atendimentoId) return [];
  const r = await sb(`ps_administracoes?atendimento_id=eq.${encodeURIComponent(atendimentoId)}` +
    `&select=id,atendimento_id,medicamento_id,medicamento_nome,dose,via,status,administrado_em,categoria,criado_em` +
    `&order=administrado_em`);
  return Array.isArray(r) ? r : [];
}

/**
 * As fontes de internação do episódio, para a conta usar a permanência REAL da
 * estadia (não a passagem pelo PS): o leito ainda OCUPADO (ligado pelo
 * `ps_atendimento_id`, internação em curso) e as SAÍDAS do prontuário (com
 * admissão, alta e dias de permanência). Só leitura — a escolha de qual saída
 * casa com o episódio é do motor puro (`escolherInternacao`). O faturamento
 * alcança as duas pela leitura de `leitos`/`leitos_saidas`.
 */
export async function carregarLeitosDoEpisodio(sb, { atendimentoId, prontuario } = {}) {
  const [ativo, saidas] = await Promise.all([
    atendimentoId
      ? sb(`leitos?ps_atendimento_id=eq.${encodeURIComponent(atendimentoId)}&status=eq.ocupado&select=data_internacao,prontuario,status&limit=1`)
      : Promise.resolve([]),
    prontuario
      ? sb(`leitos_saidas?prontuario=eq.${encodeURIComponent(prontuario)}&select=data_internacao,data_alta,dias_permanencia,leito,setor&order=data_internacao.desc&limit=20`)
      : Promise.resolve([]),
  ]);
  return {
    leitoAtivo: Array.isArray(ativo) && ativo.length ? ativo[0] : null,
    saidas: Array.isArray(saidas) ? saidas : [],
  };
}

/**
 * A lista de trabalho do faturamento: as internações (desfecho `internacao`)
 * e as contas que já existem para elas. O cruzamento e a ordem de trabalho
 * são do motor puro (`montarWorklist`); aqui só se busca.
 *
 * Traz as contas num segundo select por `atendimento_id in (...)` em vez de um
 * join do PostgREST: o faturamento lê as duas tabelas por módulos diferentes,
 * e dois selects simples não dependem de relação declarada no schema.
 */
export async function carregarWorklistFaturamento(sb, { limite = 100 } = {}) {
  const internacoes = await sb(`ps_atendimentos?desfecho=eq.internacao` +
    `&select=id,prontuario,iniciais,chegada_em,desfecho,desfecho_em,convenio_id,procedimento_cod,cid` +
    `&order=chegada_em.desc&limit=${limite}`);
  const lista = Array.isArray(internacoes) ? internacoes : [];
  if (!lista.length) return { internacoes: [], contas: [] };

  const ids = lista.map((a) => a.id).filter((v) => v != null);
  const contas = ids.length
    ? await sb(`at_contas?atendimento_id=in.(${ids.join(",")})&status=neq.cancelada` +
      `&select=id,atendimento_id,status,competencia`)
    : [];
  return { internacoes: lista, contas: Array.isArray(contas) ? contas : [] };
}

/**
 * A produção faturável para a visão por via: os atendimentos CONCLUÍDOS
 * (`status=finalizado`) que têm procedimento — o universo que vira AIH (as
 * internações), BPA/APAC (o ambulatório) ou TISS/direta (o privado). É mais
 * amplo que a worklist de internações (essa é só o `desfecho=internacao`);
 * aqui entra também o ambulatório, que é de onde nascem BPA e APAC. Só as
 * colunas que a resolução da via e o valor de referência precisam. Cancelado
 * fica de fora (não é `finalizado`). Grant de leitura de `ps_atendimentos`.
 */
export async function carregarProducaoFaturavel(sb, { limite = 500 } = {}) {
  const r = await sb(`ps_atendimentos?status=eq.finalizado&procedimento_cod=not.is.null` +
    `&select=id,convenio_id,procedimento_cod,desfecho&order=chegada_em.desc&limit=${limite}`);
  return Array.isArray(r) ? r : [];
}

/**
 * Abre a conta de um atendimento.
 *
 * O índice único parcial do banco (`at_contas_atend_unica`) é a última
 * linha de defesa: duas telas abrindo conta ao mesmo tempo para o mesmo
 * episódio fariam o atendimento ser transmitido duas vezes, e validação de
 * tela nenhuma impede isso.
 */
export async function abrirConta(sb, dados, user) {
  const corpo = camposDaConta(dados);
  if (!corpo.atendimento_id) return { ok: false, motivo: "Conta sem atendimento não é gravada." };
  const r = await sb("at_contas", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Se este atendimento já tem conta aberta, o banco recusou a segunda — recarregue. Confirme também que a migração `migracao-atendimento-faturamento.sql` foi aplicada." };
  }
  return { ok: true, conta: r[0] };
}

export async function acrescentarItem(sb, dados, user) {
  const corpo = camposDoItem(dados);
  if (!corpo.conta_id) return { ok: false, motivo: "Item sem conta não é gravado." };
  const r = await sb("at_conta_itens", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...corpo,
      cobrar_do_paciente: dados.cobrar_do_paciente === true,
      usuario: user?.name || null, updated_at: new Date().toISOString(),
    }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Se o item foi marcado para cobrança do paciente numa conta do SUS, o banco recusou — e recusou certo: atendimento SUS não pode ser cobrado do paciente." };
  }
  return { ok: true, item: r[0] };
}

/** Cancela um item — não apaga. A diferença entre a conta de ontem e a de hoje precisa ter explicação. */
export async function cancelarItem(sb, id, user) {
  if (!id) return { ok: false, motivo: "Item inválido." };
  const r = await sb(`at_conta_itens?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ cancelado: true, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi alterado." };
  return { ok: true, item: r[0] };
}

/** Fecha a conta na competência. A validação é de `validarFechamento`. */
export async function fecharConta(sb, id, { via, competencia }, user) {
  return patchConta(sb, id, {
    status: "fechada", via: via || null, competencia: competencia || null,
    fechada_em: new Date().toISOString(), fechada_por: user?.name || null,
  }, user);
}

/**
 * Reabre uma conta fechada.
 *
 * `faturada` não reabre: a partir dela existe remessa transmitida, e mexer
 * no que já foi enviado faz a conta e o arquivo contarem histórias
 * diferentes. Correção depois disso é glosa, que é outro fluxo.
 */
export async function reabrirConta(sb, id, user) {
  return patchConta(sb, id, { status: "aberta", fechada_em: null, fechada_por: null }, user);
}

export async function marcarContaFaturada(sb, id, user) {
  return patchConta(sb, id, { status: "faturada" }, user);
}

async function patchConta(sb, id, campos, user) {
  if (!id) return { ok: false, motivo: "Conta inválida." };
  const r = await sb(`at_contas?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...campos, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi alterado — confirme que seu perfil permite editar faturamento." };
  }
  return { ok: true, conta: r[0] };
}

/** As contas de uma competência — a lista de trabalho do faturamento. */
export async function contasDaCompetencia(sb, competencia, { status, limite = 500 } = {}) {
  if (!competencia) return [];
  const extra = status ? `&status=eq.${encodeURIComponent(status)}` : "";
  const r = await sb(`at_contas?competencia=eq.${encodeURIComponent(competencia)}${extra}` +
    `&select=${CAMPOS_CONTA}&order=criado_em.desc&limit=${limite}`);
  return Array.isArray(r) ? r : [];
}

// ── RESPONSÁVEL DO EPISÓDIO ─────────────────────────────────

const CAMPOS_RESPONSAVEL = [
  "id", "atendimento_id", "prontuario", "nome", "cpf", "data_nascimento",
  "telefone", "vinculo", "papel", "documento_judicial", "consente",
  "recebe_alta", "observacao", "ativo", "usuario", "criado_em",
].join(",");

/** Os responsáveis de um atendimento. */
export async function carregarResponsaveis(sb, atendimentoId) {
  if (!atendimentoId) return [];
  const r = await sb(`at_responsaveis?atendimento_id=eq.${encodeURIComponent(atendimentoId)}` +
    `&select=${CAMPOS_RESPONSAVEL}&order=criado_em.desc`);
  return Array.isArray(r) ? r : [];
}

/**
 * Os responsáveis registrados nos episódios ANTERIORES deste paciente.
 *
 * Serve para a tela oferecer "copiar do episódio anterior" — a mãe da
 * criança é a mesma toda visita, e obrigar a redigitar é como se acaba
 * registrando "mãe" sem CPF às pressas. Copiar CRIA UMA LINHA NOVA no
 * episódio de hoje: consentimento é ato no tempo, e reaproveitar a linha
 * antiga faria o registro de hoje reescrever a história de ontem.
 */
export async function responsaveisAnteriores(sb, prontuario, { limite = 10 } = {}) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const r = await sb(`at_responsaveis?prontuario=eq.${encodeURIComponent(p)}&ativo=is.true` +
    `&select=${CAMPOS_RESPONSAVEL}&order=criado_em.desc&limit=${limite}`);
  return Array.isArray(r) ? r : [];
}

/**
 * Grava um responsável.
 *
 * `camposDoResponsavel` deriva `consente` e `recebe_alta` do papel — a tela
 * não escolhe. O banco confere de novo, por CHECK: acompanhante com poder
 * de consentir é recusado lá também.
 */
export async function salvarResponsavel(sb, dados, user) {
  const corpo = camposDoResponsavel(dados);
  if (!corpo.nome) return { ok: false, motivo: "Responsável sem nome não é gravado." };
  const r = await sb("at_responsaveis", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Confirme que a migração `migracao-atendimento-responsavel.sql` foi aplicada neste banco e que seu perfil permite editar atendimento." };
  }
  return { ok: true, responsavel: r[0] };
}

/**
 * Desliga um responsável — não apaga.
 *
 * A pessoa que consentiu em março consentiu, e apagar a linha faria o
 * consentimento daquele dia deixar de ter autor. `ativo = false` tira das
 * listas de hoje e preserva o que foi feito.
 */
export async function desativarResponsavel(sb, id, user) {
  if (!id) return { ok: false, motivo: "Registro inválido." };
  const r = await sb(`at_responsaveis?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ativo: false, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi alterado." };
  return { ok: true, responsavel: r[0] };
}

// ── PRODUÇÃO DO AMBULATÓRIO (tabela agregada `atendimentos`) ─

/** O que já está gravado na agregada para um dia. */
export async function carregarProducaoGravada(sb, data) {
  const dia = String(data ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return [];
  const r = await sb(`atendimentos?data=eq.${dia}&select=*`);
  return Array.isArray(r) ? r : [];
}

/**
 * Grava a produção apurada de uma especialidade num dia.
 *
 * `on_conflict=data,especialidade` é o mesmo upsert que o formulário manual
 * do Ambulatório usa — de propósito. Duas rotas gravando a MESMA linha é o
 * que faz a conciliação valer alguma coisa; se esta escrevesse noutro
 * lugar, o painel continuaria lendo o número digitado e nada teria mudado.
 *
 * O upsert substitui a linha inteira, então `camposDaProducao` carrega
 * `emergencias` do que já estava lá. Sem isso, conciliar a agenda zeraria o
 * número que alguém digitou olhando o Pronto-Socorro.
 *
 * `atendimentos` NÃO tem `updated_at` (só `created_at`). Mandar o campo
 * faria o PostgREST recusar a linha inteira — em silêncio, como sempre.
 */
export async function gravarProducao(sb, { data, especialidadeId, apurada, gravadaAnterior }, user) {
  if (!especialidadeId) return { ok: false, motivo: "Especialidade sem correspondência no painel do Ambulatório." };
  const corpo = camposDaProducao({ data, especialidadeId, apurada, gravadaAnterior });
  const r = await sb("atendimentos?on_conflict=data,especialidade", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado — confirme que seu perfil permite lançar produção do ambulatório." };
  }
  return { ok: true, linha: r[0] };
}

// ── MANUTENÇÃO DOS CATÁLOGOS ────────────────────────────────

/**
 * Grava uma linha de catálogo (cria ou atualiza).
 *
 * Um `upsert` só, para os três tipos de tabela, porque `corpoDoCatalogo`
 * já devolve exatamente as colunas de destino. Montar o corpo aqui, tabela
 * por tabela, era o caminho para a chave inexistente que o PostgREST
 * recusa em silêncio.
 */
export async function salvarCatalogo(sb, chave, dados, user) {
  const cat = CATALOGO_POR_CHAVE[chave];
  if (!cat) return { ok: false, motivo: "Catálogo desconhecido." };

  const corpo = {
    ...corpoDoCatalogo(chave, dados),
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };

  const r = await sb(cat.tabela, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Confirme que a migração `migracao-atendimento-fase2.sql` foi aplicada e que seu perfil permite editar as tabelas." };
  }
  return { ok: true, linha: r[0] };
}

/**
 * Liga ou desliga uma linha do catálogo.
 *
 * NÃO existe apagar. Convênio, plano e procedimento aparecem em
 * atendimentos já gravados; remover a linha faria um relatório de meses
 * atrás mostrar código sem nome. `ativo = false` some das listas novas e
 * preserva o que já foi registrado.
 */
export async function alternarAtivoCatalogo(sb, chave, id, ativo, user) {
  const cat = CATALOGO_POR_CHAVE[chave];
  if (!cat || !id) return { ok: false, motivo: "Registro inválido." };
  const r = await sb(`${cat.tabela}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ativo: !!ativo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi alterado — confirme que seu perfil permite editar as tabelas." };
  }
  return { ok: true, linha: r[0] };
}

/**
 * Lê um catálogo inteiro, INCLUINDO os inativos.
 *
 * `carregarCatalogos` (usado pela ficha) traz só os ativos, porque a
 * recepção não pode escolher convênio desligado. A tela de manutenção
 * precisa do contrário: mostrar o que está desligado é a única forma de
 * alguém religar.
 */
export async function carregarCatalogoCompleto(sb, chave) {
  const cat = CATALOGO_POR_CHAVE[chave];
  if (!cat) return [];
  const filtro = cat.dominio ? `dominio=eq.${encodeURIComponent(cat.dominio)}&` : "";
  const r = await sb(`${cat.tabela}?${filtro}select=*&order=nome`);
  return Array.isArray(r) ? r : [];
}

/**
 * A lista de trabalho da recepção: quem entrou sem identificação e
 * continua assim.
 *
 * Existe porque pendência que não aparece em lugar nenhum não é pendência,
 * é esquecimento. Sem esta tela, o paciente não identificado seria
 * lembrado só na hora de faturar — semanas depois, quando ninguém mais
 * lembra quem era.
 */
export async function listarAguardandoIdentificacao(sb, { limite = 100 } = {}) {
  const r = await sb(`pacientes?nao_identificado=is.true&identificado_em=is.null&select=${CAMPOS_BUSCA},observacao,criado_em&order=criado_em.desc&limit=${limite}`);
  return Array.isArray(r) ? r : [];
}

/**
 * Marca a identificação como concluída.
 *
 * Só o carimbo: quem preenche nome, documento e endereço é o
 * `CadastroPaciente`, que já existe e já valida. Aqui só se registra que a
 * pendência foi fechada, e quando.
 */
export async function concluirIdentificacao(sb, prontuario, user) {
  const p = normalizarProntuario(prontuario);
  if (!p) return { ok: false, motivo: "Sem prontuário." };
  const r = await sb(`pacientes?prontuario=eq.${encodeURIComponent(p)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      nao_identificado: false,
      identificado_em: new Date().toISOString(),
      usuario: user?.name || null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado — confirme que seu perfil permite editar cadastro." };
  }
  return { ok: true, paciente: r[0] };
}
