// ═══════════════════════════════════════════════════════════
// MATERNIDADE — acesso a dados (loaders/savers)
//
// A tela recebe `sb` (o fetch autenticado) por prop e chama daqui. A busca
// de gestante REUSA a `buscarPacientes` do Atendimento — testada, com recuo
// para bancos sem a coluna de busca — em vez de reinventar uma segunda.
// ═══════════════════════════════════════════════════════════

import { listaLida, algumaFalhou } from "../util/leitura.js";
import { montarFilaObstetrica } from "./fila.js";
import { emitirProntuario } from "../atendimento/dados.js";
// Reuso deliberado: uma segunda busca de paciente divergiria da primeira.
export { buscarPacientes, carregarPaciente } from "../atendimento/dados.js";

/** Iniciais a partir do nome ("Maria Silva Souza" → "M.S.S."). */
function iniciaisDe(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  return partes.length ? partes.map(p => p[0].toUpperCase()).join(".") + "." : null;
}

const RECUSA =
  "O banco recusou. Confira: a gestante precisa estar cadastrada (prontuário), " +
  "e datas/valores fora do disparate (nº de fetos ≥ 1, Rh + ou −).";

/**
 * O episódio EM ANDAMENTO desta gestante, se houver. Evita abrir um segundo
 * dossiê para a mesma internação — a admissão nova pendura no episódio aberto.
 */
export async function episodioAtivoDaGestante(sb, prontuario) {
  if (!sb || !prontuario) return null;
  const r = await sb(
    `mat_episodios?prontuario=eq.${encodeURIComponent(prontuario)}&status=eq.em_andamento` +
    `&select=*&order=criado_em.desc&limit=1`).catch(() => null);
  return listaLida(r)?.[0] || null;
}

/**
 * Grava a admissão. Cria o episódio (se ainda não existe um aberto) e
 * pendura a avaliação de admissão nele.
 *
 * 🔴 CONFERE O RETORNO, não o status: o PostgREST responde 2xx alterando zero
 * linha. Sem `return=representation` + checagem, "gravou" seria mentira — e a
 * admissão que a enfermeira acha que salvou não existiria.
 *
 * Devolve `{ ok, episodioId, admissao }` ou `{ ok:false, motivo }`.
 */
export async function salvarAdmissao(sb, { episodio, admissao, episodioId = null }, user) {
  if (!sb) return { ok: false, motivo: "Sem conexão com o banco." };

  let epId = episodioId;
  if (!epId) {
    const rep = await sb("mat_episodios", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...episodio, usuario: user?.name || null }),
    }).catch(() => null);
    if (!Array.isArray(rep) || !rep.length) return { ok: false, motivo: `Não gravei o episódio. ${RECUSA}` };
    epId = rep[0].id;
  }

  const rad = await sb("mat_admissoes", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...admissao, episodio_id: epId, usuario: user?.name || null }),
  }).catch(() => null);

  // Episódio criado mas admissão falhou: o episódio fica (em andamento, sem
  // admissão) e a próxima tentativa reusa ele — não duplica o dossiê.
  if (!Array.isArray(rad) || !rad.length) return { ok: false, motivo: `Não gravei a admissão. ${RECUSA}`, episodioId: epId };

  return { ok: true, episodioId: epId, admissao: rad[0] };
}

// ── Partograma: os toques ao longo do trabalho de parto ──────

/** A série de toques deste episódio, na ordem do tempo (o que o gráfico usa). */
export async function carregarTrabalhoParto(sb, episodioId) {
  if (!sb || !episodioId) return [];
  const r = await sb(
    `mat_trabalho_parto?episodio_id=eq.${encodeURIComponent(episodioId)}&select=*&order=data_hora`
  ).catch(() => null);
  return listaLida(r);
}

/**
 * Grava um toque (append-only). Confere o RETORNO, não o status: sem isso,
 * "gravou" seria mentira e o ponto sumiria do partograma sem aviso.
 */
export async function salvarRegistroTP(sb, registro, user) {
  if (!sb) return { ok: false, motivo: "Sem conexão com o banco." };
  const r = await sb("mat_trabalho_parto", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...registro, usuario: user?.name || null }),
  }).catch(() => null);
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Não gravei o registro (o banco recusou a dilatação/De Lee fora de faixa?)." };
  return { ok: true, registro: r[0] };
}

// ── Fila obstétrica: quem são as pacientes obstétricas agora ──

