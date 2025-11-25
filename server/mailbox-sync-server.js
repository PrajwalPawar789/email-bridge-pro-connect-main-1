import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const DEFAULT_SUPABASE_URL = 'https://lyerkyijpavilyufcrgb.supabase.co';
const DEFAULT_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZXJreWlqcGF2aWx5dWZjcmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODc1MzQ2NCwiZXhwIjoyMDY0MzI5NDY0fQ.Kll6jTeiqLIGbNGgzQwxVMSpYwKs3LBbAWEbr8x2Y30';
const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:8081,http://localhost:8080';
const DEFAULT_MAILBOX_PORT = 8787;
const DEFAULT_BYPASS_AUTH = 'true';

const PORT = Number(process.env.MAILBOX_SERVER_PORT || DEFAULT_MAILBOX_PORT);
const ALLOWED_ORIGINS = (process.env.MAILBOX_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY;
const MAILBOX_BYPASS_AUTH = (process.env.MAILBOX_BYPASS_AUTH || DEFAULT_BYPASS_AUTH).toLowerCase() === 'true';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

const syncMailbox = async (config, limit = 50) => {
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
      const { data: existingData, error: existingError } = await supabaseAdmin
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
      const { error: insertError } = await supabaseAdmin
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

const authenticateRequest = async (authHeader) => {
  if (!authHeader?.startsWith('Bearer ')) {
    if (MAILBOX_BYPASS_AUTH) {
      console.warn('[mailbox] No Authorization header supplied – bypassing auth (development mode).');
      return BYPASS_USER;
    }
    console.warn('[mailbox] Missing Authorization header.');
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    console.warn('[mailbox] Authorization header present but token empty.');
    return MAILBOX_BYPASS_AUTH ? BYPASS_USER : null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    console.warn('[mailbox] Supabase token validation failed:', error?.message || 'unknown error');
    return MAILBOX_BYPASS_AUTH ? BYPASS_USER : null;
  }
  return data.user;
};

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/sync-mailbox', async (req, res) => {
  try {
    const user = await authenticateRequest(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { configId, limit = 50 } = req.body || {};
    if (!configId) {
      return res.status(400).json({ error: 'configId is required' });
    }

    let configQuery = supabaseAdmin
      .from('email_configs')
      .select('*')
      .eq('id', configId);

    if (!MAILBOX_BYPASS_AUTH) {
      configQuery = configQuery.eq('user_id', user.id);
    }

    const { data: config, error: configError } = await configQuery.single();

    if (configError || !config) {
      return res.status(404).json({ error: 'Email configuration not found' });
    }

    if (!config.imap_host || !config.imap_port) {
      return res.status(400).json({ error: 'IMAP host/port missing on configuration' });
    }

    const stats = await syncMailbox(config, limit);
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
