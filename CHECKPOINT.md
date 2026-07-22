# 📍 Ponto de restauração — checkpoint-v40

Este é um **ponto seguro** do projeto. Se alguma mudança futura quebrar algo,
dá pra voltar exatamente para este estado.

- **Tag Git mais recente:** `checkpoint-v40` (anteriores: `checkpoint-v39` … `checkpoint-v1`)
- **Data:** 2026-07-22
- **Equipe:** projeto agora com 2 devs; publicação por **branch + Pull Request**
  (merge na `main` = vai ao ar). Inclui as PRs de QA e docs do Adauam Feistler.
- **Publicado e funcionando** no HNSN (`medflow-hnsn.vercel.app`).
- ⚠️ **Banco do demo congelado** (decisão de 2026-07-16): trabalhamos só no HNSN.
  O site demo recebe o código novo, mas sem as migrações de banco — salvar nas
  telas novas dá erro lá (esperado).

## O que já está pronto neste ponto
- **Login seguro** (Supabase Auth) + permissões por papel + auditoria. Banco trancado por RLS.
- **Atendimentos** por especialidade, com sincronização entre computadores.
- **Giro de Leitos — Fase 1:** painel de leitos (livre/ocupado/interditado), internação
  (iniciais+prontuário, CID, diária de AIH), previsão de alta e sinaleira 🟢🟡🔴.
- **Giro de Leitos — Fase 2:** fluxo de higienização com cronômetro, tempos de
  solicitado/disponibilizado/pronto/entrada e painel 📊 de indicadores.
- **Sugestão de dias por CID** (tabela de referência editável).
- **Multi-hospital:** mesmo código serve vários hospitais, cada um com seu banco
  (isolamento físico). Nome por `VITE_HOSPITAL_*`. Ver [ONBOARDING.md](ONBOARDING.md).
- **Barra lateral:** especialidades agrupadas na aba **Ambulatório** (expansível).
- **Fase 3 — Modo claro/escuro** (botão 🌙/☀️, tema via CSS variables, salvo por navegador).
- **Fase 3 — Visão Geral = Centro de Monitoramento:** ocupação global, giro, permanência,
  **alertas por setor** (com fila + "restringir"), **fila de solicitações de leito**
  (origem→destino, tempo de espera) e metas das especialidades. Setores geridos em
  Giro de Leitos → 🏷️ Setores; cada leito tem um seletor de setor.
- **💊 Tratamento sugerido por CID:** cada referência de CID pode ter um texto de
  tratamento (base na literatura, revisado pela equipe). Aparece no 📚 Referências
  de CID e no modal de internação ao digitar o CID. 8 CIDs pré-preenchidos no HNSN.
- **⏳ Fila de espera separada da ocupação:** a lista de espera por leito não conta
  mais na % de ocupação do setor; aparece como selo âmbar com tempo de espera.
- **🦠 Aba SCIH — Fase A:** precauções/isolamentos (aéreo/contato/gotículas, base
  Anvisa/CDC), sinalização de isolamento por leito (selo + seletor no card),
  cadastro de casos de vigilância (cultura, germe, multirresistente, antibiótico,
  dias de ATB) com contagem de dias.
- **🦠 Aba SCIH — Fase B:** base de germes (🧬) com embasamento literário; ao digitar
  o germe no caso, sugere o isolamento e marca multirresistente. 14 germes pré-carregados.
- **🦠 Aba SCIH — Fase C:** alternador Vigilância | Indicadores. Lançamento mensal
  manual (exames, culturas, higiene de mãos, PAV, cirurgias limpas+ISC, antimicrobiano
  DOT, treinamentos), taxas calculadas automaticamente, tendência dos últimos meses
  e relatório do mês (imprimir/PDF) para a CCIH.
- **✨ Rebrand VALENTRAX (Healthcare Operations):** nova marca "Inteligência para o
  fluxo hospitalar" — logo hub de correntes convergindo no núcleo, login corporativo
  azul-marinho, cabeçalho com hospital à direita, favicon/título novos e relatórios
  assinados pela Valentrax.
- **✨ Identidade interna corporativa:** tema escuro em azul-marinho e claro em
  cinza-frio; ícones SVG de linha na barra lateral (sem emojis decorativos no app);
  paleta de gráficos categórica validada por script (contraste + daltonismo):
  teal/azul/âmbar/índigo/rosé; botões secundários neutros; cores de status
  (verde/âmbar/vermelho) reservadas para semântica real.
- **🏥 Pronto-Socorro (1º módulo do HIS por processos):** chegada → triagem com
  classificação de risco Manchester (guia embutido) → fila por prioridade com
  cronômetro contra o tempo-alvo (alerta de estouro) → atendimento → desfecho.
  Triagem coleta **sinais vitais** (PA, FC, FR, SpO2, temp, dor, AVPU, glicemia) e
  **sugere a classificação automaticamente** pelos discriminadores (selo SUGERIDA;
  decisão final da triadora; aviso pediátrico <13 anos desativa a sugestão).
  Reavaliação com histórico de aferições (ps_sinais append-only, sugerida × escolhida)
  e indicadores do dia (distribuição por cor, % no tempo-alvo, matriz sóbria).
  Desfecho "Internação" abre a solicitação de leito
  automaticamente — primeira
  **jornada do paciente ponta a ponta**: PS → fila → leito → alta → higienização.
  Indicadores: porta→triagem, permanência média, atendidos hoje. Testado e validado.
