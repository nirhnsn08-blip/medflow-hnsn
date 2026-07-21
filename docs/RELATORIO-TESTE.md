# 🧪 Relatório de Teste — Carga de dados e caça a bugs

> Teste executado em 2026-07-20 no banco de desenvolvimento (Supabase `riuvyxppixeclxudsgpv`).
> Populamos o sistema com dados fictícios e exercitamos todos os módulos para achar erros.
> Todos os registros de teste têm `usuario = "teste-seed"` (ou prontuários 8000001–8000060).

## O que foi semeado
- 60 pacientes (`pacientes`)
- 18 internações em leitos de vários setores (`leitos`)
- 15 jornadas de Pronto-Socorro com triagem Manchester e sinais vitais (`ps_atendimentos`)
- 8 cirurgias na SALA 01, em todos os estados do fluxo (`cc_cirurgias`)
- 6 casos de vigilância SCIH (`scih_casos`)
- 20 lançamentos de Ambulatório (`atendimentos`)
- 2 evoluções clínicas (`pep_evolucoes`)

## Veredito geral
O app é **robusto**: nenhum crash, nenhum erro de console, nenhum `NaN`/`undefined`/`Invalid Date`
vazando na tela mesmo com volume de dados. Todos os módulos renderizaram e os cálculos
principais (ocupação, triagem, metas) bateram. Os bugs abaixo são de refinamento, não de quebra.

---

## 🔴 BUG CRÍTICO — Data "de hoje" calculada em UTC (afeta o Brasil todo entardecer)

**Sintomas observados:**
- **Bloco Cirúrgico:** o mapa abriu em **21/07 (amanhã)** enquanto o topo do app mostrava
  corretamente "segunda, 20/07". As 7 cirurgias de hoje ficaram invisíveis ("Sala livre") até
  trocar a data manualmente. Um cirurgião acharia que não há cirurgias no dia.
- **SCIH:** "coleta 10/07 · **há 11d**" quando o correto é 10 dias (hoje 20/07). Erro de +1 em
  todos os casos.

**Causa-raiz (confirmada no código):**
- `src/App.jsx:116` → `const todayStr = () => new Date().toISOString().slice(0,10);`
  `toISOString()` devolve a data em **UTC**. No fuso do Brasil (UTC-3), depois das ~21h locais,
  o UTC já virou o dia seguinte → `todayStr()` retorna amanhã.
- Esse `todayStr()` alimenta: o dia padrão do mapa cirúrgico (`:2942`), o contador `diasDesde()`
  (`:2305`, usado no SCIH e nos dias de internação), os "desfechos de hoje" do PS (`:3473`),
  dispensações de hoje da Farmácia (`:6460`), entre outros.
- **Inconsistência agravante:** outras partes do código usam `new Date()` + `setHours(0,0,0,0)`
  (horário LOCAL, correto — ex.: `:1511`, `:1895`, `:2108`). Ou seja, o app mistura duas fontes
  de "hoje" — uma certa e uma errada — então algumas telas ficam off-by-one e outras não.

**Impacto:** alto. O hospital-alvo é brasileiro (UTC-3); isso se manifesta **todo dia após ~21h**.

**Correção sugerida:** fazer `todayStr()` usar a data LOCAL, ex.:
```js
const todayStr = () => {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
```
E padronizar TODAS as noções de "hoje"/faixas de mês para local (revisar também
`new Date(ano, mes, 1).toISOString()` nas linhas ~5204 e ~5907, que têm o mesmo risco nas
bordas de mês).

---

## 🟡 MÉDIO — Métrica "atendimentos realizados" inconsistente (Ambulatório)

Na tela de uma especialidade (ex.: Cirurgia Geral), o mesmo conceito aparece com dois números:
- "ATENDIMENTOS NO MÊS: **90**" (= 1ªs 50 + retornos 40)
- Painel de metas: "Realizadas **109** / 103"

90 ≠ 109 para "realizado", na mesma tela. Além disso, 109 **ultrapassa** as 103 ofertadas
(>100%), sem limite. Para uma ferramenta de BI, isso mina a confiança. **Ação:** definir uma
única fórmula canônica de "atendimento realizado" e usá-la em todos os cartões/gráficos.

## 🟡 MÉDIO — Denominador do setor difere na mesma tela (Giro de Leitos)

POSTO 2 aparece como **0/19** no "Mapa de Leitos" e **0/18** em "Desempenho por Setor" — físicos
(19) vs operacionais (18, excluindo 1 interditado). É defensável, mas mostrar dois denominadores
para o mesmo setor confunde. **Ação:** rotular claramente (ex.: "19 físicos · 18 operacionais")
ou unificar.

## 🟢 BAIXO — Rótulo cru de tipo de evolução (Paciente 360)

A evolução de enfermagem exibe a chave técnica "evolucao_enfermagem" em vez de um rótulo
amigável. O mapa de tipos não cobre todas as variações. **Ação:** completar o dicionário de
rótulos (fallback amigável).

