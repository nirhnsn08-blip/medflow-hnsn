// ═══════════════════════════════════════════════════════════
// O EXAME DEIXA DE SER TEXTO
//
// 🔴 ATÉ AQUI UM EXAME ERA UMA LINHA DE TEXTO: `ps_registros` com
// `texto='hemograma'` e `resultado='Hb 7,1 / Leuco 18.400'`. Não havia
// código, analito, unidade, faixa de referência nem valor crítico — e por
// isso o sistema não conseguia dizer que um valor estava alterado. Ele não
// sabia qual era o normal.
//
// As recusas de verdade estão no gatilho (migracao-sadt-exames.sql, provado
// em PGlite: 46 cenários, conferência 15/15). Aqui está o que a tela sabe
// antes de mandar — e as leituras que só existem agora que o resultado é
// dado: o nível, a faixa, a cadeia de correção, o atraso contra o prazo
// pactuado e a curva.
//
// ⚠️ O QUE ESTE ARQUIVO NÃO RECALCULA: `anormal` e `critico`. Quem compara
// com a faixa é o banco. Testar um recálculo aqui seria testar uma segunda
// opinião que não deve existir.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  leituraDoResultado, valorDoResultado, faixaTexto, faixaCriticaTexto,
  resultadosVigentes, versaoCorrigida, minutosEsperando, atrasoDoExame,
  criticosPendentes, pendentes, serieDoAnalito, tendencia,
  conferirPedido, conferirResultado, conferirCancelamento, valorDigitado,
  linhaDoPedido, linhasDosItens, linhaDoResultado,
  formularioVazio, proximoFormulario, pedidoVazio,
  veioDoRegistroAntigo, resumoDoDia,
  PRIORIDADES, MIN_INDICACAO, MIN_MOTIVO_CORRECAO,
} from "./exames.js";
import { FALHA } from "../util/leitura.js";
import {
  EXAME_SOLICITADO, EXAME_COLETADO, EXAME_RESULTADO, EXAME_VISTO,
  EXAME_CANCELADO, EXAME_ESTADOS, EXAME_PENDENTES,
  estadoDoExame, acaoDoExame, contarExames,
} from "../ps/exames.js";

// ── O NÍVEL DE UM VALOR ─────────────────────────────────────
describe("🔴 como o valor aparece: crítico, alterado, normal — ou nenhum dos três", () => {
  it("crítico ganha de alterado", () => {
    // O banco garante que crítico implica anormal. A ORDEM aqui é o que
    // decide a cor: um potássio 7,2 pintado de "alterado" ao lado de dez
    // outros "alterado" é um crítico que ninguém vê.
    const l = leituraDoResultado({ critico: true, anormal: true, valor_num: 7.2 });
    expect(l.nivel).toBe("critico");
    expect(l.label).toBe("CRÍTICO");
  });

  it("alterado sem ser crítico", () => {
    expect(leituraDoResultado({ anormal: true, valor_num: 10.5 }).nivel).toBe("anormal");
  });

  it("dentro da faixa: normal", () => {
    expect(leituraDoResultado({ anormal: false, critico: false, valor_num: 14 }).nivel).toBe("normal");
  });

  it("🔴 laudo de imagem NÃO é 'normal' — é 'sem_faixa'", () => {
    // Nunca foi comparado com faixa nenhuma. Dizer "normal" seria o sistema
    // afirmando algo que não apurou — e é exatamente o que a tela antiga
    // fazia por omissão, mostrando o texto do laudo sem qualificação.
    const l = leituraDoResultado({ laudo: "Sem alterações.", anormal: false, critico: false });
    expect(l.nivel).toBe("sem_faixa");
    expect(l.label).toBe("");
  });

  it("texto do backfill também é sem_faixa", () => {
    expect(leituraDoResultado({ laudo: "Hb 7,1 / Leuco 18.400" }).nivel).toBe("sem_faixa");
  });

  it("sem resultado: null, não 'normal'", () => {
    expect(leituraDoResultado(null)).toBeNull();
    expect(leituraDoResultado(undefined)).toBeNull();
  });

  it("o peso ordena do mais grave para o menos", () => {
    const p = n => leituraDoResultado(n).peso;
    expect(p({ critico: true })).toBeGreaterThan(p({ anormal: true }));
    expect(p({ anormal: true })).toBeGreaterThan(p({ valor_num: 1 }));
    expect(p({ valor_num: 1 })).toBeGreaterThan(p({ laudo: "x" }));
  });
});

