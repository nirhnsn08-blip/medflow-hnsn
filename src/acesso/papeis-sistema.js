// ═══════════════════════════════════════════════════════════
// OS PAPÉIS DE SISTEMA
//
// Quatro, e não se confundem com as CATEGORIAS profissionais de
// ../clinico/papeis.js: aqui é o que a pessoa pode fazer no software
// (criar usuário, importar, só ler); lá é o que ela é no hospital (médico,
// enfermeiro, farmacêutico).
//
// 🔴 As CHAVES são gravadas em `profiles.role` e lidas pelas políticas de
// RLS do banco. Renomear uma aqui não quebra nada visível: o valor gravado
// deixa de casar, a pessoa aparece sem papel na tela — e continua com o
// acesso que o banco lhe dá, porque o RLS lê a coluna, não esta tabela.
// ═══════════════════════════════════════════════════════════

export const ROLES = {
  adm_master:   { label: "ADM Master",   color: "#f59e0b", desc: "Acesso total — único que cria usuários, acessa banco e auditoria" },
  adm_silver:   { label: "ADM Silver",   color: "#22d3ee", desc: "Insere dados, importa, auditoria e gera dashboard" },
  analista:     { label: "Analista",     color: "#38bdf8", desc: "Visualiza e gera dashboard para impressão" },
  visualizador: { label: "Visualizador", color: "var(--text-muted)", desc: "Somente leitura — sem gerar dashboard" },
};
