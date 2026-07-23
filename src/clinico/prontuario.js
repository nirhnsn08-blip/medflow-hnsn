// ═══════════════════════════════════════════════════════════
// PRONTUÁRIO DO PACIENTE INTERNADO — regras de leitura
//
// PROBLEMA QUE RESOLVE
// Todo o aparato clínico do sistema (prescrição, evolução, checagem de
// medicação) vivia dentro do modal do Pronto-Socorro. O paciente
// INTERNADO — que é quem passa dias recebendo medicação — não tinha nada.
//
// Estas funções derivam o estado clínico a partir de tabelas append-only.
// Nenhuma delas escreve; nenhuma depende de React, DOM ou rede. Por isso
// são testáveis, e é onde mora a lógica que não pode errar.
//
// O PRINCÍPIO DO APPEND-ONLY
// Nada é alterado no lugar. Um item suspenso não vira "suspenso" na linha
// original: nasce um EVENTO apontando para ele. O estado atual é sempre
// derivado — a última palavra sobre cada item. Isso é exigência legal
// (CFM 1.638/2002 art. 5º), e tem um efeito colateral bom: o histórico
// completo fica disponível de graça.
// ═══════════════════════════════════════════════════════════

// ── EPISÓDIO ────────────────────────────────────────────────

/** O episódio aberto do paciente (sem alta). Só pode haver um. */
export function episodioAtivo(episodios) {
  const lista = Array.isArray(episodios) ? episodios : [];
  return lista.find(e => (e.status || "aberto") === "aberto" && !e.alta_em) || null;
}

/** Dias de internação até agora (ou até a alta). */
export function diasInternacao(episodio, agora = new Date()) {
  if (!episodio?.admissao_em) return null;
  const ini = new Date(episodio.admissao_em);
  const fim = episodio.alta_em ? new Date(episodio.alta_em) : agora;
  return Math.max(0, Math.floor((fim - ini) / 86400000));
}

// ── PRESCRIÇÃO ──────────────────────────────────────────────

// Um item pode receber vários eventos ao longo da internação
// (suspender → reativar → suspender). Vale o último.
const PESO_EVENTO = { suspenso: "suspenso", reativado: "ativo", encerrado: "encerrado" };

/**
 * Estado atual de cada item, derivado dos eventos.
 * Devolve um mapa { item_id: "ativo" | "suspenso" | "encerrado" }.
 */
export function estadoDosItens(eventos) {
  const porItem = {};
  for (const ev of (Array.isArray(eventos) ? eventos : [])) {
    if (!ev.item_id) continue;
    const anterior = porItem[ev.item_id];
    // "último" pela data; empate desempata pelo id (append-only cresce)
    if (!anterior || new Date(ev.criado_em) > new Date(anterior.criado_em)
        || (new Date(ev.criado_em).getTime() === new Date(anterior.criado_em).getTime() && ev.id > anterior.id)) {
      porItem[ev.item_id] = ev;
    }
  }
  const estado = {};
  for (const [id, ev] of Object.entries(porItem)) {
    estado[id] = PESO_EVENTO[ev.evento] || "ativo";
  }
  return estado;
}

/**
 * A prescrição que vale hoje. Uma prescrição substituída por outra
 * (`substitui_id`) sai de cena — é o "represcrever" do dia seguinte.
 */
export function prescricaoVigente(prescricoes, dataRef = null) {
  const lista = (Array.isArray(prescricoes) ? prescricoes : []).filter(p => p.assinada_em);
  if (!lista.length) return null;
  const substituidas = new Set(lista.map(p => p.substitui_id).filter(Boolean));
  const vivas = lista.filter(p => !substituidas.has(p.id));
  const doDia = dataRef ? vivas.filter(p => p.data_referencia === dataRef) : vivas;
  const alvo = doDia.length ? doDia : vivas;
  // mais recente primeiro
  return [...alvo].sort((a, b) => new Date(b.assinada_em) - new Date(a.assinada_em))[0] || null;
}

/** Itens ativos de uma prescrição, já com o estado derivado dos eventos. */
export function itensAtivos(itens, eventos) {
  const estado = estadoDosItens(eventos);
  return (Array.isArray(itens) ? itens : [])
    .map(i => ({ ...i, estado: estado[i.id] || "ativo" }))
    .filter(i => i.estado === "ativo")
    .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
}