- **🏥 Pronto-Socorro REFORMULADO (barra lateral dupla + salas + protocolo):**
  o módulo ganhou **barra lateral própria com dois blocos**, no padrão Farmácia:
  - **TRIAGEM:** Painel de Triagem · Classificar Paciente · Fila de Espera ·
    Reavaliação · Protocolo Manchester · Indicadores.
  - **EMERGÊNCIA (PS):** Painel da Emergência · Em atendimento · Leitos
    detalhados · Transferências · Aguardando leito · Assistente IA.
  - **Manchester adaptado do HNSN:** nomenclatura oficial da unidade
    (Imediato 0min · Rápido 10min · Breve 60min · Moderado 120min · Não
    prioritário 240min) nos cards, no guia e na triagem. Aba **Protocolo**
    com material didático: 5 cards por nível (sinais/discriminadores e
    conduta), 6 discriminadores gerais e a escala AVPU. As faixas de sinais
    vitais mostradas são as mesmas que o motor usa para sugerir.
  - **Painel:** 6 cards de risco compactos numa linha (5 cores + aguardando
    classificação) com **tempo-alvo** e selo de **fora do alvo**; faixa de
    segurança; rosca da distribuição do dia; e a seção do PS com 6 KPIs
    (em atendimento, aguardando, leitos ocupados, **óbitos**, tempo médio de
    permanência, atendidos) + Pacientes em Atendimento e Mapa de Salas lado a
    lado e Encaminhamentos em largura total.
  - **🛏️ Mapa de vagas do PS (`ps_salas`)** no modelo Giro de Leitos: 24 vagas
    por área (Sala Vermelha 3 · Laranja 3 · AVC 5 · Isolamento AQUARIO+GUARIDA ·
    Pediatria 2+1 iso · Observação 3 · Procedimento 3 · PCR 2), com status
    disponível/ocupado/limpeza/manutenção, alocação de paciente e cronômetro.
    ⚠️ **Regra de censo (`conta_censo`):** observação, procedimento, PCR e
    isolamento infantil são **retaguarda provisória** e **NÃO entram nos 75
    leitos do hospital** — contam só no panorama do PS. 15 no censo · 9 de
    retaguarda. O mapa exibe os dois grupos separados e marca a retaguarda com "R".
  - **Transferências** com via **Vaga Zero / GERINT / contato direto**, escolhida
    no desfecho e contabilizada no painel.
  - **Card de desfechos** separando **óbito no PS (antes de internar)** de
    **óbito após internação** — fontes diferentes, não somar.
  - **Protocolos institucionais** (`ps_protocolos`): biblioteca com busca e
    **cadastro próprio** (título, categoria, passos, referência).
  - **Assistente IA local** do PS + busca rápida **Ctrl+K** nas telas de lista.
  - **Estoque na prescrição:** ao prescrever, selo **SEM ESTOQUE / estoque baixo**
    e botão **similares com saldo** (mesmo princípio ativo ou classe); aviso ao
    assinar. A baixa continua na dispensação da Farmácia (momento correto).
  - Migrações: `supabase/migracao-ps-salas.sql` e `-ps-salas-censo.sql`
    (rodadas no HNSN em 2026-07-21).
  - **🔗 Jornada do paciente auditada e costurada (blocos 1 e 2):**
    - **Origem da chegada** (`ps_atendimentos.origem` / `origem_detalhe`):
      Meios próprios · SAMU · Transalva · Polícia Militar · Bombeiros ·
      **GERINT (aceite)** com a unidade (PA Torres, Arroio do Sal, Três
      Cachoeiras, outra). Selo na fila + seção **Procedência** nos Indicadores
      (base da pactuação regional).
    - **Prontuário obrigatório** na recepção — era opcional e quebrava o rastro.
    - **Elo forte PS → fila → leito** por `ps_atendimento_id` em
      `solicitacoes` e `leitos`. Antes o vínculo era pelo número do prontuário
      como TEXTO: se viesse vazio ou digitado diferente, o paciente sumia da
      tela "Aguardando leito". Prontuário fica só como reserva.
    - **Categoria profissional na evolução** (`ps_registros.categoria`, sem
      migração): Médica · Enfermagem · Técnico · Fisio · Outro, com selo no
      registro e rótulo correto na linha do tempo do Paciente 360 — antes tudo
      era rotulado "Evolução médica" mesmo escrito por enfermeiro/técnico.
    - Migração: `supabase/migracao-ps-origem-elo.sql` (rodada no HNSN em 2026-07-21).
  - **💉 Checagem de medicação administrada (bloco 3 da jornada):** fecha o maior
    furo de segurança do fluxo — a cadeia do medicamento terminava em *"a farmácia
    dispensou"*, o que prova que ele **saiu do estoque**, não que **entrou no
    paciente**. Nova tabela `ps_administracoes` (**append-only**, sem update/delete).
    - **Aba Checagem** no atendimento do PS, ao lado de Evoluções/Prescrição/Exames:
      por item prescrito mostra o que a farmácia entregou, **doses administradas ×
      previstas por dia** (quando a prescrição tem frequência) e o histórico assinado.
      Registra **administrado** ou **não administrado** — este com **motivo
      obrigatório** (recusa, jejum, acesso perdido, paciente ausente, suspenso pelo
      médico, sem estoque, intercorrência), **categoria profissional** (enfermeiro,
      técnico, médico, outro) e **hora editável**, porque à beira do leito se
      administra primeiro e se registra depois. Hora futura é recusada.
    - **Tela Checagem de medicação** na barra lateral EMERGÊNCIA: lista de trabalho
      da enfermagem com os pacientes cuja medicação foi entregue e **não checada**,
      ordenada pelo que espera há mais tempo, **vermelha acima de 1h**. O botão abre
      o paciente já na aba certa. Os cards de *Em atendimento* ganharam o selo
      **"N medicamento(s) sem checagem"**.
    - Limite consciente: a lista cobre quem está **em atendimento**; quem já teve
      desfecho e aguarda leito não aparece (o grupo do bloco 4/NIR).
    - Migração: `supabase/migracao-ps-checagem-medicacao.sql` (rodada no HNSN em
      2026-07-22). Modelo escolhido: **checagem simples**, não aprazamento por slots.