describe("🔴 o valor como se escreve — e o zero", () => {
  it("número com unidade", () => {
    expect(valorDoResultado({ valor_num: 14, unidade: "g/dL" })).toBe("14 g/dL");
  });

  it("🔴 ZERO é valor, não ausência", () => {
    // `res.valor_num || res.valor_texto` daria o texto (ou nada) para uma
    // contagem zerada. E zero é justamente o resultado que importa em
    // plaqueta, em bastonete, em bacilo.
    expect(valorDoResultado({ valor_num: 0, unidade: "/mm³" })).toBe("0 /mm³");
    expect(valorDoResultado({ valor_num: 0, valor_texto: "ausente" })).toBe("0");
  });

  it("texto quando não há número", () => {
    expect(valorDoResultado({ valor_texto: "negativo" })).toBe("negativo");
  });

  it("número sem unidade não inventa unidade", () => {
    expect(valorDoResultado({ valor_num: 7.2 })).toBe("7.2");
  });

  it("nada: string vazia, e não 'undefined'", () => {
    expect(valorDoResultado({})).toBe("");
    expect(valorDoResultado(null)).toBe("");
  });
});

describe("a faixa em texto, no mesmo formato que o banco grava", () => {
  it("min e max", () => expect(faixaTexto({ ref_min: 12, ref_max: 16 })).toBe("12 a 16"));
  it("só min", () => expect(faixaTexto({ ref_min: 12 })).toBe("≥ 12"));
  it("só max", () => expect(faixaTexto({ ref_max: 16 })).toBe("≤ 16"));
  it("texto ganha do numérico — é o caso da cultura", () => {
    expect(faixaTexto({ ref_texto: "negativo", ref_min: 1, ref_max: 2 })).toBe("negativo");
  });
  it("sem faixa: vazio", () => expect(faixaTexto({})).toBe(""));

  it("a faixa de pânico, nas duas pontas", () => {
    expect(faixaCriticaTexto({ critico_min: 7, critico_max: 20 })).toBe("≤ 7 ou ≥ 20");
    expect(faixaCriticaTexto({ critico_min: 7 })).toBe("≤ 7");
    expect(faixaCriticaTexto({ critico_max: 20 })).toBe("≥ 20");
  });

  it("analito SEM faixa crítica: vazio — nulo não inventa pânico", () => {
    expect(faixaCriticaTexto({ ref_min: 4000, ref_max: 11000 })).toBe("");
  });

  it("zero é limite crítico legítimo", () => {
    // `critico_min: 0` com `!= null` passa; com um `||` desapareceria — e
    // "zero" é um limite real (bicarbonato, excesso de base).
    expect(faixaCriticaTexto({ critico_min: 0 })).toBe("≤ 0");
  });
});

// ── A CADEIA DE CORREÇÃO ────────────────────────────────────
describe("🔴 um laudo corrigido não deixa duas hemoglobinas na tela", () => {
  const v1 = { id: 1, item_id: 9, analito_id: 2, nome: "Plaquetas", valor_num: 8000, critico: true, ordem: 2 };
  const v2 = { id: 2, item_id: 9, analito_id: 2, nome: "Plaquetas", valor_num: 180000, corrige_id: 1, versao: 2, ordem: 2 };
  const hb = { id: 3, item_id: 9, analito_id: 1, nome: "Hemoglobina", valor_num: 14, ordem: 1 };

  it("só a última versão de cada analito é vigente", () => {
    const vig = resultadosVigentes([v1, v2, hb]);
    expect(vig.map(r => r.id)).toEqual([3, 2]);  // ordem do laudo: Hb antes de plaqueta
  });

  it("a versão corrigida continua recuperável", () => {
    expect(versaoCorrigida(v2, [v1, v2, hb]).id).toBe(1);
    expect(versaoCorrigida(v2, [v1, v2, hb]).critico).toBe(true);
  });

  it("resultado que não corrige ninguém não tem anterior", () => {
    expect(versaoCorrigida(hb, [v1, v2, hb])).toBeNull();
  });

  it("🔴 leitura que FALHOU devolve null, nunca lista vazia", () => {
    // Lista vazia na tela lê-se "este exame não tem resultado" — notícia boa
    // inventada em cima de uma falha de rede.
    expect(resultadosVigentes(FALHA)).toBeNull();
    expect(resultadosVigentes([])).toEqual([]);
  });

  it("a ordem do laudo é a do analito, não a de inserção", () => {
    const vig = resultadosVigentes([
      { id: 5, analito_id: 3, nome: "Leucócitos", ordem: 3 },
      { id: 4, analito_id: 1, nome: "Hemoglobina", ordem: 1 },
    ]);
    expect(vig.map(r => r.nome)).toEqual(["Hemoglobina", "Leucócitos"]);
  });
});

