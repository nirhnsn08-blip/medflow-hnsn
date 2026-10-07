// ═══════════════════════════════════════════════════════════
// O DIA CIVIL DO HOSPITAL QUE FUNCIONA À NOITE
//
// Um carimbo de tempo não tem dia: tem instante. O dia sai do RELÓGIO de
// quem olha. No Brasil (UTC−3), das 21h à meia-noite o dia em UTC já é o
// seguinte — e cortar os 10 primeiros caracteres do texto que vem do banco
// é ler esse dia de UTC.
//
// Isto não é detalhe de formatação: o dia civil decide a COMPETÊNCIA da
// conta, o NÚMERO DE DIÁRIAS, a DATA DE EXECUÇÃO de cada item (coluna
// `date`, grava permanente), a idade do recebível e a data impressa no papel
// que o paciente leva. O PS e o ambulatório noturno vivem exatamente na
// janela em que o erro acontece.
//
// ⚠️ ESTES TESTES SÓ VALEM COM O FUSO FIXADO em vite.config.js
// (`test.env.TZ`). Rodando em UTC — como fazia o CI — todos passam com os
// defeitos reintroduzidos, porque "22:00 local" em UTC é 22:00 UTC e não
// cruza a meia-noite. O teste concorda consigo mesmo e não prova nada.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { permanenciaEmDias } from "./sigtap.js";
import { competenciaDe } from "./faturamento.js";
import { montarContaDoProntuario } from "./montar-conta.js";
import { declaracaoDeComparecimento, dataBR } from "./impressos.js";
import { conciliarConta } from "./receitas.js";
import { convenioSugerido } from "./faturavel.js";
import { diaLocal } from "../util/datas.js";

// O fuso tem de estar fixado, senão o arquivo inteiro é teatro.
describe("a suíte roda no fuso do hospital", () => {
  it("UTC−3 — sem isto, nada abaixo prova nada", () => {
    expect(new Date(2026, 9, 5, 22, 0).getTimezoneOffset()).toBe(180);
  });
});

// ── DIÁRIAS ─────────────────────────────────────────────────
describe("🔴 permanência: a diária que não existiu (e a que existiu)", () => {
  // 22:00 de 05/10 em Brasília é 06/10 01:00Z. 10:00 de 07/10 é 07/10 13:00Z.
  // Civil: 05 → 07 = 2 diárias. Pelo texto em UTC: 06 → 07 = 1.
  it("admissão às 22h não APAGA uma diária", () => {
    expect(permanenciaEmDias("2026-10-06T01:00:00Z", "2026-10-07T13:00:00Z")).toBe(2);
  });

  // 10:00 de 05/10 é 05/10 13:00Z. 22:00 de 07/10 é 08/10 01:00Z.
  // Civil: 05 → 07 = 2. Pelo texto em UTC: 05 → 08 = 3 — diária inventada.
  it("alta às 22h não INVENTA uma diária", () => {
    expect(permanenciaEmDias("2026-10-05T13:00:00Z", "2026-10-08T01:00:00Z")).toBe(2);
  });

  it("só-dia continua contando pelo calendário, sem fuso no meio", () => {
    expect(permanenciaEmDias("2026-10-05", "2026-10-07")).toBe(2);
    expect(permanenciaEmDias("2026-10-07", "2026-10-05")).toBeNull();
  });
});

// ── COMPETÊNCIA ─────────────────────────────────────────────
describe("🔴 competência: a conta no mês que atendeu", () => {
  it("quem chega às 22h do último dia do mês fica NO MÊS QUE ATENDEU", () => {
    // 22:00 de 30/09 → 01/10 01:00Z. A conta é de setembro.
    expect(competenciaDe("2026-10-01T01:00:00Z")).toBe("2026-09");
    // 22:00 de 31/12 → 01/01 01:00Z do ANO seguinte. Pior caso: o ano fecha.
    expect(competenciaDe("2027-01-01T01:00:00Z")).toBe("2026-12");
  });
});