- **💊 Farmácia — Fase A (catálogo + estoque):** módulo próprio com catálogo de
  medicamentos (princípio ativo, classe terapêutica, forma, unidade, estoque mínimo,
  marcação de **Controlado / Portaria 344**), controle de estoque **por lote e
  validade (FEFO)** — entradas (lote, validade, quantidade, nota) e saídas com baixa
  automática, sem deixar o saldo ficar negativo. **Kardex imutável** (histórico de
  todos os movimentos), **alertas de reposição** (abaixo do mínimo/zerado) e de
  **validade** (vencidos ou vencendo em ≤30 dias). Tela **agrupada por classe** com
  filtro. Catálogo inicial com **~164 medicamentos em 22 classes** já carregado
  (só catálogo, sem estoque).
- **💊 Farmácia — Fase B (prescrição estruturada + dispensação):** a prescrição do
  Pronto-Socorro virou **estruturada** — o médico monta itens escolhendo do catálogo
  (dose/posologia, via, quantidade) e **assina** (registro clínico imutável). A
  Farmácia ganhou a aba **Dispensação**: fila de pacientes do PS com itens pendentes,
  baixa de estoque **por lote (FEFO)** respeitando o saldo, com o paciente vinculado
  ao movimento; e **dispensação avulsa** (paciente/setor digitados, ex.: internado).
  Cada item mostra o status **pendente / parcial / dispensado**.
- **💊 Farmácia — Fase C (indicadores):** aba **Indicadores** (só leitura) com KPIs do
  mês (itens/quantidade dispensada, entradas, perdas por vencimento, rupturas, lotes
  vencendo ≤30d), **curva ABC** do consumo por medicamento (A 80% / B 15% / C 5%),
  consumo por classe terapêutica, **controlados dispensados** (Portaria 344), painel
  de validade & rupturas e **relatório mensal imprimível/PDF**. Valores por quantidade
  (sem custo financeiro cadastrado). **Módulo Farmácia completo (A+B+C).**
- **💊 Farmácia Clínica — Fase 1 (motor de alertas, estilo NoHarm.ai):** apoio à
  decisão que analisa a prescrição estruturada do PS. **Contexto clínico** do paciente
  (idade, peso, ClCr/TFG, função hepática, alergias, sonda, gestante) na aba Prescrição.
  Prescrição estruturada com **dose (valor + unidade + frequência + duração)**. Motor
  gera **7 tipos de alerta** por gravidade (alta/média/baixa): **duplicidade** (princípio
  ativo/grupo), **dose máxima diária**, **tempo de tratamento**, **sonda (não triturar)**,
  **inapropriado idoso (Beers)**, **inapropriado criança** e **alergia + reatividade
  cruzada** (betalactâmicos, sulfonamidas, AINEs). Ao prescrever um medicamento a que o
  paciente é alérgico, o sistema **bloqueia** exigindo confirmação do prescritor. Alertas
  ao vivo na aba Prescrição + sub-aba **Farmácia → Análise clínica** (com selo de alérgico
  por paciente). **Base de conhecimento editável** por medicamento (~50 pré-carregados de
  Beers/pediatria/dose máx/sonda — para validação da equipe). É apoio à decisão, não
  certificado.
- **💊 Farmácia Clínica — Fases 2 e 3 (interações, incompatibilidade em Y, ajuste
  renal/hepático):** completa os **9 tipos de alerta** (estilo NoHarm.ai). **Interação
  medicamentosa** (base `farm_interacoes` com gravidade grave/moderada/leve; ~27 pares
  clássicos) e **incompatibilidade em Y** (base `farm_incompat_y`; ~14 pares; só quando
  ambos IV) — as substâncias casam por princípio ativo, nome **ou grupo** (ex.: um par
  "opioide × benzo" cobre a classe toda). **Editor curável** "Base de interações" na
  Análise clínica. **Ajuste de posologia por função renal (ClCr/TFG) e hepática** — alerta
  quando o paciente tem função reduzida e o medicamento tem orientação de ajuste (~45
  medicamentos pré-carregados; editável por medicamento). Tudo apoio à decisão, base
  sujeita a validação da equipe.
- **💊 Dispensação priorizada + Score + filtros (estilo NoHarm):** a fila de
  dispensação é **priorizada por gravidade** (cor Manchester) e **score**, com um
  **Score de prescrição 0–3** por paciente e por item (0 boa → 3 ruim), calculado
  **localmente e de graça** a partir da base clínica (dose, frequência e alertas).
  Barra de **filtros completa**: busca (iniciais/prontuário), situação (Manchester),
  status (pendentes/dispensados), score mínimo, **tipo de alerta** (alergia, interação,
  incompatibilidade em Y, dose máxima, duplicidade, tempo, sonda, idoso, criança,
  ajuste renal/hepático), **só controlados** e ordenação (prioridade/score/nome/chegada).
  Cada card mostra os chips dos alertas presentes.