// ── O ATRASO ────────────────────────────────────────────────
describe("🔴 atraso contra o prazo PACTUADO, não contra um número fixo", () => {
  const agora = new Date("2026-10-13T12:00:00.000Z");
  const pedido = { criado_em: "2026-10-13T10:00:00.000Z", prioridade: "rotina" };

  it("120 minutos esperando", () => {
    expect(minutosEsperando({}, pedido, agora)).toBe(120);
  });

  it("a coleta reinicia a contagem — é dali que o laboratório responde", () => {
    expect(minutosEsperando({ coletado_em: "2026-10-13T11:30:00.000Z" }, pedido, agora)).toBe(30);
  });

  it("🔴 sem data: null, nunca zero", () => {
    // Zero significaria "pediram agora", e é uma afirmação.
    expect(minutosEsperando({}, {}, agora)).toBeNull();
    expect(minutosEsperando(null, null, agora)).toBeNull();
  });

  it("dentro do prazo de rotina", () => {
    const a = atrasoDoExame({}, pedido, { prazo_rotina_min: 240, prazo_urgente_min: 60 }, agora);
    expect(a.atrasado).toBe(false);
    expect(a.prazo).toBe(240);
  });

  it("🔴 o MESMO exame, urgente, está atrasado", () => {
    // O prazo de cada exame é o seu. Medir com uma régua só faria a cultura
    // viver atrasada e o hemograma urgente nunca aparecer.
    const a = atrasoDoExame({}, { ...pedido, prioridade: "urgente" },
      { prazo_rotina_min: 240, prazo_urgente_min: 60 }, agora);
    expect(a.atrasado).toBe(true);
    expect(a.excesso).toBe(60);
    expect(a.urgente).toBe(true);
  });

  it("🔴 sem prazo cadastrado: atrasado = null, NÃO false", () => {
    // "Não sei se está atrasado" e "está no prazo" são coisas diferentes, e
    // a segunda tranquiliza.
    const a = atrasoDoExame({}, pedido, {}, agora);
    expect(a.atrasado).toBeNull();
    expect(a.prazo).toBeNull();
    expect(a.esperando).toBe(120);  // a idade ainda é conhecida
  });

  it("sem catálogo nenhum também é null", () => {
    expect(atrasoDoExame({}, pedido, null, agora).atrasado).toBeNull();
  });

  it("no prazo exato não está atrasado", () => {
    expect(atrasoDoExame({}, pedido, { prazo_rotina_min: 120 }, agora).atrasado).toBe(false);
  });

  it("sem pedido não dá para medir", () => {
    expect(atrasoDoExame({}, null, { prazo_rotina_min: 60 }, agora)).toBeNull();
  });
});

