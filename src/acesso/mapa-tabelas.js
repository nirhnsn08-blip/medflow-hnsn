// ═══════════════════════════════════════════════════════════
// QUEM LÊ CADA TABELA — o mapa que fecha o RLS de leitura
//
// O QUE ISTO RESOLVE
// Até aqui, `src/acesso/modulos.js` decidia o que aparece na TELA, e as
// políticas de SELECT do banco eram todas `using (true)`: qualquer usuário
// logado alcançava qualquer tabela pela API REST, inclusive um
// `visualizador` e inclusive a tabela `pacientes` — nome completo, CPF,
// nome da mãe e endereço. Esconder o menu organizava o trabalho; não era
// barreira.
//
// Este arquivo é a fonte única de qual MÓDULO pode LER cada TABELA. O
// gerador `supabase/gerar-rls.mjs` transforma isto em política de banco, e
// `mapa-tabelas.test.js` confere que nenhuma tabela ficou de fora.
//
// COMO LER UMA LINHA
//   "pep_evolucoes": ["paciente"]
//     → só quem tem o módulo Paciente 360 em leitura ou escrita lê a
//       tabela. Para os outros o PostgREST devolve 200 com lista VAZIA
//       (não devolve erro — ver a armadilha no fim deste comentário).
//
// POR QUE UMA LISTA, E NÃO UM DONO SÓ
// Tela não respeita fronteira de módulo, e não deveria: o Giro de Leitos
// monta o mapa de risco lendo as escalas de enfermagem; o Paciente 360 lê
// o PS, o leito, a SCIH e o PEP na mesma consulta. Um dono único por tabela
// obrigaria a inventar acesso ou a quebrar tela. A lista diz a verdade:
// "estas telas legitimamente leem isto".
//
// A REGRA QUE GUIA A CLASSIFICAÇÃO
//   • Tem dado de paciente identificável (prontuário, iniciais, CPF, CID)?
//     → lista fechada, a menor possível.
//   • É catálogo, referência ou configuração, SEM dado de paciente?
//     → TODOS. Negar não protege ninguém e quebra tela alheia: o motor de
//       alertas clínicos precisa de `farm_medicamentos` no PS e no PEP, a
//       Recepção precisa de `at_dominios`, todo mundo precisa de `setores`.
//       TODOS aqui é uma DECISÃO declarada, não um `using (true)` esquecido.
//
// ⚠️ O QUE ESTE MAPA NÃO FAZ
//   1. Não filtra LINHA. Quem alcança `pacientes` alcança todos os
//      pacientes — não existe "só os do meu setor". Isso é uma fase
//      seguinte, e depende de lotação confiável em `profiles.setor`.
//   2. Não mexe em ESCRITA. As políticas de insert/update/delete continuam
//      decidindo por `role` (adm_master/adm_silver), não por módulo.
//   3. RLS bloqueando leitura devolve **200 com lista vazia**, não erro.
//      Uma tela sem acesso mostra ZERO, não "sem permissão". Onde isso
//      possa ser lido como número real (indicador, painel), a tela precisa
//      conferir a permissão e escrever "sem acesso" — ver a nota sobre a
//      Visão Geral em docs/CONTEXTO.md.
// ═══════════════════════════════════════════════════════════

/** Qualquer usuário autenticado lê. Só para tabela SEM dado de paciente. */
export const TODOS = "*";

/** A própria linha do usuário (`user_id = auth.uid()`). */
export const PROPRIO = "@proprio";

/**
 * tabela → módulos que podem LER.
 *
 * Em ordem alfabética, a mesma de `supabase/auditoria-banco.sql`, para
 * conferir os dois lado a lado sem procurar.
 */
