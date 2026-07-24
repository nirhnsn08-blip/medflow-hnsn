// ═══════════════════════════════════════════════════════════
// CATÁLOGO DE MÓDULOS E PERFIS-MODELO
//
// O QUE É UM PERFIL DE ACESSO AQUI
// Um pacote NOMEADO de permissões — "Técnico de Enfermagem", "Almoxarifado".
// O gestor pede, a TI escolhe o perfil, e a pessoa entra com tudo
// configurado. É como MV e Tasy organizam: perfil é template, não é a
// identidade da pessoa.
//
// O ERRO QUE ISTO EVITA
// Transformar cada cargo real num perfil fixo. Em dois anos vira "Téc. Enf.
// Noturno UTI", "Téc. Enf. Diurno Clínica", quarenta perfis, e ninguém sabe
// mais qual é qual. Aqui o perfil é o caso geral; o desvio daquela pessoa
// específica é uma EXCEÇÃO no usuário (ver permissoes.js), não um perfil novo.
//
// ⚠️ LIMITE DESTA FASE — LEIA ANTES DE CONFIAR
// Isto controla o que aparece na TELA. Não é, ainda, controle de acesso ao
// DADO: as políticas de SELECT do banco continuam `using (true)`, então
// qualquer usuário autenticado alcança qualquer tabela pela API REST,
// independentemente do que escondermos aqui.
//
// Ou seja: hoje isto é organização e redução de ruído — não é barreira.
// A barreira exige apertar o RLS por tabela (fase 3), e isso só se faz
// depois de medir quem realmente acessa o quê, senão tira acesso de quem
// tem direito no meio do plantão. Enquanto a fase 3 não chega, NÃO
// apresentar este módulo ao hospital como "os dados estão segregados".
//
// Base normativa que orienta a matriz:
//   COFEN 754/2024, art. 6º — nível de segurança distinto entre informação
//     administrativa e informação clínica.
//   LGPD, art. 46 — medidas aptas a proteger contra acesso não autorizado.
//   Portaria 344/98 — livro de controlados é documento fiscalizável; por
//     isso ganha módulo próprio, separado do resto da farmácia.
// ═══════════════════════════════════════════════════════════

// ── NÍVEIS ──────────────────────────────────────────────────
// Ordenados de propósito: comparar nível vira comparar número, e "quem pode
// escrever pode ler" deixa de depender de alguém lembrar de escrever as
// duas regras.
export const NIVEIS = { nenhum: 0, leitura: 1, escrita: 2 };

export const NIVEL_LABEL = {
  nenhum:  { label: "Sem acesso", cor: "var(--text-muted)" },
  leitura: { label: "Consulta",   cor: "#38bdf8" },
  escrita: { label: "Lança",      cor: "#2dd4bf" },
};

/**
 * Os módulos do sistema, na ordem em que aparecem no menu.
 *
 * `clinico: true` marca o que contém dado assistencial identificável — é o
 * recorte que a COFEN 754/2024 art. 6º manda separar do administrativo, e
 * é por onde a fase 3 (RLS de verdade) vai começar.
 *
 * `exigeMaster: true` é trava ANTI-TRANCAMENTO: por mais restrito que seja
 * o perfil, um adm_master nunca perde a porta de volta para consertar o
 * próprio erro de configuração.
 */
export const MODULOS = [
  { chave: "overview",     label: "Visão Geral",        grupo: "Geral" },
  { chave: "ambulatorio",  label: "Ambulatório",        grupo: "Assistencial", clinico: true },
  { chave: "ps",           label: "Pronto-Socorro",     grupo: "Assistencial", clinico: true },
  { chave: "bloco",        label: "Bloco Cirúrgico",    grupo: "Assistencial", clinico: true },
  { chave: "leitos",       label: "Giro de Leitos",     grupo: "Assistencial", clinico: true },
  { chave: "scih",         label: "SCIH",               grupo: "Assistencial", clinico: true },
  { chave: "paciente",     label: "Paciente 360 / PEP", grupo: "Assistencial", clinico: true,
    nota: "Prontuário completo. É o módulo de maior sensibilidade do sistema." },
  { chave: "farmacia",     label: "Farmácia",           grupo: "Apoio" },
  { chave: "controlados",  label: "Livro de Controlados", grupo: "Apoio",
    nota: "Documento fiscalizável (Portaria 344/98) — acesso restrito por norma." },
  { chave: "suprimentos",  label: "Estoque & Compras",  grupo: "Apoio" },
  { chave: "print",        label: "Imprimir Dashboard", grupo: "Gestão" },
  { chave: "auditoria",    label: "Auditoria",          grupo: "Gestão",
    nota: "Trilha de quem fez o quê. Quem é auditado não deveria administrar a própria trilha." },
  { chave: "import",       label: "Importar Dados",     grupo: "Sistema" },
  { chave: "supabase",     label: "Banco de Dados",     grupo: "Sistema" },
  { chave: "users",        label: "Usuários e Perfis",  grupo: "Sistema", exigeMaster: true,
    nota: "Exige ADM Master sempre — é a porta de volta se um perfil for configurado errado." },
];

