// POST /api/tts  { text }  →  audio/mpeg (voix Marcel, ElevenLabs)
// Variables Vercel : ELEVENLABS_API_KEY (obligatoire), ELEVENLABS_VOICE_ID (optionnel), ELEVENLABS_MODEL (optionnel)
export const config = { runtime: "edge" };

const DEFAULT_VOICE = "kENkNtk0xyzG09WW40xE"; // Marcel, voix française
const MAX_CHARS = 1200;

export default async function handler(req) {
  if (req.method !== "POST") return text("Méthode non autorisée", 405);
  if (!sameOrigin(req)) return text("Origine refusée", 403);
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return text("ELEVENLABS_API_KEY manquante", 503);

  let body;
  try { body = await req.json(); } catch { return text("JSON invalide", 400); }
  const input = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!input) return text("Texte vide", 400);

  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: input,
      model_id: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5", // rapide ; "eleven_multilingual_v2" = plus nuancé
      language_code: "fr",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    return text(`ElevenLabs ${r.status} : ${detail}`, r.status === 429 ? 429 : 502);
  }
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}

function sameOrigin(req) {
  const o = req.headers.get("origin");
  if (!o) return false; // les navigateurs envoient toujours Origin sur un POST
  try { return new URL(o).host === new URL(req.url).host || o === process.env.ALLOWED_ORIGIN; } catch { return false; }
}
function text(t, status) { return new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
