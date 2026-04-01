import dns from "node:dns";
import https from "node:https";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import {
  readJsonRequestBody,
  sendAutomationTestEmailFromServer,
  toAutomationTestEmailErrorResponse,
} from "./server/automation-test-email-handler.js";

const SUPABASE_PROXY_PREFIX = "/__supabase";
const AUTOMATION_TEST_EMAIL_ROUTE = "/api/automation-test-email";

const createSupabaseProxy = (supabaseUrl: string, dnsServersRaw?: string) => {
  const dnsServers = (dnsServersRaw ?? "1.1.1.1,8.8.8.8")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const resolver = new dns.Resolver();
  resolver.setServers(dnsServers);

  const lookup = ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
    resolver.resolve4(hostname, (resolveError, addresses) => {
      if (resolveError || !addresses?.length) {
        dns.lookup(hostname, options as dns.LookupOptions, callback as dns.LookupOneCallback);
        return;
      }

      const wantsAll = typeof options === "object" && options !== null && (options as dns.LookupAllOptions).all;
      if (wantsAll) {
        const allAddresses = addresses.map((address) => ({ address, family: 4 }));
        callback(null, allAddresses);
        return;
      }

      callback(null, addresses[0], 4);
    });
  }) as dns.LookupFunction;

  return {
    [SUPABASE_PROXY_PREFIX]: {
      target: supabaseUrl,
      changeOrigin: true,
      secure: true,
      ws: true,
      agent: new https.Agent({ lookup }),
      rewrite: (requestPath: string) =>
        requestPath.startsWith(SUPABASE_PROXY_PREFIX)
          ? requestPath.slice(SUPABASE_PROXY_PREFIX.length) || "/"
          : requestPath,
    },
  };
};

const automationTestEmailDevPlugin = (env: Record<string, string>) => ({
  name: "automation-test-email-dev-route",
  configureServer(server: { middlewares: { use: (route: string, handler: (...args: unknown[]) => void) => void } }) {
    server.middlewares.use(AUTOMATION_TEST_EMAIL_ROUTE, async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Allow", "POST, OPTIONS");

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      try {
        const payload = await readJsonRequestBody(req);
        const result = await sendAutomationTestEmailFromServer({
          headers: req.headers,
          payload,
          env,
        });

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (error) {
        const response = toAutomationTestEmailErrorResponse(error);
        res.statusCode = response.status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(response.body));
      }
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const useSupabaseDevProxy = mode === "development" && env.VITE_SUPABASE_DEV_PROXY === "true";
  const proxy =
    useSupabaseDevProxy && env.VITE_SUPABASE_URL
      ? createSupabaseProxy(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_DNS_SERVERS)
      : undefined;

  return {
    server: {
      host: "::",
      port: 8080,
      proxy,
    },
    plugins: [
      react(),
      mode === "development" && automationTestEmailDevPlugin(env),
      // mode === 'development' &&
      // componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
