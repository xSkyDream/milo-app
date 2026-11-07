// POST /api/chat  { system, messages, tools }  →  réponse brute de l'API Anthropic (Messages)
// Les outils (cocher une prise, mémoriser…) sont exécutés côté app : ce relais ne fait que transmettre.
// Variables Vercel : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (optionnel)
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(req)) return json({ error: "origin" }, 403);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "not_configured" }, 503);

  let b;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const system = String(b?.system || "").slice(0, 60000);
  const messages = Array.isArray(b?.messages) ? b.messages.slice(-40) : [];
  const tools = Array.isArray(b?.tools) ? b.tools.slice(0, 8) : [];
  if (!messages.length) return json({ error: "empty" }, 400);
  if (JSON.stringify(messages).length > 200000) return json({ error: "too_large" }, 413);

  const payload = { model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 900, system, messages };
  if (tools.length) payload.tools = tools;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await r.text();
  return new Response(out, {
    status: r.ok ? 200 : r.status === 429 ? 429 : 502,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function sameOrigin(req) {
  const o = req.headers.get("origin");
  if (!o) return false;
  try { return new URL(o).host === new URL(req.url).host || o === process.env.ALLOWED_ORIGIN; } catch { return false; }
}
function json(d, status) { return new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } }); }
