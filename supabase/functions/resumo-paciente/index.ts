// Edge Function: resumo-paciente
// Gera um resumo de passagem de plantão a partir da linha do tempo do paciente,
// usando a API da Anthropic (Claude). A chave ANTHROPIC_API_KEY fica como secret
// do Supabase — nunca no app nem no repositório.
// O gateway do Supabase valida o JWT do usuário logado (verify_jwt = true).
// LGPD: o contexto recebido usa apenas iniciais + nº de prontuário (sem nomes).
import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const SYSTEM = `Você é o assistente clínico-administrativo da plataforma Valentrax, usado por equipes de um hospital brasileiro.
Sua tarefa: transformar a linha do tempo de um paciente (eventos de pronto-socorro, internações, altas, vigilância SCIH e evoluções da equipe) em um RESUMO DE PASSAGEM DE PLANTÃO.

Regras:
- Escreva em português do Brasil, em prosa corrida e objetiva (sem listas), no máximo 2 parágrafos curtos.
- Estruture mentalmente assim: situação atual do paciente → histórico relevante desta linha do tempo → pendências e alertas em aberto.
- Use SOMENTE as informações fornecidas. Nunca invente dados, diagnósticos, doses ou condutas que não estejam no texto.
- Se houver pouca informação, diga isso claramente em vez de preencher lacunas.
- Refira-se ao paciente pelas iniciais fornecidas.
- Não dê recomendações de tratamento; você apoia a organização da informação — a conduta é sempre do médico assistente.`;

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") return json({ error: "método não suportado" }, 405);
    const { contexto } = await req.json();
    if (!contexto || typeof contexto !== "string" || contexto.length < 20 || contexto.length > 30000) {
      return json({ error: "contexto ausente ou fora do tamanho permitido" }, 400);
    }

    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: contexto }],
    });

    if (msg.stop_reason === "refusal") {
      return json({ error: "O modelo recusou gerar este resumo." }, 422);
    }
    const resumo = msg.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("\n")
      .trim();
    if (!resumo) return json({ error: "resposta vazia do modelo" }, 502);

    return json({ resumo, modelo: msg.model, tokens: msg.usage });
  } catch (e) {
    return json({ error: `falha ao gerar resumo: ${String(e)}` }, 500);
  }
});