export const MAPA_TABELAS = {
  // ── Atendimento: agenda, conta e responsável ──────────────
  ag_agendamentos:          ["atendimento"],
  ag_bloqueios:             ["atendimento"],
  ag_grades:                ["atendimento"],
  at_conta_itens:           ["atendimento"],
  at_contas:                ["atendimento"],
  // Guarda CPF e documento judicial do curador/responsável. O prontuário
  // precisa saber quem consente e quem recebe a alta.
  at_responsaveis:          ["atendimento", "paciente"],

  // ── Catálogos do Atendimento (sem paciente) ───────────────
  at_convenios:             [TODOS],
  at_dominios:              [TODOS],
  at_planos:                [TODOS],
  at_procedimentos:         [TODOS],

  // ── SIGTAP: tabela de procedimentos do SUS (Fase 4 — faturamento) ──
  // Referência oficial, sem dado de paciente. Todo mundo lê: a conta e a
  // glosa rodam dentro do Atendimento, do PS e do prontuário.
  sigtap_procedimentos:     [TODOS],

  // ── Produção ambulatorial: contagem por dia/especialidade ──
  // Números agregados, ninguém identificável. É a fonte da Visão Geral.
  atendimentos:             ["overview", "atendimento", "ambulatorio", "print"],

  // ── Trilhas ───────────────────────────────────────────────
  // Quem é auditado não administra a própria trilha (REQUISITOS-PEP A-03).
  auditoria:                ["auditoria"],
  pep_acessos:              ["auditoria"],

  // ── Bloco cirúrgico ───────────────────────────────────────
  cc_cirurgias:             ["bloco"],
  cc_salas:                 [TODOS],

  // ── Referência clínica ────────────────────────────────────
  cid_referencia:           [TODOS],
  enf_escala_faixas:        [TODOS],
  enf_sae_catalogo:         [TODOS],
  nsp_meta_faixas:          [TODOS],
  nsp_protocolos:           [TODOS],
  ps_faixas_obstetricas:    [TODOS],
  ps_faixas_pediatricas:    [TODOS],
  ps_protocolos:            [TODOS],
  scih_germes:              [TODOS],
  setores:                  [TODOS],

  // ── Enfermagem: escalas, LPP e SAE ────────────────────────
  // O Giro de Leitos monta mapa de risco e fila de checagem a partir
  // destas tabelas; o NSP conta a LPP adquirida na unidade.
  enf_escalas:              ["paciente", "leitos"],
  enf_lesao_pressao:        ["paciente", "leitos", "nsp"],
  enf_sae_checagem:         ["paciente", "leitos"],
  enf_sae_prescricao_itens: ["paciente", "leitos"],
  enf_sae_prescricoes:      ["paciente", "leitos"],
  enf_sae_diagnosticos:     ["paciente"],
  enf_sae_historico:        ["paciente"],

  // ── Farmácia ──────────────────────────────────────────────
  // O motor de alertas roda dentro do PS e do PEP: sem estas três, o
  // médico prescreve sem checagem de interação, dose e Beers.
  farm_incompat_y:          [TODOS],
  farm_interacoes:          [TODOS],
  farm_medicamentos:        [TODOS],
  farm_intervencoes:        ["farmacia"],
  farm_lotes:               ["farmacia"],
  farm_nao_padronizados:    ["farmacia"],
  farm_preparo:             ["farmacia", "ps"],
  // O livro de controlados (Portaria 344/98) é uma leitura destes
  // movimentos; a dispensação aparece no PS.
  farm_movimentos:          ["farmacia", "controlados", "ps"],

  // ── Leitos ────────────────────────────────────────────────
  // `leitos` carrega prontuário, iniciais e CID do internado; a SCIH mexe
  // no isolamento do leito.
  leitos:                   ["leitos", "paciente", "scih"],
  leitos_saidas:            ["leitos", "paciente"],
  // Só leito e horários — nenhum paciente. É indicador de giro.
  leitos_turnover:          ["leitos", "overview", "print"],

  // ── Segurança do paciente ─────────────────────────────────
  nsp_acoes:                ["nsp"],
  // Capacitação da equipe e comunicados de segurança — cultura de segurança,
  // sem dado de paciente. Ficam no módulo NSP (do PR #67 da Laura).
  nsp_capacitacoes:         ["nsp"],
  nsp_comunicados:          ["nsp"],
  nsp_incidente_eventos:    ["nsp"],
  nsp_incidentes:           ["nsp"],
  nsp_meta_medicoes:        ["nsp"],
  nsp_rca:                  ["nsp"],

  // ── Identificação do paciente ─────────────────────────────
  // A tabela mais sensível do sistema: nome completo, CPF, CNS, nome da
  // mãe, endereço. Recepção e as três telas que atendem gente.
  pacientes:                ["atendimento", "ambulatorio", "ps", "paciente"],

  // ── Prontuário eletrônico ─────────────────────────────────
  pep_administracoes:       ["paciente"],
  pep_alergias:             ["paciente"],
  pep_anamneses:            ["paciente"],
  pep_anotacoes_enfermagem: ["paciente"],
  pep_aprazamentos:         ["paciente"],
  pep_condicoes:            ["paciente"],
  pep_episodios:            ["paciente"],
  pep_evolucoes:            ["paciente"],
  pep_medicamentos_uso:     ["paciente"],
  pep_prescricao_eventos:   ["paciente"],
  pep_prescricao_itens:     ["paciente"],
  pep_prescricoes:          ["paciente"],
  pep_reconciliacao_itens:  ["paciente"],
  pep_reconciliacoes:       ["paciente"],
  pep_sinais_vitais:        ["paciente"],
  pep_sumarios_alta:        ["paciente"],

  // ── Acesso: o app precisa disto para montar o próprio menu ─
  // Nome, cargo e conselho da equipe — não é dado de paciente, e a tela
  // atribui cada registro ao autor ("prescrito por…").
  perfis_acesso:            [TODOS],
  perfis_permissoes:        [TODOS],
  profiles:                 [TODOS],
  // Exceção individual: a pessoa lê a DELA (o app resolve a própria
  // permissão no boot); a lista inteira é do módulo de Usuários.
  usuarios_permissoes:      ["users", PROPRIO],

  // ── Protocolos clínicos gerenciados (PR #67 da Laura) ─────
  // O catálogo do protocolo e a configuração por setor são referência, sem
  // paciente. A ATIVAÇÃO e o bundle executado são de um paciente concreto
  // (prontuário, episódio, valores clínicos) — e a ativação aparece no PS e
  // no prontuário, não só no módulo de Protocolos.
  prot_catalogo:            [TODOS],
  prot_setor:               [TODOS],
  prot_ativacoes:           ["protocolos", "ps", "paciente"],
  prot_bundle_itens:        ["protocolos", "ps", "paciente"],

  // ── Pronto-socorro ────────────────────────────────────────
  // O ciclo do atendimento é o mesmo objeto da Recepção e do Ambulatório
  // — ver src/atendimento/ciclo.js.
  ps_atendimentos:          ["ps", "atendimento", "ambulatorio", "paciente"],
  // O faturamento lê a medicação administrada para montar a conta do
  // episódio — o que foi de fato dado é item cobrável da AIH. É a base
  // clínica da CONTA, não a narrativa do prontuário: a evolução, a anamnese
  // e a prescrição detalhada seguem fora do alcance do faturamento (módulo
  // Paciente). Bilha o realizado, não o clínico.
  ps_administracoes:        ["ps", "paciente", "faturamento"],
  ps_sinais:                ["ps", "paciente"],
  ps_salas:                 ["ps"],
  // A farmácia lê a prescrição do PS para preparar e dispensar.
  ps_prescricao_itens:      ["ps", "paciente", "farmacia"],
  ps_registros:             ["ps", "paciente", "farmacia"],
  // Fila de internação: nasce no PS, é trabalhada pelo NIR no Giro.
  solicitacoes:             ["ps", "leitos"],

  // ── SCIH ──────────────────────────────────────────────────
  scih_casos:               ["scih", "paciente"],
  // Indicadores mensais agregados — sem paciente.
  scih_indicadores:         ["scih", "overview", "print"],

  // ── Estoque e compras ─────────────────────────────────────
  sup_cotacoes:             ["suprimentos"],
  sup_inventarios:          ["suprimentos"],
  sup_lotes:                ["suprimentos"],
  sup_pedidos:              ["suprimentos"],
  // Parâmetros do módulo (hoje só a alçada de aprovação). Leitura para quem
  // alcança Suprimentos ou Farmácia — a tela de aprovação precisa saber o
  // limite para EXPLICAR a recusa. A escrita é restrita a adm_master por
  // política própria: quem opera a compra não define o próprio teto.
  sup_parametros:           ["suprimentos", "farmacia"],
  sup_requisicoes:          ["suprimentos"],
  // A farmácia consome o mesmo catálogo de itens e custos.
  sup_fornecedores:         ["suprimentos", "farmacia"],
  sup_itens:                ["suprimentos", "farmacia"],
  sup_movimentos:           ["suprimentos", "farmacia"],
};