/**
 * Lê as três fontes (PS obstétrico, leitos ocupados, episódios de maternidade
 * abertos) e monta a fila. Devolve `incompleto:true` se ALGUMA leitura falhou
 * — a tela precisa avisar em vez de dizer "nenhuma paciente" (falso-verde: o
 * defeito mais comum deste sistema, ver util/leitura.js).
 */
export async function carregarFilaObstetrica(sb, { setoresMaternidade = null } = {}) {
  if (!sb) return { ok: false, fila: [], incompleto: true };
  const [psR, leitosR, epsR] = await Promise.all([
    sb("ps_atendimentos?or=(triagem_tipo.eq.obstetrica,gestante.is.true)&status=neq.finalizado" +
       "&select=id,iniciais,prontuario,queixa,chegada_em,classificacao,desfecho,status,triagem_tipo,gestante" +
       "&order=chegada_em.desc&limit=200").catch(() => null),
    sb("leitos?status=eq.ocupado&select=identificacao,status,iniciais,prontuario,motivo,data_internacao,setor").catch(() => null),
    sb("mat_episodios?status=eq.em_andamento&select=id,prontuario&limit=500").catch(() => null),
  ]);
  const ps = listaLida(psR), leitos = listaLida(leitosR), episodiosAbertos = listaLida(epsR);
  const incompleto = algumaFalhou(ps, leitos, episodiosAbertos);
  const fila = montarFilaObstetrica({ ps, leitos, episodiosAbertos, setoresMaternidade });
  return { ok: !incompleto, fila, incompleto };
}

// ── Cadastro ao admitir: gestante que veio só com iniciais ────

/**
 * Cria o cadastro mínimo de uma gestante que chegou pelo PS/leito sem
 * prontuário, para a admissão obstétrica poder pendurar o episódio nela.
 *
 * O prontuário é EMITIDO PELO BANCO (sequência atômica), nunca inventado na
 * tela — dois postos cadastrando ao mesmo tempo gerariam o mesmo número. O
 * partograma, a SAE, o RN e o faturamento passam a apontar todos para a mesma
 * paciente, que foi a escolha da enfermagem (nada de episódio só com iniciais).
 *
 * 🔴 CONFERE O RETORNO, não o status: o PostgREST responde 2xx alterando zero
 * linha. Devolve `{ ok, paciente }` ou `{ ok:false, motivo }`.
 */
export async function cadastrarGestante(sb, dados, user, vinculo = {}) {
  if (!sb) return { ok: false, motivo: "Sem conexão com o banco." };
  const nome = String(dados?.nome_completo ?? "").trim();
  if (!nome) return { ok: false, motivo: "O nome completo é obrigatório para gerar o prontuário." };

  const pront = await emitirProntuario(sb);
  if (!pront?.ok) return { ok: false, motivo: pront?.motivo || "Não consegui emitir o prontuário." };

  const corpo = {
    prontuario: pront.prontuario,
    nome_completo: nome,
    iniciais: iniciaisDe(nome),
    data_nascimento: dados.data_nascimento || null,
    cpf: String(dados.cpf ?? "").replace(/\D/g, "") || null,
    cns: String(dados.cns ?? "").replace(/\D/g, "") || null,
    sexo: "F",
    nacionalidade: "brasileira",
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };
  const r = await sb("pacientes", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify(corpo),
  }).catch(() => null);

  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: `Não gravei o cadastro (CPF/CNS pode já existir em outra paciente). O prontuário ${pront.prontuario} chegou a ser emitido — procure por ele antes de tentar de novo.` };
  }

  // Religa a FONTE (leito/atendimento do PS) ao prontuário emitido, senão a
  // paciente reapareceria na fila como "sem cadastro" e alguém a cadastraria
  // de novo. Best-effort: se a RLS negar (perfil sem escrita no leito/PS), a
  // admissão já valeu — só a fila fica com uma linha órfã até um admin religar.
  await religarFonte(sb, vinculo, pront.prontuario);

  return { ok: true, paciente: r[0] };
}

async function religarFonte(sb, vinculo, prontuario) {
  const corpo = JSON.stringify({ prontuario });
  const opt = { method: "PATCH", headers: { Prefer: "return=representation" }, body: corpo };
  try {
    if (vinculo?.leito) await sb(`leitos?identificacao=eq.${encodeURIComponent(vinculo.leito)}`, opt);
    if (vinculo?.psId)  await sb(`ps_atendimentos?id=eq.${encodeURIComponent(vinculo.psId)}`, opt);
  } catch { /* best-effort: a admissão não depende disto */ }
}
