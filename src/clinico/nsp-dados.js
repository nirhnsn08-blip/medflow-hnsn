// ═══════════════════════════════════════════════════════════
// NSP — ACESSO AO BANCO
//
// Saiu do App.jsx. Toda escrita do Núcleo de Segurança do Paciente passa
// por aqui: nada na tela chama a rede direto.
//
// 🔴 POR QUE O `sb` É PARÂMETRO, E NÃO IMPORT
// A medição de `NSPPage` mostrou que a superfície compartilhada com o resto
// do App.jsx não eram as cores nem o formulário: eram 226 linhas de máquina
// de sessão — `sbFetch`, `renovarSessao`, `clearSession`, `AUTH_TOKEN`,
// `SESSION_KEY`, o aviso de sessão expirada. Mover isso junto arrastaria o
// login inteiro; deixar um import cruzado devolveria o acoplamento pela
// porta dos fundos.
//
// Recebendo `sb`, este módulo não sabe o que é sessão nem renovação de
// token — e `sb` nulo é o modo offline, que antes era a flag global
// `USE_SUPABASE`. É o mesmo padrão de src/atendimento/dados.js.
//
// ⚠️ PostgREST responde 2xx alterando ZERO linha. Onde o retorno importa, o
// `Prefer: return=representation` está pedido de propósito — quem confia no
// status já produziu bug nesta casa.
// ═══════════════════════════════════════════════════════════

// 🔴 De `nsp-incidente.js`: esta camada é chamada pelo botão que vive no
// casco, e importar de `nsp.js` traria o módulo inteiro junto.
import { matrizRisco, exigeRCA, notificacaoCompulsoria } from "./nsp-incidente.js";
import { listaLida } from "../util/leitura.js";

// ── NSP — Núcleo de Segurança do Paciente (Fase 2a) ──
export async function loadIncidentes(sb) {
  if (!sb) return [];
  const rows = await sb("nsp_incidentes?select=*&order=criado_em.desc").catch(() => []);
  return listaLida(rows);
}
// Indicador automático (diferencial): LPP adquirida na unidade (marcador POA da Fase 1a).
export async function loadLppAdquiridas(sb) {
  if (!sb) return 0;
  const rows = await sb("enf_lesao_pressao?presente_admissao=eq.false&select=id").catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}