// ── APRAZAMENTO ─────────────────────────────────────────────

/**
 * Gera os horários do dia para um item, a partir da frequência.
 *
 * Regra adotada: distribui as doses uniformemente em 24h a partir de um
 * horário âncora. NÃO usa `new Date()` internamente — recebe a data — para
 * ser testável e para não repetir o bug de fuso que o projeto já teve
 * (o banco roda em UTC; após as 21h no Brasil `current_date` já é amanhã).
 *
 * "Se necessário" (SOS) não gera horário: por definição não tem hora marcada.
 */
export function horariosDoDia(item, dataBase, horaAncora = 6) {
  if (!item || item.se_necessario) return [];
  const freq = Number(item.frequencia_dia) || 0;
  const intervalo = Number(item.intervalo_horas) || (freq ? 24 / freq : 0);
  if (!intervalo || intervalo <= 0) return [];

  const base = new Date(dataBase);
  base.setHours(horaAncora, 0, 0, 0);
  const horarios = [];
  // O "dia" da prescrição são as 24h a partir da âncora, NÃO o dia civil.
  // Em 6/6h ancorado às 06h, a quarta dose cai à meia-noite e pertence a
  // esta prescrição — cortar por data do calendário a faria sumir, e a
  // dose que some é a que ninguém administra.
  for (let h = 0; h < 24; h += intervalo) {
    horarios.push(new Date(base.getTime() + h * 3600000));
  }
  return horarios;
}

/**
 * Cruza o planejado com o realizado.
 * Devolve, para cada horário: se já foi administrado, e se está atrasado.
 */
export function checarAprazamento(horarios, administracoes, agora = new Date(), toleranciaMin = 60) {
  const feitas = (Array.isArray(administracoes) ? administracoes : [])
    .filter(a => (a.status || "administrado") === "administrado")
    .map(a => new Date(a.administrado_em || a.criado_em).getTime())
    .sort((a, b) => a - b);
  const usadas = new Set();
  const slots = [...(horarios || [])].sort((a, b) => a - b);

  // Casa cada administração com o horário previsto que ela cumpre.
  //
  // A regra NÃO é "a mais próxima dentro da tolerância". Uma dose das 06h
  // administrada às 09h continua sendo a dose das 06h — dada com atraso,
  // mas dada. Tratá-la como não-casada faria a tela dizer que a dose foi
  // PULADA, que é uma afirmação clínica diferente e mais grave.
  //
  // Então: cada administração cumpre o último horário previsto igual ou
  // anterior a ela que ainda não foi cumprido. O atraso vira um atributo
  // do cumprimento, não a sua negação.
  const cumprido = new Map();   // índice do slot -> instante em que foi dado
  for (const f of feitas) {
    let alvo = -1;
    for (let k = 0; k < slots.length; k++) {
      if (usadas.has(k)) continue;
      if (slots[k].getTime() <= f + toleranciaMin * 60000) alvo = k;   // o último que já venceu
      else break;
    }
    if (alvo >= 0) { usadas.add(alvo); cumprido.set(alvo, f); }
  }

  return slots.map((h, k) => {
    const alvo = h.getTime();
    const quando = cumprido.get(k);
    const administrado = quando != null;
    return {
      horario: h,
      administrado,
      // administrado, porém fora da janela: o registro tem que preservar
      // essa informação — é dado de qualidade assistencial.
      administradoComAtraso: administrado && quando > alvo + toleranciaMin * 60000,
      atrasado: !administrado && agora.getTime() > alvo + toleranciaMin * 60000,
      pendente: !administrado && agora.getTime() <= alvo + toleranciaMin * 60000,
    };
  });
}

// ── SINAIS VITAIS ───────────────────────────────────────────

/**
 * Série temporal já resolvida (correções aplicadas), do mais antigo ao
 * mais novo — é a ordem que gráfico espera.
 */
export function serieSinaisVitais(registros) {
  const lista = Array.isArray(registros) ? registros : [];
  const corrigidos = new Set(lista.map(r => r.corrige_id).filter(Boolean));
  return lista
    .filter(r => !corrigidos.has(r.id))
    .sort((a, b) => new Date(a.aferido_em || a.criado_em) - new Date(b.aferido_em || b.criado_em));
}

