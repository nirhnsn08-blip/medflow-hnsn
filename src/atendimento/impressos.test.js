// ═══════════════════════════════════════════════════════════
// OS IMPRESSOS DA RECEPÇÃO
//
// Quatro coisas aqui são regra, não detalhe:
//
//   1. LOCALIZAÇÃO NÃO IDENTIFICA. Leito, quarto e box mudam durante a
//      internação — e o dia em que dois pacientes trocam de leito é
//      exatamente o dia em que alguém confere pela placa da cama. É a regra
//      central do Protocolo de Identificação do Paciente (PNSP).
//   2. A PULSEIRA NÃO CARREGA NADA CLÍNICO. Ela fica visível no corredor
//      inteiro. CID, queixa e alergia no pulso é diagnóstico exposto a
//      quem passa.
//   3. DATA CIVIL NÃO PASSA POR `new Date`. Este sistema já teve o bug de
//      fuso duas vezes; numa pulseira ele vira data de nascimento errada no
//      documento que existe para conferir a data de nascimento.
//   4. "NINGUÉM PERGUNTOU" NÃO É "NÃO TEM ALERGIA". Imprimir um pelo outro
//      é a mentira mais cara que esta ficha poderia contar.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  MINIMO_IDENTIFICADORES, NAO_IDENTIFICAM, dataBR, dataHoraBR,
  identificadoresDoPaciente, conferirPulseira, dadosDaPulseira,
  rotuloDominio, dadosDaFicha, horaBR,
  declaracaoDeComparecimento, comprovanteDeAgendamento, ANTECEDENCIA_MINUTOS, O_QUE_TRAZER,
} from "./impressos.js";
import { TIPO_NENHUMA } from "../clinico/alergias.js";

const HOJE = new Date("2026-07-30T10:00:00");

const pac = (over = {}) => ({
  prontuario: "100042", nome_completo: "Maria Aparecida da Silva",
  data_nascimento: "1957-03-04", nome_mae: "Joana da Silva",
  sexo: "F", cpf: "52998224725", cns: "898001160650005", ...over,
});

const at = (over = {}) => ({
  id: 77, prontuario: "100042", status: "aguardando_triagem",
  chegada_em: "2026-07-30T12:30:00Z", tipo_atendimento: "emergencia",
  origem: "SAMU", ...over,
});

describe("data civil não passa por new Date", () => {
  it("formata sem voltar um dia", () => {
    expect(dataBR("1957-03-04")).toBe("04/03/1957");
    expect(dataBR("2026-01-01")).toBe("01/01/2026");
    // A borda que o fuso quebra: primeiro dia do mês vira o último do
    // anterior quando se converte para UTC.
    expect(dataBR("2026-03-01")).toBe("01/03/2026");
  });

  it("aceita timestamp completo e ignora a hora", () => {
    expect(dataBR("1957-03-04T23:30:00Z")).toBe("04/03/1957");
  });

  it("devolve vazio para lixo, em vez de 'Invalid Date' impresso", () => {
    expect(dataBR(null)).toBe("");
    expect(dataBR("")).toBe("");
    expect(dataBR("04/03/1957")).toBe("");
    expect(dataHoraBR("nem data")).toBe("");
    expect(dataHoraBR(null)).toBe("");
  });
});