- **💊 Fluxo de preparo com notificação sonora:** ao assinar a prescrição no PS, ela
  entra no ciclo **aguardando farmácia → em preparo → pronto → retirada** (tabela
  `farm_preparo`). Nova aba **Farmácia → Preparo** (quadro): a farmácia **recebe**
  (🔔 bipe + aviso), **separa** (baixa de estoque), **marca pronto** (🔔 avisa o posto)
  e a enfermagem **confirma a retirada**. Banner no topo do **Pronto-Socorro** lista as
  medicações **prontas para retirada** com bipe e botão Retirar. Botão **"Ativar som"**
  por computador (áudio local via WebAudio, sem depender de arquivo). Avisos por
  polling (~12s), sem custo. Itens prescritos **sem quantidade** também podem ser
  dispensados (a farmácia digita a quantidade, sugerida pela dose).
- **💊 Custos por paciente:** cada medicamento tem **custo unitário (R$)** editável
  (Estoque → Editar). Os **Indicadores** ganharam KPI de **custo dispensado no mês**,
  **ranking de custo por paciente** e coluna de **custo na curva ABC**; o card da
  Dispensação mostra o custo já dispensado do paciente. (Modelo por custo unitário do
  medicamento — dá pra evoluir para custo por lote/compra.)
- **💊 Livro de controlados (Portaria 344):** aba **Controlados** com **saldo, balanço
  mensal** (saldo inicial · entradas · saídas · saldo final) e **livro de movimentação**
  (saldo corrente linha a linha, com paciente/documento/usuário) dos medicamentos
  marcados como Controlado; **balanço imprimível/PDF**. Sem migração — apura do histórico.
- **💊 Medicamentos não padronizados (trazidos pela família):** aba própria para
  **registrar e controlar** medicamentos **fora do catálogo** que o paciente/família
  traz — recebimento (paciente, medicamento, apresentação, quantidade, lote/validade,
  quem trouxe), **conferência** pelo farmacêutico e status **recebido → em uso →
  devolvido/descartado**, com busca e filtro.
- **💊 Intervenção farmacêutica (estilo NoHarm):** identifica o problema, propõe a
  conduta e acompanha o **desfecho** (pendente → aceita / não aceita → resolvida).
  Alimentada pelos alertas do motor (botão **Intervir** já preenche o registro) ou
  manual. KPIs (pendentes, aceitas, **taxa de aceitação**).
- **💊 Farmácia reformulada (barra lateral própria, cores Valentrax):** ao entrar na
  Farmácia abre uma **barra lateral interna** com ícones (turquesa/azul/cinza):
  **Dashboard** (visão geral com atalhos), **Prescrições**, **Solicitações**,
  **Dispensações**, **Intervenção**, **Estoque**, **Interações**, **Controlados**,
  **Não padronizados**, **Relatórios & BI**, **Assistente AI**.
  - **Estoque** ganhou **previsão de demanda (7 dias)**: consumo médio dos últimos 30
    dias → cobertura em dias, demanda prevista e **sugestão de compra**; painel de
    **previsão de ruptura**.
  - **Relatórios & BI**: **Top 5 medicamentos do mês** + **prescrições por status**
    (aguardando/preparo/pronto/retirado), além de curva ABC, custos e PDF.
  - **Assistente AI**: assistente **local e gratuito** (chat por palavras-chave) que
    responde sobre o setor a partir dos dados — pendências, o que vai faltar em 7 dias,
    mais usados, custos por paciente, controlados, validade, alertas e intervenções.
    Nada é enviado para fora.
- **💊 Refino — aviso ao prescritor no PS + assistente ampliado:** quando o
  farmacêutico registra uma **intervenção**, ela aparece num **banner no
  Pronto-Socorro** (problema + conduta sugerida) para o paciente ainda no PS; o
  médico responde **aceita / não aceita** ali mesmo (fecha o ciclo, com bipe).
  Casa por `atendimento_id` ou prontuário — sem tabela nova. O **Assistente AI**
  da Farmácia ganhou intents: **panorama** do setor, **zerados**, **consumo por
  classe**, **dispensações do mês/hoje**, **tamanho do catálogo**, **validade
  detalhada** (lista de lotes vencendo) e saudações.