// ── data_execucao DOS ITENS ─────────────────────────────────
describe("🔴 data_execucao: coluna `date`, grava o dia errado permanente", () => {
  const at = {
    id: 777,
    prontuario: "1024",
    procedimento_cod: "0303010037",
    cid: "J18",
    // 22:00 de 05/10 em Brasília.
    chegada_em: "2026-10-06T01:00:00Z",
    desfecho: "internacao",
    // 10:00 de 07/10.
    desfecho_em: "2026-10-07T13:00:00Z",
    medico: "Dra. Ana",
    idade: 40,
  };
  const SUS = { tipo: "sus" };

  it("o procedimento principal executa no dia em que o paciente chegou", () => {
    const r = montarContaDoProntuario({ atendimento: at, convenio: SUS });
    const p = r.itens.find(i => i.tipo === "procedimento");
    expect(p.data_execucao).toBe("2026-10-05");
  });

  it("a medicação das 22h não executa amanhã — que pode ser DEPOIS DA ALTA", () => {
    const r = montarContaDoProntuario({
      atendimento: at,
      convenio: SUS,
      // administrada às 23h de 06/10 → 07/10 02:00Z
      administracoes: [{ medicamento_nome: "Dipirona 500mg", status: "administrado", administrado_em: "2026-10-07T02:00:00Z" }],
    });
    const m = r.itens.find(i => i.tipo === "medicamento");
    expect(m.data_execucao).toBe("2026-10-06");
  });

  it("a diária executa no dia da alta, pelo relógio do hospital", () => {
    const r = montarContaDoProntuario({
      atendimento: at,
      convenio: SUS,
      // alta às 22h de 09/10 → 10/10 01:00Z
      internacao: { admissao: "2026-10-05", alta: "2026-10-09T01:00:00Z" },
    });
    const d = r.itens.find(i => i.tipo === "diaria");
    expect(d.data_execucao).toBe("2026-10-08");
  });
});

// ── O PAPEL ─────────────────────────────────────────────────
describe("🔴 o impresso não se contradiz", () => {
  it("a data do comparecimento bate com a hora de entrada", () => {
    const d = declaracaoDeComparecimento({
      paciente: { nome_completo: "Maria Silva", prontuario: "1024" },
      atendimento: { chegada_em: "2026-10-06T01:00:00Z", desfecho_em: "2026-10-06T02:30:00Z" },
    });
    // Entrada às 22:00 — a data ao lado tem de ser 05/10, não 06/10. Um papel
    // assinado pelo hospital dizendo "06/10, entrada 22:00" é um papel errado.
    expect(d.periodo.data).toBe("05/10/2026");
    expect(d.periodo.entrada).toMatch(/22:00/);
  });

  it("formato solto continua RECUSADO — não inventa data no papel", () => {
    // "04/03/1957" é 4 de março para quem digitou; o `new Date` leria 3 de
    // abril e imprimiria "03/04/1957" sem erro nenhum pelo caminho.
    expect(dataBR("04/03/1957")).toBe("");
    expect(dataBR("marco de 1957")).toBe("");
    expect(dataBR(null)).toBe("");
  });
});

// ── O RECEBÍVEL ─────────────────────────────────────────────
describe("🔴 a idade do recebível", () => {
  it("conta transmitida às 22h não envelhece um dia a mais", () => {
    const hoje = new Date(2026, 9, 10, 9, 0); // 10/10, 09:00 local
    const c = conciliarConta({
      conta: { id: 1, status: "faturada", faturada_em: "2026-10-06T01:00:00Z", competencia: "2026-10" },
      itens: [], glosas: [], repasses: [], hoje,
    });
    // Faturada às 22h de 05/10 → 5 dias até 10/10, não 4.
    expect(c.diasDesdeFaturamento).toBe(5);
  });
});

// ── O CONVÊNIO SUGERIDO ─────────────────────────────────────
describe("🔴 de quando vem o convênio sugerido", () => {
  it("a tela mostra o dia do atendimento, não o de UTC", () => {
    const s = convenioSugerido([{ convenio_id: "7", chegada_em: "2026-10-06T01:00:00Z" }]);
    expect(s).toEqual({ convenio_id: "7", de: "2026-10-05" });
  });
});

