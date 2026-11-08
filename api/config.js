// GET /api/config → configuration publique des comptes (Supabase)
// Les valeurs viennent des variables d'environnement Vercel, jamais du code :
//   SUPABASE_URL       ex. https://abcdefgh.supabase.co   (Project Settings > API > Project URL)
//   SUPABASE_ANON_KEY  clé PUBLIQUE uniquement : « sb_publishable_… » ou l'ancienne clé « anon »
// Garde-fou : une clé secrète (sb_secret_… ou service_role) n'est JAMAIS renvoyée au navigateur.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const url = (process.env.SUPABASE_URL || "").trim(), key = (process.env.SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) return json({ error: "not_configured" }, 503);
  if (!isPublicKey(key)) return json({ error: "secret_key_refused", hint: "SUPABASE_ANON_KEY doit être la clé publique (sb_publishable_… ou anon), jamais la clé secrète." }, 500);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url) && !/^https:\/\/[^/\s]+$/i.test(url)) return json({ error: "bad_url", hint: "SUPABASE_URL doit être l'adresse du projet, ex. https://abcdefgh.supabase.co" }, 500);
  return json({ url: url.replace(/\/$/, ""), anonKey: key, apple: process.env.AUTH_APPLE === "1" }, 200);
}
function isPublicKey(k) {
  if (/^sb_secret_/i.test(k)) return false;
  if (/^sb_publishable_/i.test(k)) return true;
  const p = k.split(".");                       // ancienne clé JWT : refuser service_role
  if (p.length === 3) { try { const b = JSON.parse(atob(p[1].replace(/-/g, "+").replace(/_/g, "/"))); return b.role === "anon"; } catch { return false; } }
  return false;
}
function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
