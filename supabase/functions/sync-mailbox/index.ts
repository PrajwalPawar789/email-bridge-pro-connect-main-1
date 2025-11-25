// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1.0.145";
import { simpleParser } from "npm:mailparser@3.9.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase environment variables for sync-mailbox function");
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

type EmailConfig = {
  id: string;
  user_id: string;
  smtp_username: string;
  smtp_password: string;
  imap_host: string;
  imap_port: number;
  security?: string | null;
};

type SyncResult = {
  processed: number;
  inserted: number;
  skipped: number;
};

const getUserFromRequest = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    console.error("Failed to validate user token", error);
    return null;
  }

  return data.user;
};

const buildImapClient = (config: EmailConfig) => {
  const security = (config.security || "SSL").toUpperCase();
  const useTls = security === "SSL" || security === "TLS";

  return new ImapFlow({
    host: config.imap_host,
    port: config.imap_port || (useTls ? 993 : 143),
    secure: useTls,
    auth: {
      user: config.smtp_username,
      pass: config.smtp_password,
    },
    tls: {
      // Some providers (e.g. Titan/Hostinger) require relaxed certificate checks in serverless environments
      rejectUnauthorized: false,
    },
    logger: false,
  });
};

const messageToRow = (config: EmailConfig, message: any, parsed: any) => {
  const fromAddress = parsed.from?.value?.[0]?.address || message.envelope?.from?.[0]?.address || "";
  const toAddress = parsed.to?.value?.[0]?.address || config.smtp_username;
  const subject = parsed.subject || message.envelope?.subject || "(No Subject)";
  const bodyHtml = parsed.html || parsed.textAsHtml || parsed.text || "";
  const messageDate: Date = parsed.date || message.internalDate || new Date();

  return {
    user_id: config.user_id,
    config_id: config.id,
    uid: message.uid,
    from_email: fromAddress,
    to_email: toAddress,
    subject,
    body: bodyHtml,
    date: messageDate.toISOString(),
    folder: message.mailbox || "INBOX",
    read: message.flags?.includes("\\Seen") ?? false,
  };
};

const syncMailbox = async (config: EmailConfig, limit = 50): Promise<SyncResult> => {
  const client = buildImapClient(config);
  let processed = 0;
  let mailboxOpened = false;

  try {
    await client.connect();
  const mailbox = await client.mailboxOpen("INBOX");
  mailboxOpened = true;

    if (!mailbox?.exists) {
      console.log("No emails found for mailbox", config.id);
      return { processed: 0, inserted: 0, skipped: 0 };
    }

    const totalMessages = mailbox.exists;
    const startSeq = Math.max(totalMessages - limit + 1, 1);
    const range = `${startSeq}:*`;

    const rows: any[] = [];

    for await (const message of client.fetch(range, {
      uid: true,
      flags: true,
      envelope: true,
      source: true,
      internalDate: true,
      bodyStructure: true,
    })) {
      processed++;
      try {
        const parsed = await simpleParser(message.source ?? "");
        rows.push(messageToRow(config, message, parsed));
      } catch (parseError) {
        console.error("Failed to parse message", message.uid, parseError);
      }
    }

    if (rows.length === 0) {
      return { processed, inserted: 0, skipped: processed };
    }

    const { error } = await supabaseAdmin
      .from('email_messages')
      .upsert(rows, { onConflict: 'config_id,uid' });

    if (error) {
      console.error('Upsert error while syncing mailbox', error);
      throw error;
    }

    return { processed, inserted: rows.length, skipped: processed - rows.length };
  } finally {
    try {
      if (mailboxOpened) {
        await client.mailboxClose().catch(() => {});
      }
      await client.logout();
    } catch (logoutError) {
      console.error('Error closing IMAP connection', logoutError);
    }
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { configId, limit = 50 } = await req.json();

    if (!configId) {
      return new Response(
        JSON.stringify({ error: 'configId is required' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: config, error: configError } = await supabaseAdmin
      .from('email_configs')
      .select('*')
      .eq('id', configId)
      .eq('user_id', user.id)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: 'Email configuration not found' }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!config.imap_host || !config.imap_port) {
      return new Response(
        JSON.stringify({ error: 'IMAP settings are incomplete for this configuration' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const result = await syncMailbox(config as EmailConfig, limit);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error('sync-mailbox function error', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Mailbox sync failed' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
