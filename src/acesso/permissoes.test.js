// Testes da resolução de permissão.
//
// Regra de acesso é o tipo de código que, quando afrouxa por descuido,
// ninguém percebe — não dá erro, não quebra tela, só passa a mostrar o que
// não devia. Por isso cada afirmação abaixo é uma frase que o hospital
// precisaria conseguir defender numa auditoria.

import { describe, it, expect } from "vitest";
import {
  permissoesEfetivas, podeVer, podeEditar, modulosVisiveis, resumoDeAcesso,
  excecoesAplicadas, quantosUsam, conferirPerfil, podeSalvarPerfil,
} from "./permissoes.js";
import { PERFIL_POR_CHAVE, MODULOS, PERFIS_MODELO } from "./modulos.js";

const user = (role = "adm_silver") => ({ role, nome: "Fulano" });

describe("perfil define o que a pessoa alcança", () => {
  it("almoxarifado vê estoque e mais nada", () => {
    const perms = permissoesEfetivas(user(), PERFIL_POR_CHAVE.almoxarifado);
    expect(podeEditar(perms, "suprimentos")).toBe(true);
    expect(podeVer(perms, "bloco")).toBe(false);
    expect(podeVer(perms, "paciente")).toBe(false);
    expect(podeVer(perms, "ps")).toBe(false);
    expect(modulosVisiveis(perms).map(m => m.chave)).toEqual(["suprimentos"]);
  });

  it("enfermeiro alcança o prontuário e o cuidado", () => {
    const perms = permissoesEfetivas(user(), PERFIL_POR_CHAVE.enfermeiro);
    expect(podeEditar(perms, "paciente")).toBe(true);
    expect(podeEditar(perms, "leitos")).toBe(true);
    expect(podeEditar(perms, "scih")).toBe(true);
    expect(podeVer(perms, "suprimentos")).toBe(true);
    expect(podeEditar(perms, "suprimentos")).toBe(false);   // consulta, não lança
  });

  it("sem perfil não se alcança nada", () => {
    const perms = permissoesEfetivas(user(), null);
    expect(modulosVisiveis(perms)).toEqual([]);
  });
});

describe("recepção e faturamento NÃO abrem prontuário (COFEN 754/2024, art. 6º)", () => {
  for (const chave of ["recepcao", "faturamento", "almoxarifado", "aux_farmacia", "gestao"]) {
    it(`${chave} não vê o Paciente 360`, () => {
      const perms = permissoesEfetivas(user(), PERFIL_POR_CHAVE[chave]);
      expect(podeVer(perms, "paciente"), chave).toBe(false);
      expect(resumoDeAcesso(perms).alcancaProntuario, chave).toBe(false);
    });
  }

  it("recepção ainda cadastra no ambulatório e no PS — senão não trabalha", () => {
    const perms = permissoesEfetivas(user(), PERFIL_POR_CHAVE.recepcao);
    expect(podeEditar(perms, "ambulatorio")).toBe(true);
    expect(podeEditar(perms, "ps")).toBe(true);
  });
});

describe("livro de controlados (Portaria 344/98)", () => {
  it("farmacêutico escritura", () => {
    expect(podeEditar(permissoesEfetivas(user(), PERFIL_POR_CHAVE.farmaceutico), "controlados")).toBe(true);
  });
  it("auxiliar de farmácia só consulta", () => {
    const perms = permissoesEfetivas(user(), PERFIL_POR_CHAVE.aux_farmacia);
    expect(podeVer(perms, "controlados")).toBe(true);
    expect(podeEditar(perms, "controlados")).toBe(false);
  });
  it("enfermeiro e médico não alcançam o livro", () => {
    for (const c of ["enfermeiro", "medico", "tecnico_enfermagem"])
      expect(podeVer(permissoesEfetivas(user(), PERFIL_POR_CHAVE[c]), "controlados"), c).toBe(false);
  });
});

describe("exceções por usuário", () => {
  it("ampliam sem precisar criar perfil novo", () => {
    // "esta técnica também cobre o bloco"
    const perms = permissoesEfetivas(user(), PERFIL_POR_CHAVE.tecnico_enfermagem,
      [{ modulo: "bloco", nivel: "leitura", motivo: "Cobre escala do bloco" }]);
    expect(podeVer(perms, "bloco")).toBe(true);
  });

  it("REDUZEM também — suspender acesso sem inventar perfil", () => {
    const perms = permissoesEfetivas(user(), PERFIL_POR_CHAVE.enfermeiro,
      [{ modulo: "paciente", nivel: "nenhum", motivo: "Afastada — apuração em curso" }]);
    expect(podeVer(perms, "paciente")).toBe(false);
  });

  it("exceção em módulo inexistente é ignorada, não quebra a tela", () => {
    const perms = permissoesEfetivas(user(), PERFIL_POR_CHAVE.recepcao,
      [{ modulo: "modulo_que_nao_existe", nivel: "escrita" }]);
    expect(perms.modulo_que_nao_existe).toBeUndefined();
    expect(podeEditar(perms, "ambulatorio")).toBe(true);
  });

  it("listam o desvio em relação ao perfil — exceção que ninguém vê não se audita", () => {
    const d = excecoesAplicadas(PERFIL_POR_CHAVE.tecnico_enfermagem,
      [{ modulo: "bloco", nivel: "leitura", motivo: "Cobre escala", concedido_por: "adauam" },
       { modulo: "ps", nivel: "escrita" }]);   // igual ao perfil, não é desvio
    expect(d).toHaveLength(1);
    expect(d[0].modulo).toBe("bloco");
    expect(d[0].de).toBe("nenhum");
    expect(d[0].ampliou).toBe(true);
    expect(d[0].motivo).toBe("Cobre escala");
  });
});