export const MODULO_POR_CHAVE = Object.fromEntries(MODULOS.map(m => [m.chave, m]));
export const GRUPOS = [...new Set(MODULOS.map(m => m.grupo))];

// ── PERFIS-MODELO ───────────────────────────────────────────

// Atalho de leitura: só o que NÃO é "nenhum" precisa ser declarado.
// Declarar quinze `nenhum` por perfil esconderia o que importa no meio do
// que não importa — e matriz que ninguém consegue ler é matriz que ninguém
// confere.
const p = (grants) => grants;

/**
 * Os perfis que já vêm no sistema.
 *
 * `categoria` é a competência CLÍNICA (COFEN/CFM) e vive em `profiles`; o
 * perfil apenas SUGERE. Quem manda no ato clínico é `src/clinico/papeis.js`
 * — um perfil de acesso não concede competência assistencial, do mesmo jeito
 * que ser adm_master não faz ninguém poder assinar evolução médica.
 *
 * `role` é o papel de sistema que costuma acompanhar o cargo. Também é
 * sugestão: a TI confirma na criação.
 */
export const PERFIS_MODELO = [
  // ── Assistenciais ────────────────────────────────────────
  {
    chave: "medico", nome: "Médico(a)", categoria: "medico", role: "adm_silver",
    descricao: "Assistência médica: prescreve, evolui, dá alta.",
    grants: p({ overview: "leitura", ambulatorio: "escrita", ps: "escrita", bloco: "escrita",
                leitos: "escrita", scih: "leitura", paciente: "escrita", farmacia: "leitura",
                print: "leitura" }),
  },
  {
    chave: "enfermeiro", nome: "Enfermeiro(a)", categoria: "enfermeiro", role: "adm_silver",
    descricao: "Processo de Enfermagem completo, gestão de leitos e do cuidado.",
    grants: p({ overview: "leitura", ambulatorio: "escrita", ps: "escrita", bloco: "leitura",
                leitos: "escrita", scih: "escrita", paciente: "escrita", farmacia: "leitura",
                suprimentos: "leitura", print: "leitura" }),
  },
  {
    chave: "enfermeiro_scih", nome: "Enfermeiro(a) — SCIH", categoria: "enfermeiro", role: "adm_silver",
    descricao: "Controle de infecção: vigilância, culturas, indicadores.",
    grants: p({ overview: "leitura", ps: "leitura", bloco: "leitura", leitos: "leitura",
                scih: "escrita", paciente: "escrita", farmacia: "leitura", print: "leitura" }),
  },
  {
    chave: "tecnico_enfermagem", nome: "Técnico(a) de Enfermagem", categoria: "tecnico_enfermagem", role: "adm_silver",
    descricao: "Anotação de enfermagem, checagem de medicação e sinais vitais. O que pode registrar é limitado pela categoria (COFEN 736/2024).",
    grants: p({ overview: "leitura", ambulatorio: "leitura", ps: "escrita", leitos: "escrita",
                scih: "leitura", paciente: "escrita" }),
  },
  {
    chave: "fisioterapeuta", nome: "Fisioterapeuta", categoria: "fisioterapeuta", role: "adm_silver",
    descricao: "Evolução de fisioterapia no prontuário.",
    grants: p({ overview: "leitura", ps: "leitura", leitos: "leitura", paciente: "escrita" }),
  },
  {
    chave: "nutricionista", nome: "Nutricionista", categoria: "nutricionista", role: "adm_silver",
    descricao: "Avaliação e evolução nutricional.",
    grants: p({ overview: "leitura", leitos: "leitura", paciente: "escrita" }),
  },
  {
    chave: "assistente_social", nome: "Assistente Social", categoria: "assistente_social", role: "adm_silver",
    descricao: "Avaliação social, apoio à alta.",
    grants: p({ overview: "leitura", ambulatorio: "leitura", leitos: "leitura", paciente: "escrita" }),
  },

  // ── Farmácia ─────────────────────────────────────────────
  {
    chave: "farmaceutico", nome: "Farmacêutico(a)", categoria: "farmaceutico", role: "adm_silver",
    descricao: "Farmácia clínica, dispensação, controlados e intervenção farmacêutica.",
    grants: p({ overview: "leitura", ps: "leitura", leitos: "leitura", scih: "leitura",
                farmacia: "escrita", controlados: "escrita", suprimentos: "leitura",
                paciente: "leitura", print: "leitura" }),
  },
  {
    chave: "aux_farmacia", nome: "Auxiliar de Farmácia", categoria: "administrativo", role: "adm_silver",
    descricao: "Dispensação e estoque da farmácia. Não acessa prontuário.",
    // Controlados só em leitura: a escrituração do livro é responsabilidade
    // do farmacêutico responsável técnico (Portaria 344/98).
    grants: p({ farmacia: "escrita", controlados: "leitura", suprimentos: "leitura" }),
  },

  // ── Administrativos e apoio ──────────────────────────────
  {
    chave: "recepcao", nome: "Recepção / Admissão", categoria: "administrativo", role: "adm_silver",
    descricao: "Cadastro, chegada e agendamento. NÃO acessa prontuário (COFEN 754/2024, art. 6º).",
    grants: p({ overview: "leitura", ambulatorio: "escrita", ps: "escrita", leitos: "leitura" }),
  },
  {
    chave: "faturamento", nome: "Faturamento", categoria: "administrativo", role: "analista",
    descricao: "Produção e movimento para faturamento. NÃO acessa prontuário.",
    grants: p({ overview: "leitura", ambulatorio: "leitura", leitos: "leitura", print: "leitura" }),
  },
  {
    chave: "almoxarifado", nome: "Almoxarifado / Suprimentos", categoria: "administrativo", role: "adm_silver",
    descricao: "Materiais, estoque, compras e inventário. Sem acesso assistencial.",
    grants: p({ suprimentos: "escrita" }),
  },
  {
    chave: "gestao", nome: "Gestão / Diretoria", categoria: "administrativo", role: "analista",
    descricao: "Indicadores e BI de todos os módulos. Gestão trabalha com número agregado — não precisa de prontuário individual.",
    grants: p({ overview: "leitura", ambulatorio: "leitura", ps: "leitura", bloco: "leitura",
                leitos: "leitura", scih: "leitura", farmacia: "leitura", suprimentos: "leitura",
                print: "leitura", auditoria: "leitura" }),
  },
  {
    chave: "diretor_tecnico", nome: "Diretor(a) Técnico(a)", categoria: "medico", role: "adm_silver",
    descricao: "Responsável pelo prontuário da instituição (CFM 1.638/2002, art. 2º): acessa tudo do assistencial e a trilha de auditoria.",
    grants: p({ overview: "leitura", ambulatorio: "leitura", ps: "escrita", bloco: "leitura",
                leitos: "leitura", scih: "leitura", paciente: "escrita", farmacia: "leitura",
                controlados: "leitura", suprimentos: "leitura", print: "leitura", auditoria: "escrita" }),
  },
  {
    chave: "ti", nome: "TI / Analista de Sistemas", categoria: "administrativo", role: "adm_master",
    descricao: "Administra o sistema: cria usuários, configura perfis, importa e acessa o banco. Não tem competência clínica.",
    sistema: true,   // não pode ser apagado — é a porta de volta
    grants: p({ overview: "escrita", ambulatorio: "escrita", ps: "escrita", bloco: "escrita",
                leitos: "escrita", scih: "escrita", paciente: "escrita", farmacia: "escrita",
                controlados: "escrita", suprimentos: "escrita", print: "escrita",
                auditoria: "escrita", import: "escrita", supabase: "escrita", users: "escrita" }),
  },
];

export const PERFIL_POR_CHAVE = Object.fromEntries(PERFIS_MODELO.map(x => [x.chave, x]));