describe("identificadores", () => {
  it("são os quatro do protocolo, na ordem da conferência", () => {
    expect(identificadoresDoPaciente(pac()).map(i => i.chave))
      .toEqual(["nome", "data_nascimento", "nome_mae", "prontuario"]);
  });

  it("o número do ATENDIMENTO nunca é identificador — ele muda a cada visita", () => {
    const ids = identificadoresDoPaciente(pac());
    expect(ids.some(i => String(i.valor).includes("77"))).toBe(false);
    const d = dadosDaPulseira({ paciente: pac(), atendimento: at(), agora: HOJE });
    expect(d.identificadores.some(i => i.chave === "atendimento")).toBe(false);
    // continua aparecendo como CONTEXTO, que é outra coisa
    expect(d.contexto.some(c => c.valor === "#77")).toBe(true);
  });

  it("só entra o que existe — cadastro magro não inventa campo", () => {
    const ids = identificadoresDoPaciente({ prontuario: "9061", iniciais: "NÃO IDENTIFICADO" });
    expect(ids.map(i => i.chave)).toEqual(["prontuario"]);
  });

  it("INICIAIS não são identificador — nem 'NÃO IDENTIFICADO', nem 'J.S.M.'", () => {
    // Se as iniciais contassem, dois pacientes sem nome fechariam o
    // protocolo com dois identificadores cada — e idênticos entre si.
    for (const iniciais of ["NÃO IDENTIFICADO", "J.S.M."]) {
      const ids = identificadoresDoPaciente({ prontuario: "9061", iniciais });
      expect(ids.some(i => i.chave === "nome"), iniciais).toBe(false);
    }
    expect(conferirPulseira({ prontuario: "9061", iniciais: "J.S.M." }).estado).toBe("insuficiente");
  });

  it("mas a pulseira ainda IMPRIME as iniciais — melhor que pulso em branco", () => {
    const d = dadosDaPulseira({ paciente: { prontuario: "9061", iniciais: "NÃO IDENTIFICADO" }, agora: HOJE });
    expect(d.nome).toBe("NÃO IDENTIFICADO");
  });

  it("prefere o nome social, que é direito do paciente", () => {
    const ids = identificadoresDoPaciente(pac({ nome_social: "Marina da Silva" }));
    expect(ids[0].valor).toBe("Marina da Silva");
  });

  it("sem paciente não devolve identificador nenhum", () => {
    expect(identificadoresDoPaciente(null)).toEqual([]);
    expect(identificadoresDoPaciente(undefined)).toEqual([]);
  });
});

describe("localização NUNCA identifica (PNSP)", () => {
  it("leito, quarto e box não aparecem na pulseira, mesmo gravados", () => {
    const sujo = pac({ leito: "12-A", quarto: "204", cama: "B", box: "3", sala: "Vermelha" });
    const d = dadosDaPulseira({
      paciente: sujo,
      atendimento: at({ leito: "12-A", sala: "Vermelha", box: "3" }),
      agora: HOJE,
    });
    const impresso = JSON.stringify(d).toLowerCase();
    for (const proibido of NAO_IDENTIFICAM) {
      expect(impresso, proibido).not.toContain(`"${proibido}"`);
    }
    expect(impresso).not.toContain("12-a");
    expect(impresso).not.toContain("vermelha");
  });

  it("a lista de campos proibidos não está vazia", () => {
    // Trava a mutação óbvia: esvaziar NAO_IDENTIFICAM faria o teste acima
    // passar sem conferir nada.
    expect(NAO_IDENTIFICAM.length).toBeGreaterThan(3);
    expect(NAO_IDENTIFICAM).toContain("leito");
  });
});

describe("a pulseira não carrega nada clínico", () => {
  it("CID, queixa, classificação e alergia ficam fora", () => {
    const d = dadosDaPulseira({
      paciente: pac({ alergias: "Penicilina" }),
      atendimento: at({ cid: "I10", queixa: "dor no peito", classificacao: "vermelho", alergias: "Penicilina" }),
      agora: HOJE,
    });
    const impresso = JSON.stringify(d).toLowerCase();
    // Os VALORES não podem vazar…
    for (const proibido of ["i10", "dor no peito", "vermelho", "penicilina"]) {
      expect(impresso, proibido).not.toContain(proibido);
    }
    // …e as CHAVES vão entre aspas de propósito: "cid" solto casa com
    // "Aparecida" e o teste passaria a mentir que confere alguma coisa.
    for (const chave of ["cid", "queixa", "classificacao", "alergias"]) {
      expect(impresso, chave).not.toContain(`"${chave}"`);
    }
  });
});

