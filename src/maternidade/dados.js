// ═══════════════════════════════════════════════════════════
// MATERNIDADE — acesso a dados (loaders/savers)
//
// A tela recebe `sb` (o fetch autenticado) por prop e chama daqui. A busca
// de gestante REUSA a `buscarPacientes` do Atendimento — testada, com recuo
// para bancos sem a coluna de busca — em vez de reinventar uma segunda.
// ═══════════════════════════════════════════════════════════

import { listaLida, algumaFalhou } from "../util/leitura.js";
import { montarFilaObstetrica } from "./fila.js";
import { medidaMaisRecente } from "./vigilancia.js";
import { emitirProntuario, cadastrarRecemNascido } from "../atendimento/dados.js";
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

// ── Parto & cesárea: o registro do nascimento ────────────────

/** Os partos deste episódio, na ordem do tempo. */
export async function carregarPartos(sb, episodioId) {
  if (!sb || !episodioId) return [];
  const r = await sb(
    `mat_partos?episodio_id=eq.${encodeURIComponent(episodioId)}&select=*&order=data_hora`
  ).catch(() => null);
  return listaLida(r);
}

/**
 * Grava um parto (append-only). Confere o RETORNO, não o status: sem isso
 * "gravou" seria mentira e o parto sumiria do dossiê sem aviso.
 */
export async function salvarParto(sb, registro, user) {
  if (!sb) return { ok: false, motivo: "Sem conexão com o banco." };
  const r = await sb("mat_partos", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...registro, usuario: user?.name || null }),
  }).catch(() => null);
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Não gravei o parto (o banco recusou algum valor fora de faixa?)." };
  return { ok: true, parto: r[0] };
}

// ── Recém-nascido: identidade (reuso) + avaliação clínica ────

/** As avaliações de RN deste episódio, na ordem do tempo. */
export async function carregarRecemNascidos(sb, episodioId) {
  if (!sb || !episodioId) return [];
  const r = await sb(
    `mat_recem_nascidos?episodio_id=eq.${encodeURIComponent(episodioId)}&select=*&order=data_hora`
  ).catch(() => null);
  return listaLida(r);
}

/**
 * Registra um RN: cria o CADASTRO do bebê (prontuário próprio ligado à mãe,
 * reusando `cadastrarRecemNascido`) e grava a AVALIAÇÃO clínica ligada a ele.
 *
 * Dois passos: se o cadastro vai mas a avaliação falha, o bebê JÁ EXISTE — o
 * retorno diz isso (com o prontuário) para não recadastrar e virar gêmeo falso.
 */
export async function salvarRecemNascido(sb, { mae, dados, avaliacao, episodioId, partoId }, user) {
  if (!sb) return { ok: false, motivo: "Sem conexão com o banco." };

  const rc = await cadastrarRecemNascido(sb, { mae, dados }, user);
  if (!rc.ok) return rc;   // { ok:false, motivo }

  const registro = {
    ...avaliacao,
    episodio_id: episodioId,
    parto_id: partoId || null,
    prontuario_rn: rc.paciente.prontuario,
    sexo: avaliacao?.sexo || dados?.sexo || null,
    usuario: user?.name || null,
  };
  const r = await sb("mat_recem_nascidos", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify(registro),
  }).catch(() => null);

  if (!Array.isArray(r) || !r.length) {
    return { ok: false, paciente: rc.paciente, motivo: `O bebê foi cadastrado (prontuário ${rc.paciente.prontuario}), mas não gravei a avaliação clínica. Busque o bebê e lance a avaliação de novo — NÃO recadastre.` };
  }
  return { ok: true, paciente: rc.paciente, avaliacao: r[0] };
}

// ── Indicadores: lê partos e RNs para agregar (sem migração) ──

/**
 * Lê os partos e as avaliações de RN para os indicadores. `incompleto:true`
 * se alguma leitura falhou — a tela avisa em vez de mostrar taxa de banco
 * meio-lido. A agregação (Robson etc.) é do motor puro (indicadores.js); o
 * recorte por período é da tela.
 */
export async function carregarIndicadores(sb) {
  if (!sb) return { partos: [], rns: [], incompleto: true };
  const [pR, rR] = await Promise.all([
    sb("mat_partos?select=robson,via,perda_sangue_ml,rn_vivo,data_hora&order=data_hora.desc&limit=2000").catch(() => null),
    sb("mat_recem_nascidos?select=peso_g,ig_capurro_semanas,apgar_5,data_hora&order=data_hora.desc&limit=2000").catch(() => null),
  ]);
  const partos = listaLida(pR), rns = listaLida(rR);
  return { partos, rns, incompleto: algumaFalhou(partos, rns) };
}

