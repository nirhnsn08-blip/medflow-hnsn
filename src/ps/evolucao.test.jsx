// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A EVOLUÇÃO NÃO SOME DA TELA ANTES DE ESTAR NO PRONTUÁRIO
//
// 🔴 POR QUE ISTO EXISTE, COM NOME E DATA
// Em 16/09/2026 dois defeitos foram encontrados na aba de Evoluções do PS,
// os dois apagando texto clínico sem uma palavra:
//
//   1. A gravação não conferia o retorno e limpava o campo em seguida. Com
//      a gravação recusada (RLS, sessão vencida, rede), a evolução sumia da
//      tela e nunca chegava ao prontuário.
//   2. Trocar de aba apagava o texto. Resto da época em que o campo servia
//      também à prescrição livre. O médico ditava a evolução, ia conferir um
//      exame, voltava — e o texto não existia mais.
//
// Ditado é o pior caso dos dois: não há rascunho em lugar nenhum para refazer.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AtendimentoModal } from "./modais.jsx";

const PACIENTE = { id: 77, iniciais: "J.N.", prontuario: "T9031", queixa: "Cefaleia", classificacao: "amarelo" };
const TEXTO = "Paciente refere melhora da cefaleia após analgesia. Sem déficit focal.";

/**
 * `sb` falso. `gravacao` decide o que o POST em `ps_registros` devolve:
 * "ok" devolve a linha, "recusada" devolve [] (RLS), "falha" devolve null.
 */
function bancoFalso(gravacao = "ok") {
  const posts = [];
  const sb = async (caminho, opts = {}) => {
    const c = String(caminho);
    if (opts.method === "POST" && c.startsWith("ps_registros")) {
      posts.push(JSON.parse(opts.body));
      if (gravacao === "recusada") return [];
      if (gravacao === "falha") return null;
      return [{ id: 900, ...JSON.parse(opts.body) }];
    }
    return [];
  };
  sb.posts = posts;
  return sb;
}

const montar = sb => render(
  <AtendimentoModal sb={sb} sbCru={null} paciente={{ ...PACIENTE }} currentUser={{ name: "Dra. Ana" }}
    onClose={() => {}} abaInicial="evolucao" />);

const campo = () => screen.getByRole("textbox");
const abrirAba = nome => fireEvent.click(screen.getByRole("button", { name: new RegExp("^" + nome, "i") }));
const salvar = () => fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));

describe("🔴 a evolução só sai da tela depois de gravada", () => {
  let alerta;
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    alerta = vi.spyOn(window, "alert").mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("gravação que volta com a linha limpa o campo", async () => {
    const sb = bancoFalso("ok");
    montar(sb);
    fireEvent.change(campo(), { target: { value: TEXTO } });
    salvar();
    await waitFor(() => expect(campo().value).toBe(""));
    expect(sb.posts).toHaveLength(1);
    expect(sb.posts[0]).toMatchObject({ tipo: "evolucao", texto: TEXTO });
  });

  it("🔴 gravação RECUSADA pela RLS mantém o texto na tela e avisa", async () => {
    const sb = bancoFalso("recusada");
    montar(sb);
    fireEvent.change(campo(), { target: { value: TEXTO } });
    salvar();
    await waitFor(() => expect(alerta).toHaveBeenCalled());
    expect(alerta.mock.calls[0][0]).toMatch(/NÃO foi gravada/);
    expect(campo().value).toBe(TEXTO);
  });

  it("🔴 gravação que NÃO VOLTOU (rede, sessão) também mantém o texto", async () => {
    const sb = bancoFalso("falha");
    montar(sb);
    fireEvent.change(campo(), { target: { value: TEXTO } });
    salvar();
    await waitFor(() => expect(alerta).toHaveBeenCalled());
    expect(campo().value).toBe(TEXTO);
  });

  it("⚠️ depois da recusa, dá para salvar de novo sem redigitar", async () => {
    const sb = bancoFalso("recusada");
    montar(sb);
    fireEvent.change(campo(), { target: { value: TEXTO } });
    salvar();
    await waitFor(() => expect(alerta).toHaveBeenCalled());
    // o botão não ficou travado em "…"
    expect(screen.getByRole("button", { name: /Salvar/ }).disabled).toBe(false);
  });
});

describe("🔴 trocar de aba não apaga a evolução", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("🔴 texto digitado continua lá depois de ir à aba Exames e voltar", async () => {
    montar(bancoFalso());
    fireEvent.change(campo(), { target: { value: TEXTO } });

    abrirAba("Exames");
    abrirAba("Evoluções");

    await waitFor(() => expect(campo().value).toBe(TEXTO));
  });

  it("vale para qualquer aba do atendimento", async () => {
    montar(bancoFalso());
    fireEvent.change(campo(), { target: { value: TEXTO } });
    for (const aba of ["Prescrição", "Checagem", "Exames"]) {
      abrirAba(aba);
      abrirAba("Evoluções");
      await waitFor(() => expect(campo().value, aba).toBe(TEXTO));
    }
  });
});
