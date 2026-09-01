// ═══════════════════════════════════════════════════════════
// PROTOCOLOS CLÍNICOS — ACESSO AO BANCO
//
// Linhas de cuidado tempo-dependentes: sepse, dor torácica, AVC, TEV.
// Catálogo, instâncias por setor, ativações e itens do bundle.
//
// 🔴 `checarPassoProt` MARCA UM PASSO DO BUNDLE COMO FEITO, e o carimbo
// de hora é o que sustenta o indicador porta→ação. Um passo marcado sem
// hora não é um passo cumprido: é um passo que ninguém sabe quando
// aconteceu, e o tempo-dependente perde o sentido.
//
// ⚠️ Cada instância é POR SETOR (`prot_setores`): a Emergência e a UTI
// ativam o mesmo protocolo separadamente, porque o relógio de cada uma
// corre sozinho.
//
// `sb` é parâmetro. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

export async function loadProtCatalogo(sb) {
  if (!sb) return [];
  const rows = await sb("prot_catalogo?select=*&order=criado_em").catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export async function loadProtSetores(sb) {
  if (!sb) return [];
  const rows = await sb("prot_setor?select=*").catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export async function loadProtAtivacoes(sb) {
  if (!sb) return [];
  const rows = await sb("prot_ativacoes?select=*&order=acionado_em.desc").catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export async function loadProtItens(sb) {
  if (!sb) return [];
  const rows = await sb("prot_bundle_itens?select=*&order=feito_em").catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export async function registrarAtivacaoProt(sb, a, user) {
  if (!sb) return null;
  const body = {
    protocolo: a.protocolo, setor: a.setor || null, prontuario: a.prontuario || null,
    paciente_nome: a.paciente_nome || null, leito: a.leito || null,
    gatilho_ref: a.gatilho_ref || null, acionado_por: user?.name || null,
  };
  // Avaliação (TEV) já nasce concluída, com a recomendação como desfecho.
  if (a.status) body.status = a.status;
  if (a.desfecho) body.desfecho = a.desfecho;
  if (a.encerrado_em) body.encerrado_em = a.encerrado_em;
  const res = await sb("prot_ativacoes", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return Array.isArray(res) ? res[0] : res;
}

export async function checarPassoProt(sb, item, user) {
  if (!sb) return null;
  return await sb("prot_bundle_itens", {
    method: "POST",
    body: JSON.stringify({
      ativacao_id: item.ativacao_id, passo: item.passo, rotulo: item.rotulo || null,
      feito: !item.nao_aplica, nao_aplica: !!item.nao_aplica,
      valor: item.valor || null, obs: item.obs || null, feito_por: user?.name || null,
    }),
  });
}

export async function encerrarAtivacaoProt(sb, a, desfecho, motivo, user) {
  if (!sb) return;
  await sb(`prot_ativacoes?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({
    status: "concluida", desfecho: desfecho || null, motivo: motivo || null, encerrado_em: new Date().toISOString(),
  }) });
}

export async function upsertProtSetorRemote(sb, inst, user) {
  if (!sb) return;
  await sb("prot_setor?on_conflict=setor,protocolo", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      setor: inst.setor, protocolo: inst.protocolo, ativo: inst.ativo !== false,
      janela_min: inst.janela_min ?? null, responsavel: inst.responsavel || null,
      validado: !!inst.validado, usuario: user?.name || null, updated_at: new Date().toISOString(),
    }),
  });
}

export async function patchCatalogoProt(sb, t, patch, user) {
  if (!sb) return;
  await sb(`prot_catalogo?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, usuario: user?.name || null, updated_at: new Date().toISOString() }) });
}
