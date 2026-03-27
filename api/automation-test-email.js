const resolveSupabaseFunctionUrl = () => {
  const baseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";

  if (!baseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL in Vercel.");
  }

  return `${baseUrl.replace(/\/+$/, "")}/functions/v1/automation-test-email`;
};

const getRequestBody = (req) => {
  if (req.body == null) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Allow", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const upstreamUrl = resolveSupabaseFunctionUrl();
    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const apikey =
      req.headers.apikey ||
      req.headers.Apikey ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "";

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(apikey ? { apikey: String(apikey) } : {}),
      },
      body: JSON.stringify(getRequestBody(req)),
    });

    const contentType = upstream.headers.get("content-type") || "application/json";
    const rawBody = await upstream.text();

    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    return res.send(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach automation-test-email.";
    return res.status(500).json({ error: message });
  }
}
