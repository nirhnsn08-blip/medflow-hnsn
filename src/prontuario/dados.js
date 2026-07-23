// ═══════════════════════════════════════════════════════════
// PRONTUÁRIO DO INTERNADO — camada de dados
//
// Só acesso ao banco. A lógica de derivação vive em
// `src/clinico/prontuario.js` (funções puras, testadas); a interface, em
// `ProntuarioInternado.jsx`. Separado assim porque cada camada erra de um
// jeito diferente e se conserta de um jeito diferente.
//
// Toda escrita é INSERT. Não há update nem delete de registro clínico:
// o RLS do banco recusa, e a correção se faz por novo registro com
// `corrige_id`.
//
// TODO INSERT DO PEP PASSA POR AQUI — inclusive os que a tela poderia
// fazer sozinha. Não é preciosismo arquitetural: enquanto a Anamnese
// montava o próprio `body`, ela gravava em quatro colunas que não existem
// (`tipo`, `historia_doenca`, `antecedentes`, `medicacoes_uso`) e o banco
// recusava o registro inteiro. Ninguém percebeu porque o erro só aparecia
// no console. Com a escrita concentrada aqui, `contrato-banco.test.js`
// confere cada chave contra `supabase/auditoria-banco.sql` e essa classe
// de erro não passa mais.
// ═══════════════════════════════════════════════════════════

import { assinaturaDe } from "../clinico/papeis.js";

/**
 * Autoria congelada dentro do registro: nome e conselho de quem assinou,
 * como estavam NO MOMENTO do registro.
 *
 * Congelar é deliberado (REQUISITOS-PEP.md, fase 1, item 2): exibir um
 * registro de 2027 fazendo join com a tabela de usuários mostraria o
 * conselho de hoje — e o profissional pode ter mudado de número, de nome
 * ou ter saído do hospital.
 *
 * `campoNome` existe porque as tabelas não convergiram: a prescrição chama
 * quem assina de `prescritor_nome`, a administração de `executor_nome`, e
 * as demais de `profissional_nome`.
 */
function assinatura(user, campoNome = "profissional_nome") {
  const a = assinaturaDe(user);
  return {
    [campoNome]: a.profissional_nome,
    conselho: a.conselho,
    registro_conselho: a.registro_conselho,
    usuario: a.profissional_nome,
  };
}

/**
 * Carrega o prontuário do episódio ativo do paciente.
 * `sb` é o sbFetch do App.jsx, injetado para esta camada não depender dele.
 */
export async function carregarProntuario(sb, prontuario) {
  const p = encodeURIComponent(prontuario);
  const [episodios, alergias, condicoes] = await Promise.all([
    sb(`pep_episodios?prontuario=eq.${p}&select=*&order=admissao_em.desc`).catch(() => []),
    sb(`pep_alergias?prontuario=eq.${p}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_condicoes?prontuario=eq.${p}&select=*&order=criado_em.desc`).catch(() => []),
  ]);

  const eps = Array.isArray(episodios) ? episodios : [];
  const ativo = eps.find(e => (e.status || "aberto") === "aberto" && !e.alta_em) || null;
  // A lista de uso domiciliar é do PACIENTE: existe mesmo sem internação
  // aberta, e é justamente antes de internar que ela precisa estar à mão.
  const medicamentosUso = await sb(`pep_medicamentos_uso?prontuario=eq.${p}&select=*&order=criado_em.desc`).catch(() => []);

  if (!ativo) {
    return { episodios: eps, episodio: null, alergias: alergias || [], condicoes: condicoes || [],
             medicamentosUso: Array.isArray(medicamentosUso) ? medicamentosUso : [],
             prescricoes: [], itens: [], eventos: [], administracoes: [], sinais: [], evolucoes: [],
             anotacoes: [], anamneses: [], reconciliacoes: [], reconciliacaoItens: [], sumarios: [] };
  }

  const e = ativo.id;
  const [prescricoes, itens, eventos, administracoes, sinais, evolucoes, anotacoes, anamneses,
         reconciliacoes, reconciliacaoItens, sumarios] = await Promise.all([
    sb(`pep_prescricoes?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_prescricao_itens?episodio_id=eq.${e}&select=*&order=ordem`).catch(() => []),
    sb(`pep_prescricao_eventos?episodio_id=eq.${e}&select=*&order=criado_em`).catch(() => []),
    sb(`pep_administracoes?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_sinais_vitais?episodio_id=eq.${e}&select=*&order=aferido_em`).catch(() => []),
    sb(`pep_evolucoes?prontuario=eq.${p}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_anotacoes_enfermagem?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_anamneses?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
    // As três abaixo só existem depois da migração da fase 3. O `.catch`
    // já protegia as outras pela mesma razão: código pode chegar à Vercel
    // antes de alguém rodar o SQL no painel.
    sb(`pep_reconciliacoes?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_reconciliacao_itens?episodio_id=eq.${e}&select=*&order=ordem`).catch(() => []),
    sb(`pep_sumarios_alta?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
  ]);

  const arr = x => (Array.isArray(x) ? x : []);
  return {
    episodios: eps, episodio: ativo,
    alergias: arr(alergias), condicoes: arr(condicoes),
    prescricoes: arr(prescricoes), itens: arr(itens), eventos: arr(eventos),
    administracoes: arr(administracoes), sinais: arr(sinais),
    evolucoes: arr(evolucoes), anotacoes: arr(anotacoes), anamneses: arr(anamneses),
    medicamentosUso: arr(medicamentosUso),
    reconciliacoes: arr(reconciliacoes), reconciliacaoItens: arr(reconciliacaoItens),
    sumarios: arr(sumarios),
  };
}

/**
 * Abre o episódio de internação a partir do leito ocupado.
 * Idempotente na prática: quem chama confere antes se já existe aberto —
 * dois episódios abertos para o mesmo paciente seria erro clínico, não
 * apenas duplicidade de dado.
 */
export async function abrirEpisodio(sb, { prontuario, iniciais, leito, setor, cid, motivo }, user) {
  return sb("pep_episodios", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario, iniciais, tipo: "internacao", leito, setor,
      cid_principal: cid || null, motivo_internacao: motivo || null,
      admissao_em: new Date().toISOString(), status: "aberto",
      usuario: user?.name || null,
    }),
  });
}

