// Edge Function: admin-usuarios
// Gestão de usuários (criar, editar papel/nome, redefinir senha, ativar/desativar)
// feita SOMENTE por quem tem papel adm_master.
//
// Usa a SERVICE_ROLE do Supabase (chave de administrador) — ela fica no servidor,
// injetada automaticamente pelo Supabase, e NUNCA vai para o app nem para o repo.
// O gateway valida o JWT do usuário logado (verify_jwt = true); aqui reconferimos
// o papel do chamador antes de qualquer operação. Cada resposta traz { ok } ou { error }.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOMAIN = "@hnsn.local";                                  // usuario -> usuario@hnsn.local
const ROLES = ["adm_master", "adm_silver", "analista", "visualizador"];
const BAN_LONGO = "876000h";                                   // ~100 anos = "desativado" (reversível)

// Cliente de administração — bypassa RLS. Só é usado depois de conferir o papel.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

    // 1) Identifica o chamador pelo JWT enviado no Authorization
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "sem autenticação" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "sessão inválida" }, 401);
    const callerId = userData.user.id;

    // 2) Só ADM Master pode administrar usuários
    const { data: prof } = await admin.from("profiles").select("role").eq("id", callerId).single();
    if (!prof || prof.role !== "adm_master") return json({ error: "acesso restrito ao ADM Master" }, 403);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as Record<string, unknown>).action || "");
    const b = body as Record<string, string | boolean | undefined>;

    // ── Listar usuários (perfis + situação de ativo) ─────────────────────────
    if (action === "list") {
      const { data: profs } = await admin.from("profiles").select("id, username, nome, role").order("role");
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const banMap = new Map((list?.users || []).map((u) => [u.id, (u as { banned_until?: string }).banned_until]));
      const emailMap = new Map((list?.users || []).map((u) => [u.id, u.email]));
      const rows = (profs || []).map((p) => {
        const bu = banMap.get(p.id);
        const ativo = !bu || new Date(bu) <= new Date();
        return { id: p.id, username: p.username, nome: p.nome, role: p.role, email: emailMap.get(p.id), ativo };
      });
      return json({ ok: true, usuarios: rows });
    }

    // ── Criar usuário ────────────────────────────────────────────────────────
    if (action === "create") {
      const username = String(b.username || "").trim().toLowerCase();
      const nome = String(b.nome || "").trim();
      const role = String(b.role || "visualizador");
      const senha = String(b.senha || "");
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json({ error: "usuário inválido (3–32 caracteres: letras, números, . _ -)" }, 400);
      if (!ROLES.includes(role)) return json({ error: "papel inválido" }, 400);
      if (senha.length < 6) return json({ error: "a senha precisa de ao menos 6 caracteres" }, 400);
      const email = username + DOMAIN;
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,                                  // pode entrar já (e-mail interno, sem confirmação)
        user_metadata: { nome: nome || username, role },
      });
      if (error) {
        const msg = /already|exists|registered/i.test(error.message) ? "já existe um usuário com esse nome" : error.message;
        return json({ error: msg }, 400);
      }
      // Garante o perfil (mesmo que o trigger de auth não esteja ativo)
      await admin.from("profiles").upsert({ id: created.user.id, username, nome: nome || username, role }, { onConflict: "id" });
      return json({ ok: true, id: created.user.id });
    }

    // ── Editar papel e/ou nome ───────────────────────────────────────────────
    if (action === "update") {
      const id = String(b.id || "");
      const nome = b.nome != null ? String(b.nome).trim() : undefined;
      const role = b.role != null ? String(b.role) : undefined;
      if (!id) return json({ error: "id ausente" }, 400);
      if (role != null && !ROLES.includes(role)) return json({ error: "papel inválido" }, 400);
      if (id === callerId && role != null && role !== "adm_master") return json({ error: "você não pode rebaixar o seu próprio papel" }, 400);
      const patch: Record<string, string> = {};
      if (nome !== undefined) patch.nome = nome;
      if (role !== undefined) patch.role = role;
      if (Object.keys(patch).length === 0) return json({ error: "nada para atualizar" }, 400);
      const { error } = await admin.from("profiles").update(patch).eq("id", id);   // profiles é a fonte da verdade do papel
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ── Redefinir a senha de outro usuário ───────────────────────────────────
    if (action === "reset_senha") {
      const id = String(b.id || "");
      const senha = String(b.senha || "");
      if (!id) return json({ error: "id ausente" }, 400);
      if (senha.length < 6) return json({ error: "a senha precisa de ao menos 6 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ── Ativar / desativar acesso (ban reversível, sem apagar histórico) ──────
    if (action === "set_ativo") {
      const id = String(b.id || "");
      const ativo = !!b.ativo;
      if (!id) return json({ error: "id ausente" }, 400);
      if (id === callerId && !ativo) return json({ error: "você não pode desativar a si mesmo" }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : BAN_LONGO });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