describe("conferirPulseira", () => {
  it("dois identificadores fecham o protocolo", () => {
    const c = conferirPulseira({ prontuario: "100042", nome_completo: "Maria Aparecida da Silva" });
    expect(c.estado).toBe("ok");
    expect(c.selo).toBeNull();
    expect(c.identificadores.length).toBeGreaterThanOrEqual(MINIMO_IDENTIFICADORES);
  });

  it("um só identificador é insuficiente — e a pulseira sai carimbada", () => {
    const c = conferirPulseira({ prontuario: "100042" });
    expect(c.estado).toBe("insuficiente");
    expect(c.selo).toBe("IDENTIFICAÇÃO INCOMPLETA");
    expect(c.aviso).toMatch(/nascimento/i);
  });

  it("paciente sem identificação é PROVISÓRIA, não falha de preenchimento", () => {
    const c = conferirPulseira({ prontuario: "9061", iniciais: "NÃO IDENTIFICADO", nao_identificado: true });
    expect(c.estado).toBe("provisoria");
    expect(c.selo).toBe("IDENTIFICAÇÃO PROVISÓRIA");
  });

  it("quem já foi identificado deixa de ser provisório", () => {
    const c = conferirPulseira(pac({ nao_identificado: true, identificado_em: "2026-07-30T11:00:00Z" }));
    expect(c.estado).toBe("ok");
  });

  it("nunca impede a impressão — todo estado devolve identificadores", () => {
    for (const p of [{ prontuario: "1" }, pac(), { prontuario: "9061", nao_identificado: true }]) {
      expect(Array.isArray(conferirPulseira(p).identificadores)).toBe(true);
    }
  });
});

describe("dadosDaPulseira", () => {
  it("mostra o nome social em destaque e guarda o civil abaixo", () => {
    const d = dadosDaPulseira({ paciente: pac({ nome_social: "Marina da Silva" }), agora: HOJE });
    expect(d.nome).toBe("Marina da Silva");
    expect(d.nomeRegistro).toBe("Maria Aparecida da Silva");
  });

  it("sem nome social não repete o mesmo nome duas vezes", () => {
    expect(dadosDaPulseira({ paciente: pac(), agora: HOJE }).nomeRegistro).toBeNull();
  });

  it("traz idade e sexo como contexto", () => {
    const d = dadosDaPulseira({ paciente: pac(), atendimento: at(), agora: HOJE });
    expect(d.contexto.find(c => c.label === "Idade").valor).toBe("69 anos");
    expect(d.contexto.find(c => c.label === "Sexo").valor).toBe("Feminino");
  });

  it("cadastro sem data de nascimento não vira idade chutada", () => {
    const d = dadosDaPulseira({ paciente: pac({ data_nascimento: null }), agora: HOJE });
    expect(d.contexto.some(c => c.label === "Idade")).toBe(false);
  });
});

describe("rotuloDominio", () => {
  it("troca o código pelo nome cadastrado", () => {
    const cat = { especialidade: [{ codigo: "ORTO", nome: "Ortopedia" }] };
    expect(rotuloDominio(cat, "especialidade", "ORTO")).toBe("Ortopedia");
  });

  it("catálogo vazio devolve o próprio código, e não uma linha em branco", () => {
    expect(rotuloDominio({}, "especialidade", "ORTO")).toBe("ORTO");
    expect(rotuloDominio(null, "especialidade", "ORTO")).toBe("ORTO");
  });

  it("sem código não imprime nada", () => {
    expect(rotuloDominio({}, "especialidade", null)).toBe("");
    expect(rotuloDominio({}, "especialidade", "  ")).toBe("");
  });
});

