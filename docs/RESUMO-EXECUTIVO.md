# Valentrax — Resumo Executivo

**Gestão operacional hospitalar com segurança clínica embutida**
Versão de 2026-09-01 · Documento completo: [`DOCUMENTACAO.md`](DOCUMENTACAO.md)

---

## O que é

Plataforma web que cobre a jornada do paciente **da porta de entrada à alta**: recepção,
agenda ambulatorial, pronto-socorro com triagem de Manchester, prontuário eletrônico,
enfermagem, farmácia clínica, estoque, leitos, centro cirúrgico, controle de infecção,
segurança do paciente e faturamento.

Foi construído **dentro de um hospital em operação** — modelagem assistencial por
enfermeira, engenharia por desenvolvedor — e não a partir de levantamento externo. Daí a
característica central: as regras são **normativas brasileiras** (COFEN, CFM, ANVISA, MS)
implementadas e testadas, não parâmetros que alguém precisa configurar depois.

**Porte-alvo:** hospitais de 50 a 200 leitos, com forte componente SUS.

---

## Quatro diferenciais

**1. Motor de alertas de farmácia clínica.** Dose máxima, interação cruzada com a conduta,
critérios de Beers, ajuste renal e hepático, compatibilidade em Y, viabilidade por sonda.
É o ativo técnico mais forte e vive num módulo destacável.

**2. Rastro de decisão que os concorrentes não capturam.** A triagem registra a
classificação **sugerida pelo sistema** e a **escolhida pelo profissional**, separadas — dado
de auditoria e de treinamento que não existe quando só o resultado final é guardado.

**3. Segurança clínica como regra dura, não configuração.** O sistema **recusa**, não apenas
avisa:
- técnico de enfermagem não assina diagnóstico de enfermagem (COFEN 736/2024), sem override;
- atendimento SUS não é cobrado do paciente — travado na tela, na lógica e no banco;
- abaixo de 2 anos, recusa idade aproximada para triagem em vez de estimar faixa de sinais vitais;
- curatela exige número de processo judicial (Lei 13.146/2015).

**4. Registro clínico append-only, verificado.** Correção é registro novo; o original
permanece. Testado: nem um administrador apaga pela API.

---

## Módulos

| | |
|---|---|
| **Atendimento** | recepção, agenda com cota por origem, consultas, faturamento, tabelas |
| **Pronto-Socorro** | triagem Manchester adaptada, faixas pediátricas e obstétricas, painel e censo |
| **Prontuário (PEP)** | prescrição com aprazamento e checagem, sinais vitais com NEWS, evolução, reconciliação, sumário de alta |
| **Enfermagem** | SAE completa com catálogo editável, escalas de risco, LPP com marcador de admissão, mapa de risco por leito |
| **Segurança do Paciente** | notificação em 30 s, causa raiz, plano 5W2H, indicadores automáticos, 6 Metas OMS/JCI, NOTIVISA |
| **Farmácia Clínica** | motor de alertas, score de prescrição, intervenções, livro de controlados (Portaria 344/98) |
| **Suprimentos** | requisição com aprovação, cotação, pedido, inventário, ponto de pedido |
| **Leitos / NIR** | mapa, regulação interna, lista de espera, giro e permanência |
| **Centro Cirúrgico · SCIH · Ambulatório/BI** | mapa de salas · casos e germes · produção, metas e absenteísmo |
| **Acesso** | 15 cargos prontos, perfil como template, exceção individual com motivo, trilha de auditoria |

---

## Números

| | |
|---|---|
| Testes automatizados | **2.401** em 90 arquivos |
| Banco de dados | **86 tabelas · 1.363 colunas**, RLS ativo em todas *(contagem de 02/08/2026)* |
| Vulnerabilidades de dependência | **0** |
| Código do front | **135 arquivos** em 15 pastas por domínio (era 1 arquivo de 18.392 linhas até 01/09/2026) |
| Stack | React 18 · Vite 7 · PostgreSQL (Supabase) · Vercel |
| Implantação de referência | Hospital Nossa Senhora de Navegantes |

---

## O que o sistema **não** faz

Declarado de frente, porque aparece em qualquer avaliação técnica — e porque capacidade
prometida e não entregue custa caro na implantação:

- ❌ **Sem interoperabilidade**: HL7, FHIR e RNDS não implementados.
- ❌ **Sem geração de arquivo de remessa** (BPA/APAC/AIH/TISS). O modelo de dados está
  pronto; falta o layout que o hospital transmite hoje e o ciclo de homologação.
- ❌ **Sem integração laboratorial, PACS ou ERP financeiro.**
- ❌ **Sem assinatura digital ICP-Brasil.**
- ⚠️ **Leitura segregada por módulo, não por linha** — tirar um módulo do perfil tira também
  o acesso ao dado pela API (recepção e faturamento não alcançam o prontuário nem por fora da
  tela). Falta o recorte por **setor** — quem abre o Paciente 360 vê o de qualquer paciente,
  não só os da sua unidade — e a **escrita** ainda é decidida pelo papel de sistema, não pelo módulo.
- ⚠️ **O CI não bloqueia o merge.** `.github/workflows/ci.yml` roda validação de SQL,
  lint, testes e build em todo PR, mas o merge não é barrado por ele e a Vercel publica
  independente — em 01/09/2026 a `main` ficou vermelha por três merges seguidos sem que
  nada avisasse. Barrar exige branch protection ligado no GitHub, que ainda não está.
- ⚠️ **Ainda sem registro de paciente real** — o sistema opera com dado de teste e de
  configuração.

A regulação SUS (GERCON/GERINT) entra por **transcrição manual com protocolo**, não por API.

---

## Modelo comercial *(proposta — decisão em aberto)*

Três caminhos, que exigem empresas diferentes:

| | Modelo | Exige antes | Ciclo de venda |
|---|---|---|---|
| **A** | HIS substituto | faturamento com remessa, interoperabilidade, certificação | longo |
| **B** | **Camada complementar** sobre o HIS existente | pouco — ataca onde MV/Tasy são fracos | **curto** ✅ |
| **C** | Farmácia clínica como produto isolado | empacotamento | curto |

**Recomendação: começar pelo B**, com o HNSN como o caso "substituto" que já existe.

**Estrutura de receita sugerida:** implantação (uma vez) + assinatura mensal por leito
operacional, com piso + customização por hora.

---

## Pré-requisitos para o segundo hospital

Três itens bloqueantes antes de uma segunda implantação:

1. **Fechar a leitura do RLS** — é o primeiro achado de qualquer auditoria de segurança.
2. **Automatizar a aplicação de migração** — aplicar SQL à mão não passa de ~5 hospitais.
3. **Definir o modelo comercial** — ele determina o que precisa existir antes da primeira venda.

---

<sub>Valentrax — Healthcare Operations · `github.com/nirhnsn08-blip/medflow-hnsn` · `main` @ `f4baa9a`</sub>