// ── O QUE PRECISA DE ALGUÉM ─────────────────────────────────
describe("🔴 os críticos que ninguém olhou", () => {
  const itens = [
    { id: 1, status: EXAME_RESULTADO },
    { id: 2, status: EXAME_VISTO },
  ];
  const res = [
    { id: 10, item_id: 1, analito_id: 1, critico: true },
    { id: 11, item_id: 2, analito_id: 1, critico: true },
    { id: 12, item_id: 1, analito_id: 2, critico: false, anormal: true },
  ];

  it("o crítico de item já visto sai da lista; o não visto fica", () => {
    expect(criticosPendentes(res, itens).map(r => r.id)).toEqual([10]);
  });

  it("🔴 crítico retificado para normal sai — é a cadeia de correção", () => {
    const comCorrecao = [...res, { id: 13, item_id: 1, analito_id: 1, corrige_id: 10, critico: false }];
    expect(criticosPendentes(comCorrecao, itens)).toEqual([]);
  });

  it("🔴 crítico cujo item a tela não casou CONTINUA na lista", () => {
    // Sumir com um crítico porque o join falhou é o pior silêncio desta
    // tela — e é o caminho que uma leitura incompleta tomaria sozinha.
    const orfao = [{ id: 20, item_id: 999, critico: true }];
    expect(criticosPendentes(orfao, itens).map(r => r.id)).toEqual([20]);
  });

  it("🔴 qualquer leitura que falhou devolve null", () => {
    expect(criticosPendentes(FALHA, itens)).toBeNull();
    expect(criticosPendentes(res, FALHA)).toBeNull();
    expect(criticosPendentes([], [])).toEqual([]);
  });

  it("pendente é solicitado OU coletado", () => {
    const lista = [
      { id: 1, status: EXAME_SOLICITADO }, { id: 2, status: EXAME_COLETADO },
      { id: 3, status: EXAME_RESULTADO }, { id: 4, status: EXAME_CANCELADO },
    ];
    expect(pendentes(lista).map(i => i.id)).toEqual([1, 2]);
    expect(pendentes(FALHA)).toBeNull();
  });
});

// ── A CURVA ─────────────────────────────────────────────────
describe("🔴 a curva — é para isto que o número serve", () => {
  const serie = [
    { id: 1, analito_id: 7, valor_num: 0.9, criado_em: "2026-10-11T08:00:00.000Z" },
    { id: 2, analito_id: 7, valor_num: 1.8, criado_em: "2026-10-13T08:00:00.000Z" },
    { id: 3, analito_id: 7, valor_num: 1.3, criado_em: "2026-10-12T08:00:00.000Z" },
    { id: 4, analito_id: 9, valor_num: 140, criado_em: "2026-10-13T08:00:00.000Z" },
  ];

  it("ordem crescente no tempo, só do analito pedido", () => {
    // Creatinina 1,8 não diz nada; 0,9 ontem e 1,8 hoje é lesão renal aguda.
    // Com o exame em texto livre, essa comparação não existia.
    expect(serieDoAnalito(serie, 7).map(p => p.valor)).toEqual([0.9, 1.3, 1.8]);
  });

  it("resultado sem número não entra na curva", () => {
    const comTexto = [...serie, { id: 5, analito_id: 7, valor_texto: "hemolisado", criado_em: "2026-10-13T09:00:00.000Z" }];
    expect(serieDoAnalito(comTexto, 7)).toHaveLength(3);
  });

  it("a versão corrigida não aparece duas vezes na curva", () => {
    const corrigida = [...serie, { id: 6, analito_id: 7, valor_num: 1.1, corrige_id: 2, criado_em: "2026-10-13T10:00:00.000Z" }];
    const s = serieDoAnalito(corrigida, 7);
    expect(s.map(p => p.valor)).toEqual([0.9, 1.3, 1.1]);
  });

  it("FALHA atravessa", () => expect(serieDoAnalito(FALHA, 7)).toBeNull());

  it("a tendência precisa de duas medidas", () => {
    expect(tendencia(serieDoAnalito(serie, 9))).toBeNull();
    const t = tendencia(serieDoAnalito(serie, 7));
    expect(t.direcao).toBe("subindo");
    expect(t.delta).toBeCloseTo(0.9, 5);
    expect(t.medidas).toBe(3);
  });

  it("valor igual nas pontas é estável, não null", () => {
    expect(tendencia([{ valor: 1 }, { valor: 2 }, { valor: 1 }]).direcao).toBe("estavel");
  });
});

