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

import { filtroBuscaPacientes, normalizarProntuario, dadosNaoIdentificado } from "./recepcao.js";
import { camposDaFicha, DOMINIOS } from "./ficha.js";

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
  const r = await sb(`pacientes?${filtro}&select=${CAMPOS_BUSCA}&limit=${limite}&order=prontuario`);
  return Array.isArray(r) ? r : [];
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
  const r = await sb(`ps_atendimentos?prontuario=eq.${encodeURIComponent(p)}&status=neq.finalizado&select=id,prontuario,iniciais,status,chegada_em,classificacao&order=chegada_em.desc`);
  return Array.isArray(r) ? r : [];
}

/**
 * Abre o atendimento.
 *
 * As `iniciais` são copiadas do cadastro em vez de digitadas de novo: era
 * o campo em que a chegada do PS divergia do cadastro sem ninguém notar —
 * a fila mostrava um nome e o Paciente 360, outro.
 */
export async function abrirAtendimento(sb, { paciente, tipo = "emergencia", origem, origemDetalhe, queixa, ficha, medico }, user) {
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
    status: "aguardando_triagem",
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
