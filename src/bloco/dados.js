// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — ACESSO AO BANCO
//
// Salas e cirurgias. Saiu do App.jsx com `sb` por parâmetro, como os outros
// módulos. Nulo = sem banco.
//
// 🔴 TODA ESCRITA AQUI CONFERE O QUE VOLTOU — e isso é recente (07/10/2026).
//
// As quatro escritas deste arquivo descartavam o retorno. Uma delas chegava
// a PEDIR `return=representation` e jogar fora; o PATCH nem mandava o
// cabeçalho. O PostgREST responde 2xx com ZERO LINHAS quando a RLS filtra
// pelo `using`, e `sbFetch` só injeta a representação no POST (ver
// App.jsx) — então um PATCH barrado era indistinguível de um que funcionou.
//
// O pior caso era o checklist de cirurgia segura: a circulante marcava os
// itens, clicava "Concluir Sign In", o modal fechava, a trilha de auditoria
// gravava que o checklist tinha sido concluído, e NADA ia para o banco. Em
// caso de evento sentinela, o sistema guardava registro contraditório.
//
// Por isso cada função devolve `{ ok, motivo }` em vez de `undefined`, no
// mesmo formato de `src/acesso/dados.js` e `src/atendimento/dados.js`.
// ═══════════════════════════════════════════════════════════

import { nowISO } from "../util/datas.js";
import { listaLida } from "../util/leitura.js";

/** A mesma frase para as quatro escritas — o que a pessoa precisa fazer. */
const NAO_GRAVOU = {
  ok: false,
  motivo: "Nada foi gravado. Pode ser permissão do seu perfil para o módulo Bloco, " +
          "ou a conexão. Confira na tela se a alteração aparece antes de seguir — " +
          "NÃO assuma que foi salvo.",
};
const SEM_BANCO = { ok: false, motivo: "Sem conexão com o banco — nada foi gravado." };

/** 2xx com zero linha NÃO é sucesso: é a RLS barrando em silêncio. */
function conferir(r, chave = "linha") {
  if (!Array.isArray(r) || !r.length) return NAO_GRAVOU;
  return { ok: true, [chave]: r[0] };
}

export async function loadCcSalas(sb) {
  const rows = await sb("cc_salas?select=*&order=ordem");
  return listaLida(rows);
}

export async function upsertCcSalaRemote(sb, sala, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_salas?on_conflict=nome", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...sala, usuario: user?.name || null, updated_at: nowISO() }),
  });
  return conferir(r, "sala");
}

/**
 * Apagar sala não devolve linha — DELETE sem representação responde 204 em
 * todo caso, inclusive quando a RLS barrou. Por isso a conferência aqui é
 * RELER: se o nome continuar no catálogo, não apagou.
 */
export async function deleteCcSalaRemote(sb, nome) {
  if (!sb) return SEM_BANCO;
  await sb(`cc_salas?nome=eq.${encodeURIComponent(nome)}`, { method: "DELETE" });
  const resto = await sb(`cc_salas?nome=eq.${encodeURIComponent(nome)}&select=nome`);
  if (!Array.isArray(resto)) {
    return { ok: false, motivo: "Não consegui confirmar se a sala foi apagada — recarregue antes de concluir que ela saiu." };
  }
  return resto.length ? NAO_GRAVOU : { ok: true };
}

export async function loadCcCirurgias(sb, data) {
  const rows = await sb(`cc_cirurgias?data=eq.${data}&select=*&order=hora_prevista`);
  return listaLida(rows);
}

export async function addCcCirurgiaRemote(sb, c, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_cirurgias", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...c, usuario: user?.name || null }),
  });
  return conferir(r, "cirurgia");
}

/**
 * ⚠️ O `Prefer` é explícito aqui porque `sbFetch` só o injeta no POST. Sem
 * ele o PATCH devolve 204 vazio e não há como distinguir "gravou" de "a RLS
 * filtrou a linha" — que é exatamente o defeito que este arquivo corrigiu.
 */
