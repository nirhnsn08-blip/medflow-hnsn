// ═══════════════════════════════════════════════════════════
// DRILL-DOWN — testes
//
// O teste que manda aqui é o da PERMISSÃO FECHADA: sem permissão (ou com
// as permissões ainda carregando), não se oferece link. O render do
// App.jsx não barra ninguém — quem chega num módulo que não é seu vê a
// tela vazia pela RLS, e "está tudo zerado" é a pior forma de negar acesso.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi } from "vitest";
import { DESTINOS, destinoDoItem, linkDe, acaoDoCard } from "./navegacao.js";
import { MODULO_POR_CHAVE } from "../acesso/modulos.js";

/** `verModulo` falso: permite só o que está na lista. */
const com = (...modulos) => (m, padrao = true) => (modulos.length ? modulos.includes(m) : padrao);

describe("o catálogo de destinos", () => {
  it("🔴 todo destino aponta para um módulo que EXISTE no catálogo", () => {
    // Um destino com chave errada viraria um card que nunca abre — e, como
    // a permissão falha fechado, ele sumiria em silêncio para todo mundo.
    for (const [chave, d] of Object.entries(DESTINOS)) {
      expect(MODULO_POR_CHAVE[d.modulo], `destino de '${chave}' aponta para módulo inexistente: ${d.modulo}`).toBeDefined();
    }
  });

  it("todo destino tem rótulo legível (vai para o title do card)", () => {
    for (const [chave, d] of Object.entries(DESTINOS)) {
      expect(d.rotulo, `${chave} sem rótulo`).toBeTruthy();
    }
  });

  it("a agenda do ambulatório vai para a ABA certa do Atendimento", () => {
    // O módulo `ambulatorio` existe para RLS mas não tem porta no menu.
    expect(DESTINOS.ambulatorio).toMatchObject({ modulo: "atendimento", aba: "agenda" });
  });

  it("item em falta vai para a casa dele", () => {
    expect(destinoDoItem("farmacia").modulo).toBe("farmacia");
    expect(destinoDoItem("estoque").modulo).toBe("suprimentos");
    expect(destinoDoItem(undefined).modulo).toBe("suprimentos");
  });
});

describe("linkDe", () => {
  it("devolve o destino quando a pessoa alcança o módulo", () => {
    expect(linkDe("falta", com("suprimentos"))).toMatchObject({ modulo: "suprimentos" });
  });

  it("🔴 sem permissão, NÃO oferece o link", () => {
    expect(linkDe("falta", com("leitos"))).toBeNull();
  });

  it("🔴 FALHA FECHADO: permissões ainda carregando não viram link", () => {
    // `verModulo` do App devolve o PADRÃO quando `perms` é null — e aqui a
    // pergunta é feita com padrão false de propósito.
    const aindaCarregando = (m, padrao = true) => padrao;
    expect(linkDe("falta", aindaCarregando)).toBeNull();
  });

  it("chave desconhecida não inventa destino", () => {
    expect(linkDe("nao_existe", com("leitos"))).toBeNull();
  });

  it("sem `verModulo` não há link (a tela não decide sozinha)", () => {
    expect(linkDe("falta", null)).toBeNull();
    expect(linkDe("falta", undefined)).toBeNull();
  });

  it("aceita um destino pronto, não só a chave", () => {
    expect(linkDe({ modulo: "farmacia", rotulo: "Farmácia" }, com("farmacia")))
      .toMatchObject({ modulo: "farmacia" });
  });
});

describe("acaoDoCard", () => {
  it("monta o clique e o título quando pode ir", () => {
    const navegar = vi.fn();
    const a = acaoDoCard("pa", { verModulo: com("ps"), navegar });
    expect(a.clicavel).toBe(true);
    expect(a.title).toBe("Abrir Pronto-Socorro");
    a.onClick();
    expect(navegar).toHaveBeenCalledWith("ps", null, null);
  });

  it("passa a aba quando o destino tem uma", () => {
    const navegar = vi.fn();
    acaoDoCard("ambulatorio", { verModulo: com("atendimento"), navegar }).onClick();
    expect(navegar).toHaveBeenCalledWith("atendimento", "agenda", null);
  });

  it("leva o extra adiante — é como o prontuário chega ao Paciente 360", () => {
    const navegar = vi.fn();
    acaoDoCard("paciente", { verModulo: com("paciente"), navegar, extra: "1001" }).onClick();
    expect(navegar).toHaveBeenCalledWith("paciente", null, "1001");
  });

  it("🔴 sem permissão o card fica INERTE, não vira botão quebrado", () => {
    const navegar = vi.fn();
    const a = acaoDoCard("pa", { verModulo: com("leitos"), navegar });
    expect(a.clicavel).toBe(false);
    expect(a.onClick).toBeUndefined();
    expect(a.title).toBeUndefined();
  });

  it("sem `navegar` também fica inerte", () => {
    expect(acaoDoCard("pa", { verModulo: com("ps") }).clicavel).toBe(false);
  });

  it("sem opções nenhuma não quebra", () => {
    expect(acaoDoCard("pa")).toMatchObject({ clicavel: false });
  });
});