/**
 * Tabelas que carregam dado de paciente identificável ou rastreável.
 *
 * Serve de trava no teste: nenhuma delas pode ser marcada TODOS, nem hoje
 * nem por descuido de quem acrescentar tabela depois. É a lista que a
 * COFEN 754/2024 art. 6º e a LGPD art. 46 mandam separar do administrativo.
 */
export const SENSIVEIS = new Set([
  "ag_agendamentos", "at_conta_itens", "at_contas", "at_responsaveis",
  "auditoria", "cc_cirurgias",
  "enf_escalas", "enf_lesao_pressao", "enf_sae_checagem",
  "enf_sae_diagnosticos", "enf_sae_historico",
  "enf_sae_prescricao_itens", "enf_sae_prescricoes",
  "farm_intervencoes", "farm_movimentos", "farm_nao_padronizados", "farm_preparo",
  "leitos", "leitos_saidas",
  "nsp_acoes", "nsp_incidente_eventos", "nsp_incidentes", "nsp_rca",
  "pacientes",
  "pep_acessos", "pep_administracoes", "pep_alergias", "pep_anamneses",
  "pep_anotacoes_enfermagem", "pep_aprazamentos", "pep_condicoes",
  "pep_episodios", "pep_evolucoes", "pep_medicamentos_uso",
  "pep_prescricao_eventos", "pep_prescricao_itens", "pep_prescricoes",
  "pep_reconciliacao_itens", "pep_reconciliacoes", "pep_sinais_vitais",
  "pep_sumarios_alta",
  "prot_ativacoes", "prot_bundle_itens",
  "ps_administracoes", "ps_atendimentos", "ps_prescricao_itens",
  "ps_registros", "ps_salas", "ps_sinais",
  "scih_casos", "solicitacoes",
]);

/** Os módulos citados no mapa, sem repetição. */
export function modulosCitados(mapa = MAPA_TABELAS) {
  const s = new Set();
  for (const alvos of Object.values(mapa))
    for (const a of alvos) if (a !== TODOS && a !== PROPRIO) s.add(a);
  return [...s].sort();
}