// ── AS CONFERÊNCIAS ─────────────────────────────────────────
describe("o pedido pode ir?", () => {
  const bom = {
    prioridade: "rotina", solicitante: "Dr. X",
    indicacao_clinica: "anemia a esclarecer, Hb de ontem 9,0",
    itens: [{ descricao: "Hemograma completo", categoria: "laboratorial" }],
  };

  it("completo: passa", () => expect(conferirPedido(bom)).toBeNull());

  it("sem exame nenhum: recusa", () => {
    expect(conferirPedido({ ...bom, itens: [] })).toMatch(/ao menos um exame/i);
  });

  it("exame só com espaço em branco não conta", () => {
    expect(conferirPedido({ ...bom, itens: [{ descricao: "   " }] })).toMatch(/ao menos um exame/i);
  });

  it("🔴 sem indicação clínica: recusa, e diz para que ela serve", () => {
    const r = conferirPedido({ ...bom, indicacao_clinica: "dor" });
    expect(r).toMatch(new RegExp(`${MIN_INDICACAO} caracteres`));
    expect(r).toMatch(/o que procurar/);
  });

  it("prioridade inventada: recusa", () => {
    expect(conferirPedido({ ...bom, prioridade: "quando_der" })).toMatch(/rotina ou urgente/);
  });

  it("sem solicitante: recusa", () => {
    expect(conferirPedido({ ...bom, solicitante: " " })).toMatch(/quem está solicitando/i);
  });

  it("as duas prioridades do banco são as duas daqui", () => {
    expect(PRIORIDADES.map(p => p.chave).sort()).toEqual(["rotina", "urgente"]);
  });
});

describe("🔴 o valor digitado passa pelo leitor único do projeto", () => {
  it("vírgula, ponto e milhar, todos lidos como gente escreve", () => {
    expect(valorDigitado("7,2").valor).toBeCloseTo(7.2, 5);
    expect(valorDigitado("7.2").valor).toBeCloseTo(7.2, 5);
    expect(valorDigitado("150.000").valor).toBe(150000);
    expect(valorDigitado("1.234,56").valor).toBeCloseTo(1234.56, 5);
  });

  it("número já numérico passa intacto", () => {
    expect(valorDigitado(7.2).valor).toBeCloseTo(7.2, 5);
    expect(valorDigitado(0).valor).toBe(0);
  });

  it("🔴 campo em branco é VAZIO, não erro", () => {
    // Resultado só de laudo é legítimo. Tratar branco como erro impediria
    // de lançar laudo de imagem.
    expect(valorDigitado("")).toMatchObject({ vazio: true, valor: null, erro: null });
    expect(valorDigitado(null).vazio).toBe(true);
  });

  it("texto que não é número devolve erro citando o que foi digitado", () => {
    const r = valorDigitado("doze");
    expect(r.valor).toBeNull();
    expect(r.erro).toMatch(/doze/);
  });
});

