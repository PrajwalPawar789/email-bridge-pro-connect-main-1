import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const DEFAULT_SUPABASE_URL = 'https://lyerkyijpavilyufcrgb.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZXJreWlqcGF2aWx5dWZjcmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NTM0NjQsImV4cCI6MjA2NDMyOTQ2NH0.hdh-tzbNBmCusr_ZJBU_K27P-6K9s1kwpBE3PrzXiwc';
const DEFAULT_SERVICE_ROLE_KEY = 'REDACTED_SUPABASE_SERVICE_ROLE_KEY';
const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:8080,http://10.127.57.196:8080';
const DEFAULT_MAILBOX_PORT = 8787;
const DEFAULT_BYPASS_AUTH = 'true';
const DEFAULT_CRM_REDIRECT_URI = 'http://localhost:5173/dashboard?tab=integrations';
const DEFAULT_CRM_FRONTEND_URL = 'http://localhost:5173';

const PORT = Number(process.env.MAILBOX_SERVER_PORT || DEFAULT_MAILBOX_PORT);
const ALLOWED_ORIGINS = (process.env.MAILBOX_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  DEFAULT_SUPABASE_ANON_KEY;
const MAILBOX_BYPASS_AUTH = (process.env.MAILBOX_BYPASS_AUTH || DEFAULT_BYPASS_AUTH).toLowerCase() === 'true';
const CRM_OAUTH_SIMULATE = (process.env.CRM_OAUTH_SIMULATE || 'true').toLowerCase() === 'true';
const CRM_REDIRECT_URI = process.env.CRM_OAUTH_REDIRECT_URI || DEFAULT_CRM_REDIRECT_URI;
const CRM_FRONTEND_URL = process.env.CRM_FRONTEND_URL || DEFAULT_CRM_FRONTEND_URL;
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID || '';
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET || '';
const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID || '';
const SALESFORCE_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET || '';
const SALESFORCE_LOGIN_URL = process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com';
const HUBSPOT_SCOPES =
  process.env.HUBSPOT_SCOPES ||
  'crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write oauth';
const SALESFORCE_SCOPES =
  process.env.SALESFORCE_SCOPES ||
  'api refresh_token offline_access';

const isPlaceholderValue = (value) => {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return (
    normalized.includes('redacted') ||
    normalized.includes('your-service-role-key') ||
    normalized.includes('your-anon-key')
  );
};

const hasServiceRoleKey = !isPlaceholderValue(SUPABASE_SERVICE_ROLE_KEY);
const hasAnonKey = !isPlaceholderValue(SUPABASE_ANON_KEY);
const supabaseAdmin = hasServiceRoleKey ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

if (!hasServiceRoleKey) {
  console.warn('[mailbox] SUPABASE_SERVICE_ROLE_KEY is missing or placeholder. Falling back to anon key.');
}
if (!hasAnonKey) {
  console.warn('[mailbox] SUPABASE_ANON_KEY is missing or placeholder. Mailbox sync may fail.');
}
if (MAILBOX_BYPASS_AUTH && !hasServiceRoleKey) {
  console.warn('[mailbox] MAILBOX_BYPASS_AUTH requires a service role key. Bypass auth disabled.');
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

const buildImapClient = (config) => {
  const security = (config.security || 'SSL').toUpperCase();
  const secure = security !== 'NONE';
  const port = config.imap_port || (secure ? 993 : 143);

  return new ImapFlow({
    host: config.imap_host,
    port,
    secure,
    auth: {
      user: config.smtp_username,
      pass: config.smtp_password,
    },
    tls: {
      rejectUnauthorized: false,
    },
    logger: false,
  });
};

const mapMessageToRow = (config, message, parsed, mailboxPath) => {
  const parsedFrom = Array.isArray(parsed?.from?.value) ? parsed.from.value : [];
  const parsedTo = Array.isArray(parsed?.to?.value) ? parsed.to.value : [];

  const fromAddress = parsedFrom?.[0]?.address || message.envelope?.from?.[0]?.address || '';
  const toAddress = parsedTo?.[0]?.address || config.smtp_username;
  const subject = parsed?.subject || message.envelope?.subject || '(No Subject)';
  const body = parsed?.html || parsed?.textAsHtml || parsed?.text || '';
  const messageDate = parsed?.date || message.internalDate || new Date();

  let seen = false;
  if (Array.isArray(message.flags)) {
    seen = message.flags.includes('\\Seen');
  } else if (message.flags && typeof message.flags.has === 'function') {
    seen = message.flags.has('\\Seen');
  }

  return {
    user_id: config.user_id,
    config_id: config.id,
    uid: message.uid,
    from_email: fromAddress,
    to_email: toAddress,
    subject,
    body,
    date: messageDate.toISOString(),
    folder: mailboxPath || message.mailbox || 'INBOX',
    read: seen,
  };
};

const syncMailbox = async (config, limit = 50, dbClient) => {
  if (!dbClient) {
    throw new Error('Supabase client not configured');
  }
  const client = buildImapClient(config);
  let processed = 0;
  const rows = [];

  await client.connect();

  try {
    const mailbox = await client.mailboxOpen('INBOX');
    if (!mailbox?.exists) {
      return { processed: 0, inserted: 0, skipped: 0 };
    }

    const startSeq = Math.max(mailbox.exists - limit + 1, 1);
    const range = `${startSeq}:*`;

    for await (const message of client.fetch(range, {
      uid: true,
      flags: true,
      envelope: true,
      source: true,
      internalDate: true,
    })) {
      processed++;
      try {
        let parsed;

        try {
          if (message.source) {
            parsed = await simpleParser(message.source);
          } else {
            const download = await client.download(message.uid, { source: true });
            const chunks = [];
            for await (const chunk of download.content) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            parsed = await simpleParser(buffer);
          }
        } catch (parseError) {
          console.warn(`[mailbox] Failed to parse message ${message.uid}:`, parseError?.message || parseError);
          parsed = {
            from: { value: message.envelope?.from || [] },
            to: { value: message.envelope?.to || [] },
            subject: message.envelope?.subject || '(No Subject)',
            text: '',
            html: '',
            date: message.internalDate ? new Date(message.internalDate) : new Date(),
          };
        }

        const row = mapMessageToRow(config, message, parsed, mailbox.path);
        rows.push(row);

        if (processed <= 3) {
          console.log('[mailbox] Sample row prepared:', {
            uid: row.uid,
            from: row.from_email,
            subject: row.subject,
            date: row.date,
          });
        }
      } catch (parseError) {
        console.error('[mailbox] Unexpected error preparing message', message.uid, parseError);
      }
    }

    if (rows.length === 0) {
      return { processed, inserted: 0, skipped: processed };
    }

    // Deduplicate within this batch
    const uniqueRowsMap = new Map();
    for (const row of rows) {
      if (row.uid == null) continue;
      if (!uniqueRowsMap.has(row.uid)) {
        uniqueRowsMap.set(row.uid, row);
      }
    }
    const uniqueRows = Array.from(uniqueRowsMap.values());

    // Fetch UIDs that already exist for this config
    let existingUids = new Set();
    if (uniqueRows.length > 0) {
      const { data: existingData, error: existingError } = await dbClient
        .from('email_messages')
        .select('uid')
        .eq('config_id', config.id)
        .in('uid', uniqueRows.map((row) => row.uid));

      if (existingError) {
        throw existingError;
      }

      existingUids = new Set((existingData ?? []).map((item) => item.uid));
    }

    const newRows = uniqueRows.filter((row) => !existingUids.has(row.uid));

    if (newRows.length > 0) {
      const { error: insertError } = await dbClient
        .from('email_messages')
        .insert(newRows);

      if (insertError) {
        throw insertError;
      }
    }

    return {
      processed,
      inserted: newRows.length,
      skipped: Math.max(processed - newRows.length, 0),
    };
  } finally {
    try {
      if (client?.mailboxLock) {
        await client.mailboxClose().catch(() => {});
      }
      await client.logout();
    } catch (closeError) {
      console.error('Error closing IMAP connection', closeError);
    }
  }
};

const BYPASS_USER = {
  id: 'mailbox-bypass-user',
  email: 'bypass@local.dev',
};

const buildUserSupabaseClient = (authHeader) => {
  if (!hasAnonKey) return null;
  const headers = authHeader ? { Authorization: authHeader } : {};
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers },
    auth: { persistSession: false },
  });
};