export async function updateCcCirurgiaRemote(sb, id, campos) {
  if (!sb) return SEM_BANCO;
  const r = await sb(`cc_cirurgias?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...campos, updated_at: nowISO() }),
  });
  return conferir(r, "cirurgia");
}

// ── CIRURGIA SEGURA — a trilha ──────────────────────────────

/**
 * As conferências (e os pulos) de uma cirurgia, da mais recente para a mais
 * antiga.
 *
 * ⚠️ "Não consegui ler" NÃO é "nunca foi conferido". Sem essa diferença,
 * uma oscilação de rede faria uma cirurgia com checklist completo parecer
 * uma que nunca passou por conferência — e é sob essa leitura que alguém
 * decide se pode seguir para a incisão.
 */
export async function loadCcChecklist(sb, cirurgiaId) {
  if (!sb || !cirurgiaId) return [];
  const rows = await sb(`cc_checklist?cirurgia_id=eq.${cirurgiaId}&select=*&order=criado_em.desc`);
  return listaLida(rows);
}

/**
 * Grava uma linha da trilha. O gatilho acende o selo no MESMO insert.
 *
 * A frase de recusa vem do BANCO: é ele que sabe se a contagem não fecha,
 * se faltou item sem explicação ou se a cirurgia está cancelada. Repetir
 * essas regras aqui só criaria duas versões para divergirem.
 */
export async function registrarChecklist(sb, corpo, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_checklist", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null }),
  });
  if (Array.isArray(r) && r.length) return { ok: true, linha: r[0] };
  return { ok: false, motivo: motivoDoBanco(r) || NAO_GRAVOU.motivo };
}

/**
 * A mensagem que o Postgres mandou, quando mandou.
 *
 * `sbFetch` devolve o corpo do erro como texto/objeto. A recusa do gatilho
 * é escrita para ser lida por quem está na sala — jogá-la fora e mostrar
 * "não foi possível" transformaria seis motivos distintos num só.
 */
function motivoDoBanco(r) {
  if (!r) return null;
  const bruto = typeof r === "string" ? r : JSON.stringify(r);
  const m = /"message"\s*:\s*"([^"]+)"/.exec(bruto);
  if (m) return m[1];
  return typeof r?.message === "string" ? r.message : null;
}

/**
 * A trilha de TODAS as cirurgias de um dia, numa consulta só.
 *
 * Por dia e não por cartão: um mapa com doze cirurgias faria doze pedidos,
 * e o painel do bloco recarrega a cada 30s.
 */
export async function loadCcChecklistDoDia(sb, ids = []) {
  const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!sb || !lista.length) return [];
  const rows = await sb(`cc_checklist?cirurgia_id=in.(${lista.join(",")})&select=*&order=criado_em.desc`);
  return listaLida(rows);
}

// ── A EQUIPE CIRÚRGICA ──────────────────────────────────────

/** A equipe de todas as cirurgias de um dia, numa consulta só. */
export async function loadCcEquipeDoDia(sb, ids = []) {
  const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!sb || !lista.length) return [];
  const rows = await sb(`cc_equipe?cirurgia_id=in.(${lista.join(",")})&select=*&order=id`);
  return listaLida(rows);
}

export async function addMembroEquipe(sb, corpo, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_equipe", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null }),
  });
  if (Array.isArray(r) && r.length) return { ok: true, membro: r[0] };
  // A recusa do índice único ("dois cirurgiões") vem do banco com a frase
  // do Postgres, que não serve para quem está na sala. A tela já conferiu
  // antes; isto é a rede para quem chamar a API direto.
  const msg = motivoDoBanco(r);
  if (msg && /cc_equipe_um_cirurgiao_idx|duplicate key/i.test(msg)) {
    return { ok: false, motivo: "Esta cirurgia já tem um cirurgião principal. Remova o atual antes de pôr outro." };
  }
  return { ok: false, motivo: msg || NAO_GRAVOU.motivo };
}

/**
 * Tira um membro da equipe.
 *
 * ⚠️ DELETE de verdade, e isso é diferente da trilha de cirurgia segura
 * (append-only). Equipe é CADASTRO do ato, não registro de conferência:
 * trocar o auxiliar que entrou na sala é correção administrativa, e exigir
 * linha nova encheria a conta de membro fantasma. O que foi CONFERIDO não
 * se apaga; quem operou se corrige até a conta fechar.
 *
 * Como DELETE não devolve linha, a conferência é RELER.
 */
export async function removerMembroEquipe(sb, id) {
  if (!sb) return SEM_BANCO;
  await sb(`cc_equipe?id=eq.${id}`, { method: "DELETE" });
  const resto = await sb(`cc_equipe?id=eq.${id}&select=id`);
  if (!Array.isArray(resto)) {
    return { ok: false, motivo: "Não consegui confirmar se o membro saiu da equipe — recarregue antes de concluir que saiu." };
  }
  return resto.length ? NAO_GRAVOU : { ok: true };
}

/**
 * O catálogo de procedimentos do hospital, para a cirurgia ter CÓDIGO.
 *
 * Mesma tabela que o Atendimento usa (`at_procedimentos`) — e de propósito:
 * duas listas de procedimento divergiriam, e aí a mesma cirurgia teria um
 * código no bloco e outro no faturamento.
 */
export async function loadProcedimentosDoCatalogo(sb) {
  if (!sb) return [];
  const rows = await sb("at_procedimentos?ativo=eq.true&select=codigo,nome,valor_sus,via_sus&order=nome");
  return listaLida(rows);
}

/**
 * Os profissionais do cadastro, para a equipe sair com conselho e CBO.
 *
 * Reaproveita a mesma leitura do Atendimento (`profiles`), com `uf_conselho`
 * a mais — a guia TISS pede conselho E UF de cada membro.
 *
 * ⚠️ NÃO filtra por categoria clínica, ao contrário do `carregarProfissionais`
 * do Atendimento: a sala tem instrumentador e circulante, que são atos de
 * apoio e não assinam ato assistencial — mas estão na equipe e entram no
 * registro de quem operou.
 */
export async function loadProfissionaisDoBloco(sb) {
  if (!sb) return [];
  const r = await sb("profiles?select=username,nome,categoria,conselho,registro_conselho,uf_conselho,cbo&order=nome");
  return listaLida(r);
}

/**
 * Os atendimentos deste paciente, para LIGAR a cirurgia ao episódio.
 *
 * Sem este elo a cirurgia não vira conta — e o backfill da migração só
 * liga o que não tem dúvida, de propósito. O resto se liga aqui, por quem
 * sabe de qual episódio a cirurgia é.
 *
 * Os mais recentes primeiro: cirurgia se liga ao episódio em curso, não a
 * um de dois anos atrás.
 */
export async function loadAtendimentosDoPaciente(sb, prontuario) {
  const p = String(prontuario ?? "").trim();
  if (!sb || !p) return [];
  const rows = await sb(
    `ps_atendimentos?prontuario=eq.${encodeURIComponent(p)}&status=neq.cancelado` +
    `&select=id,chegada_em,desfecho_em,status,tipo_atendimento,procedimento_cod&order=chegada_em.desc&limit=10`);
  return listaLida(rows);
}

// ── A DESCRIÇÃO CIRÚRGICA ───────────────────────────────────

/**
 * As versões da descrição de uma cirurgia, da mais nova para a mais antiga.
 *
 * ⚠️ "Não consegui ler" NÃO é "não tem descrição". Sem essa diferença, uma
 * oscilação de rede faria a tela oferecer "registrar descrição" numa
 * cirurgia que já tem uma — e o banco recusaria só depois de a pessoa ter
 * escrito o documento inteiro.
 */
export async function loadCcDescricoes(sb, cirurgiaId) {
  if (!sb || !cirurgiaId) return [];
  const rows = await sb(`cc_descricao?cirurgia_id=eq.${cirurgiaId}&select=*&order=versao.desc`);
  return listaLida(rows);
}

/** As descrições de todas as cirurgias de um dia, numa consulta só. */
export async function loadCcDescricoesDoDia(sb, ids = []) {
  const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!sb || !lista.length) return [];
  const rows = await sb(`cc_descricao?cirurgia_id=in.(${lista.join(",")})&select=*&order=versao.desc`);
  return listaLida(rows);
}

/**
 * Grava o documento. O gatilho calcula a versão e acende o selo no MESMO
 * insert — a tela nunca manda `versao`.
 *
 * A frase de recusa vem do BANCO: é ele que sabe se a cirurgia está
 * cancelada, se ainda não entrou em sala, se já existe descrição vigente ou
 * se a correção aponta para a cirurgia errada. Repetir essas regras aqui só
 * criaria duas versões para divergirem.
 */
export async function registrarDescricao(sb, corpo, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_descricao", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null }),
  });
  if (Array.isArray(r) && r.length) return { ok: true, descricao: r[0] };
  return { ok: false, motivo: motivoDoBanco(r) || NAO_GRAVOU.motivo };
}

/**
 * O CADASTRO dos pacientes do mapa, para o cartão dizer de quem é a cirurgia.
 *
 * 🔴 Existe porque o mapa mostrava as iniciais DIGITADAS no agendamento, sem
 * nunca compará-las com o cadastro — e é nesse cartão que o Sign In confere
 * identidade (Meta 1 da OMS). O argumento inteiro está em
 * `./identidade-cirurgia.js`.
 *
 * Por dia e numa consulta só, como a trilha e a equipe: um mapa com doze
 * cirurgias faria doze pedidos, e esta tela recarrega a cada 30s.
 *
 * Só os quatro campos do rótulo. Cirurgia não precisa de CPF, endereço nem
 * filiação para dizer quem vai ser operado, e trazer a ficha inteira para
 * cada paciente do dia exporia dado que esta tela não usa.
 */
export async function loadPacientesDoMapa(sb, prontuarios = []) {
  const lista = [...new Set(
    (Array.isArray(prontuarios) ? prontuarios : [])
      .map(p => String(p ?? "").trim())
      // O prontuário deste hospital é alfanumérico ("T9060"). O que fugir
      // do conjunto seguro fica FORA do filtro em vez de ser escapado na
      // mão — valor estranho não vira sintaxe de consulta.
      .filter(p => /^[A-Za-z0-9._-]{1,32}$/.test(p)))];
  if (!sb || !lista.length) return [];
  const rows = await sb(
    `pacientes?prontuario=in.(${lista.map(p => `"${p}"`).join(",")})` +
    `&select=prontuario,nome_completo,nome_social,iniciais`);
  return listaLida(rows);
}

// ── A FICHA ANESTÉSICA E A RECUPERAÇÃO ──────────────────────

/** As versões da ficha anestésica de uma cirurgia, da mais nova para a mais antiga. */
export async function loadCcAnestesia(sb, cirurgiaId) {
  if (!sb || !cirurgiaId) return [];
  const rows = await sb(`cc_anestesia?cirurgia_id=eq.${cirurgiaId}&select=*&order=versao.desc`);
  return listaLida(rows);
}

/** As fichas anestésicas de todas as cirurgias de um dia, numa consulta só. */
export async function loadCcAnestesiaDoDia(sb, ids = []) {
  const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!sb || !lista.length) return [];
  const rows = await sb(`cc_anestesia?cirurgia_id=in.(${lista.join(",")})&select=*&order=versao.desc`);
  return listaLida(rows);
}

/**
 * Grava a ficha. O gatilho calcula a versão, acende `anestesia_em` e
 * mantém a coluna antiga `tipo_anestesia` no mesmo insert.
 */
export async function registrarAnestesia(sb, corpo, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_anestesia", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null }),
  });
  if (Array.isArray(r) && r.length) return { ok: true, ficha: r[0] };
  return { ok: false, motivo: motivoDoBanco(r) || NAO_GRAVOU.motivo };
}

/**
 * As avaliações de Aldrete de uma cirurgia, da mais recente para a mais
 * antiga.
 *
 * ⚠️ "Não consegui ler" NÃO é "nenhuma avaliação". Sem a diferença, a tela
 * ofereceria a alta como se o paciente nunca tivesse sido avaliado — e o
 * banco recusaria depois, o que ao menos é seguro; mas a tela também
 * esconderia a CURVA, que é onde se vê o paciente piorando.
 */
export async function loadCcAldrete(sb, cirurgiaId) {
  if (!sb || !cirurgiaId) return [];
  const rows = await sb(`cc_rpa_aldrete?cirurgia_id=eq.${cirurgiaId}&select=*&order=criado_em.desc`);
  return listaLida(rows);
}

/** As avaliações de todas as cirurgias de um dia, numa consulta só. */
export async function loadCcAldreteDoDia(sb, ids = []) {
  const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!sb || !lista.length) return [];
  const rows = await sb(`cc_rpa_aldrete?cirurgia_id=in.(${lista.join(",")})&select=*&order=criado_em.desc`);
  return listaLida(rows);
}

/**
 * Grava uma avaliação da recuperação. `total` NÃO vai daqui — é coluna
 * gerada pelo banco, para a soma da tela não divergir da soma que o
 * gatilho da alta usa.
 */
export async function registrarAldrete(sb, corpo, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_rpa_aldrete", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null }),
  });
  if (Array.isArray(r) && r.length) return { ok: true, avaliacao: r[0] };
  return { ok: false, motivo: motivoDoBanco(r) || NAO_GRAVOU.motivo };
}