- **🛏️ Giro de Leitos REFORMULADO (Fases 1–5 + Modo TV, sem migração de banco):**
  módulo com **barra lateral própria** (padrão Farmácia): Dashboard, Mapa de leitos,
  Fila de internação, Pacientes, Altas, Transferências ext., Internações,
  Relatórios & BI, Alertas inteligentes, IA Assistente.
  - **Dashboard:** KPIs (ocupação global, disponíveis, aguardando internação, altas
    previstas 24h, permanência média, **giro vs mês anterior**, fator de utilização),
    mini-mapa por setor, tempos de giro (solicitado→disp→pronto→entrada), desempenho
    por setor e **previsão de vagas 24/48h**.
  - **Mapa de leitos:** cards corporativos (faixa de acento, selo, badges), **chips de
    setor** na ordem fixa (Emergência, AVC, Posto 1–3, Psiquiatria, UTI) — clicar mostra
    só o setor; "Todos" empilha. **6 status**: livre/ocupado/higienização/**reservado/
    manutenção/bloqueado externo**/interditado + botão **Transferir** (externa).
  - **Listas:** fila com cronômetro + vagas previstas no destino; censo de pacientes;
    altas; transferências (desfecho=transferencia, destino no motivo); internações.
  - **Relatórios & BI:** KPIs com Δ vs mês anterior, gráficos (saídas 12m, permanência,
    ocupação por setor, tempos de giro) e **relatório imprimível/PDF** Valentrax.
  - **Alertas inteligentes** (local): ocupação crítica, alta vencida/próxima,
    higienização demorada, setor lotado, fila parada e **leito livre com fila**.
  - **IA Assistente** local/grátis (panorama, vagas previstas, ocupação por setor…).
  - **Inteligência:** **reserva automática do PS** (desfecho Internação reserva o leito;
    "✓ Chegou — internar" fecha o ciclo com tempo real) e **média real de permanência
    por CID** (aprende do histórico) no modal de internação.
  - **📺 Modo TV:** painel de parede tela cheia somente leitura (tiles por setor, KPIs,
    vagas previstas, alertas, fila), atualização automática a cada 60s, sai com Esc.
  - **✅ Alta segura (Kanban):** checklist de pendências por paciente (liberação clínica,
    exames, receita, sumário, família, transporte, serviço social) + turno previsto;
    3 colunas (internado → preparando alta → pronto para alta) que se movem sozinhas;
    limpa na alta. Guarda em `leitos.alta_pendencias` (JSON) e `leitos.alta_periodo`.
  - **🎯 Metas por setor:** meta de ocupação/permanência/giro cadastráveis (Setores);
    farol verde/vermelho no BI pela ocupação atual × meta.
  - **⏳ Motivo da espera na fila:** categoria de gargalo por solicitação (sem vaga,
    aguardando limpeza/exame/família/transporte, regulação) + resumo de gargalos.
  - **Migração:** `supabase/migracao-leitos-kanban-metas.sql` (rodada no HNSN em 2026-07-19).
- **📋 Paciente 360 (embrião do prontuário eletrônico):** busca por prontuário/iniciais,
  cadastro mínimo (LGPD), linha do tempo automática agregando PS + internações +
  altas + SCIH + evoluções, alertas sentinela, evoluções multiprofissionais
  imutáveis (sem UPDATE/DELETE no banco) com ditado por voz (pt-BR) e **resumo de
  passagem de plantão** gerado localmente (gratuito, dados não saem do navegador;
  versão IA dormante em supabase/functions). Testado.
- **🔪 Bloco Cirúrgico (completo, A+B+C):** salas com reserva e detecção de conflito,
  agenda com materiais/OPME, mapa cirúrgico do dia, check-in, checklist de Cirurgia
  Segura da OMS (Sign In/Time Out/Sign Out com itens oficiais), tempos cirúrgicos,
  RPA com cronômetro, cancelamento com motivo padronizado e indicadores (ocupação
  de salas, taxa/motivos de cancelamento, produtividade por cirurgião, adesão ao
  checklist). Testado e validado.
- **🛏️ Giro de Leitos — permanência/giro POR SETOR + altas antes das 10h:** a saída
  do leito passa a gravar o **setor** (`leitos_saidas.setor`); o BI de Metas por setor
  ganhou **farol com dados reais** (ocupação atual × meta, permanência e giro do mês
  por setor) e um KPI novo **"Altas antes das 10h"** (hora em que o leito vagou).
  Migração `supabase/migracao-leitos-saida-setor.sql` (rodada no HNSN em 2026-07-20).
- **👤 Gestão de usuários pelo ADM Master (na própria conta):** a aba **Usuários**
  agora permite ao `adm_master` **criar** usuário (nome, login, perfil, senha),
  **editar o perfil** (papel) inline, **redefinir a senha** de qualquer um e
  **ativar/desativar** o acesso (bloqueio reversível — não apaga histórico). Feito
  com segurança via **Edge Function `admin-usuarios`** (roda no servidor com a
  service_role; valida o JWT e confere que o chamador é `adm_master`). Nenhuma chave
  de administrador vai para o navegador. Usuários não-master seguem com lista
  somente-leitura + trocar a própria senha. **Sem migração de banco.** Requer o
  deploy da função: `supabase functions deploy admin-usuarios` (`deploy-funcao.bat`).
