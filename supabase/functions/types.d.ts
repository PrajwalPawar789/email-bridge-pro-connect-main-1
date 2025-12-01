import type { createClient as supabaseCreateClient } from "@supabase/supabase-js";

type SupabaseCreateClient = typeof supabaseCreateClient;

declare global {
  const Deno: {
    env: {
      get: (key: string) => string | undefined;
    };
  };
}

declare module "https://deno.land/std@0.190.0/http/server.ts" {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>
  ): void;
}

declare module "https://deno.land/x/djwt@v2.8/mod.ts" {
  export function create(header: any, payload: any, key: any): Promise<string>;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export const createClient: SupabaseCreateClient;
}

declare module "npm:nodemailer@6.9.7" {
  interface SentMessageInfo {
    messageId?: string;
    response?: string;
  }

  interface NodemailerTransporter {
    verify: () => Promise<void>;
    sendMail: (options: Record<string, unknown>) => Promise<SentMessageInfo>;
  }

  export function createTransport(options: Record<string, unknown>): NodemailerTransporter;
}
