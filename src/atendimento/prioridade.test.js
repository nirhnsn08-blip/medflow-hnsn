// ═══════════════════════════════════════════════════════════
// PRIORIDADE LEGAL NO ATENDIMENTO
//
// A fila ordenava por TEMPO DE ESPERA e nada mais. A lei diz outra coisa:
//
//   Lei 10.048/2000, art. 1º — pessoa com deficiência, idoso com 60 anos ou
//   mais, gestante, lactante, pessoa com criança de colo e obeso.
//
//   Estatuto do Idoso, art. 3º, §2º — entre os idosos, o maior de 80 tem
//   prioridade ESPECIAL sobre os demais idosos.
//
// O sistema não errava por conta própria: não sabia que prioridade existe, e
// quem opera o balcão sabe. A ordem real passava a ser combinada por fora da
// tela — e aí o tempo de espera que o relatório mostra deixa de descrever o
// que aconteceu.
//
// DUAS COISAS AQUI SÃO REGRA, NÃO DETALHE:
//   1. Prioridade vem PRIMEIRO; o relógio só desempata dentro do nível.
//   2. Sem data de nascimento NÃO SE CHUTA IDADE. Quem não tem data fica no
//      nível normal e a fila DIZ que a idade é desconhecida — decidir por
//      ela seria dar ou tirar um direito por adivinhação.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  prioridadeLegal, compararNaFila, NIVEIS, CATEGORIAS_SEM_CAMPO,
  IDOSO_ANOS, IDOSO_ESPECIAL_ANOS, CRIANCA_DE_COLO_ANOS, LIMITE_ESPERA_MIN,
} from "./prioridade.js";
import { filaDoAmbulatorio } from "./ciclo.js";

const HOJE = new Date("2026-08-25T10:00:00");
/** Alguém com exatamente `anos` anos hoje. */
const nascidoHa = anos => `${2026 - anos}-08-25`;
const pac = anos => ({ data_nascimento: nascidoHa(anos) });

