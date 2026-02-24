import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import process from 'process';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PLAN_EXPECTATIONS = {
  free: {
    mailboxLimit: 1,
    campaignLimit: 3,
    creditsInPeriod: 2000,
  },
  growth: {
    mailboxLimit: 5,
    campaignLimit: 25,
    creditsInPeriod: 100000,
  },
  scale: {
    mailboxLimit: 20,
    campaignLimit: 100,
    creditsInPeriod: 300000,
  },
  enterprise: {
    mailboxLimit: null,
    campaignLimit: null,
    creditsInPeriod: 0,
  },
};

const requireEnv = () => {
  if (!SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL in environment.');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in environment.');
  }
};

const toSingleRow = (data) => (Array.isArray(data) ? (data[0] ?? null) : data);

const getSnapshot = async (client, userId) => {
  const { data, error } = await client.rpc('get_billing_snapshot', { p_user_id: userId });
  if (error) throw new Error(`get_billing_snapshot failed: ${error.message}`);
  const row = toSingleRow(data);
  if (!row) throw new Error('Billing snapshot is empty.');
  return row;
};

const callSetPlan = async (client, userId, planId, billingCycle = 'monthly') => {
  const { error } = await client.rpc('set_user_subscription_plan', {
    p_plan_id: planId,
    p_billing_cycle: billingCycle,
    p_user_id: userId,
    p_status: 'active',
  });

  if (error) {
    throw new Error(`set_user_subscription_plan failed: ${error.message}`);
  }
};

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`${message}. Expected=${expected}, Actual=${actual}`);
  }
};

const assertTrue = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createTempUser = async (client, planId) => {
  const timestamp = Date.now();
  const email = `smoke-${planId}-${timestamp}@example.com`;
  const password = `Tmp-${randomUUID()}-A1!`;

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      source: 'plan-smoke-test',
      plan: planId,
      created_at: new Date().toISOString(),
    },
  });

  if (error || !data?.user?.id) {
    throw new Error(`Unable to create temp user: ${error?.message || 'Unknown error'}`);
  }

  return { userId: data.user.id, email };
};

const deleteTempUser = async (client, userId) => {
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`[cleanup] Failed to delete temp user ${userId}: ${error.message}`);
  }
};

const createCampaignRows = (userId, count) =>
  Array.from({ length: count }).map((_, index) => ({
    user_id: userId,
    name: `Smoke Campaign ${index + 1} ${randomUUID().slice(0, 8)}`,
    subject: 'Smoke test subject',
    body: 'Smoke test body',
    status: 'draft',
    send_delay_minutes: 0,
  }));

const createMailboxRows = (userId, count) =>
  Array.from({ length: count }).map((_, index) => {
    const stamp = `${Date.now()}-${index}-${randomUUID().slice(0, 6)}`;
    const email = `smoke-sender-${stamp}@example.com`;
    return {
      user_id: userId,
      sender_name: `Smoke Sender ${index + 1}`,
      smtp_username: email,
      smtp_password: `smtp-${randomUUID()}`,
      smtp_host: 'smtp.example.com',
      smtp_port: 465,
      security: 'SSL',
      imap_host: 'imap.example.com',
      imap_port: 993,
    };
  });

const verifyCampaignConstraint = async (client, userId, expectedLimit) => {
  console.log('[check] Campaign limit enforcement');
  const seedCount = expectedLimit === null ? 5 : expectedLimit;

  if (seedCount > 0) {
    const { error: seedError } = await client.from('campaigns').insert(createCampaignRows(userId, seedCount));
    if (seedError) {
      throw new Error(`Failed to seed campaigns: ${seedError.message}`);
    }
  }

  if (expectedLimit === null) {
    console.log('  - PASS: Unlimited campaigns accepted.');
    return;
  }

  const { error: limitError } = await client.from('campaigns').insert(createCampaignRows(userId, 1));
  if (!limitError) {
    throw new Error('Campaign limit was not enforced on overflow insert.');
  }

  assertTrue(
    String(limitError.message || '').toLowerCase().includes('campaign limit reached'),
    `Unexpected campaign overflow error message: ${limitError.message}`
  );

  console.log('  - PASS: Campaign overflow blocked with campaign limit error.');
};