describe("ficha do atendimento", () => {
  const base = {
    paciente: pac(), atendimento: at({ queixa: "dor no peito" }),
    hospital: { nome: "Hospital Nossa Senhora de Navegantes", sigla: "HNSN" },
    usuario: { name: "adauam_feistler" }, agora: HOJE,
  };

  it("quem NÃO consultou não imprime negativa — nem 'sem registro'", () => {
    // A recepção não lê prontuário (COFEN 754/2024, art. 6º). Uma negativa
    // que ninguém apurou, no papel que acompanha o paciente até o leito, é
    // pior do que a ausência do campo.
    const f = dadosDaFicha(base);                     // sem passar `alergias`
    expect(f.alergias.estado).toBe("nao_consultado");
    expect(f.alergias.texto).toMatch(/não consultado/i);
    expect(f.alergias.texto).not.toMatch(/nega|sem registro/i);
    expect(dadosDaFicha({ ...base, alergias: null }).alergias.estado).toBe("nao_consultado");
  });

  it("'ninguém perguntou' não é impresso como 'não tem alergia'", () => {
    const f = dadosDaFicha({ ...base, alergias: [] });
    expect(f.alergias.estado).toBe("sem_registro");
    expect(f.alergias.texto).toMatch(/sem registro/i);
    expect(f.alergias.texto).not.toMatch(/nega/i);
  });

  it("paciente que negou alergia sai como negativa registrada", () => {
    const f = dadosDaFicha({ ...base, alergias: [{ id: 1, tipo: TIPO_NENHUMA, agente: "Nenhuma conhecida", situacao: "ativa" }] });
    expect(f.alergias.estado).toBe("nenhuma");
    expect(f.alergias.texto).toMatch(/nega alergias/i);
  });

  it("alergia vigente é impressa pelo nome", () => {
    const f = dadosDaFicha({ ...base, alergias: [{ id: 1, agente: "Penicilina", situacao: "ativa" }] });
    expect(f.alergias.estado).toBe("com_alergia");
    expect(f.alergias.texto).toContain("Penicilina");
  });

  it("campo vazio não vira linha em branco no papel", () => {
    const f = dadosDaFicha({ ...base, paciente: { prontuario: "9061", iniciais: "NÃO IDENTIFICADO" } });
    expect(f.identificacao.every(l => String(l.valor).trim())).toBe(true);
    expect(f.pagadora).toEqual([]);
  });

  it("a queixa é impressa como relato, separada da classificação", () => {
    const f = dadosDaFicha(base);
    expect(f.queixa).toBe("dor no peito");
    expect(f.classificacao.some(c => c.valor === "dor no peito")).toBe(false);
  });

  it("resolve os códigos de classificação pelos catálogos", () => {
    const f = dadosDaFicha({
      ...base,
      atendimento: at({ especialidade_cod: "ORTO", carater_cod: "U" }),
      catalogos: { especialidade: [{ codigo: "ORTO", nome: "Ortopedia" }] },
    });
    expect(f.classificacao.find(c => c.label === "Especialidade").valor).toBe("Ortopedia");
    // código sem cadastro continua aparecendo, senão o dado some do papel
    expect(f.classificacao.find(c => c.label === "Caráter").valor).toBe("U");
  });

  it("acidente de trabalho é impresso com a consequência junto", () => {
    const f = dadosDaFicha({ ...base, atendimento: at({ acidente_trabalho: true }) });
    expect(f.classificacao.find(c => c.label === "Acidente de trabalho").valor).toMatch(/CAT/);
  });

  it("o rodapé registra quem imprimiu e quando", () => {
    const f = dadosDaFicha(base);
    expect(f.rodape.impressoPor).toBe("adauam_feistler");
    expect(f.rodape.impressoEm).toMatch(/30\/07\/2026/);
  });

  it("sem usuário identificado o rodapé não inventa um nome", () => {
    const f = dadosDaFicha({ ...base, usuario: null });
    expect(f.rodape.impressoPor).toBe("—");
  });

  it("imprime o responsável com o papel — é o que impede entregar a criança a quem só acompanha", () => {
    const f = dadosDaFicha({
      ...base,
      responsaveis: [
        { nome: "Maria da Silva", vinculo: "mae", papel: "representante", cpf: "52998224725", recebe_alta: true, consente: true },
        { nome: "Vizinha", vinculo: "outro", papel: "acompanhante", recebe_alta: false },
      ],
    });
    expect(f.responsaveis).toHaveLength(2);
    expect(f.responsaveis[0]).toMatchObject({ nome: "Maria da Silva", vinculo: "Mãe", papel: "Representante legal", recebeAlta: true });
    expect(f.responsaveis[1]).toMatchObject({ papel: "Acompanhante", recebeAlta: false });
    expect(f.responsaveis[0].cpf).toBe("529.982.247-25");
  });

  it("responsável desligado não sai no papel de hoje", () => {
    const f = dadosDaFicha({
      ...base,
      responsaveis: [{ nome: "Ex-guardião", papel: "representante", ativo: false }],
    });
    expect(f.responsaveis).toEqual([]);
  });

  it("sem responsável a seção não existe, em vez de sair vazia", () => {
    expect(dadosDaFicha(base).responsaveis).toEqual([]);
  });

  it("carrega o estado da pulseira junto — é o mesmo balcão", () => {
    const f = dadosDaFicha({ ...base, paciente: { prontuario: "1" } });
    expect(f.pulseira.estado).toBe("insuficiente");
    expect(f.pulseira.selo).toBe("IDENTIFICAÇÃO INCOMPLETA");
  });

  it("não quebra sem atendimento — a ficha do cadastro também se imprime", () => {
    const f = dadosDaFicha({ paciente: pac(), agora: HOJE });
    expect(f.episodio).toEqual([]);
    expect(f.identificacao.length).toBeGreaterThan(3);
  });
});