// ── A FONTE ÚNICA ───────────────────────────────────────────
describe("diaLocal é a única porta, e é estreita", () => {
  it("carimbo vai pelo relógio local; só-dia passa intacto", () => {
    expect(diaLocal("2026-10-06T01:00:00Z")).toBe("2026-10-05");
    expect(diaLocal("2026-10-05")).toBe("2026-10-05");
    expect(diaLocal("2026-10-05 22:10:00+00")).toBe("2026-10-05");
  });
  it("forma que não é ISO é RECUSADA, não adivinhada", () => {
    expect(diaLocal("04/03/1957")).toBeNull();
    expect(diaLocal("Jul 1 2026")).toBeNull();
    expect(diaLocal("ontem")).toBeNull();
  });
});

// ── A CATRACA ESTÁTICA ──────────────────────────────────────
//
// O que os testes de comportamento acima NÃO pegam: a forma direta escrita
// amanhã num arquivo novo, sem teste nenhum. Esta varredura pega a forma
// direta — `coluna_timestamptz` cortada em 10 caracteres na mesma expressão.
//
// Limite honesto: ela NÃO alcança o corte feito dentro de um helper que
// recebe o carimbo por parâmetro (era onde moravam os piores casos deste
// PR — `soData`, `diaUTC`, `diasDesde`). Para esses, a defesa é o teste de
// comportamento, e é por isso que os dois existem.
describe("catraca: carimbo cortado em 10 caracteres", () => {
  const RAIZ = path.resolve(__dirname, "..", "..");

  const tipos = () => {
    const sql = fs.readFileSync(path.join(RAIZ, "supabase", "reconstruir-banco.sql"), "utf8");
    const carimbo = new Set(), soDia = new Set();
    const re = /^\s*(?:ADD COLUMN (?:IF NOT EXISTS )?)?([a-z_][a-z0-9_]*)\s+(timestamptz|timestamp with time zone|date)\b/gim;
    for (const m of sql.matchAll(re)) (m[2].startsWith("date") ? soDia : carimbo).add(m[1]);
    for (const m of sql.matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_][a-z0-9_]*)\s+(timestamptz|date)\b/gi)) {
      (m[2] === "date" ? soDia : carimbo).add(m[1]);
    }
    // Coluna que é `date` numa tabela e `timestamptz` noutra é AMBÍGUA: a
    // varredura não sabe qual tabela a linha do front está lendo, e acusar
    // sem saber faz a catraca ser contornada em vez de obedecida.
    return [...carimbo].filter(c => !soDia.has(c)).sort();
  };

  const CORTES = [
    /\.slice\(\s*0\s*,\s*(?:10|7)\s*\)/,
    /\.substring\(\s*0\s*,\s*(?:10|7)\s*\)/,
    /\.substr\(\s*0\s*,\s*(?:10|7)\s*\)/,
    /\.split\(\s*["'`]T["'`]\s*\)\s*\[\s*0\s*\]/,
  ];

  const arquivos = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) arquivos(p, out);
      else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
    }
    return out;
  };

  // Comentário não é código: o próprio datas.js descreve o defeito em prosa.
  const semComentario = linha => {
    const t = linha.trim();
    if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/") || t.startsWith("//")) return "";
    return linha.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
  };

  function varrer() {
    const proibidas = tipos();
    const achados = [];
    for (const f of arquivos(path.join(RAIZ, "src"))) {
      fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((linha, i) => {
        const codigo = semComentario(linha);
        if (!CORTES.some(r => r.test(codigo))) return;
        const cols = proibidas.filter(c => new RegExp(`\\b${c}\\b`).test(codigo));
        const iso = /toISOString\(\)/.test(codigo);
        if (!cols.length && !iso) return;
        const rel = path.relative(RAIZ, f).replace(/\\/g, "/");
        achados.push(`${rel}:${i + 1} [${cols.join(", ") || "toISOString()"}] ${linha.trim()}`);
      });
    }
    return achados;
  }

  it("a varredura encontra as colunas de carimbo no schema", () => {
    const p = tipos();
    expect(p.length).toBeGreaterThan(30);
    expect(p).toContain("chegada_em");
    expect(p).toContain("administrado_em");
    expect(p).toContain("faturada_em");
    // `data_execucao` e `vigencia_inicio` são `date`: cortá-las é legítimo.
    expect(p).not.toContain("data_execucao");
    expect(p).not.toContain("vigencia_inicio");
  });

  it("nenhum carimbo é cortado em dia civil por fatia de texto", () => {
    expect(varrer()).toEqual([]);
  });
});