const authenticateRequest = async (authHeader) => {
  const canBypassAuth = MAILBOX_BYPASS_AUTH && hasServiceRoleKey;

  if (!authHeader?.startsWith('Bearer ')) {
    if (canBypassAuth) {
      console.warn('[mailbox] No Authorization header supplied - bypassing auth (development mode).');
      return BYPASS_USER;
    }
    console.warn('[mailbox] Missing Authorization header.');
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    console.warn('[mailbox] Authorization header present but token empty.');
    return canBypassAuth ? BYPASS_USER : null;
  }

  const authClient = supabaseAdmin || buildUserSupabaseClient(authHeader);
  if (!authClient) {
    console.warn('[mailbox] Supabase keys not configured for auth.');
    return null;
  }

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    console.warn('[mailbox] Supabase token validation failed:', error?.message || 'unknown error');
    return canBypassAuth ? BYPASS_USER : null;
  }
  return data.user;
};

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/crm/:provider/oauth/start', (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const state = crypto.randomUUID();

  if (CRM_OAUTH_SIMULATE) {
    return res.json({
      mode: 'simulate',
      authUrl: `${CRM_FRONTEND_URL}/oauth/simulate?provider=${provider}&state=${state}`,
      simulatedCode: `sim-${provider}-${Date.now()}`
    });
  }

  if (provider === 'hubspot') {
    if (!HUBSPOT_CLIENT_ID) {
      return res.status(400).send('HUBSPOT_CLIENT_ID is not configured.');
    }
    const params = new URLSearchParams({
      client_id: HUBSPOT_CLIENT_ID,
      redirect_uri: CRM_REDIRECT_URI,
      scope: HUBSPOT_SCOPES,
      state
    });
    return res.json({
      mode: 'live',
      authUrl: `https://app.hubspot.com/oauth/authorize?${params.toString()}`
    });
  }

  if (provider === 'salesforce') {
    if (!SALESFORCE_CLIENT_ID) {
      return res.status(400).send('SALESFORCE_CLIENT_ID is not configured.');
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SALESFORCE_CLIENT_ID,
      redirect_uri: CRM_REDIRECT_URI,
      scope: SALESFORCE_SCOPES,
      state
    });
    return res.json({
      mode: 'live',
      authUrl: `${SALESFORCE_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`
    });
  }

  return res.status(400).send('Unsupported CRM provider.');
});