- **📦 Estoque & Compras (Suprimentos) — Fases A e B:** módulo novo com barra
  lateral própria (padrão Farmácia) para o **almoxarifado geral** — materiais
  médico-hospitalares, EPI, higiene, escritório, impressos, rouparia, nutrição,
  manutenção, informática e laboratório.
  - **Fase A:** catálogo agrupado por categoria (busca + filtro), estoque **por
    lote e validade** (entradas com NF e fornecedor; saídas com motivo e setor,
    sem saldo negativo), **kardex imutável**, painéis de reposição/validade,
    **previsão de demanda 7 dias com sugestão de compra** e cadastro de
    **fornecedores** (razão social, CNPJ, contato, o que fornece).
  - **Fase B:** **requisições de materiais pelos setores** (setores vêm do
    cadastro do Giro de Leitos) — quadro *aguardando → em separação → pronto →
    entregue* com cronômetro, **bipe** na chegada (padrão preparo da Farmácia),
    **baixa FEFO automática** na separação (kardex `REQ-<nº>` com setor de
    destino) e atendimento **parcial** quando falta saldo (selo PARCIAL,
    atendido/pedido). Histórico à parte.
  - **Seed:** catálogo inicial com **~120 materiais em 10 categorias** carregado
    no HNSN (insere por nome — seguro rodar de novo). Testado e validado.
  - **Fase C — Compras:** pedidos por fornecedor com itens de **material E
    medicamento** no mesmo pedido (custo unitário e total em R$, entrega
    prevista), botão **⇩ importar sugestão de compra** (traz o que a previsão
    de demanda diz que acaba em 7 dias, do almoxarifado E da Farmácia), ciclo
    *em elaboração → enviado → parcial → recebido* e **recebimento com entrada
    automática** no estoque certo (material no kardex do almoxarifado com
    fornecedor; medicamento no kardex da Farmácia), com NF/lote/validade por
    item e recebimento em várias vezes. Testado e validado.
  - **Fase D — Relatórios & BI + Assistente:** aba **Relatórios & BI** com
    seletor de mês, 8 KPIs (consumo qtd/custo, entradas/gasto em compras,
    perdas, requisições entregues, rupturas, validade), rankings de **top
    materiais, consumo por setor, por categoria e gasto por fornecedor**,
    **curva ABC por custo de consumo** e **relatório mensal imprimível/PDF**
    Valentrax; e aba **Assistente AI** local/gratuito (panorama, o que vai
    faltar, zerados, validade, consumo/gasto do mês, requisições, pedidos,
    fornecedores, saldo por nome — nada sai do navegador). Sem migração.
    **Módulo Estoque & Compras completo (A+B+C+D).**
  - **💼 Painel Executivo:** visão financeira do estoque **almoxarifado +
    Farmácia** — capital parado (saldo × custo), **capital liberável** (excesso
    acima de 30 dias de cobertura + mínimo, com a lista de onde está),
    **economia vs mês anterior** (compras), **perdas por vencimento** com % de
    redução, **rupturas previstas em 7 dias** (MAT+MED), **medicamentos que
    mais custam por paciente** e **consumo por setor em R$ com Δ%** (vermelho
    >10% = investigar desperdício). Critérios transparentes no rodapé; local e
    sem migração. Indicadores comparativos ganham significado a partir do 2º
    mês de uso.
  - **⏰ Vencimentos inteligentes:** aba própria com manchete ("Existem X
    unidades vencendo em 30 dias — R$ Y em risco"), faixas vencido/≤30d/
    31–90d/**não serão consumidos a tempo** (cruza lote × consumo médio) e
    **ação sugerida** por lote (consumir FEFO, priorizar/remanejar, baixa,
    devolução). Materiais + medicamentos.
  - **📈 Estoque preditivo:** aba com previsão item a item — "no ritmo atual
    acaba em ~N dias" com data prevista, situação (crítico/atenção/ok), busca,
    filtro MAT/MED e sugestão de compra.
  - **💼 Painel Executivo ampliado:** **mapa hospitalar** (card por setor com
    consumo R$, Δ%, requisições e item mais consumido), **simulador
    financeiro** ("e se aumentarmos antibióticos em 30%?" → capital
    adicional + cobertura antes/depois, alerta >90d) e **fármacos
    monitorados** (constante SUP_FARMACOS_MONITORADOS: morfina, fentanil,
    alteplase, tenecteplase, contraste, albumina — saídas, custo, % de uso,
    pacientes, saldo, selo P.344). Tudo sem migração.
  - **🔢 Inventário cíclico + 💰 custo médio ponderado + 📷 código de barras:**
    aba **Inventário** com fila de contagem rotativa por curva ABC (A=7d, B=30d,
    C=90d), **contagem cega** (revela a diferença só após conferir), ajuste
    automático no kardex e KPI de **acuracidade do estoque (%)** — que aparece
    em destaque no Painel Executivo. O custo passa a entrar **na entrada e no
    recebimento de compra** e o sistema recalcula o **custo médio ponderado
    móvel** (materiais e medicamentos). **Código de barras** no cadastro (leitor
    USB) com busca por código no Estoque e no Inventário. Migração
    `supabase/migracao-suprimentos-inventario.sql` (rodada no HNSN em 2026-07-21).
  - **🛡️ Confiança dos dados + 🎯 ponto de pedido + ✅ Ações de hoje (3 melhorias):**
    (1) **selo de confiança** no Painel Executivo (% com custo, inventariado 90d,
    código de barras — diz o quanto confiar nos R$); (2) **ponto de pedido
    inteligente** — campo **prazo de entrega por fornecedor** (`lead_time_dias`),
    "comprar agora" dispara quando a cobertura cai abaixo do prazo + margem (3d),
    cada material herda o prazo do último fornecedor (padrão 15d), sugestão de
    compra cobre o prazo de reposição, e **alerta de demanda instável** (↑/↓)
    quando o consumo recente destoa da média; (3) aba **Ações de hoje** — lista
    priorizada (rupturas, comprar, vencimentos, requisições, recebimentos,
    contagens) com atalho para cada ferramenta. Migração
    `supabase/migracao-suprimentos-ponto-de-pedido.sql` (rodada no HNSN em 2026-07-21).
  - **📄 Importar NF-e (XML):** botão no Estoque lê o XML da nota, extrai fornecedor,
    NF e itens, **casa com o catálogo** (código de barras ou nome), deixa revisar
    (qtd/custo/lote/validade, criar material novo ou pular) e **lança as entradas
    em lote** — atualiza o custo médio ponderado e **cadastra o fornecedor** se o
    CNPJ for novo. Tudo local (o XML não sai do navegador). Sem migração.
  - **💱 Cotação de compra:** aba **Cotações** — cria cotação (fornecedores a
    comparar + itens), **matriz preço × fornecedor** que destaca o mais barato de
    cada item (verde) e o total por fornecedor (✓ no melhor que cotou tudo; ⚠ nos
    parciais); **gera pedido** pelo *melhor preço por item* (divide entre
    fornecedores) ou *fornecedor único*, alimentando a aba Compras. Pesa preço ×
    prazo de entrega (lead time no cabeçalho). Migração
    `supabase/migracao-suprimentos-cotacao.sql` (rodada no HNSN em 2026-07-21).
  - **Migrações:** `supabase/migracao-suprimentos-faseA.sql`, `-faseB.sql`,
    `-faseC.sql` e `-seed.sql` (rodadas no HNSN em 2026-07-20).

## Como VOLTAR para este ponto (restaurar)

### Reverter o código para o checkpoint
```bash
git fetch --tags
git reset --hard checkpoint-v40
git push --force-with-lease origin main
```
Em ~1 min a Vercel republica os dois sites neste estado. ⚠️ Descarta o que foi feito
*depois* do checkpoint (é o objetivo de "voltar").

### Sem apagar nada — branch a partir do checkpoint
```bash
git fetch --tags
git checkout -b recuperacao checkpoint-v40
```

## ⚠️ Importante: código ≠ dados
Este checkpoint salva o **código**. Ele **não** desfaz alterações nos **dados**
(atendimentos, leitos), que ficam no Supabase. Para proteger os dados, faça
**backup do banco** — ver a pasta local `backups/` (peça "faz um backup dos dados").

## Pendências conhecidas (não urgentes)
- Equipe médica revisar os 8 textos de tratamento por CID (editáveis no 📚).
- **DEMO congelado**: banco sem as migrações da Fase 3 pt2 e do tratamento por CID.
  Se um dia voltarmos a usar o demo, rodar as migrações acumuladas antes.
- ✅ **Resolvido (2026-07-21):** registros de teste do AQUARIO removidos do HNSN
  (3 em `leitos_saidas`, 2 em `leitos_turnover` e o leito ocupado fake em `leitos`).
  Investigação do bug de fuso do Adauam confirmou **nenhum dado real corrompido**
  (ambulatório e altas íntegros); os únicos flagrados eram esses fakes do AQUARIO.

## Marcos incluídos (mais recentes no topo)
- `dfe4d4f` 💉 PS — checagem de medicação administrada (append-only + lista de trabalho da enfermagem)
- `32374f8` 🔗 PS — categoria profissional na evolução (médica/enfermagem/técnico)
- `ba1966a` 🔗 PS — origem da chegada + prontuário obrigatório + elo forte PS→fila→leito
- `0338a54` 🏥 PS — ajustes de layout (cards iguais, encaminhamentos em largura total)
- `198de71` 🏥 PS — KPIs compactos (leitos ocupados, óbitos, tempo médio de permanência)
- `f6bd24d` 🏥 PS — card de desfechos separando óbito no PS × pós-internação
- `76231ca` 🏥 PS — bloco EMERGÊNCIA (6 abas, mapa com regra de censo, transferências, assistente, protocolos)
- `692465f` 🏥 PS — barra lateral TRIAGEM + Protocolo Manchester didático
- `e0c011e` 🏥 PS — painel em duas seções (Triagem / Pronto-Socorro)
- `127f599` 💊 Estoque na prescrição do PS (sem estoque + similares)
- (PRs do Adauam) 📊 relatório mensal do PS · 🔍 auditoria ampliada · 🐛 falhas de banco visíveis
- `9d6fe93` 💱 Cotação de compra (matriz preço × fornecedor, gera pedido do vencedor)
- `7ac79d7` 📄 Importar NF-e (XML) no estoque (entradas em lote, casamento por código/nome, custo médio)
- `fc3da31` ✅ Painel "Ações de hoje" (lista priorizada de tarefas do almoxarifado)
- `47f7097` 🎯 Ponto de pedido inteligente (lead time por fornecedor + demanda instável)
- `ea49925` 🛡️ Selo de confiança dos dados no Painel Executivo
- `9d259f3` 🔢💰📷 Inventário cíclico (contagem cega ABC + acuracidade) + custo médio ponderado + código de barras
- (PRs do Adauam) 🐛 fix de fuso horário em datas + regra única de estoque; 📄 docs de fluxo de equipe
- `426e90d` ⏰📈 Vencimentos inteligentes + Estoque preditivo + Executivo ampliado (mapa por setor, simulador, fármacos monitorados)
- `1360d0f` 💼 Painel Executivo — capital parado/liberável, economia, perdas, rupturas, custo por paciente, setores c/ Δ
- `cd0fe03` 📦 Suprimentos Fase D — Relatórios & BI + assistente local (módulo completo)
- `e2d54be` 📦 Suprimentos Fase C — pedidos de compra (mat+med, sugestão da previsão, recebimento parcial c/ entrada automática)
- `b988721` 📦 fix: seed de suprimentos insere por nome
- `bef3892` 📦 Suprimentos Fase B — requisições dos setores (bipe, baixa FEFO, parcial) + seed ~120 materiais
- `6c79e27` 📦 Suprimentos Fase A — catálogo de materiais + estoque por lote/validade + fornecedores
- `86e7ed9` 👤 Gestão de usuários pelo ADM Master (Edge Function admin-usuarios)
- `c9d325b` 🛏️ Giro de Leitos — permanência/giro por setor + altas antes das 10h (migração leitos-saida-setor)
- `38982b3` 🛏️ Kanban de alta + Metas por setor + Motivo da espera (migração leitos-kanban-metas)
- `a60428d` 🛏️ Modo TV (painel de parede) + refresh automático 60s
- `cb53386` 🛏️ Fase 5 — previsão de vagas 24/48h, média real por CID, reserva automática do PS, alerta leito livre com fila
- `68351ae` 🛏️ Mapa detalhado com seletor de setor (chips)
- `cb3aece` 🛏️ Ordem fixa de setores + cards de leito corporativos
- `4aaa0fe` 🛏️ Fase 4 — alertas inteligentes + IA assistente local
- `544dc90` 🛏️ Fase 3 — Relatórios & BI (gráficos, Δ mensal, PDF)
- `65e7fde` 🛏️ Fase 2 — fila, pacientes, altas, transferências, internações
- `b02afea` 🛏️ Fase 1 — barra lateral + KPIs + mapa por setor + status novos
- `dbecfaf` 💊 Refino — aviso ao prescritor no PS + assistente com mais respostas
- `22af34d` 💊 Farmácia Fase 4 — assistente local (perguntas sobre o setor)
- `8198b38` 💊 Farmácia Fase 3 — BI (top 5 do mês + prescrição por status)
- `4e7dde2` 💊 Farmácia Fase 2 — previsão de demanda 7 dias no Estoque
- `997ef54` 💊 Farmácia Fase 1 — barra lateral própria + Dashboard
- `384b419` 💊 Aba Intervenção farmacêutica (estilo NoHarm)
- `6332c94` 💊 Livro de controlados (Portaria 344) + medicamentos não padronizados
- `fa2dde5` 💊 Custos por paciente (custo unitário por medicamento)
- `fa6f510` 💊 fix: dispensação de itens sem Qtd + "dispensado" falso + match de lote
- `d72fd9a` 💊 Fluxo de preparo da farmácia com notificação e bipe
- `5fdd520` 💊 Filtros de prescrição estilo NoHarm na dispensação
- `4c3a6a8` 💊 Dispensação priorizada + score de prescrição 0–3
- `9ad2b65` 💊 Farmácia Clínica Fase 3 — ajuste de posologia renal/hepática
- `fbc7d7b` 💊 Farmácia Clínica Fase 2 — interações medicamentosas + incompatibilidade em Y
- `0a70c95` 💊 Farmácia Clínica — alerta de alergia + reatividade cruzada (bloqueio na prescrição)
- `b6dcb15` 🩺 fix: salvar contexto clínico do PS com feedback
- `a2a0db7` 💊 Farmácia Clínica Fase 1 — motor de alertas (Beers, dose máx, sonda, duplicidade)
- `0c1c782` 💊 Farmácia Fase C — indicadores (consumo, curva ABC, controlados, relatório)
- `c26001b` 💊 Farmácia Fase B — prescrição estruturada no PS + dispensação (fila + avulsa, baixa por lote)
- `6b14d10` 💊 Farmácia — classe terapêutica + catálogo agrupado (~164 medicamentos, 22 classes)
- `c62dc56` 💊 Farmácia Fase A — catálogo + estoque (lote/validade, kardex FEFO)
- `4ebd602` 🩺 Desfecho do PS — médico, alocação de leito vago, contabilização (óbitos, evasão por médico)
- `536bb14` 🩺 Painel de atendimento médico no PS (evolução, prescrição, exames)
- `329e8dc` 🚑 Pacote triagem — aviso pediátrico, reavaliação com histórico, indicadores
- `a01445b` 🚑 Triagem com sinais vitais + sugestão automática de Manchester
- `ab00284` 🔪 Bloco Cirúrgico Fase C — indicadores (ocupação, cancelamentos, produtividade)
- `0a48ef5` 🔪 Bloco Cirúrgico Fase B — check-in, checklist OMS, tempos, RPA
- `8ccf7b8` 🔪 Bloco Cirúrgico Fase A — agenda, mapa por sala, cancelamentos
- `d832105` 📋 Resumo de passagem de plantão gratuito (local) no Paciente 360
- `45472e5` 📋 Paciente 360 — registro clínico integrado (timeline + evoluções + voz)
- `c6d1c0d` 🏥 Pronto-Socorro — triagem Manchester + jornada do paciente
- `dc8b5a9` 🎨 paleta de gráficos profissional validada
- `225b70e` 🎨 rebrand profundo — paleta marinho + interface sem emojis
- `82e2604` ✨ rebrand Valentrax — marca, login, cabeçalho, favicon
- `0aebdf9` 🦠 SCIH Fase C — indicadores mensais + dashboard + relatório
- `2678bdd` 🦠 SCIH Fase B — base de germes com embasamento + sugestão de isolamento
- `8852264` 🦠 SCIH Fase A — isolamentos por leito + casos de vigilância
- `1d97345` ⏳ fila de espera separada da ocupação do setor
- `9b4ca54` 💊 Tratamento sugerido por CID (referências + modal de internação)
- `baabe17` Fase 3 pt2 — Centro de Monitoramento (setores, solicitações, alertas)
- `ebc40d3` Fase 3 pt1 — modo claro/escuro
- `39bba1a` aba "Ambulatório" expansível · `cb71266` Giro de Leitos Fase 2
- `4753e82` multi-hospital · `e65ea2f` sugestão de CID · `cb8b7a7` Giro de Leitos Fase 1
- (histórico completo: `git log`)
