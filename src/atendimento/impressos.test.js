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
  rotuloDominio, dadosDaFicha,
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
