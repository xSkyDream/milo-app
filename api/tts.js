// POST /api/tts  { text }  →  audio/wav  (voix Google Gemini TTS, offre gratuite)
// Variables Vercel : GEMINI_API_KEY (obligatoire), GEMINI_VOICE (optionnel), GEMINI_TTS_MODEL (optionnel)
export const config = { runtime: "edge" };

const DEFAULT_MODEL = "gemini-3.8-flash-tts";
const DEFAULT_VOICE = "Achird"; // « Friendly ». Autres idées : Puck (enjoué), Sulafat (chaleureux), Vindemiatrix (doux)
const STYLE = "en français, voix chaleureuse, douce et rassurante, un peu espiègle, débit naturel";
const MAX_CHARS = 1000;

export default async function handler(req) {
  if (req.method !== "POST") return text("Méthode non autorisée", 405);
  if (!sameOrigin(req)) return text("Origine refusée", 403);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return text("GEMINI_API_KEY manquante", 503);

  let body;
  try { body = await req.json(); } catch { return text("JSON invalide", 400); }
  const input = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!input) return text("Texte vide", 400);

  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GEMINI_TTS_MODEL || DEFAULT_MODEL,
      input: [{ type: "user_input", content: [{ type: "text", text: input, annotations: [{ type: "speech_metadata", style: STYLE }] }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: process.env.GEMINI_VOICE || DEFAULT_VOICE }] },
    }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    return text(`Gemini TTS ${r.status} : ${detail}`, r.status === 429 ? 429 : 502);
  }
  const d = await r.json();
  const audio = (d.steps || [])
    .filter((s) => s.type === "model_output")
    .flatMap((s) => s.content || [])
    .filter((c) => c.type === "audio")
    .pop();
  if (!audio?.data) return text("Pas d'audio dans la réponse", 502);

  let bytes = b64ToBytes(audio.data);
  // Réponse unaire = WAV. Par sécurité, si c'est du PCM brut (24 kHz, mono, 16 bits), on ajoute l'en-tête WAV.
  if (!(bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)) bytes = pcmToWav(bytes, 24000);
  return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pcmToWav(pcm, rate) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}
function sameOrigin(req) {
  const o = req.headers.get("origin");
  if (!o) return false;
  try { return new URL(o).host === new URL(req.url).host || o === process.env.ALLOWED_ORIGIN; } catch { return false; }
}
function text(t, status) { return new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
