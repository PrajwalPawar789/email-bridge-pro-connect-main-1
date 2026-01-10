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

async function fixCampaignCounts() {
  const campaignId = '59d00bc7-08e7-4af8-83b8-c4921d3c7d12';

  console.log(`Fixing counts for campaign: ${campaignId}`);

  // Get actual counts from recipients table
  const { data: recipients, error: recipientsError } = await supabase
    .from('recipients')
    .select('opened_at, clicked_at, replied, bounced')
    .eq('campaign_id', campaignId);

  if (recipientsError) {
    console.error('Error fetching recipients:', recipientsError);
    return;
  }

  // Calculate actual counts
  const actualOpens = recipients.filter(r => r.opened_at).length;
  const actualClicks = recipients.filter(r => r.clicked_at).length;
  const actualReplies = recipients.filter(r => r.replied).length;
  const actualBounces = recipients.filter(r => r.bounced).length;

  console.log(`Actual counts from recipients table:`);
  console.log(`- Opens: ${actualOpens}`);
  console.log(`- Clicks: ${actualClicks}`);
  console.log(`- Replies: ${actualReplies}`);
  console.log(`- Bounces: ${actualBounces}`);

  // Get current campaign counts
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('opened_count, clicked_count, replied_count, bounced_count, bot_open_count, bot_click_count')
    .eq('id', campaignId)
    .single();

  if (campaignError) {
    console.error('Error fetching campaign:', campaignError);
    return;
  }

  console.log(`Current DB counts:`);
  console.log(`- Opens: ${campaign.opened_count}`);
  console.log(`- Clicks: ${campaign.clicked_count}`);
  console.log(`- Replies: ${campaign.replied_count}`);
  console.log(`- Bounces: ${campaign.bounced_count}`);
  console.log(`- Bot Opens: ${campaign.bot_open_count}`);
  console.log(`- Bot Clicks: ${campaign.bot_click_count}`);

  // Update campaign with correct counts
  const { error: updateError } = await supabase
    .from('campaigns')
    .update({
      opened_count: actualOpens,
      clicked_count: actualClicks,
      replied_count: actualReplies,
      bounced_count: actualBounces,
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignId);

  if (updateError) {
    console.error('Error updating campaign counts:', updateError);
    return;
  }

  console.log('✅ Campaign counts fixed successfully!');
  console.log(`Updated to: ${actualOpens} opens, ${actualClicks} clicks, ${actualReplies} replies, ${actualBounces} bounces`);
}

fixCampaignCounts().catch(console.error);