/** Registra aferição de sinais vitais. Append-only. */
export async function registrarSinais(sb, episodio, sv, user) {
  return sb("pep_sinais_vitais", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      ...sv,
      aferido_em: sv.aferido_em || new Date().toISOString(),
      ...assinatura(user),
    }),
  });
}

/**
 * Registra anotação de enfermagem (fato pontual, distinto da evolução do turno).
 *
 * A coluna é `categoria` (eliminacoes | dieta | dor | intercorrencia | …),
 * não `tipo`. Enquanto esta função mandava `tipo`, o PostgREST recusava o
 * INSERT inteiro — a anotação simplesmente não era gravada.
 */
export async function registrarAnotacao(sb, episodio, { categoria, texto, intercorrencia, ocorrido_em }, user) {
  return sb("pep_anotacoes_enfermagem", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      categoria: categoria || "outro", texto,
      intercorrencia: !!intercorrencia,
      ocorrido_em: ocorrido_em || new Date().toISOString(),
      ...assinatura(user),
    }),
  });
}

/**
 * Registra a admissão — anamnese médica, histórico de enfermagem ou
 * avaliação de outra categoria. Todos na mesma tabela, mudando `categoria`.
 */
export async function registrarAnamnese(sb, episodio, dados, user) {
  return sb("pep_anamneses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      categoria: dados.categoria || "medica",
      queixa_principal: dados.queixa_principal || null,
      historia_doenca_atual: dados.historia_doenca_atual || null,
      antecedentes_pessoais: dados.antecedentes_pessoais || null,
      antecedentes_familiares: dados.antecedentes_familiares || null,
      medicamentos_em_uso: dados.medicamentos_em_uso || null,
      habitos: dados.habitos || null,
      alergias_relatadas: dados.alergias_relatadas || null,
      exame_fisico: dados.exame_fisico || null,
      sistemas: dados.sistemas || {},
      hipoteses_diagnosticas: dados.hipoteses_diagnosticas || null,
      conduta_inicial: dados.conduta_inicial || null,
      ...assinatura(user),
    }),
  });
}

/** Registra alergia do PACIENTE (não do episódio). */
export async function registrarAlergia(sb, prontuario, alergia, user) {
  return sb("pep_alergias", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario, ...alergia,
      ...assinatura(user),
    }),
  });
}

/**
 * Assina uma prescrição: grava o cabeçalho e os itens.
 * Se houver prescrição anterior, `substitui_id` a aposenta — é o
 * "represcrever" do dia seguinte, sem alterar a de ontem.
 */
