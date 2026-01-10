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

async function debugCampaignDisplay() {
  const campaignId = '59d00bc7-08e7-4af8-83b8-c4921d3c7d12';

  console.log('🔍 Debugging campaign display differences...\n');

  // Fetch campaign data exactly like the frontend hooks do
  const { data: campaignData, error: campaignError } = await supabase
    .from('campaigns')
    .select(`
      *,
      recipients (id, status, opened_at, clicked_at, current_step, bounced, replied, last_email_sent_at, email, name),
      campaign_followups (id, step_number, delay_days, delay_hours)
    `)
    .eq('id', campaignId)
    .single();

  if (campaignError) {
    console.error('Error fetching campaign:', campaignError);
    return;
  }

  console.log('📊 Campaign Database Values:');
  console.log(`   opened_count: ${campaignData.opened_count}`);
  console.log(`   clicked_count: ${campaignData.clicked_count}`);
  console.log(`   replied_count: ${campaignData.replied_count}`);
  console.log(`   bounced_count: ${campaignData.bounced_count}`);
  console.log(`   bot_open_count: ${campaignData.bot_open_count}`);
  console.log(`   bot_click_count: ${campaignData.bot_click_count}`);
  console.log('');

  console.log('📈 Recipients Data Analysis:');
  const recipients = campaignData.recipients || [];
  console.log(`   Total recipients: ${recipients.length}`);

  const stats = {
    sent: recipients.filter(r => r.status === 'sent').length,
    pending: recipients.filter(r => r.status === 'pending').length,
    failed: recipients.filter(r => r.status === 'failed').length,
    processing: recipients.filter(r => r.status === 'processing').length,
    opened: recipients.filter(r => r.opened_at !== null).length,
    clicked: recipients.filter(r => r.clicked_at !== null).length,
    replied: recipients.filter(r => r.replied === true).length,
    bounced: recipients.filter(r => r.bounced === true).length
  };

  console.log(`   Status breakdown:`);
  console.log(`     - Sent: ${stats.sent}`);
  console.log(`     - Pending: ${stats.pending}`);
  console.log(`     - Failed: ${stats.failed}`);
  console.log(`     - Processing: ${stats.processing}`);
  console.log(`   Engagement:`);
  console.log(`     - Opened (from recipients): ${stats.opened}`);
  console.log(`     - Clicked (from recipients): ${stats.clicked}`);
  console.log(`     - Replied (from recipients): ${stats.replied}`);
  console.log(`     - Bounced (from recipients): ${stats.bounced}`);
  console.log('');

  console.log('🔍 What CampaignList should display:');
  console.log(`   Recipients: ${recipients.length}`);
  console.log(`   Sent/Pending: ${stats.sent}/${stats.pending}`);
  console.log(`   Opens/Clicks: ${stats.opened}/${stats.clicked}`);
  console.log(`   Bounces: ${stats.bounced}`);
  console.log(`   Replies: ${stats.replied}`);
  console.log(`   Bot info: ${campaignData.bot_open_count || 0} opens, ${campaignData.bot_click_count || 0} clicks`);
  console.log('');

  console.log('⚠️  Comparison with user-reported data:');
  console.log(`   User sees: 463 opens, 394 clicks`);
  console.log(`   Actual should be: ${stats.opened} opens, ${stats.clicked} clicks`);
  console.log(`   Difference: ${463 - stats.opened} opens, ${394 - stats.clicked} clicks`);
  console.log('');

  // Check if there are any recipients with opened_at/clicked_at that might be missing
  const openedRecipients = recipients.filter(r => r.opened_at);
  const clickedRecipients = recipients.filter(r => r.clicked_at);

  console.log('🔎 Sample opened recipients:');
  openedRecipients.slice(0, 3).forEach(r => {
    console.log(`   - ${r.email}: opened_at = ${r.opened_at}`);
  });

  console.log('\n🔎 Sample clicked recipients:');
  clickedRecipients.slice(0, 3).forEach(r => {
    console.log(`   - ${r.email}: clicked_at = ${r.clicked_at}`);
  });

  // Check for any data consistency issues
  const dbVsActualOpens = campaignData.opened_count - stats.opened;
  const dbVsActualClicks = campaignData.clicked_count - stats.clicked;

  console.log('\n✅ Data Consistency Check:');
  console.log(`   DB opens vs Actual opens: ${dbVsActualOpens === 0 ? 'MATCH' : `DIFF: ${dbVsActualOpens}`}`);
  console.log(`   DB clicks vs Actual clicks: ${dbVsActualClicks === 0 ? 'MATCH' : `DIFF: ${dbVsActualClicks}`}`);

  if (dbVsActualOpens !== 0 || dbVsActualClicks !== 0) {
    console.log('\n🛠️  Database counts need synchronization!');
  } else {
    console.log('\n✅ All data is properly synchronized!');
  }
}

debugCampaignDisplay().catch(console.error);