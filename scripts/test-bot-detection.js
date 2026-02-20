import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runTest() {
  console.log("Starting Bot Detection End-to-End Test...");

  // 1. Fetch an existing campaign to use
  const { data: campaigns, error: campError } = await supabase.from('campaigns').select('id, user_id').limit(1);
  
  if (campError || !campaigns || campaigns.length === 0) {
      console.error("No campaigns found to test with. Please create a campaign in the dashboard first.", campError);
      return;
  }
  
  const campaignId = campaigns[0].id;
  console.log(`Using Campaign ID: ${campaignId}`);

  // 2. Create a test recipient
  const { data: recipient, error: recError } = await supabase
    .from('recipients')
    .insert({
      campaign_id: campaignId,
      email: `bot-test-${Date.now()}@example.com`,
      status: 'sent',
      last_email_sent_at: new Date().toISOString() // Sent NOW
    })
    .select()
    .single();

  if (recError) {
      console.error("Error creating recipient:", recError);
      return;
  }
  
  const recipientId = recipient.id;
  console.log(`Created Recipient ID: ${recipientId}`);

  // 3. Test Speed Trap (Open)
  console.log("\n--- Testing Speed Trap (Open) ---");
  const openUrl = `${SUPABASE_URL}/functions/v1/track-email-open?campaign_id=${campaignId}&recipient_id=${recipientId}`;
  console.log(`Calling: ${openUrl}`);
  
  try {
      const res = await fetch(openUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
      });
      console.log(`Response: ${res.status} ${res.statusText}`);
  } catch (e) {
      console.error("Error calling open tracking:", e);
  }

  // 4. Test Honeypot (Click)
  console.log("\n--- Testing Honeypot (Click) ---");
  const clickUrl = `${SUPABASE_URL}/functions/v1/track-email-click?campaign_id=${campaignId}&recipient_id=${recipientId}&url=${encodeURIComponent('http://example.com')}&type=ghost`;
  console.log(`Calling: ${clickUrl}`);

  try {
      const res = await fetch(clickUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
      });
      console.log(`Response: ${res.status} ${res.statusText}`);
  } catch (e) {
      console.error("Error calling click tracking:", e);
  }

  // 5. Verify Results
  console.log("\n--- Verifying Results ---");
  // Wait a moment for async inserts
  await new Promise(r => setTimeout(r, 5000));

  const { data: events, error: eventError } = await supabase
    .from('tracking_events')
    .select('*')
    .eq('recipient_id', recipientId);

  if (eventError) {
      console.error("Error fetching events:", eventError);
  } else {
      console.log(`Found ${events.length} tracking events:`);
      events.forEach(e => {
          console.log(`- Type: ${e.event_type}, IsBot: ${e.is_bot}, Score: ${e.bot_score}, Reasons: ${JSON.stringify(e.bot_reasons)}`);
      });
  }
  
  const { data: campStats } = await supabase
    .from('campaigns')
    .select('bot_open_count, bot_click_count')
    .eq('id', campaignId)
    .single();
    
  console.log("Campaign Stats:", campStats);
}

runTest();