describe("o resultado pode ir?", () => {
  const item = { id: 9, status: EXAME_SOLICITADO };

  it("com número: passa", () => {
    expect(conferirResultado({ valor_num: 14 }, item)).toBeNull();
  });
  it("com texto: passa", () => {
    expect(conferirResultado({ valor_texto: "negativo" }, item)).toBeNull();
  });
  it("com laudo: passa", () => {
    expect(conferirResultado({ laudo: "Sem alterações." }, item)).toBeNull();
  });

  it("🔴 zero passa — é valor", () => {
    expect(conferirResultado({ valor_num: 0 }, item)).toBeNull();
  });

  it("sem nada: recusa", () => {
    expect(conferirResultado({ valor_num: "", valor_texto: "", laudo: "" }, item))
      .toMatch(/não informa/);
  });

  it("valor que não é número: recusa, e cita o que foi digitado", () => {
    const r = conferirResultado({ valor_num: "doze" }, item);
    expect(r).toMatch(/não foi entendido/);
    expect(r).toMatch(/doze/);
  });

  it("🔴 `7,2` com VÍRGULA passa — é como se escreve em português", () => {
    // Era o defeito desta própria função: `Number("7,2")` é NaN, portanto
    // "não tem número", portanto "informe o valor" — com o valor digitado
    // ali na tela. Quem está na bancada escreve com vírgula.
    expect(conferirResultado({ valor_num: "7,2" }, item)).toBeNull();
    expect(linhaDoResultado({ valor_num: "7,2" }, item).valor_num).toBeCloseTo(7.2, 5);
  });

  it("🔴 `150.000` plaquetas é cento e cinquenta mil, não cento e cinquenta", () => {
    expect(linhaDoResultado({ valor_num: "150.000" }, item).valor_num).toBe(150000);
  });

  it("`1234.56` do analisador continua mil duzentos e trinta e quatro", () => {
    // Ponto decimal é o que sai de qualquer exportação de equipamento.
    expect(linhaDoResultado({ valor_num: "1234.56" }, item).valor_num).toBeCloseTo(1234.56, 5);
  });

  it("🔴 a recusa do número ilegível vem ANTES da de 'sem nada'", () => {
    // A ordem é o conserto: dizer o que está errado com o que a pessoa
    // escreveu vem primeiro de dizer que ela não escreveu nada.
    expect(conferirResultado({ valor_num: "abc", valor_texto: "", laudo: "" }, item))
      .toMatch(/não foi entendido/);
  });

  it("número negativo passa — excesso de base é negativo", () => {
    expect(conferirResultado({ valor_num: "-7,5" }, item)).toBeNull();
    expect(linhaDoResultado({ valor_num: "-7,5" }, item).valor_num).toBeCloseTo(-7.5, 5);
  });

  it("🔴 exame cancelado: recusa com a palavra do banco", () => {
    const r = conferirResultado({ valor_num: 1 }, { ...item, status: EXAME_CANCELADO });
    expect(r).toMatch(/CANCELADO/);
    expect(r).toMatch(/não foi feito/);
  });

  it("sem item: recusa", () => {
    expect(conferirResultado({ valor_num: 1 }, null)).toMatch(/Escolha o exame/);
  });

  it("correção sem motivo: recusa, e diz por que o anterior fica", () => {
    const r = conferirResultado({ valor_num: 180000, corrige_id: 1, motivo_correcao: "errado" }, item);
    expect(r).toMatch(new RegExp(`${MIN_MOTIVO_CORRECAO} caracteres`));
    expect(r).toMatch(/tratado o paciente com base nele/);
  });

  it("correção com motivo: passa", () => {
    expect(conferirResultado({
      valor_num: 180000, corrige_id: 1,
      motivo_correcao: "contagem automática confundiu agregado plaquetário; revisto em lâmina",
    }, item)).toBeNull();
  });

  it("cancelamento exige motivo", () => {
    expect(conferirCancelamento("x")).toMatch(/por que/);
    expect(conferirCancelamento("paciente transferido antes da coleta")).toBeNull();
  });
});