describe("travas que nenhum perfil derruba", () => {
  it("adm_master nunca perde a tela de Usuários — anti-trancamento", () => {
    // Mesmo com o perfil mais pobre do sistema.
    const perms = permissoesEfetivas(user("adm_master"), PERFIL_POR_CHAVE.almoxarifado);
    expect(podeEditar(perms, "users")).toBe(true);
  });

  it("quem não é adm_master não chega em Usuários, nem com perfil de TI", () => {
    const perms = permissoesEfetivas(user("adm_silver"), PERFIL_POR_CHAVE.ti);
    expect(podeVer(perms, "users")).toBe(false);
  });

  it("nem com exceção individual — a trava vem depois das exceções", () => {
    const perms = permissoesEfetivas(user("adm_silver"), PERFIL_POR_CHAVE.enfermeiro,
      [{ modulo: "users", nivel: "escrita" }]);
    expect(podeVer(perms, "users")).toBe(false);
  });

  it("visualizador nunca escreve, tenha o perfil que tiver", () => {
    const perms = permissoesEfetivas(user("visualizador"), PERFIL_POR_CHAVE.medico);
    expect(podeVer(perms, "paciente")).toBe(true);
    expect(podeEditar(perms, "paciente")).toBe(false);
    expect(MODULOS.every(m => !podeEditar(perms, m.chave))).toBe(true);
  });
});

describe("conferência do perfil antes de salvar", () => {
  const usuarios = [{ perfil: "enfermeiro" }, { perfil: "enfermeiro" }, { perfil: "medico" }];

  it("perfil sem nome não salva", () => {
    const a = conferirPerfil({ nome: "  ", grants: { overview: "leitura" } });
    expect(podeSalvarPerfil(a)).toBe(false);
  });

  it("perfil que não dá acesso a nada não salva", () => {
    const a = conferirPerfil({ nome: "Vazio", grants: {} });
    expect(podeSalvarPerfil(a)).toBe(false);
  });

  it("avisa quando um perfil administrativo abre prontuário", () => {
    const a = conferirPerfil({ nome: "Recepção plus", categoria: "administrativo", grants: { paciente: "leitura" } });
    expect(a.some(x => x.nivel === "avisa" && /COFEN/.test(x.texto))).toBe(true);
    expect(podeSalvarPerfil(a)).toBe(true);   // avisa, não impede
  });

  it("avisa sobre controlados fora do farmacêutico", () => {
    const a = conferirPerfil({ nome: "X", categoria: "enfermeiro", grants: { controlados: "escrita" } });
    expect(a.some(x => /344\/98/.test(x.texto))).toBe(true);
  });

  it("avisa quantas pessoas a mudança atinge", () => {
    const a = conferirPerfil({ chave: "enfermeiro", nome: "Enfermeiro(a)", grants: { paciente: "escrita" } }, { usuarios });
    expect(a.some(x => /2 usuário/.test(x.texto))).toBe(true);
  });

  it("conta quantos usam o perfil", () => {
    expect(quantosUsam("enfermeiro", usuarios)).toBe(2);
    expect(quantosUsam("almoxarifado", usuarios)).toBe(0);
  });
});

describe("catálogo de perfis-modelo", () => {
  it("toda chave é única", () => {
    const chaves = PERFIS_MODELO.map(p => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("todo grant aponta para um módulo que existe", () => {
    const validos = new Set(MODULOS.map(m => m.chave));
    for (const p of PERFIS_MODELO)
      for (const k of Object.keys(p.grants))
        expect(validos.has(k), `${p.chave} → ${k}`).toBe(true);
  });

  it("todo perfil-modelo passa na própria conferência", () => {
    for (const p of PERFIS_MODELO)
      expect(podeSalvarPerfil(conferirPerfil(p)), p.chave).toBe(true);
  });

  it("o perfil de TI é marcado como de sistema — não pode ser apagado", () => {
    expect(PERFIL_POR_CHAVE.ti.sistema).toBe(true);
  });

  it("nenhum perfil-modelo concede o módulo de Usuários por grant solto", () => {
    // Quem administra usuários é o role adm_master, não o perfil. Se um dia
    // alguém "resolver" isso por grant, a trava continua valendo — mas o
    // catálogo não deve sugerir que funciona assim.
    const perms = permissoesEfetivas(user("adm_silver"), PERFIL_POR_CHAVE.ti);
    expect(podeVer(perms, "users")).toBe(false);
  });
});
