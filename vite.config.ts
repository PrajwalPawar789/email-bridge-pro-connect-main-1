import dns from "node:dns";
import https from "node:https";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const SUPABASE_PROXY_PREFIX = "/__supabase";

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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useSupabaseDevProxy = mode === "development" && env.VITE_SUPABASE_DEV_PROXY !== "false";
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