// ── O QUE VAI PARA O BANCO ──────────────────────────────────
describe("🔴 a tela não manda o que o gatilho calcula", () => {
  it("o resultado não leva anormal, critico nem versao", () => {
    const l = linhaDoResultado({ analito_id: 1, valor_num: 7.2, liberado_por: "Bioq. Y" }, { id: 9 });
    expect(l).not.toHaveProperty("anormal");
    expect(l).not.toHaveProperty("critico");
    expect(l).not.toHaveProperty("versao");
    expect(l.valor_num).toBe(7.2);
    expect(l.item_id).toBe(9);
    expect(l.liberado_por).toBe("Bioq. Y");
  });

  it("número vem como NÚMERO, não como string do input", () => {
    // O input devolve string. Mandar "7.2" faria o Postgres converter — e
    // "7,2" com vírgula viraria erro no meio da bancada.
    expect(linhaDoResultado({ valor_num: "7.2" }, { id: 1 }).valor_num).toBe(7.2);
    expect(typeof linhaDoResultado({ valor_num: "0" }, { id: 1 }).valor_num).toBe("number");
  });

  it("campo vazio vira null, não string vazia", () => {
    const l = linhaDoResultado({ valor_num: 1, valor_texto: "  ", laudo: "" }, { id: 1 });
    expect(l.valor_texto).toBeNull();
    expect(l.laudo).toBeNull();
  });

  it("motivo de correção só vai quando há correção", () => {
    expect(linhaDoResultado({ valor_num: 1, motivo_correcao: "sobrou do formulário" }, { id: 1 }).motivo_correcao)
      .toBeNull();
  });

  it("o pedido leva indicação, CBO e o elo com o episódio", () => {
    const l = linhaDoPedido(
      { prioridade: "urgente", indicacao_clinica: "sepse suspeita", solicitante: "Dr. X", solicitante_cbo: "225125" },
      { prontuario: "P001", ps_atendimento_id: 5, pep_episodio_id: 7 });
    expect(l).toMatchObject({
      prontuario: "P001", ps_atendimento_id: 5, pep_episodio_id: 7,
      prioridade: "urgente", solicitante_cbo: "225125",
    });
    expect(l).not.toHaveProperty("origem_registro_id");
  });

  it("os itens nascem solicitados e carregam o código do catálogo", () => {
    const itens = linhasDosItens({ itens: [
      { descricao: "Hemograma", categoria: "laboratorial", catalogo_id: 1 },
      { descricao: "  " },
    ] }, 42);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ pedido_id: 42, catalogo_id: 1, status: EXAME_SOLICITADO });
  });

  it("exame fora do catálogo entra com catalogo_id null, não some", () => {
    const itens = linhasDosItens({ itens: [{ descricao: "Exame externo trazido pelo paciente" }] }, 1);
    expect(itens[0].catalogo_id).toBeNull();
    expect(itens[0].categoria).toBe("outro");
  });
});

// ── O FORMULÁRIO ────────────────────────────────────────────
describe("🔴 o que sobrevive a um salvamento", () => {
  it("só quem liberou sobrevive — o valor NUNCA", () => {
    // Regra que virou regra depois do OPME, onde o formulário guardava o
    // fabricante e atribuía o fabricante errado a outro produto numa tabela
    // de rastreabilidade.
    const cheio = {
      analito_id: 1, nome: "Hemoglobina", valor_num: 7.2, valor_texto: "baixa",
      laudo: "x", liberado_por: "Bioq. Y", corrige_id: 3, motivo_correcao: "y",
    };
    const p = proximoFormulario(cheio);
    expect(p.liberado_por).toBe("Bioq. Y");
    expect(p.valor_num).toBe("");
    expect(p.valor_texto).toBe("");
    expect(p.laudo).toBe("");
    expect(p.analito_id).toBeNull();
    expect(p.corrige_id).toBeNull();
    expect(p.motivo_correcao).toBe("");
  });

  it("o formulário vazio não tem valor nenhum", () => {
    const v = formularioVazio();
    expect(v.valor_num).toBe("");
    expect(v.corrige_id).toBeNull();
  });

  it("o pedido vazio nasce em rotina e sem itens", () => {
    expect(pedidoVazio()).toMatchObject({ prioridade: "rotina", itens: [] });
  });
});

// ── O MUNDO ANTIGO ──────────────────────────────────────────
describe("o que veio do backfill", () => {
  it("pedido migrado é reconhecível", () => {
    // Serve para a tela não cobrar o que não existia: um pedido migrado não
    // tem indicação clínica nem CBO, e isso não é alguém que esqueceu.
    expect(veioDoRegistroAntigo({ origem_registro_id: 12 })).toBe(true);
    expect(veioDoRegistroAntigo({ origem_registro_id: null })).toBe(false);
    expect(veioDoRegistroAntigo({})).toBe(false);
  });
});