/**
 * NEWS simplificado (National Early Warning Score) — detecção de
 * deterioração clínica. Padrão do NHS, adotado amplamente no Brasil.
 *
 * APOIO À DECISÃO: não substitui avaliação. Devolve null quando faltam
 * dados demais — pontuar com metade dos parâmetros dá falsa segurança.
 */
export function scoreAlertaPrecoce(sv) {
  if (!sv) return null;
  const pontos = [];
  const p = (v, faixas) => {
    // NaN precisa ser barrado explicitamente: `Number(undefined)` é NaN, e
    // NaN não é null nem "". Sem esta guarda, parâmetro AUSENTE caía no
    // fallback "extremo" e somava 3 pontos — inflando o escore justamente
    // por falta de dado. Um paciente estável mal aferido viraria crítico.
    if (v == null || v === "" || Number.isNaN(v)) return;
    for (const [min, max, score] of faixas) if (v >= min && v <= max) return pontos.push(score);
    pontos.push(3); // fora de todas as faixas = extremo de verdade
  };

  p(Number(sv.fr),      [[12, 20, 0], [21, 24, 2], [9, 11, 1]]);
  p(Number(sv.spo2),    [[96, 100, 0], [94, 95, 1], [92, 93, 2]]);
  p(Number(sv.temp),    [[36.1, 38.0, 0], [38.1, 39.0, 1], [35.1, 36.0, 1]]);
  p(Number(sv.pa_sist), [[111, 219, 0], [101, 110, 1], [91, 100, 2]]);
  p(Number(sv.fc),      [[51, 90, 0], [91, 110, 1], [111, 130, 2], [41, 50, 1]]);
  if (sv.consciencia && sv.consciencia !== "A") pontos.push(3);

  if (pontos.length < 3) return null;   // dados insuficientes
  const total = pontos.reduce((a, b) => a + b, 0);
  return {
    score: total,
    nivel: total >= 7 ? "alto" : total >= 5 ? "medio" : total >= 1 ? "baixo" : "normal",
    parametros: pontos.length,
    conduta: total >= 7 ? "Avaliação médica imediata e considerar cuidados intensivos."
           : total >= 5 ? "Avaliação médica urgente. Aumentar frequência das aferições."
           : total >= 1 ? "Manter monitorização; reavaliar conforme protocolo."
           : "Manter rotina de aferição.",
  };
}

// ── TIMELINE ────────────────────────────────────────────────

/**
 * Une os registros do episódio numa linha do tempo única.
 * Mesmo formato já usado pelo Paciente 360, para reaproveitar o renderer.
 */
export function timelineEpisodio({ evolucoes = [], prescricoes = [], administracoes = [], sinais = [], anotacoes = [] }) {
  const ev = [];
  const add = (quando, modulo, cor, titulo, detalhe) => {
    if (quando) ev.push({ quando: new Date(quando), modulo, cor, titulo, detalhe });
  };

  for (const e of evolucoes)      add(e.criado_em, "Evolução", "#2dd4bf", e.tipo || "Evolução", (e.texto || "").slice(0, 220));
  for (const p of prescricoes)    add(p.assinada_em || p.criado_em, "Prescrição", "#3b82f6", `Prescrição ${p.tipo || "médica"} assinada`, p.prescritor_nome || p.usuario || "");
  for (const a of administracoes) add(a.administrado_em || a.criado_em, "Medicação", "#a78bfa",
                                      (a.status === "nao_administrado" ? "Não administrado: " : "Administrado: ") + (a.medicamento_nome || a.descricao || ""),
                                      a.motivo || "");
  for (const s of serieSinaisVitais(sinais)) {
    const partes = [s.pa_sist && `PA ${s.pa_sist}/${s.pa_diast || "?"}`, s.fc && `FC ${s.fc}`,
                    s.temp && `T ${s.temp}°`, s.spo2 && `SpO₂ ${s.spo2}%`].filter(Boolean);
    add(s.aferido_em || s.criado_em, "Sinais vitais", "#f59e0b", "Aferição", partes.join(" · "));
  }
  for (const a of anotacoes)      add(a.criado_em, "Enfermagem", "#34d399", a.tipo || "Anotação", (a.texto || "").slice(0, 220));

  return ev.sort((a, b) => b.quando - a.quando);
}