export async function assinarPrescricao(sb, episodio, { itens, tipo, observacao, substituiId }, user) {
  const agora = new Date().toISOString();
  const cab = await sb("pep_prescricoes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      tipo: tipo || "medica",
      // data civil LOCAL: o banco roda em UTC e após as 21h no Brasil já
      // seria amanhã. Mesmo cuidado do todayStr() do App.jsx.
      data_referencia: dataLocalISO(),
      inicio_em: agora, assinada_em: agora,
      substitui_id: substituiId || null,
      observacao: observacao || null,
      ...assinatura(user, "prescritor_nome"),
    }),
  });
  const prescricao = Array.isArray(cab) ? cab[0] : cab;
  if (!prescricao?.id || !itens?.length) return prescricao;

  await sb("pep_prescricao_itens", {
    method: "POST",
    body: JSON.stringify(itens.map((i, k) => ({
      ...i, prescricao_id: prescricao.id, episodio_id: episodio.id,
      prontuario: episodio.prontuario, ordem: k,
      usuario: assinaturaDe(user).profissional_nome,
    }))),
  });
  return prescricao;
}

/** Suspende/reativa/encerra um item — por EVENTO, nunca por update. */
export async function eventoDoItem(sb, episodio, item, evento, motivo, user) {
  return sb("pep_prescricao_eventos", {
    method: "POST",
    body: JSON.stringify({
      prescricao_id: item.prescricao_id, item_id: item.id,
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      evento, motivo: motivo || null,
      ...assinatura(user),
    }),
  });
}

/** Registra administração (ou a não-administração, com o motivo). */
export async function registrarAdministracao(sb, episodio, adm, user) {
  return sb("pep_administracoes", {
    method: "POST",
    body: JSON.stringify({
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      ...adm,
      administrado_em: adm.administrado_em || new Date().toISOString(),
      ...assinatura(user, "executor_nome"),
    }),
  });
}

/**
 * Registra que alguém ABRIU este prontuário.
 * Silencioso por design: falha aqui não pode impedir o acesso ao
 * prontuário — atrapalhar o cuidado para salvar um log seria pior que o
 * log faltar. Mas a falha aparece no console pelo sbFetch.
 */
export function registrarAcesso(sb, prontuario, origem, contexto, user) {
  try {
    sb("pep_acessos", {
      method: "POST",
      body: JSON.stringify({
        prontuario, origem, contexto: contexto ? String(contexto) : null,
        usuario: user?.name || null, papel: user?.role || null,
      }),
    });
  } catch { /* nunca bloqueia a tela */ }
}

// ── FASE 3: RECONCILIAÇÃO E ALTA ────────────────────────────

/**
 * Acrescenta um medicamento à lista de uso domiciliar do PACIENTE.
 * Append-only: corrigir é gravar outro apontando para este em `corrige_id`.
 */
export async function registrarMedicamentoUso(sb, prontuario, episodio, med, user) {
  return sb("pep_medicamentos_uso", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario, episodio_id: episodio?.id || null,
      medicamento_id: med.medicamento_id || null,
      descricao: med.descricao,
      substancia: med.substancia || null,
      dose: med.dose || null,
      dose_valor: med.dose_valor ?? null,
      dose_unidade: med.dose_unidade || null,
      via: med.via || null,
      frequencia: med.frequencia || null,
      frequencia_dia: med.frequencia_dia ?? null,
      uso_continuo: med.uso_continuo !== false,
      indicacao: med.indicacao || null,
      fonte: med.fonte || "paciente",
      confiabilidade: med.confiabilidade || null,
      situacao: med.situacao || "ativa",
      // registro de entrevista: "perguntei, não usa nada"
      sem_uso: !!med.sem_uso,
      observacao: med.observacao || null,
      corrige_id: med.corrige_id || null,
      motivo_correcao: med.motivo_correcao || null,
      ...assinatura(user),
    }),
  });
}

/**
 * Assina a reconciliação: cabeçalho com o placar + uma linha por decisão.
 *
 * Nasce concluída, como a prescrição. Não existe rascunho no banco: uma
 * reconciliação abandonada no meio que o sistema conta como existente é
 * pior que nenhuma — a tela diria "já foi feita".
 */