// ── O RESUMO DO DIA ─────────────────────────────────────────
describe("o resumo do dia", () => {
  const hoje = "2026-10-13";
  const pedidos = [
    { id: 1, criado_em: "2026-10-13T08:00:00.000Z", prioridade: "urgente" },
    { id: 2, criado_em: "2026-10-13T09:00:00.000Z", prioridade: "rotina" },
    { id: 3, criado_em: "2026-10-01T09:00:00.000Z", prioridade: "rotina" },
  ];
  const itens = [
    { id: 1, pedido_id: 1, status: EXAME_SOLICITADO },
    { id: 2, pedido_id: 1, status: EXAME_COLETADO },
    { id: 3, pedido_id: 2, status: EXAME_RESULTADO },
    { id: 4, pedido_id: 2, status: EXAME_VISTO },
    { id: 5, pedido_id: 2, status: EXAME_CANCELADO },
    { id: 6, pedido_id: 3, status: EXAME_SOLICITADO },  // de outro dia
  ];

  it("conta só o do dia, e os baldes fecham com o total", () => {
    const r = resumoDoDia(itens, pedidos, hoje);
    expect(r.total).toBe(5);
    expect(r.aguardando + r.prontos + r.vistos + r.cancelados).toBe(r.total);
    expect(r.aguardando).toBe(2);
    expect(r.urgentes).toBe(2);
  });

  it("FALHA atravessa nas duas pontas", () => {
    expect(resumoDoDia(FALHA, pedidos, hoje)).toBeNull();
    expect(resumoDoDia(itens, FALHA, hoje)).toBeNull();
  });

  it("item sem pedido casado não entra na conta do dia", () => {
    expect(resumoDoDia([{ id: 9, pedido_id: 999, status: EXAME_SOLICITADO }], pedidos, hoje).total).toBe(0);
  });
});

// ── O VOCABULÁRIO, QUE AGORA TEM CINCO ESTADOS ──────────────
describe("🔴 o vocabulário cresceu de três para cinco estados", () => {
  it("os cinco estados, na ordem do ciclo", () => {
    expect(EXAME_ESTADOS.map(e => e.chave)).toEqual([
      EXAME_SOLICITADO, EXAME_COLETADO, EXAME_RESULTADO, EXAME_VISTO, EXAME_CANCELADO,
    ]);
  });

  it("os checks do banco e esta lista dizem o mesmo", () => {
    // Se o banco aceitar um sexto estado, a tela cai no fallback
    // `solicitado` e o exame volta a parecer pendente para sempre.
    expect(EXAME_ESTADOS.map(e => e.chave).sort()).toEqual(
      ["cancelado", "coletado", "resultado_disponivel", "solicitado", "visto"]);
  });

  it("coletado já é reconhecido, não cai no fallback", () => {
    expect(estadoDoExame({ status: EXAME_COLETADO }).chave).toBe(EXAME_COLETADO);
    expect(estadoDoExame({ status: EXAME_CANCELADO }).chave).toBe(EXAME_CANCELADO);
  });

  it("🔴 status desconhecido continua lendo-se como pendente", () => {
    // Lê-lo como resolvido é sumir com ele da tela de quem espera.
    expect(estadoDoExame({ status: "extraviado" }).chave).toBe(EXAME_SOLICITADO);
    expect(estadoDoExame(null).chave).toBe(EXAME_SOLICITADO);
  });

  it("coletado oferece a mesma ação que solicitado", () => {
    expect(acaoDoExame({ status: EXAME_COLETADO })).toBe("lancar_resultado");
    expect(acaoDoExame({ status: EXAME_SOLICITADO })).toBe("lancar_resultado");
  });

  it("🔴 cancelado e visto não oferecem nada", () => {
    expect(acaoDoExame({ status: EXAME_CANCELADO })).toBeNull();
    expect(acaoDoExame({ status: EXAME_VISTO })).toBeNull();
  });

  it("EXAME_PENDENTES são exatamente os dois que ainda estão com o laboratório", () => {
    expect(EXAME_PENDENTES).toEqual([EXAME_SOLICITADO, EXAME_COLETADO]);
  });

  it("🔴 a contagem fecha com o total — o defeito que o cabeçalho previu", () => {
    // Quando `coletado` entrou, contar só `solicitado` em `aguardando` fazia
    // o exame coletado desaparecer das duas pontas: não aparecia como
    // pendente nem como pronto.
    const c = contarExames([
      { status: EXAME_SOLICITADO }, { status: EXAME_COLETADO },
      { status: EXAME_RESULTADO }, { status: EXAME_VISTO }, { status: EXAME_CANCELADO },
    ]);
    expect(c.total).toBe(5);
    expect(c.aguardando + c.prontos + c.vistos + c.cancelados).toBe(c.total);
    expect(c.aguardando).toBe(2);
    expect(c.coletados).toBe(1);
  });
});
