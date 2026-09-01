// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — CATÁLOGO
//
// Os seis estados da cirurgia, os motivos de cancelamento e o Checklist de
// Cirurgia Segura da OMS.
//
// 🔴 O CHECKLIST TEM TRÊS FASES E A ORDEM É A DO PROTOCOLO:
// Sign In antes da indução anestésica, Time Out antes da incisão, Sign Out
// antes de o paciente deixar a sala. Trocar a ordem, ou permitir pular uma,
// desmonta a única barreira que existe contra cirurgia em lado errado.
//
// ⚠️ `CC_MOTIVOS_CANCELAMENTO` não é lista de conveniência: é o que alimenta
// o indicador de cancelamento por causa evitável. Juntar "falta de material"
// com "condição clínica" faria o hospital parar de enxergar o que ele
// poderia ter resolvido.
//
// 🔴 As CHAVES de `CC_STATUS` são gravadas em `cc_cirurgias.status`.
// Renomear uma aqui não quebra nada visível: a cirurgia gravada some do
// filtro e aparece sem cor no mapa do dia.
// ═══════════════════════════════════════════════════════════

export const CC_STATUS = {
  agendada:    { label: "Agendada",          cor: "#8d99ab" },
  checkin:     { label: "Check-in feito",    cor: "#3b82f6" },
  em_cirurgia: { label: "Em cirurgia",       cor: "#22d3ee" },
  recuperacao: { label: "Recuperação (RPA)", cor: "#d97706" },
  concluida:   { label: "Concluída",         cor: "#34d399" },
  cancelada:   { label: "Cancelada",         cor: "#f43f5e" },
};

export const CC_MOTIVOS_CANCELAMENTO = [
  "Condição clínica do paciente", "Jejum inadequado", "Falta de material/OPME",
  "Falta de sala/tempo cirúrgico", "Ausência do paciente", "Ausência do cirurgião",
  "Exames pendentes", "Falta de leito para pós-operatório", "Outro",
];

// Checklist de Cirurgia Segura (OMS) — 3 fases, itens oficiais adaptados
export const CHECKLIST_OMS = {
  sign_in: {
    campo: "chk_sign_in", label: "Sign In", quando: "antes da indução anestésica", cor: "#3b82f6",
    itens: [
      "Paciente confirmou identidade, sítio cirúrgico, procedimento e consentimento",
      "Sítio cirúrgico demarcado (ou não se aplica)",
      "Verificação de segurança anestésica concluída",
      "Oxímetro de pulso instalado e funcionando",
      "Alergias conhecidas verificadas",
      "Risco de via aérea difícil / broncoaspiração avaliado",
      "Risco de perda sanguínea > 500 ml (7 ml/kg em crianças) avaliado",
    ],
  },
  time_out: {
    campo: "chk_time_out", label: "Time Out", quando: "antes da incisão na pele", cor: "#d97706",
    itens: [
      "Toda a equipe se apresentou pelo nome e função",
      "Confirmado em voz alta: paciente, sítio e procedimento",
      "Antibiótico profilático administrado nos últimos 60 min (ou não se aplica)",
      "Cirurgião revisou: passos críticos, duração e perda sanguínea prevista",
      "Anestesia revisou: particularidades do paciente",
      "Enfermagem revisou: esterilização confirmada e questões de materiais",
      "Exames de imagem essenciais disponíveis na sala (ou não se aplica)",
    ],
  },
  sign_out: {
    campo: "chk_sign_out", label: "Sign Out", quando: "antes de o paciente sair da sala", cor: "#34d399",
    itens: [
      "Nome do procedimento realizado confirmado e registrado",
      "Contagem de compressas, instrumentais e agulhas correta",
      "Amostras cirúrgicas identificadas (nome do paciente) — ou não se aplica",
      "Problemas com equipamentos anotados para correção",
      "Equipe revisou as preocupações para a recuperação do paciente",
    ],
  },
};