export async function salvarReconciliacao(sb, episodio, { momento, linhas = [], observacao, substituiId }, user) {
  const discrepantes = linhas.filter(l => l.discrepancias?.length).length;
  const cab = await sb("pep_reconciliacoes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      momento: momento || "admissao",
      substitui_id: substituiId || null,
      total_itens: linhas.length,
      total_discrepancias: discrepantes,
      total_pendentes: linhas.filter(l => l.pendente).length,
      observacao: observacao || null,
      concluida_em: new Date().toISOString(),
      ...assinatura(user),
    }),
  });
  const rec = Array.isArray(cab) ? cab[0] : cab;
  if (!rec?.id || !linhas.length) return rec;

  await sb("pep_reconciliacao_itens", {
    method: "POST",
    body: JSON.stringify(linhas.map((l, k) => {
      const base = l.item || {};
      return {
        reconciliacao_id: rec.id,
        prontuario: episodio.prontuario, episodio_id: episodio.id,
        origem: l.origem || "domiciliar",
        medicamento_uso_id: l.origem === "domiciliar" ? (base.id || null) : null,
        prescricao_item_id: l.origem === "hospitalar" ? (base.id || null) : null,
        medicamento_id: base.medicamento_id || null,
        // posologia COPIADA: a prescrição de amanhã substitui a de hoje, e
        // a decisão precisa continuar dizendo sobre o que ela foi tomada.
        descricao: base.descricao || base.nome || "(sem descrição)",
        dose: base.dose ?? null,
        dose_valor: base.dose_valor ?? null,
        dose_unidade: base.dose_unidade || null,
        via: base.via || null,
        frequencia: base.frequencia || null,
        frequencia_dia: base.frequencia_dia ?? null,
        decisao: l.decisao || null,
        justificativa: l.justificativa || null,
        discrepancia: !!l.discrepancias?.length,
        tipo_discrepancia: l.discrepancias?.[0]?.tipo || null,
        leva_para_casa: l.levaParaCasa,
        ordem: k,
        usuario: assinaturaDe(user).profissional_nome,
      };
    })),
  });
  return rec;
}

/**
 * Emite o sumário de alta. Documento — não se edita: retificar é emitir
 * outro com `substitui_id`, e o original continua legível.
 *
 * `texto_impressao` guarda a via impressa como saiu, porque enquanto não
 * houver assinatura qualificada é o papel assinado à mão que vale
 * (COFEN 754/2024, art. 2º, §3º), e reimprimir tem de dar a mesma folha.
 */
export async function emitirSumarioAlta(sb, episodio, sumario, { medicamentos = [], suspensos = [], texto, reconciliacaoId, substituiId } = {}, user) {
  return sb("pep_sumarios_alta", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      admissao_em: sumario.admissao_em || null,
      alta_em: sumario.alta_em || new Date().toISOString(),
      dias_internacao: sumario.dias_internacao ?? null,
      setor: sumario.setor || null, leito: sumario.leito || null,
      desfecho: sumario.desfecho,
      desfecho_detalhe: sumario.desfecho_detalhe || null,
      diagnostico_principal: sumario.diagnostico_principal || null,
      cid_principal: sumario.cid_principal || null,
      cid_secundarios: sumario.cid_secundarios || null,
      motivo_internacao: sumario.motivo_internacao || null,
      resumo_internacao: sumario.resumo_internacao || null,
      procedimentos: sumario.procedimentos || null,
      exames_relevantes: sumario.exames_relevantes || null,
      condicao_alta: sumario.condicao_alta || null,
      orientacoes: sumario.orientacoes || null,
      sinais_de_alerta: sumario.sinais_de_alerta || null,
      retorno_em: sumario.retorno_em || null,
      retorno_servico: sumario.retorno_servico || null,
      reconciliacao_id: reconciliacaoId || null,
      medicamentos_alta: medicamentos,
      medicamentos_suspensos: suspensos,
      texto_impressao: texto || null,
      substitui_id: substituiId || null,
      assinado_em: new Date().toISOString(),
      ...assinatura(user),
    }),
  });
}

/**
 * Fecha o episódio: registra alta, desfecho e status.
 *
 * ESTE É O ÚNICO UPDATE DO MÓDULO, e é deliberado. `pep_episodios` guarda
 * o ESTADO da internação (aberta/encerrada, em qual leito), não a narrativa
 * clínica — o registro imutável do desfecho é o sumário de alta, que já foi
 * gravado antes desta chamada. Abrir e fechar episódio por eventos
 * append-only só acrescentaria uma tabela para derivar o que uma coluna
 * `status` responde direto.
 *
 * A ordem importa: sumário primeiro, episódio depois. Se falhar aqui, o
 * documento existe e o leito continua ocupado — situação visível e
 * corrigível. Na ordem inversa o paciente teria alta sem sumário nenhum.
 */
export async function encerrarEpisodio(sb, episodio, { desfecho, desfecho_detalhe, alta_em }, user) {
  return sb(`pep_episodios?id=eq.${episodio.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      alta_em: alta_em || new Date().toISOString(),
      desfecho: desfecho || null,
      desfecho_detalhe: desfecho_detalhe || null,
      status: "encerrado",
      atualizado_em: new Date().toISOString(),
      usuario: assinaturaDe(user).profissional_nome,
    }),
  });
}

/** Data civil LOCAL em YYYY-MM-DD. Não usar toISOString: devolve UTC. */
export function dataLocalISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