describe("prioridadeLegal — quem a lei põe na frente", () => {
  it("🔴 maior de 80 tem prioridade ESPECIAL sobre os demais idosos", () => {
    // Estatuto do Idoso, art. 3º, §2º. É o nível que passa até na frente de
    // outro idoso — sem ele, a lei estaria só metade implementada.
    const r = prioridadeLegal({ paciente: pac(82), agora: HOJE });
    expect(r.nivel).toBe(2);
    expect(r.chave).toBe("especial");
    expect(r.norma).toMatch(/Estatuto do Idoso/);
  });

  it("vale a partir de 80 COMPLETOS, e a fronteira usa o NÚMERO DA LEI", () => {
    // 🔴 A primeira versão deste teste comparava com `IDOSO_ESPECIAL_ANOS`,
    // e por isso não provava nada: trocar a constante para 81 mantinha tudo
    // verde, porque o teste se movia junto com o erro. A mutação pegou.
    // Fronteira legal se testa com o número que está na lei, escrito à mão.
    expect(prioridadeLegal({ paciente: pac(80), agora: HOJE }).nivel).toBe(2);
    expect(prioridadeLegal({ paciente: pac(79), agora: HOJE }).nivel).toBe(1);
    expect(IDOSO_ESPECIAL_ANOS).toBe(80);
  });

  it("idoso de 60 a 79 é prioritário — 60 é o número da lei", () => {
    expect(IDOSO_ANOS).toBe(60);
    for (const anos of [60, 65, 79]) {
      const r = prioridadeLegal({ paciente: pac(anos), agora: HOJE });
      expect(r.nivel, String(anos)).toBe(1);
      expect(r.norma).toMatch(/10\.048/);
    }
  });

  it("59 anos NÃO é idoso — a fronteira da lei é 60", () => {
    expect(prioridadeLegal({ paciente: pac(59), agora: HOJE }).nivel).toBe(0);
  });

  it("criança de colo dá prioridade — e o rótulo diz DE QUEM é o direito", () => {
    // A lei fala de "pessoa com criança de colo": o direito é de quem
    // trouxe o bebê. Na fila o paciente é o bebê, e o efeito é o mesmo —
    // mas escrever "o bebê tem prioridade" ensinaria a lei errada.
    const r = prioridadeLegal({ paciente: pac(1), agora: HOJE });
    expect(r.nivel).toBe(1);
    expect(r.motivos.map(m => m.rotulo).join(" ")).toMatch(/quem a trouxe/i);
  });

  it("criança que já anda não é criança de colo", () => {
    expect(CRIANCA_DE_COLO_ANOS).toBe(2);
    expect(prioridadeLegal({ paciente: pac(2), agora: HOJE }).nivel).toBe(0);
    expect(prioridadeLegal({ paciente: pac(7), agora: HOJE }).nivel).toBe(0);
  });

  it("gestante vem do EPISÓDIO, não do cadastro — é estado, não atributo", () => {
    const r = prioridadeLegal({ paciente: pac(30), atendimento: { gestante: true }, agora: HOJE });
    expect(r.nivel).toBe(1);
    expect(r.motivos.some(m => m.chave === "gestante")).toBe(true);
  });

  it("os motivos ACUMULAM — uma gestante de 82 anos é as duas coisas", () => {
    // A tela que mostrar só um dos rótulos parece errada para quem está
    // olhando a pessoa.
    const r = prioridadeLegal({ paciente: pac(82), atendimento: { gestante: true }, agora: HOJE });
    expect(r.nivel).toBe(2);
    expect(r.motivos.map(m => m.chave)).toContain("idoso_especial");
    expect(r.motivos.map(m => m.chave)).toContain("gestante");
  });

  it("🔴 sem data de nascimento NÃO se chuta idade", () => {
    // Decidir por adivinhação daria ou tiraria um direito. Fica normal, e a
    // fila diz que a idade é desconhecida para alguém conferir com a pessoa.
    const r = prioridadeLegal({ paciente: {}, agora: HOJE });
    expect(r.nivel).toBe(0);
    expect(r.motivos.some(m => m.chave === "idade_desconhecida")).toBe(true);
    expect(r.motivos.every(m => m.legal !== true)).toBe(true);
  });

  it("não explode sem nada", () => {
    expect(() => prioridadeLegal()).not.toThrow();
    expect(prioridadeLegal().nivel).toBe(0);
    expect(prioridadeLegal({ paciente: { data_nascimento: "não é data" } }).nivel).toBe(0);
  });

  it("as categorias que o sistema NÃO enxerga estão declaradas", () => {
    // Fila que ordena por prioridade e silencia sobre o que não vê é pior
    // que fila sem prioridade: quem opera passa a confiar na ordem e para de
    // conferir justamente o que depende dele.
    const chaves = CATEGORIAS_SEM_CAMPO.map(c => c.chave);
    expect(chaves).toContain("pcd");
    expect(chaves).toContain("lactante");
    expect(chaves).toContain("obeso");
  });

  it("os níveis são NÚMERO — é por eles que se ordena", () => {
    // Comparar rótulo daria ordem alfabética, que poria "normal" na frente
    // de "prioritário".
    expect(Object.keys(NIVEIS).map(Number).sort()).toEqual([0, 1, 2]);
  });
});

