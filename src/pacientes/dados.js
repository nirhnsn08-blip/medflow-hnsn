// ═══════════════════════════════════════════════════════════
// PACIENTE 360 — ACESSO AO BANCO
//
// 🔴 `loadPaciente360` LÊ NOVE TABELAS DE UMA VEZ, de cinco módulos:
// cadastro, atendimentos do PS, leito atual, saídas, casos do SCIH,
// evoluções, alergias. É a única leitura do sistema que atravessa o
// hospital inteiro por um prontuário.
//
// ⚠️ As tabelas que podem não existir num banco sem a migração do PEP
// levam `.catch(() => [])` individual: uma tabela ausente não pode apagar
// as outras oito. Sem isso, um banco desatualizado mostraria o paciente
// como se não tivesse histórico nenhum.
//
// `sb` é parâmetro. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { listaLida } from "../util/leitura.js";

export async function loadPaciente360(sb, prontuario) {
  const p = encodeURIComponent(prontuario);
  const [cad, ps, leitoAtual, saidas, scih, evolucoes, alergias] = await Promise.all([
    sb(`pacientes?prontuario=eq.${p}&select=*`),
    sb(`ps_atendimentos?prontuario=eq.${p}&select=*&order=chegada_em.desc`),
    sb(`leitos?prontuario=eq.${p}&status=eq.ocupado&select=*`),
    sb(`leitos_saidas?prontuario=eq.${p}&select=*&order=data_alta.desc`).catch(() => []),
    // `created_at`, não `criado_em`: só pep_evolucoes, ps_registros e
    // ps_administracoes usam o nome em português. As outras 23 tabelas usam
    // created_at, e scih_casos é uma delas.
    sb(`scih_casos?prontuario=eq.${p}&select=*&order=created_at.desc`).catch(() => []),
    sb(`pep_evolucoes?prontuario=eq.${p}&select=*&order=criado_em.desc`),
    // Alergia é do PACIENTE (pep_alergias), não do atendimento. `.catch`
    // preserva o app em bancos onde a migração do PEP ainda não rodou.
    sb(`pep_alergias?prontuario=eq.${p}&select=*&order=criado_em.desc`).catch(() => []),
  ]);
  const psRows = listaLida(ps);
  let registrosPS = [];
  if (psRows.length) {
    const ids = psRows.map(a => a.id).join(",");
    const regs = await sb(`ps_registros?atendimento_id=in.(${ids})&select=*&order=criado_em.desc`).catch(() => []);
    registrosPS = listaLida(regs);
  }
  return {
    cadastro: Array.isArray(cad) && cad[0] ? cad[0] : null,
    ps: psRows, leitoAtual: listaLida(leitoAtual),
    saidas: listaLida(saidas), scih: listaLida(scih),
    evolucoes: listaLida(evolucoes),
    alergias: listaLida(alergias),
    registrosPS,
  };
}

export async function buscarPacientes(sb, termo) {
  const t = String(termo || "").trim();
  if (t.length < 2) return [];
  const filtros = [`iniciais.ilike.*${encodeURIComponent(t)}*`];
  if (t.length >= 3) filtros.push(
    `nome_completo.ilike.*${encodeURIComponent(t)}*`,
    `nome_social.ilike.*${encodeURIComponent(t)}*`);
  const doc = t.replace(/\D/g, "");
  if (doc.length === 11) filtros.push(`cpf.eq.${doc}`);
  if (doc.length === 15) filtros.push(`cns.eq.${doc}`);
  const rows = await sb(`pacientes?or=(${filtros.join(",")})&select=*&limit=12`).catch(() => null);
  // Banco sem a migração da identificação ainda: cai para a busca antiga em
  // vez de devolver vazio e fazer parecer que o paciente não existe.
  if (rows == null) {
    const antigo = await sb(`pacientes?iniciais=ilike.*${encodeURIComponent(t)}*&select=*&limit=12`);
    return listaLida(antigo);
  }
  return listaLida(rows);
}

// A gravação do paciente passou para `src/pacientes/CadastroPaciente.jsx`:
// ela agora valida documento, confere duplicidade antes de criar um segundo
// prontuário da mesma pessoa e grava a identificação inteira. Um upsert
// solto aqui voltaria a gravar cadastro sem nada disso.
export async function addEvolucaoRemote(sb, ev, user) {
  if (!sb) return;
  await sb("pep_evolucoes", { method: "POST", body: JSON.stringify({ ...ev, usuario: user?.name || null }) });
}
