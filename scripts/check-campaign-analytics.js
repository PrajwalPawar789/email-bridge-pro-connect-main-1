import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCampaignAnalytics() {
  const campaignId = '59d00bc7-08e7-4af8-83b8-c4921d3c7d12';

  console.log(`🔍 Checking analytics for campaign: ${campaignId}\n`);

  // Get campaign data
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError) {
    console.error('Error fetching campaign:', campaignError);
    return;
  }

  console.log('📊 Campaign Database Counts:');
  console.log(`   Opened Count: ${campaign.opened_count || 0}`);
  console.log(`   Clicked Count: ${campaign.clicked_count || 0}`);
  console.log(`   Replied Count: ${campaign.replied_count || 0}`);
  console.log(`   Bounced Count: ${campaign.bounced_count || 0}`);
  console.log(`   Bot Open Count: ${campaign.bot_open_count || 0}`);
  console.log(`   Bot Click Count: ${campaign.bot_click_count || 0}`);
  console.log(`   Status: ${campaign.status}`);
  console.log('');

  // Get actual recipient counts
  const { data: recipients, error: recipientError } = await supabase
    .from('recipients')
    .select('status, opened_at, clicked_at, replied, bounced')
    .eq('campaign_id', campaignId);

  if (recipientError) {
    console.error('Error fetching recipients:', recipientError);
    return;
  }

  console.log('📈 Actual Recipient Data:');
  const stats = {
    total: recipients.length,
    sent: recipients.filter(r => r.status === 'sent').length,
    opened: recipients.filter(r => r.opened_at !== null).length,
    clicked: recipients.filter(r => r.clicked_at !== null).length,
    replied: recipients.filter(r => r.replied === true).length,
    bounced: recipients.filter(r => r.bounced === true).length,
    pending: recipients.filter(r => r.status === 'pending').length,
    failed: recipients.filter(r => r.status === 'failed').length,
    processing: recipients.filter(r => r.status === 'processing').length
  };

  console.log(`   Total Recipients: ${stats.total}`);
  console.log(`   Status Breakdown:`);
  console.log(`     - Sent: ${stats.sent}`);
  console.log(`     - Pending: ${stats.pending}`);
  console.log(`     - Failed: ${stats.failed}`);
  console.log(`     - Processing: ${stats.processing}`);
  console.log(`   Engagement:`);
  console.log(`     - Opened: ${stats.opened}`);
  console.log(`     - Clicked: ${stats.clicked}`);
  console.log(`     - Replied: ${stats.replied}`);
  console.log(`     - Bounced: ${stats.bounced}`);
  console.log('');

  // Check for discrepancies
  console.log('⚠️  Discrepancy Analysis:');
  const openDiff = (campaign.opened_count || 0) - stats.opened;
  const clickDiff = (campaign.clicked_count || 0) - stats.clicked;
  const replyDiff = (campaign.replied_count || 0) - stats.replied;
  const bounceDiff = (campaign.bounced_count || 0) - stats.bounced;

  console.log(`   Opens: DB(${campaign.opened_count || 0}) vs Actual(${stats.opened}) = ${openDiff !== 0 ? `DIFF: ${openDiff}` : 'MATCH'}`);
  console.log(`   Clicks: DB(${campaign.clicked_count || 0}) vs Actual(${stats.clicked}) = ${clickDiff !== 0 ? `DIFF: ${clickDiff}` : 'MATCH'}`);
  console.log(`   Replies: DB(${campaign.replied_count || 0}) vs Actual(${stats.replied}) = ${replyDiff !== 0 ? `DIFF: ${replyDiff}` : 'MATCH'}`);
  console.log(`   Bounces: DB(${campaign.bounced_count || 0}) vs Actual(${stats.bounced}) = ${bounceDiff !== 0 ? `DIFF: ${bounceDiff}` : 'MATCH'}`);

  // Check tracking events
  const { data: openEvents, error: openEventsError } = await supabase
    .from('tracking_events')
    .select('id, is_bot')
    .eq('campaign_id', campaignId)
    .eq('event_type', 'open')
    .eq('is_bot', false);

  const { data: clickEvents, error: clickEventsError } = await supabase
    .from('tracking_events')
    .select('id, is_bot')
    .eq('campaign_id', campaignId)
    .eq('event_type', 'click')
    .eq('is_bot', false);

  if (!openEventsError && !clickEventsError) {
    console.log('');
    console.log('🔍 Tracking Events (Human Only):');
    console.log(`   Open Events: ${openEvents.length}`);
    console.log(`   Click Events: ${clickEvents.length}`);
  }

  // Check if counts need fixing
  const needsFixing = openDiff !== 0 || clickDiff !== 0 || replyDiff !== 0 || bounceDiff !== 0;

  if (needsFixing) {
    console.log('');
    console.log('🛠️  RECOMMENDATION: Database counts need to be synced with actual recipient data.');
    console.log('   Run the fix-campaign-counts.js script to correct this.');
  } else {
    console.log('');
    console.log('✅ All counts are properly synchronized!');
  }
}

checkCampaignAnalytics().catch(console.error);