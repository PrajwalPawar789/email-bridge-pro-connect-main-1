import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

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

const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const contains = (text, token) => normalize(text).includes(normalize(token));
const neq = (a, b) => normalize(a) !== normalize(b);

const getBlocks = (result) => (Array.isArray(result?.blocks) ? result.blocks : []);
const getFirstText = (result) => {
  const block = getBlocks(result).find((item) => String(item?.type || '').toLowerCase() === 'text');
  return String(block?.content?.text || '');
};
const getAllText = (result) =>
  getBlocks(result)
    .map((block) => {
      const type = String(block?.type || '').toLowerCase();
      const text = String(block?.content?.text || block?.content?.html || '');
      return `${type}: ${text}`;
    })
    .join('\n');
const getButtonText = (result) => {
  const block = getBlocks(result).find((item) => String(item?.type || '').toLowerCase() === 'button');
  return String(block?.content?.text || '');
};

const check = (condition, title, details = {}) => ({
  pass: Boolean(condition),
  title,
  details,
});

async function run() {
  const env = loadEnv('.env');
  const proxyUrl = 'http://localhost:8080/__supabase';
  const admin = createClient(proxyUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const app = createClient(proxyUrl, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `ai-conversation-test+${Date.now()}@example.com`;
  const password = `AiConv!${Date.now()}Ab`;

  const assertions = [];
  let userId = '';

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: 'conversation-e2e' },
    });
    if (created.error || !created.data?.user?.id) {
      throw new Error(`createUser failed: ${created.error?.message || 'unknown'}`);
    }
    userId = created.data.user.id;

    const signIn = await app.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`);

    // 1) Create template A
    const promptA =
      'Create a product launch email template for an AI CRM platform. Keep it professional and include CTA text Book Demo.';
    const respA = await app.functions.invoke('ai-builder-generate', {
      body: {
        mode: 'email',
        provider: 'claude',
        optimizeFor: 'quality',
        instruction: promptA,
        brief: {
          audience: 'B2B revenue leaders',
          tone: 'Professional',
          goal: 'Book product demos',
          cta: 'Book Demo',
        },
      },
    });

    assertions.push(check(!respA.error, 'Template A generation succeeded', { error: respA.error?.message || null }));
    const dataA = respA.data || {};
    const threadA = String(dataA.threadId || '');
    const subjectA = String(dataA?.result?.subject || '');
    const blocksA = getBlocks(dataA.result);
    const qualityA = Number(dataA?.usage?.diagnostics?.qualityScore ?? 0);
    assertions.push(check(Boolean(threadA), 'Template A thread created', { threadA }));
    assertions.push(check(blocksA.length >= 5, 'Template A has >= 5 blocks', { blockCount: blocksA.length }));
    assertions.push(check(qualityA >= 70, 'Template A quality score >= 70', { qualityA }));
    assertions.push(check(contains(getButtonText(dataA.result), 'Book Demo'), 'Template A CTA contains Book Demo', {
      ctaText: getButtonText(dataA.result),
    }));

    // 2) Create template B (new conversation)
    const promptB =
      'Create a weekly HR newsletter email template with bullet points and one CTA Download Guide.';
    const respB = await app.functions.invoke('ai-builder-generate', {
      body: {
        mode: 'email',
        provider: 'claude',
        optimizeFor: 'quality',
        instruction: promptB,
        brief: {
          audience: 'HR directors',
          tone: 'Friendly',
          goal: 'Newsletter engagement',
          cta: 'Download Guide',
        },
      },
    });

    assertions.push(check(!respB.error, 'Template B generation succeeded', { error: respB.error?.message || null }));
    const dataB = respB.data || {};
    const threadB = String(dataB.threadId || '');
    const subjectB = String(dataB?.result?.subject || '');
    const firstTextB = getFirstText(dataB.result);
    const qualityB = Number(dataB?.usage?.diagnostics?.qualityScore ?? 0);
    assertions.push(check(Boolean(threadB), 'Template B thread created', { threadB }));
    assertions.push(check(threadB !== threadA, 'Template B uses a different thread than A', { threadA, threadB }));
    assertions.push(check(neq(subjectA, subjectB), 'Template B subject differs from template A subject', { subjectA, subjectB }));
    assertions.push(check(/^- /m.test(firstTextB) || contains(getAllText(dataB.result), '- '), 'Template B includes bullets', {
      firstTextSample: firstTextB.slice(0, 220),
    }));
    assertions.push(check(qualityB >= 70, 'Template B quality score >= 70', { qualityB }));

    // 3) Follow-up on template B and verify changes
    const followUp1 =
      'In this same template, change CTA text to Download the HR Checklist and convert bullet points into paragraphs.';
    const respB2 = await app.functions.invoke('ai-builder-generate', {
      body: {
        mode: 'email',
        threadId: threadB,
        provider: 'claude',
        optimizeFor: 'quality',
        instruction: followUp1,
        brief: {
          audience: 'HR directors',
          tone: 'Friendly',
        },
      },
    });

    assertions.push(check(!respB2.error, 'Template B follow-up #1 succeeded', { error: respB2.error?.message || null }));
    const dataB2 = respB2.data || {};
    const threadB2 = String(dataB2.threadId || '');
    const firstTextB2 = getFirstText(dataB2.result);
    const ctaB2 = getButtonText(dataB2.result);
    assertions.push(check(threadB2 === threadB, 'Follow-up #1 stayed in thread B', { threadB, threadB2 }));
    assertions.push(check(contains(ctaB2, 'Download the HR Checklist'), 'Follow-up #1 updated CTA text correctly', {
      ctaB2,
    }));
    assertions.push(check(!/^\s*[-*•]/m.test(firstTextB2), 'Follow-up #1 converted first text block to paragraph style', {
      firstTextB2: firstTextB2.slice(0, 240),
    }));

    const followUp2 = 'Add one extra paragraph about implementation timeline and expected ROI in 90 days.';
    const respB3 = await app.functions.invoke('ai-builder-generate', {
      body: {
        mode: 'email',
        threadId: threadB,
        provider: 'claude',
        optimizeFor: 'quality',
        instruction: followUp2,
        brief: {
          audience: 'HR directors',
          tone: 'Friendly',
        },
      },
    });

    assertions.push(check(!respB3.error, 'Template B follow-up #2 succeeded', { error: respB3.error?.message || null }));
    const dataB3 = respB3.data || {};
    const threadB3 = String(dataB3.threadId || '');
    const allTextB3 = getAllText(dataB3.result);
    assertions.push(check(threadB3 === threadB, 'Follow-up #2 stayed in thread B', { threadB, threadB3 }));
    assertions.push(
      check(
        contains(allTextB3, 'timeline') || contains(allTextB3, '90 days') || contains(allTextB3, 'roi'),
        'Follow-up #2 included timeline/ROI content',
        { textSample: allTextB3.slice(0, 500) }
      )
    );

    // 4) Verify conversation history persisted for thread B
    const { data: messagesB, error: msgErrB } = await admin
      .from('ai_builder_messages')
      .select('role, content, created_at')
      .eq('thread_id', threadB)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    assertions.push(check(!msgErrB, 'Thread B history query succeeded', { error: msgErrB?.message || null }));
    const rows = Array.isArray(messagesB) ? messagesB : [];
    const userTurns = rows.filter((row) => String(row.role || '') === 'user').length;
    const assistantTurns = rows.filter((row) => String(row.role || '') === 'assistant').length;
    assertions.push(check(userTurns >= 3 && assistantTurns >= 3, 'Thread B has expected multi-turn chat history', {
      userTurns,
      assistantTurns,
      totalRows: rows.length,
    }));
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId);
  }

  const failed = assertions.filter((item) => !item.pass);
  const result = {
    total: assertions.length,
    passed: assertions.length - failed.length,
    failed: failed.length,
    failures: failed,
  };
  console.log(JSON.stringify(result, null, 2));
  if (failed.length > 0) process.exit(1);
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});