export async function registrarIncidente(sb, inc, user) {
  if (!sb) return null;
  const anonimo = !!inc.anonimo;
  const risco = matrizRisco(inc.probabilidade, inc.gravidade);
  const res = await sb("nsp_incidentes", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      classe: inc.classe, tipo: inc.tipo || null, grau_dano: inc.grau_dano || null,
      descricao: inc.descricao, acoes_imediatas: inc.acoes_imediatas || null,
      local_setor: inc.local_setor || null, leito: inc.leito || null,
      ocorrido_em: inc.ocorrido_em || null, detectado_em: inc.detectado_em || new Date().toISOString(),
      prontuario: inc.prontuario || null, episodio_id: inc.episodio_id || null,
      origem_tipo: inc.origem_tipo || "manual", origem_id: inc.origem_id || null, origem_ref: inc.origem_ref || null,
      probabilidade: inc.probabilidade ?? null, gravidade: inc.gravidade ?? null,
      risco_score: risco.score || null, risco_faixa: risco.faixa || null,
      anonimo, notificado_por: anonimo ? null : (user?.name || null), categoria: anonimo ? null : (user?.categoria || null),
      notificacao_compulsoria: notificacaoCompulsoria(inc), exige_rca: exigeRCA(inc), status: "nova",
    }),
  });
  return Array.isArray(res) ? res[0] : res;
}
export async function atualizarStatusIncidente(sb, inc, novoStatus, texto, user) {
  if (!sb) return;
  await sb(`nsp_incidentes?id=eq.${inc.id}`, { method: "PATCH", body: JSON.stringify({ status: novoStatus, atualizado_em: new Date().toISOString() }) });
  await sb("nsp_incidente_eventos", { method: "POST", body: JSON.stringify({
    incidente_id: inc.id, tipo: "status", de_status: inc.status || null, para_status: novoStatus,
    texto: texto || null, usuario: user?.name || null, categoria: user?.categoria || null,
  }) });
}
// ── NSP Fase 2b: análise de causa raiz + plano de ação ──
export async function loadRcas(sb) {
  if (!sb) return [];
  const rows = await sb("nsp_rca?select=*&order=criado_em.desc").catch(() => []);
  return listaLida(rows);
}
export async function loadAcoes(sb) {
  if (!sb) return [];
  const rows = await sb("nsp_acoes?select=*&order=criado_em.desc").catch(() => []);
  return listaLida(rows);
}
export async function registrarRca(sb, rca, user) {
  if (!sb) return null;
  const res = await sb("nsp_rca", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      incidente_id: rca.incidente_id, metodo: rca.metodo || null,
      porques: rca.porques || [], ishikawa: rca.ishikawa || {}, fatores: rca.fatores || [], barreiras: rca.barreiras || [],
      causa_raiz: rca.causa_raiz || null, conclusao: rca.conclusao || null, status: rca.status || "concluida",
      registrado_por: user?.name || null, categoria: user?.categoria || null,
      conselho: user?.conselho || null, registro_conselho: user?.registro_conselho || null,
    }),
  });
  return Array.isArray(res) ? res[0] : res;
}
export async function registrarAcao(sb, acao, user) {
  if (!sb) return null;
  const res = await sb("nsp_acoes", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      incidente_id: acao.incidente_id, rca_id: acao.rca_id || null,
      o_que: acao.o_que, por_que: acao.por_que || null, responsavel: acao.responsavel || null,
      prazo: acao.prazo || null, onde: acao.onde || null, como: acao.como || null, quanto: acao.quanto || null,
      status: acao.status || "pendente",
      registrado_por: user?.name || null, categoria: user?.categoria || null,
      conselho: user?.conselho || null, registro_conselho: user?.registro_conselho || null,
    }),
  });
  return Array.isArray(res) ? res[0] : res;
}
export async function atualizarAcao(sb, acao, patch) {
  if (!sb) return;
  const body = { ...patch, atualizado_em: new Date().toISOString() };
  if (patch.status === "concluida" && !acao.concluida_em) body.concluida_em = new Date().toISOString();
  await sb(`nsp_acoes?id=eq.${acao.id}`, { method: "PATCH", body: JSON.stringify(body) });
}
// ── NSP Fase 2c: metas de segurança (alvos editáveis + medições de auditoria) ──
export async function loadMetaFaixas(sb) {
  if (!sb) return [];
  const rows = await sb("nsp_meta_faixas?select=*&order=ordem").catch(() => []);
  return listaLida(rows);
}
export async function loadMetaMedicoes(sb) {
  if (!sb) return [];
  const rows = await sb("nsp_meta_medicoes?select=*&order=competencia.desc").catch(() => []);
  return listaLida(rows);
}
// Alvo editável — só ADM Master (a tela restringe). Upsert por chave, como enf_escala_faixas.
export async function salvarMetaFaixa(sb, faixa, user) {
  if (!sb) return;
  await sb("nsp_meta_faixas?on_conflict=chave", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ ...faixa, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
}
// Medição de auditoria (append-only, autoria congelada).
export async function registrarMetaMedicao(sb, med, user) {
  if (!sb) return null;
  const res = await sb("nsp_meta_medicoes", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      meta: med.meta, competencia: med.competencia,
      numerador: Number(med.numerador) || 0, denominador: Number(med.denominador) || 0,
      observacao: med.observacao || null,
      registrado_por: user?.name || null, categoria: user?.categoria || null,
      conselho: user?.conselho || null, registro_conselho: user?.registro_conselho || null,
    }),
  });
  return Array.isArray(res) ? res[0] : res;
}
// ── NSP Fase 2d: protocolos gerenciados de segurança ──
export async function loadProtocolos(sb) {
  if (!sb) return [];
  const rows = await sb("nsp_protocolos?select=*&order=criado_em").catch(() => []);
  return listaLida(rows);
}
// Cria/edita protocolo — só ADM/canEdit (a tela restringe). Upsert por id, é configuração.
export async function salvarProtocolo(sb, proto, user) {
  if (!sb) return;
  const body = {
    meta: proto.meta || null, titulo: proto.titulo, versao: proto.versao || null,
    responsavel: proto.responsavel || null, conteudo: proto.conteudo || null,
    referencia: proto.referencia || null, revisao_em: proto.revisao_em || null,
    status: proto.status || "em_revisao", validado: !!proto.validado, ativo: proto.ativo !== false,
    usuario: user?.name || null, updated_at: new Date().toISOString(),
  };
  if (proto.id) body.id = proto.id;
  if (proto.chave) body.chave = proto.chave;
  await sb("nsp_protocolos?on_conflict=id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(body),
  });
}
// ── NSP Fase 2d: capacitações (treinamentos em segurança) ──
export async function loadCapacitacoes(sb) {
  if (!sb) return [];
  const rows = await sb("nsp_capacitacoes?select=*&order=criado_em.desc").catch(() => []);
  return listaLida(rows);
}
export async function salvarCapacitacao(sb, cap, user) {
  if (!sb) return;
  const numOrNull = v => (v === "" || v == null ? null : Number(v));
  const body = {
    tema: cap.tema, meta: cap.meta || null, data: cap.data || null,
    carga_horaria: numOrNull(cap.carga_horaria), facilitador: cap.facilitador || null,
    publico_alvo: cap.publico_alvo || null, participantes: numOrNull(cap.participantes),
    status: cap.status || "planejado", proxima_em: cap.proxima_em || null,
    observacao: cap.observacao || null, ativo: cap.ativo !== false,
    usuario: user?.name || null, updated_at: new Date().toISOString(),
  };
  if (cap.id) body.id = cap.id;
  await sb("nsp_capacitacoes?on_conflict=id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(body),
  });
}
// ── NSP Fase 2d: comunicação (mural de comunicados de segurança) ──
export async function loadComunicados(sb) {
  if (!sb) return [];
  const rows = await sb("nsp_comunicados?select=*&order=criado_em.desc").catch(() => []);
  return listaLida(rows);
}
export async function salvarComunicado(sb, com, user) {
  if (!sb) return;
  const body = {
    titulo: com.titulo, tipo: com.tipo || "informativo", prioridade: com.prioridade || "media",
    conteudo: com.conteudo || null, publico_alvo: com.publico_alvo || null,
    data: com.data || null, incidente_id: com.incidente_id || null,
    status: com.status || "ativo", ativo: com.ativo !== false,
    autor: com.autor || user?.name || null,
    usuario: user?.name || null, updated_at: new Date().toISOString(),
  };
  if (com.id) body.id = com.id;
  await sb("nsp_comunicados?on_conflict=id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(body),
  });
}