// ── Vigilância materna (painel MEOWS) ─────────────────────────

/**
 * O painel de segurança materna: para cada episódio EM ANDAMENTO, a medida de
 * sinais vitais mais recente que existe no dossiê.
 *
 * Não há tabela nova: os vitais já são gravados em dois lugares — uma vez na
 * admissão e a cada registro do partograma. O painel só junta os dois e fica
 * com o mais novo. Quem está em trabalho de parto é medida de hora em hora;
 * quem está internada e ainda não entrou em trabalho tem a da admissão, que é
 * exatamente o caso em que o painel precisa gritar que a medida envelheceu.
 *
 * 🔴 `incompleto` viaja junto: se alguma leitura falhou, a tela NÃO pode
 * dizer "nenhuma paciente em risco" — ela não sabe. Leitura que falhou não é
 * leitura vazia.
 */
export async function carregarVigilanciaMaterna(sb) {
  if (!sb) return { ok: false, casos: [], incompleto: true };

  const epsR = await sb("mat_episodios?status=eq.em_andamento&select=id,prontuario,risco&limit=500")
    .catch(() => null);
  const episodios = listaLida(epsR);
  if (episodios.falhou) return { ok: false, casos: [], incompleto: true };
  if (!episodios.length) return { ok: true, casos: [], incompleto: false };

  const ids = episodios.map(e => e.id).join(",");
  const prontuarios = [...new Set(episodios.map(e => e.prontuario).filter(Boolean))]
    .map(p => `"${p}"`).join(",");

  const [pacR, leitosR, tpR, admR] = await Promise.all([
    prontuarios
      ? sb(`pacientes?prontuario=in.(${prontuarios})&select=prontuario,iniciais,nome_completo`).catch(() => null)
      : Promise.resolve([]),
    sb("leitos?status=eq.ocupado&select=identificacao,prontuario,setor").catch(() => null),
    sb(`mat_trabalho_parto?episodio_id=in.(${ids})&select=episodio_id,data_hora,vitais` +
       "&order=data_hora.desc&limit=2000").catch(() => null),
    sb(`mat_admissoes?episodio_id=in.(${ids})&select=episodio_id,data_hora,vitais` +
       "&order=data_hora.desc&limit=500").catch(() => null),
  ]);

  const pacientes = listaLida(pacR), leitos = listaLida(leitosR);
  const tps = listaLida(tpR), admissoes = listaLida(admR);
  const incompleto = algumaFalhou(pacientes, leitos, tps, admissoes);

  const porProntuario = new Map(pacientes.map(p => [p.prontuario, p]));
  const leitoDe = new Map(leitos.filter(l => l.prontuario).map(l => [l.prontuario, l]));
  // as listas vêm em ordem decrescente: o primeiro de cada episódio é o mais novo
  const ultimoTP = new Map(), ultimaAdm = new Map();
  for (const r of tps) if (!ultimoTP.has(r.episodio_id)) ultimoTP.set(r.episodio_id, r);
  for (const a of admissoes) if (!ultimaAdm.has(a.episodio_id)) ultimaAdm.set(a.episodio_id, a);

  const casos = episodios.map(e => {
    const pac = porProntuario.get(e.prontuario) || {};
    const leito = leitoDe.get(e.prontuario);
    const tp = ultimoTP.get(e.id), adm = ultimaAdm.get(e.id);
    const medida = medidaMaisRecente([
      tp  && { origem: "partograma", vitais: tp.vitais,  medidoEm: tp.data_hora },
      adm && { origem: "admissao",   vitais: adm.vitais, medidoEm: adm.data_hora },
    ].filter(Boolean));
    return {
      episodioId: e.id,
      prontuario: e.prontuario,
      nome: pac.nome_completo || null,
      iniciais: pac.iniciais || null,
      risco: e.risco || null,
      leito: leito?.identificacao || null,
      setor: leito?.setor || null,
      vitais: medida?.vitais || null,
      medidoEm: medida?.medidoEm || null,
      origem: medida?.origem || null,
      emTrabalhoDeParto: !!tp,
    };
  });

  return { ok: !incompleto, casos, incompleto };
}
