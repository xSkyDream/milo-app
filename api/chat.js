// POST /api/chat  { system, messages, tools }  →  { content: [...blocs], stop_reason }
// Relais vers Google Gemini (offre gratuite). Les outils (cocher une prise, mémoriser…)
// sont exécutés côté app : ce relais traduit seulement les messages au format Gemini.
// Variables Vercel : GEMINI_API_KEY (obligatoire), GEMINI_MODEL (optionnel)
export const config = { runtime: "edge" };

const DEFAULT_MODEL = "gemini-3.8-flash";

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(req)) return json({ error: "origin" }, 403);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "not_configured" }, 503);

  let b;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const system = String(b?.system || "").slice(0, 60000);
  const messages = Array.isArray(b?.messages) ? b.messages.slice(-40) : [];
  const tools = Array.isArray(b?.tools) ? b.tools.slice(0, 8) : [];
  if (!messages.length) return json({ error: "empty" }, 400);
  if (JSON.stringify(messages).length > 200000) return json({ error: "too_large" }, 413);

  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: toGemini(messages),
    generationConfig: { temperature: 0.7, maxOutputTokens: 900 },
  };
  if (tools.length) {
    payload.tools = [{
      functionDeclarations: tools.map((t) => {
        const fd = { name: t.name, description: t.description };
        const s = t.input_schema;
        if (s && s.properties && Object.keys(s.properties).length) fd.parameters = s;
        return fd;
      }),
    }];
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 400);
    return json({ error: "gemini", status: r.status, detail }, r.status === 429 ? 429 : 502);
  }
  const d = await r.json();
  return json(fromGemini(d), 200);
}

// Format interne (style Anthropic) → format Gemini
function toGemini(messages) {
  const idName = {};
  const contents = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const parts = [];
    if (typeof m.content === "string") parts.push({ text: m.content });
    else for (const blk of m.content || []) {
      if (blk.type === "text" && blk.text) {
        const p = { text: blk.text };
        if (blk.signature) p.thoughtSignature = blk.signature;
        parts.push(p);
      } else if (blk.type === "tool_use") {
        idName[blk.id] = blk.name;
        const p = { functionCall: { name: blk.name, args: blk.input || {} } };
        if (blk.signature) p.thoughtSignature = blk.signature; // exigé par Gemini 3 entre deux tours d'outils
        parts.push(p);
      } else if (blk.type === "tool_result") {
        parts.push({ functionResponse: { name: idName[blk.tool_use_id] || "outil", response: { result: blk.content, is_error: !!blk.is_error } } });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return contents;
}

// Réponse Gemini → format interne
function fromGemini(d) {
  const cand = d?.candidates?.[0];
  if (!cand?.content?.parts?.length) {
    return { content: [{ type: "text", text: "[face] Je ne peux pas répondre à ça. Parlons plutôt de ta récupération ?" }], stop_reason: "end_turn" };
  }
  const content = [];
  let calls = 0;
  for (const p of cand.content.parts) {
    if (p.thought) continue; // réflexion interne : jamais affichée
    if (p.functionCall) {
      calls++;
      content.push({ type: "tool_use", id: "fc_" + calls + "_" + Math.random().toString(36).slice(2, 8), name: p.functionCall.name, input: p.functionCall.args || {}, signature: p.thoughtSignature });
    } else if (typeof p.text === "string" && p.text) {
      content.push({ type: "text", text: p.text, signature: p.thoughtSignature });
    }
  }
  const stop_reason = calls ? "tool_use" : cand.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn";
  return { content, stop_reason };
}

function sameOrigin(req) {
  const o = req.headers.get("origin");
  if (!o) return false;
  try { return new URL(o).host === new URL(req.url).host || o === process.env.ALLOWED_ORIGIN; } catch { return false; }
}
function json(data, status) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