describe("compararNaFila", () => {
  const item = (nivel, esperaMin) => ({ prioridade: { nivel }, esperaMin });

  it("🔴 prioridade vem PRIMEIRO; o relógio só desempata dentro do nível", () => {
    // Quem chegou agora e tem prioridade passa na frente de quem espera há
    // duas horas e não tem. É o que a lei diz.
    expect(compararNaFila(item(2, 1), item(0, 120))).toBeLessThan(0);
    expect(compararNaFila(item(1, 1), item(0, 120))).toBeLessThan(0);
    // e entre iguais, quem espera mais vem antes
    expect(compararNaFila(item(1, 30), item(1, 90))).toBeGreaterThan(0);
  });

  it("especial passa até na frente de outro idoso", () => {
    expect(compararNaFila(item(2, 5), item(1, 200))).toBeLessThan(0);
  });

  it("espera desconhecida vai para o FIM do próprio nível", () => {
    // Sem hora de chegada não se sabe há quanto tempo a pessoa está lá.
    // Mandá-la para o topo tiraria a vez de quem tem a espera comprovada.
    expect(compararNaFila(item(1, null), item(1, 0))).toBeGreaterThan(0);
  });

  it("não explode com item sem prioridade calculada", () => {
    expect(() => [{}, { esperaMin: 5 }].sort(compararNaFila)).not.toThrow();
  });
});

describe("filaDoAmbulatorio com prioridade", () => {
  const chegou = (id, anos, hora, extra = {}) => ({
    id, status: "aguardando_atendimento", chegada_em: `2026-08-25T${hora}:00`,
    pacientes: { data_nascimento: nascidoHa(anos) }, ...extra,
  });

  it("🔴 A SENHORA DE 82 QUE CHEGOU POR ÚLTIMO É CHAMADA PRIMEIRO", () => {
    // O caso que motivou o arquivo: antes, ela era a última porque chegou
    // por último.
    const f = filaDoAmbulatorio([
      chegou(1, 30, "08:00"),   // espera 2h
      chegou(2, 82, "09:55"),   // chegou agora
      chegou(3, 66, "09:50"),
    ], { agora: HOJE });
    expect(f.esperando.map(a => a.id)).toEqual([2, 3, 1]);
  });

  it("marca a espera longa mesmo de quem NÃO tem prioridade", () => {
    // É a trava contra o efeito colateral da própria ordenação: num dia de
    // fila cheia de idosos, quem não tem prioridade some do topo e ninguém
    // percebe.
    const f = filaDoAmbulatorio([chegou(1, 30, "08:00"), chegou(2, 82, "09:55")], { agora: HOJE });
    const normal = f.esperando.find(a => a.id === 1);
    expect(normal.esperaMin).toBeGreaterThanOrEqual(LIMITE_ESPERA_MIN);
    expect(normal.esperaLonga).toBe(true);
    expect(f.esperando.find(a => a.id === 2).esperaLonga).toBe(false);
  });

  it("cada um da fila carrega a própria prioridade, para a tela mostrar", () => {
    const f = filaDoAmbulatorio([chegou(1, 82, "09:00")], { agora: HOJE });
    expect(f.esperando[0].prioridade.tem).toBe(true);
    expect(f.esperando[0].prioridade.rotulo).toBe("Prioridade especial");
  });

  it("sem o cadastro vinculado, a fila volta a ser a de antes — e não inventa", () => {
    // O vínculo pode faltar (episódio com prontuário órfão). Ninguém é
    // promovido nem rebaixado por falta de dado.
    const f = filaDoAmbulatorio([
      { id: 1, status: "aguardando_atendimento", chegada_em: "2026-08-25T08:00:00" },
      { id: 2, status: "aguardando_atendimento", chegada_em: "2026-08-25T09:00:00" },
    ], { agora: HOJE });
    expect(f.esperando.map(a => a.id)).toEqual([1, 2]);   // só o relógio
    expect(f.esperando[0].prioridade.nivel).toBe(0);
  });

  it("quem já está em atendimento continua separado", () => {
    const f = filaDoAmbulatorio([
      chegou(1, 82, "09:00", { status: "em_atendimento", atendimento_em: "2026-08-25T09:30:00" }),
      chegou(2, 30, "09:10"),
    ], { agora: HOJE });
    expect(f.emAtendimento.map(a => a.id)).toEqual([1]);
    expect(f.esperando.map(a => a.id)).toEqual([2]);
  });
});
