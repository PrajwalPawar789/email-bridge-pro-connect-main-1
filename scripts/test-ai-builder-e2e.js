import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const GENERIC_SUBJECT_TOKENS = [
  'ai email template',
  'ai email draft',
  'quick idea for your team',
  'new message',
  'untitled',
];

function loadEnv(path) {
  const map = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

const expectCheck = (condition, message, details = {}) => ({
  pass: Boolean(condition),
  message,
  details,
});

const pickFirstText = (result) => {
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  const textBlock = blocks.find((block) => String(block?.type || '').toLowerCase() === 'text');
  return String(textBlock?.content?.text || '');
};

const isSubjectGeneric = (subject) => {
  const normalized = String(subject || '').trim().toLowerCase();
  if (!normalized) return true;
  return GENERIC_SUBJECT_TOKENS.some((token) => normalized.includes(token));
};

async function run() {
  const env = loadEnv('.env');
  const proxyUrl = 'http://localhost:8080/__supabase';
  const admin = createClient(proxyUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const app = createClient(proxyUrl, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `ai-builder-e2e+${Date.now()}@example.com`;
  const password = `AiBuilder!${Date.now()}Ab`;

  const results = [];
  let userId = '';
  let threadId = '';
  let secondThreadId = '';

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: 'cli-e2e' },
    });
    if (created.error || !created.data?.user?.id) {
      throw new Error(`createUser failed: ${created.error?.message || 'unknown'}`);
    }
    userId = created.data.user.id;

    const signIn = await app.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`);

    const createPrompt =
      'create email marketing template for indian army on anniversary with informative copy';
    const createResp = await app.functions.invoke('ai-builder-generate', {
      body: {
        mode: 'email',
        instruction: createPrompt,
        provider: 'claude',
        optimizeFor: 'balanced',
        brief: {
          audience: 'All',
          tone: 'Professional',
          goal: 'Engagement',
        },
      },
    });

    results.push(
      expectCheck(!createResp.error, 'First generation request succeeded', {
        error: createResp.error?.message || null,
      })
    );

    const firstData = createResp.data || {};
    threadId = String(firstData.threadId || '');
    const firstSubject = String(firstData?.result?.subject || '');
    const firstBlocks = Array.isArray(firstData?.result?.blocks) ? firstData.result.blocks.length : 0;

    results.push(expectCheck(Boolean(threadId), 'Thread ID returned for first request', { threadId }));
    results.push(
      expectCheck(!isSubjectGeneric(firstSubject), 'First subject should not be generic', {
        subject: firstSubject,
      })
    );
    results.push(
      expectCheck(firstBlocks >= 5, 'First response should include at least 5 blocks', { blocks: firstBlocks })
    );

    const bulletPrompt = 'add content about indian army in bullet points';
    const bulletResp = await app.functions.invoke('ai-builder-generate', {
      body: {
        mode: 'email',
        threadId,
        provider: 'claude',
        optimizeFor: 'balanced',
        instruction: bulletPrompt,
        brief: { audience: 'All', tone: 'Professional' },
      },
    });

    results.push(
      expectCheck(!bulletResp.error, 'Follow-up bullet request succeeded', {
        error: bulletResp.error?.message || null,
      })
    );

    const secondData = bulletResp.data || {};
    const secondThread = String(secondData.threadId || '');
    const secondText = pickFirstText(secondData.result);
    const secondSubject = String(secondData?.result?.subject || '');
    results.push(
      expectCheck(secondThread === threadId, 'Follow-up stayed in same thread', {
        expectedThreadId: threadId,
        actualThreadId: secondThread,
      })
    );
    results.push(
      expectCheck(/^- /m.test(secondText), 'Bullet prompt produced bullet-style text', {
        textSample: secondText.slice(0, 220),
      })
    );
    results.push(
      expectCheck(!/content mean/i.test(secondSubject), 'Edit prompt should not become subject', {
        subject: secondSubject,
      })
    );

    const paragraphPrompt =
      "content means not just heading i want information about indian army in paragraphs";
    const paragraphResp = await app.functions.invoke('ai-builder-generate', {
      body: {
        mode: 'email',
        threadId,
        provider: 'claude',
        optimizeFor: 'balanced',
        instruction: paragraphPrompt,
        brief: { audience: 'All', tone: 'Professional' },
      },
    });

    results.push(
      expectCheck(!paragraphResp.error, 'Paragraph follow-up request succeeded', {
        error: paragraphResp.error?.message || null,
      })
    );
    const thirdData = paragraphResp.data || {};
    const thirdSubject = String(thirdData?.result?.subject || '');
    const thirdText = pickFirstText(thirdData.result);
    results.push(
      expectCheck(
        thirdData.threadId === threadId,
        'Paragraph follow-up stayed in same thread',
        { expectedThreadId: threadId, actualThreadId: thirdData.threadId }
      )
    );
    results.push(
      expectCheck(
        !/content means not just heading/i.test(thirdSubject),
        'Paragraph command should not overwrite subject with raw instruction',
        { subject: thirdSubject }
      )
    );
    results.push(
      expectCheck(
        !/^\s*[-*•]/m.test(thirdText),
        'Paragraph command should not return bullet style in first text block',
        { textSample: thirdText.slice(0, 220) }
      )
    );

    const freshThreadResp = await app.functions.invoke('ai-builder-generate', {
      body: {
        mode: 'email',
        instruction: 'create welcome email for saas onboarding',
        provider: 'claude',
        optimizeFor: 'balanced',
        brief: { audience: 'SaaS signups', tone: 'Friendly' },
      },
    });

    secondThreadId = String(freshThreadResp?.data?.threadId || '');
    results.push(
      expectCheck(!freshThreadResp.error, 'Fresh template request succeeded', {
        error: freshThreadResp.error?.message || null,
      })
    );
    results.push(
      expectCheck(Boolean(secondThreadId) && secondThreadId !== threadId, 'Fresh request created a new thread', {
        firstThreadId: threadId,
        secondThreadId,
      })
    );

    const { data: msgRows, error: msgError } = await admin
      .from('ai_builder_messages')
      .select('role, content, created_at')
      .eq('thread_id', threadId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    results.push(
      expectCheck(!msgError, 'Message history query succeeded', {
        error: msgError?.message || null,
      })
    );
    const history = Array.isArray(msgRows) ? msgRows : [];
    results.push(
      expectCheck(history.length >= 6, 'Primary thread has expected message history', {
        messageCount: history.length,
      })
    );
    const roles = history.map((row) => String(row.role || ''));
    const hasAlternatingRoles = roles.filter((role) => role === 'user').length >= 3 &&
      roles.filter((role) => role === 'assistant').length >= 3;
    results.push(expectCheck(hasAlternatingRoles, 'Thread contains both user and assistant turns', { roles }));

    const indexResp = await app.functions.invoke('ai-builder-index', {
      body: {
        mode: 'email',
        objectId: `e2e-${Date.now()}`,
        threadId,
        text: [
          'Indian Army Anniversary Campaign',
          'Informative content with bullet and paragraph sections.',
          'Audience: all users.',
        ].join('\n'),
        metadata: { source: 'cli-e2e', threadId },
      },
    });
    results.push(
      expectCheck(!indexResp.error, 'Index request succeeded', {
        error: indexResp.error?.message || null,
      })
    );
    results.push(
      expectCheck(Number(indexResp?.data?.indexedChunks || 0) >= 1, 'Index created at least one embedding chunk', {
        indexedChunks: indexResp?.data?.indexedChunks || 0,
      })
    );
  } finally {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }

  const failed = results.filter((item) => !item.pass);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failures: failed,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) process.exit(1);
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});