## 🟢 BAIXO — "em atendimento há —" (Pronto-Socorro)

Pacientes movidos direto para "em atendimento" sem `atendimento_em` mostram "há —". **Ação:**
preencher `atendimento_em` na transição de status, ou exibir um texto melhor que "—".

## 🟢 BAIXO — Farmácia: 159 rupturas, 0 "abaixo do mínimo"

159 itens com saldo zero, mas 0 sinalizados "abaixo do mínimo" (porque `estoque_minimo` padrão é
0). Coerente na regra, confuso na prática. **Ação:** tratar saldo zero como alerta de reposição
independente do mínimo, ou orientar o cadastro de mínimos.

## 🔵 COSMÉTICO — Falta espaço em "Centro de Monitoramento —HNSN"

Título concatena o traço com a sigla sem espaço. **Ação:** "— {SIGLA}".

## 🟢 BAIXO — Achados da varredura completa (todas as sub-abas)

- **Farmácia Dashboard × Estoque inconsistentes:** o Dashboard mostra "ABAIXO DO MÍNIMO: 0",
  mas a tela Estoque mostra "REPOSIÇÃO: 159 abaixo do mínimo / zerados". Mesma realidade,
  contagens diferentes em telas diferentes. **Ação:** unificar a regra de reposição.
- **Giro › Relatórios & BI — minutos fracionados:** "Disponibilizado → Pronto 1h 3.5min" e
  "Pronto → Entrada 10h 3.75min". Exibir minutos com casas decimais. **Ação:** arredondar.
- **Giro › Relatórios & BI — rótulo sem espaço:** eixo do gráfico mostra "BLOCOCIRURGICO"
  (sem espaço). **Ação:** formatar o label do setor.
- **Banco de Dados — instruções desatualizadas:** o passo 5 manda editar
  `window.SUPABASE_URL` no `index.html`, mas o app usa variáveis `.env`/Vercel
  (`import.meta.env.VITE_SUPABASE_*`). Mesma defasagem existe no README. **Ação:** atualizar
  o guia interno e o README para o fluxo `.env`.
- **Importar Dados — texto de botão redundante:** "Excluir Apagar todos os dados"
  (duas palavras de ação). **Ação:** "Apagar todos os dados".

## ⚪ Verificado e DESCARTADO (não é bug)
- Um `<span>` com "160" aparece no texto de várias telas, mas está posicionado em
  `top: -20000px` (fora da tela) — é um elemento oculto de medição de biblioteca, **invisível
  ao usuário**. Não é bug.

---

## Cobertura do teste (≈40 telas — todas passaram sem crash)
- **Visão Geral / Centro de Monitoramento** ✓
- **Ambulatório:** Cirurgia Geral, Oftalmologia, Ginecologia, Urologia, Ortopedia ✓
- **Pronto-Socorro** ✓
- **Bloco Cirúrgico:** Mapa do dia, Indicadores ✓
- **Giro de Leitos:** Dashboard, Mapa de leitos, Fila de internação, Pacientes, Alta segura,
  Altas, Transferências ext., Internações, Relatórios & BI, Alertas inteligentes, IA Assistente ✓
- **SCIH:** Base de germes, Vigilância & Isolamentos, Indicadores & Relatórios ✓
- **Farmácia:** Dashboard, Prescrições, Solicitações, Dispensações, Intervenção, Estoque,
  Interações, Controlados, Não padronizados, Relatórios & BI, Assistente AI ✓
- **Paciente 360** ✓
- **Administração:** Auditoria, Importar Dados, Banco de Dados, Usuários ✓
  (a Edge Function `admin-usuarios` respondeu — gestão de usuários operante; impede
  desativar a si mesmo, comportamento correto).

Nenhuma tela apresentou crash, erro de console ou valor quebrado (`NaN`/`undefined`/`Invalid
Date`) visível ao usuário.

---

## ✅ O que funcionou bem (não mexer sem motivo)
- Triagem Manchester classificando por sinais vitais, com filas por prioridade e "tempo estourado".
- Fluxo cirúrgico completo (Agendada → Check-in → Em cirurgia → RPA → Concluída) + checklist OMS.
- Timeline integrada do Paciente 360 (une internação + evoluções + idade + status do leito).
- Cálculo de ocupação por setor, alertas "RESTRINGIR" a 100%, previsão de vagas.
- SCIH com base de germes, isolamentos e dias de ATB.
- Robustez geral: sem crashes, sem erros de console, sem valores quebrados na tela.

## Próximos passos sugeridos (para o board de trabalho)
1. **[Crítico]** Corrigir `todayStr()` para data local e padronizar "hoje" em todo o app.
2. **[Médio]** Unificar a definição de "atendimento realizado" no Ambulatório.
3. **[Médio]** Padronizar denominadores físico/operacional no Giro de Leitos.
4. **[Baixo]** Rótulos de evolução, `atendimento_em` no PS, alerta de ruptura na Farmácia, título.
5. **[Higiene]** Depois dos testes, limpar os dados `teste-seed` do banco.
