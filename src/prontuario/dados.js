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
// ═══════════════════════════════════════════════════════════

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
  if (!ativo) {
    return { episodios: eps, episodio: null, alergias: alergias || [], condicoes: condicoes || [],
             prescricoes: [], itens: [], eventos: [], administracoes: [], sinais: [], evolucoes: [], anotacoes: [], anamneses: [] };
  }

  const e = ativo.id;
  const [prescricoes, itens, eventos, administracoes, sinais, evolucoes, anotacoes, anamneses] = await Promise.all([
    sb(`pep_prescricoes?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_prescricao_itens?episodio_id=eq.${e}&select=*&order=ordem`).catch(() => []),
    sb(`pep_prescricao_eventos?episodio_id=eq.${e}&select=*&order=criado_em`).catch(() => []),
    sb(`pep_administracoes?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_sinais_vitais?episodio_id=eq.${e}&select=*&order=aferido_em`).catch(() => []),
    sb(`pep_evolucoes?prontuario=eq.${p}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_anotacoes_enfermagem?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
    sb(`pep_anamneses?episodio_id=eq.${e}&select=*&order=criado_em.desc`).catch(() => []),
  ]);

  const arr = x => (Array.isArray(x) ? x : []);
  return {
    episodios: eps, episodio: ativo,
    alergias: arr(alergias), condicoes: arr(condicoes),
    prescricoes: arr(prescricoes), itens: arr(itens), eventos: arr(eventos),
    administracoes: arr(administracoes), sinais: arr(sinais),
    evolucoes: arr(evolucoes), anotacoes: arr(anotacoes), anamneses: arr(anamneses),
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
      profissional_nome: user?.name || null, usuario: user?.name || null,
    }),
  });
}

/** Registra anotação de enfermagem (fato pontual, distinto da evolução do turno). */
export async function registrarAnotacao(sb, episodio, { tipo, texto }, user) {
  return sb("pep_anotacoes_enfermagem", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      prontuario: episodio.prontuario, episodio_id: episodio.id,
      tipo: tipo || "anotacao", texto,
      profissional_nome: user?.name || null, usuario: user?.name || null,
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
      profissional_nome: user?.name || null, usuario: user?.name || null,
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
      prescritor_nome: user?.name || null, usuario: user?.name || null,
    }),
  });
  const prescricao = Array.isArray(cab) ? cab[0] : cab;
  if (!prescricao?.id || !itens?.length) return prescricao;

  await sb("pep_prescricao_itens", {
    method: "POST",
    body: JSON.stringify(itens.map((i, k) => ({
      ...i, prescricao_id: prescricao.id, episodio_id: episodio.id,
      prontuario: episodio.prontuario, ordem: k, usuario: user?.name || null,
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
      profissional_nome: user?.name || null, usuario: user?.name || null,
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
      executor_nome: user?.name || null, usuario: user?.name || null,
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

/** Data civil LOCAL em YYYY-MM-DD. Não usar toISOString: devolve UTC. */
export function dataLocalISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