// ═══════════════════════════════════════════════════════════
// OS DOIS PAPÉIS QUE O PACIENTE LEVA EMBORA
//
// A pulseira e a ficha ficam no hospital. Estes dois saem pela porta, e
// por isso erram de outro jeito:
//
//   A DECLARAÇÃO DE COMPARECIMENTO vai para o EMPREGADOR. É o único
//   impresso do sistema cujo destinatário não é clínico — e o único em que
//   um CID seria entregar o diagnóstico do trabalhador ao patrão.
//
//   O COMPROVANTE DE AGENDAMENTO é a última chance de conferir o telefone
//   do cadastro com a pessoa na frente. Depois disso, a confirmação da
//   véspera liga para um número errado e ninguém fica sabendo.
// ═══════════════════════════════════════════════════════════

describe("horaBR — as duas formas de hora que a base tem", () => {
  it("hora pura da agenda não passa por new Date", () => {
    // "14:35:00" sozinho não é data: `new Date` devolveria Invalid Date e o
    // horário da consulta sumiria do comprovante.
    expect(horaBR("14:35:00")).toBe("14:35");
    expect(horaBR("14:35")).toBe("14:35");
  });

  it("timestamp completo vira hora local", () => {
    expect(horaBR("2026-08-25T09:07:00")).toBe("09:07");
  });

  it("vazio e lixo não viram hora inventada", () => {
    for (const v of ["", null, undefined, "x"]) expect(horaBR(v)).toBe("");
  });
});

describe("declaração de comparecimento", () => {
  const pacDec = pac({ prontuario: "T9001", cpf: "52998224725" });
  const atFechado = {
    id: 412, chegada_em: "2026-07-30T08:12:00", desfecho_em: "2026-07-30T10:41:00",
    queixa: "dor de cabeça há 3 dias", cid: "I10",
  };

  it("🔴 NÃO carrega NADA clínico — o destinatário é o patrão", () => {
    // CID, queixa e diagnóstico numa declaração de comparecimento entregam
    // o diagnóstico do trabalhador ao empregador. Este teste existe para
    // quebrar quando alguém "só acrescentar o motivo" na folha.
    //
    // A conferência é por CHAVE, e não por substring no documento inteiro.
    // A primeira versão procurava "cid" no JSON e acusava a paciente de
    // teste: Maria Apare*cid*a. Guarda que dá alarme falso é guarda que
    // alguém desliga — e esta protege sigilo de diagnóstico.
    const d = declaracaoDeComparecimento({
      paciente: pacDec, atendimento: atFechado, hospital: { sigla: "HNSN" }, agora: HOJE,
    });

    const chaves = [];
    (function varrer(o) {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) { chaves.push(k.toLowerCase()); varrer(v); }
    })(d);
    for (const proibida of ["cid", "queixa", "diagnostico", "alergias", "setor", "classificacao"])
      expect(chaves, proibida).not.toContain(proibida);

    // e os VALORES clínicos do episódio também não vazam por outro campo
    const texto = JSON.stringify(d).toLowerCase();
    for (const valor of ["i10", "dor de cabeça"])
      expect(texto, valor).not.toContain(valor);
  });

  it("episódio encerrado imprime a saída REAL", () => {
    const d = declaracaoDeComparecimento({ paciente: pacDec, atendimento: atFechado, agora: HOJE });
    expect(d.periodo.entrada).toBe("08:12");
    expect(d.periodo.saida).toBe("10:41");
    expect(d.periodo.saidaEstimada).toBe(false);
  });

  it("🔴 episódio ABERTO não finge que o paciente já saiu", () => {
    // A hora final passa a ser a da emissão, e a folha marca isso. Errar
    // para menos custa uma hora ao paciente; errar para mais é declarar um
    // fato que não aconteceu.
    const d = declaracaoDeComparecimento({
      paciente: pacDec, atendimento: { id: 412, chegada_em: "2026-07-30T08:12:00" }, agora: HOJE,
    });
    expect(d.periodo.saida).toBe("10:00");        // HOJE é 10:00
    expect(d.periodo.saidaEstimada).toBe(true);
  });

  it("sem acompanhante, o titular é o próprio paciente", () => {
    const d = declaracaoDeComparecimento({ paciente: pacDec, atendimento: atFechado, agora: HOJE });
    expect(d.titular.tipo).toBe("paciente");
    expect(d.titular.nome).toBe(d.paciente.nome);
    expect(d.titular.documento).toBe("529.982.247-25");
  });

  it("com acompanhante, o titular é QUEM TROUXE — é o patrão dele que cobra", () => {
    const d = declaracaoDeComparecimento({
      paciente: pacDec, atendimento: atFechado, agora: HOJE,
      acompanhante: { nome: "Rosa Barbosa", vinculo: "mae", cpf: "11144477735" },
    });
    expect(d.titular.tipo).toBe("acompanhante");
    expect(d.titular.nome).toBe("Rosa Barbosa");
    expect(d.titular.documento).toBe("111.444.777-35");
    // e o paciente continua nomeado: é o motivo do comparecimento
    expect(d.paciente.nome).toBeTruthy();
  });

  it("o número do atendimento é o protocolo — e é o único número da folha", () => {
    const d = declaracaoDeComparecimento({ paciente: pacDec, atendimento: atFechado, agora: HOJE });
    expect(d.atendimento).toBe("#412");
  });

  it("não explode sem atendimento nem paciente", () => {
    expect(() => declaracaoDeComparecimento()).not.toThrow();
    expect(() => declaracaoDeComparecimento({ paciente: pacDec })).not.toThrow();
  });
});