const verifyMailboxConstraint = async (client, userId, expectedLimit) => {
  console.log('[check] Sender account (mailbox) limit enforcement');
  const seedCount = expectedLimit === null ? 5 : expectedLimit;

  if (seedCount > 0) {
    const { error: seedError } = await client.from('email_configs').insert(createMailboxRows(userId, seedCount));
    if (seedError) {
      throw new Error(`Failed to seed sender accounts: ${seedError.message}`);
    }
  }

  if (expectedLimit === null) {
    console.log('  - PASS: Unlimited sender accounts accepted.');
    return;
  }

  const { error: limitError } = await client.from('email_configs').insert(createMailboxRows(userId, 1));
  if (!limitError) {
    throw new Error('Sender account limit was not enforced on overflow insert.');
  }

  assertTrue(
    String(limitError.message || '').toLowerCase().includes('mailbox limit reached'),
    `Unexpected mailbox overflow error message: ${limitError.message}`
  );

  console.log('  - PASS: Sender overflow blocked with mailbox limit error.');
};

const verifyCreditConsumption = async (client, userId, creditsInPeriod) => {
  console.log('[check] Credit deduction and insufficient-credit blocking');
  const before = await getSnapshot(client, userId);
  const beforeCredits = Number(before.credits_remaining || 0);

  if (creditsInPeriod <= 0 || beforeCredits <= 0) {
    const { data, error } = await client.rpc('consume_user_credits', {
      p_amount: 1,
      p_event_type: 'smoke_credit_probe',
      p_reference_id: `smoke:${userId}:probe:${Date.now()}`,
      p_metadata: { source: 'smoke-test' },
      p_user_id: userId,
    });
    if (error) throw new Error(`consume_user_credits probe failed: ${error.message}`);

    const row = toSingleRow(data);
    assertTrue(row?.allowed === false, 'Credit probe should be blocked for zero-credit plan/workspace.');
    console.log('  - PASS: Zero-credit workspace blocks outbound credit consumption.');
    return;
  }

  const consumeReference = `smoke:${userId}:consume:${Date.now()}`;
  const { data: consumeData, error: consumeError } = await client.rpc('consume_user_credits', {
    p_amount: 1,
    p_event_type: 'smoke_credit_consume',
    p_reference_id: consumeReference,
    p_metadata: { source: 'smoke-test' },
    p_user_id: userId,
  });
  if (consumeError) throw new Error(`consume_user_credits failed: ${consumeError.message}`);

  const consumeRow = toSingleRow(consumeData);
  assertTrue(Boolean(consumeRow?.allowed), 'Expected credit debit to be allowed.');

  const afterConsume = await getSnapshot(client, userId);
  const afterConsumeCredits = Number(afterConsume.credits_remaining || 0);
  assertEqual(afterConsumeCredits, beforeCredits - 1, 'Credits were not deducted by 1');

  const { error: refundError } = await client.rpc('refund_user_credits', {
    p_amount: 1,
    p_event_type: 'smoke_credit_refund',
    p_reference_id: consumeReference,
    p_metadata: { source: 'smoke-test' },
    p_user_id: userId,
  });
  if (refundError) throw new Error(`refund_user_credits failed: ${refundError.message}`);

  const afterRefund = await getSnapshot(client, userId);
  const afterRefundCredits = Number(afterRefund.credits_remaining || 0);
  assertEqual(afterRefundCredits, beforeCredits, 'Credits were not restored after refund');

  const { data: blockedData, error: blockedError } = await client.rpc('consume_user_credits', {
    p_amount: afterRefundCredits + 1,
    p_event_type: 'smoke_credit_overflow',
    p_reference_id: `smoke:${userId}:overflow:${Date.now()}`,
    p_metadata: { source: 'smoke-test' },
    p_user_id: userId,
  });
  if (blockedError) throw new Error(`Overflow consume_user_credits call failed: ${blockedError.message}`);

  const blockedRow = toSingleRow(blockedData);
  assertTrue(blockedRow?.allowed === false, 'Overflow credit debit should be blocked.');
  console.log('  - PASS: Credits debit, refund, and insufficient-credit blocking work as expected.');
};

