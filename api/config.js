// GET /api/config → configuration publique des comptes (Supabase)
// Les valeurs viennent des variables d'environnement Vercel, jamais du code :
//   SUPABASE_URL       ex. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY  clé « anon / publishable » (publique par conception, protégée par les règles RLS)
// Sans ces variables, l'app fonctionne normalement, sans comptes.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const url = process.env.SUPABASE_URL, anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return json({ error: "not_configured" }, 503);
  return json({ url, anonKey, apple: process.env.AUTH_APPLE === "1" }, 200);
}
function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
