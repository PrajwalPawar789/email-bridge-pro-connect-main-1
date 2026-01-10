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

async function checkAllCampaignsSync() {
  console.log('🔍 Checking synchronization status for all campaigns...\n');

  // Get all campaigns
  const { data: campaigns, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, name, opened_count, clicked_count, replied_count, bounced_count, status')
    .order('created_at', { ascending: false });

  if (campaignError) {
    console.error('Error fetching campaigns:', campaignError);
    return;
  }

  let totalIssues = 0;
  const issues = [];

  for (const campaign of campaigns) {
    // Get actual recipient counts for this campaign
    const { data: recipients, error: recipientError } = await supabase
      .from('recipients')
      .select('opened_at, clicked_at, replied, bounced')
      .eq('campaign_id', campaign.id);

    if (recipientError) {
      console.error(`Error fetching recipients for ${campaign.id}:`, recipientError);
      continue;
    }

    const actual = {
      opens: recipients.filter(r => r.opened_at !== null).length,
      clicks: recipients.filter(r => r.clicked_at !== null).length,
      replies: recipients.filter(r => r.replied === true).length,
      bounces: recipients.filter(r => r.bounced === true).length
    };

    const db = {
      opens: campaign.opened_count || 0,
      clicks: campaign.clicked_count || 0,
      replies: campaign.replied_count || 0,
      bounces: campaign.bounced_count || 0
    };

    const hasIssues = actual.opens !== db.opens || actual.clicks !== db.clicks ||
                     actual.replies !== db.replies || actual.bounces !== db.bounces;

    if (hasIssues) {
      totalIssues++;
      issues.push({
        id: campaign.id,
        name: campaign.name || 'Unnamed',
        opens: { db: db.opens, actual: actual.opens, diff: db.opens - actual.opens },
        clicks: { db: db.clicks, actual: actual.clicks, diff: db.clicks - actual.clicks },
        replies: { db: db.replies, actual: actual.replies, diff: db.replies - actual.replies },
        bounces: { db: db.bounces, actual: actual.bounces, diff: db.bounces - actual.bounces }
      });
    }
  }

  if (totalIssues === 0) {
    console.log('✅ All campaigns are properly synchronized!');
  } else {
    console.log(`⚠️  Found ${totalIssues} campaigns with synchronization issues:\n`);

    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.name}`);
      console.log(`   ID: ${issue.id}`);
      if (issue.opens.diff !== 0) console.log(`   Opens: DB(${issue.opens.db}) vs Actual(${issue.opens.actual}) [${issue.opens.diff > 0 ? '+' : ''}${issue.opens.diff}]`);
      if (issue.clicks.diff !== 0) console.log(`   Clicks: DB(${issue.clicks.db}) vs Actual(${issue.clicks.actual}) [${issue.clicks.diff > 0 ? '+' : ''}${issue.clicks.diff}]`);
      if (issue.replies.diff !== 0) console.log(`   Replies: DB(${issue.replies.db}) vs Actual(${issue.replies.actual}) [${issue.replies.diff > 0 ? '+' : ''}${issue.replies.diff}]`);
      if (issue.bounces.diff !== 0) console.log(`   Bounces: DB(${issue.bounces.db}) vs Actual(${issue.bounces.actual}) [${issue.bounces.diff > 0 ? '+' : ''}${issue.bounces.diff}]`);
      console.log('');
    });

    console.log('🛠️  RECOMMENDATION: Run the fix-campaign-counts.js script for all campaigns to resolve these issues.');
  }
}

checkAllCampaignsSync().catch(console.error);