-- ═══════════════════════════════════════════════════════════
-- AUDITORIA — valores que o leitor de número ANTIGO pode ter inflado
--
-- 🔴 O QUE ACONTECEU. Até 03/09/2026, o valor digitado em campo de preço e
-- de repasse era lido assim:
--
--     Number(String(v).replace(/\./g, "").replace(",", "."))
--
-- que apaga TODO ponto, tratando-o sempre como separador de milhar. Quem
-- digitasse `1234.56` gravava **123456** — cem vezes mais, sem erro em tela.
-- Corrigido no PR #210 (`src/util/numero-brasileiro.js`), mas a correção
-- vale daqui para a frente: linha já gravada continua como está.
--
-- ⚠️ ESTE ARQUIVO NÃO ALTERA NADA. Só SELECT. Pode rodar no principal a
-- qualquer hora, inclusive com gente usando o sistema.
--
-- ⚠️ E ELE NÃO DÁ VEREDITO. Não existe assinatura que separe "R$ 123.456,00
-- porque alguém digitou 1234.56" de "R$ 123.456,00 porque é esse o valor":
-- as duas linhas são idênticas no banco. O que ele faz é REDUZIR A PILHA
-- para o que cabe conferir com o olho — se as tabelas tiverem poucas linhas,
-- a auditoria acaba em um minuto.
-- ═══════════════════════════════════════════════════════════

-- ── 1. Quanto tem para conferir ──────────────────────────────
-- Se der zero nas duas, acabou aqui: não havia o que o defeito corrompesse.
select 'at_precos'   as tabela, count(*) as linhas from at_precos
union all
select 'at_repasses' as tabela, count(*) as linhas from at_repasses;


-- ── 2. Os preços, com quem digitou e quando ──────────────────
-- A coluna `suspeita` é uma DICA, não um diagnóstico: o leitor antigo só
-- produzia inteiro sem centavos (ele apagava o ponto). Preço redondo de
-- verdade também cai aqui — por isso a coluna ao lado mostra quanto seria
-- o valor se tivesse sido digitado com ponto decimal, para comparar.
select
  p.id,
  c.nome                                    as convenio,
  p.codigo,
  p.descricao,
  p.valor,
  case when p.valor = trunc(p.valor) and p.valor >= 1000
       then round(p.valor / 100.0, 2)
  end                                       as seria_isto_se_o_ponto_fosse_decimal,
  case when p.valor = trunc(p.valor) and p.valor >= 1000
       then 'conferir'
       else 'ok'
  end                                       as suspeita,
  p.vigencia_inicio,
  p.vigencia_fim,
  p.usuario,
  p.updated_at
from at_precos p
left join at_convenios c on c.id = p.convenio_id
order by suspeita desc, p.valor desc;


-- ── 3. Os repasses, mesma coisa ──────────────────────────────
-- ⚠️ Aqui valor NEGATIVO é legítimo (estorno). Não é sinal de nada.
select
  r.id,
  r.conta_id,
  r.valor,
  case when r.valor = trunc(r.valor) and abs(r.valor) >= 1000
       then round(r.valor / 100.0, 2)
  end                                       as seria_isto_se_o_ponto_fosse_decimal,
  case when r.valor = trunc(r.valor) and abs(r.valor) >= 1000
       then 'conferir'
       else 'ok'
  end                                       as suspeita,
  r.recebido_em,
  r.usuario,
  r.criado_em
from at_repasses r
order by suspeita desc, abs(r.valor) desc;


-- ── 4. Se achar uma linha errada ─────────────────────────────
-- NÃO conserte com um update em massa: não dá para saber quais linhas o
-- defeito atingiu, e dividir por cem uma linha certa cria o erro inverso.
-- Corrija UMA A UMA, pela tela de Convênios & contratos, conferindo o valor
-- contra o contrato da operadora.