app.post('/crm/:provider/oauth/exchange', async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).send('OAuth code is required.');
  }

  if (CRM_OAUTH_SIMULATE) {
    return res.json({
      accessToken: `sim-access-${provider}`,
      refreshToken: `sim-refresh-${provider}`,
      expiresIn: 3600,
      accountLabel: 'Sandbox workspace'
    });
  }

  try {
    if (provider === 'hubspot') {
      if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
        return res.status(400).send('HubSpot OAuth credentials are not configured.');
      }
      const payload = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        redirect_uri: CRM_REDIRECT_URI,
        code
      });
      const tokenResp = await axios.post('https://api.hubapi.com/oauth/v1/token', payload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return res.json({
        accessToken: tokenResp.data.access_token,
        refreshToken: tokenResp.data.refresh_token,
        expiresIn: tokenResp.data.expires_in,
        accountLabel: tokenResp.data.hub_id ? `Hub ID ${tokenResp.data.hub_id}` : 'HubSpot workspace'
      });
    }

    if (provider === 'salesforce') {
      if (!SALESFORCE_CLIENT_ID || !SALESFORCE_CLIENT_SECRET) {
        return res.status(400).send('Salesforce OAuth credentials are not configured.');
      }
      const payload = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: SALESFORCE_CLIENT_ID,
        client_secret: SALESFORCE_CLIENT_SECRET,
        redirect_uri: CRM_REDIRECT_URI,
        code
      });
      const tokenResp = await axios.post(
        `${SALESFORCE_LOGIN_URL}/services/oauth2/token`,
        payload.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return res.json({
        accessToken: tokenResp.data.access_token,
        refreshToken: tokenResp.data.refresh_token,
        expiresIn: tokenResp.data.expires_in,
        accountLabel: tokenResp.data.instance_url || 'Salesforce org'
      });
    }

    return res.status(400).send('Unsupported CRM provider.');
  } catch (error) {
    console.error('[crm] OAuth exchange failed:', error?.response?.data || error?.message || error);
    return res.status(500).send('OAuth exchange failed.');
  }
});

app.post('/crm/:provider/sync', async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!['hubspot', 'salesforce'].includes(provider)) {
    return res.status(400).send('Unsupported CRM provider.');
  }

  const synced = 120 + Math.floor(Math.random() * 240);
  const updated = 30 + Math.floor(Math.random() * 60);
  const warnings = Math.random() > 0.75 ? Math.floor(Math.random() * 6) : 0;

  return res.json({ synced, updated, warnings });
});

app.post('/sync-mailbox', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const canBypassAuth = MAILBOX_BYPASS_AUTH && hasServiceRoleKey;
    const user = await authenticateRequest(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const dbClient = supabaseAdmin || buildUserSupabaseClient(authHeader);
    if (!dbClient) {
      return res.status(500).json({
        error: 'Supabase keys are not configured. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.',
      });
    }

    const { configId, limit = 50 } = req.body || {};
    if (!configId) {
      return res.status(400).json({ error: 'configId is required' });
    }

    let configQuery = dbClient
      .from('email_configs')
      .select('*')
      .eq('id', configId);

    if (!canBypassAuth) {
      configQuery = configQuery.eq('user_id', user.id);
    }

    const { data: config, error: configError } = await configQuery.maybeSingle();

    if (configError) {
      console.error('[mailbox] Failed to load email configuration:', configError);
      return res.status(500).json({ error: 'Failed to load email configuration' });
    }

    if (!config) {
      return res.status(404).json({ error: 'Email configuration not found' });
    }

    if (!config.imap_host || !config.imap_port) {
      return res.status(400).json({ error: 'IMAP host/port missing on configuration' });
    }

    const stats = await syncMailbox(config, limit, dbClient);
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('Mailbox sync error', error);
    res.status(500).json({ error: error.message || 'Mailbox sync failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Mailbox sync server listening on port ${PORT}`);
  console.log('Allowed origins:', ALLOWED_ORIGINS.join(', ') || '*');
});