export const runPlanSmokeTest = async ({
  planId,
  billingCycle = 'monthly',
  keepUser = false,
} = {}) => {
  requireEnv();

  const normalizedPlan = String(planId || '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PLAN_EXPECTATIONS, normalizedPlan)) {
    throw new Error(`Unknown plan "${planId}". Supported: ${Object.keys(PLAN_EXPECTATIONS).join(', ')}`);
  }

  const expected = PLAN_EXPECTATIONS[normalizedPlan];
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { userId, email } = await createTempUser(admin, normalizedPlan);

  console.log(`\n[setup] Created temp user: ${email} (${userId})`);
  let hadFailure = false;

  try {
    console.log(`[setup] Applying plan "${normalizedPlan}" (${billingCycle})`);
    await callSetPlan(admin, userId, normalizedPlan, billingCycle);

    const snapshot = await getSnapshot(admin, userId);
    if (
      typeof snapshot.campaign_limit === 'undefined' ||
      typeof snapshot.campaigns_used === 'undefined' ||
      typeof snapshot.unlimited_campaigns === 'undefined'
    ) {
      throw new Error(
        'Campaign limit fields are missing in get_billing_snapshot. Apply latest Supabase migrations before running smoke tests.'
      );
    }

    assertEqual(snapshot.plan_id, normalizedPlan, 'Plan id mismatch after plan update');
    assertEqual(snapshot.billing_cycle, billingCycle, 'Billing cycle mismatch after plan update');
    assertEqual(snapshot.mailbox_limit, expected.mailboxLimit, 'Mailbox limit mismatch');
    assertEqual(snapshot.campaign_limit, expected.campaignLimit, 'Campaign limit mismatch');
    assertEqual(Number(snapshot.credits_in_period || 0), expected.creditsInPeriod, 'Credits in period mismatch');
    console.log('[check] Billing snapshot limits match expected plan values');

    await verifyCampaignConstraint(admin, userId, expected.campaignLimit);
    await verifyMailboxConstraint(admin, userId, expected.mailboxLimit);
    await verifyCreditConsumption(admin, userId, expected.creditsInPeriod);

    console.log(`\n[result] PASS (${normalizedPlan})`);
  } catch (error) {
    hadFailure = true;
    console.error(`\n[result] FAIL (${normalizedPlan})`);
    console.error(String(error?.stack || error));
    throw error;
  } finally {
    if (!keepUser) {
      await deleteTempUser(admin, userId);
      console.log('[cleanup] Temp user deleted.');
    } else {
      console.log(`[cleanup] keepUser=true. Temp user retained: ${userId}`);
    }

    if (hadFailure) {
      process.exitCode = 1;
    }
  }
};

const parseArgs = (argv) => {
  const result = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const maybeValue = argv[i + 1];
    if (!maybeValue || maybeValue.startsWith('--')) {
      result[key] = true;
      continue;
    }
    result[key] = maybeValue;
    i += 1;
  }
  return result;
};

const runFromCli = async () => {
  const args = parseArgs(process.argv);
  const planId = String(args.plan || '');
  const billingCycle = String(args.billingCycle || 'monthly').toLowerCase();
  const keepUser = Boolean(args.keepUser);

  if (!planId) {
    throw new Error('Missing --plan argument. Example: node scripts/smoke-plan-constraints.js --plan free');
  }

  await runPlanSmokeTest({ planId, billingCycle, keepUser });
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  runFromCli().catch((error) => {
    console.error(String(error?.stack || error));
    process.exit(1);
  });
}