describe("comprovante de agendamento", () => {
  const ag = { id: 77, data: "2026-09-14", hora: "14:35" };

  it("traz o que o paciente precisa saber para voltar", () => {
    const c = comprovanteDeAgendamento({
      paciente: pac({ telefone: "5136641234" }), agendamento: ag,
      profissional: { nome: "Dra. Ana Souza" }, especialidade: "Ortopedia",
      tipoAtendimento: "Primeira consulta", hospital: { nome: "HNSN", sigla: "HNSN" }, agora: HOJE,
    });
    const rotulos = c.consulta.map(l => l.label);
    expect(rotulos).toContain("Data");
    expect(rotulos).toContain("Horário");
    expect(rotulos).toContain("Profissional");
    expect(c.consulta.find(l => l.label === "Data").valor).toBe("14/09/2026");
    expect(c.consulta.find(l => l.label === "Horário").valor).toBe("14:35");
    expect(c.antecedenciaMinutos).toBe(ANTECEDENCIA_MINUTOS);
    expect(c.trazer).toEqual(O_QUE_TRAZER);
  });

  it("chegada sem hora marcada DIZ o que é, em vez de virar traço", () => {
    // Quem entra pela fila do dia não tem hora. "—" seria lido como erro
    // de sistema por quem recebe o papel.
    const c = comprovanteDeAgendamento({ paciente: pac(), agendamento: { id: 9, data: "2026-09-14", hora: null }, agora: HOJE });
    expect(c.consulta.find(l => l.label === "Horário").valor).toBe("por ordem de chegada");
  });

  it("🔴 imprime o telefone DO CADASTRO para ser conferido no balcão", () => {
    // É para este número que a confirmação da véspera liga. Conferir com a
    // pessoa na frente é de graça; depois vira telefonema para o vazio.
    const c = comprovanteDeAgendamento({ paciente: pac({ telefone: "5136641234" }), agendamento: ag, agora: HOJE });
    expect(c.contato.telefone).toBe("(51) 3664-1234");
    expect(c.contato.aviso).toMatch(/corrija agora/i);
  });

  it("🔴 sem telefone a folha DIZ isso — a falta é o que precisa ser resolvido", () => {
    const c = comprovanteDeAgendamento({ paciente: pac({ telefone: "" }), agendamento: ag, agora: HOJE });
    expect(c.contato.telefone).toBe("");
    expect(c.contato.aviso).toMatch(/não temos telefone/i);
  });

  it("não explode sem nada", () => {
    expect(() => comprovanteDeAgendamento()).not.toThrow();
  });
});
