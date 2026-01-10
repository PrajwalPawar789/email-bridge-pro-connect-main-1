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

async function fixAllCampaignCounts() {
  console.log('🔧 Fixing counts for all campaigns...\n');

  // Get all campaigns
  const { data: campaigns, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, name, opened_count, clicked_count, replied_count, bounced_count')
    .order('created_at', { ascending: false });

  if (campaignError) {
    console.error('Error fetching campaigns:', campaignError);
    return;
  }

  console.log(`📊 Processing ${campaigns.length} campaigns...\n`);

  let fixedCount = 0;

  for (const campaign of campaigns) {
    // Get actual counts from recipients table
    const { data: recipients, error: recipientError } = await supabase
      .from('recipients')
      .select('opened_at, clicked_at, replied, bounced')
      .eq('campaign_id', campaign.id);

    if (recipientError) {
      console.error(`Error fetching recipients for ${campaign.id}:`, recipientError);
      continue;
    }

    const actualCounts = {
      opened_count: recipients.filter(r => r.opened_at !== null).length,
      clicked_count: recipients.filter(r => r.clicked_at !== null).length,
      replied_count: recipients.filter(r => r.replied === true).length,
      bounced_count: recipients.filter(r => r.bounced === true).length
    };

    const currentCounts = {
      opened_count: campaign.opened_count || 0,
      clicked_count: campaign.clicked_count || 0,
      replied_count: campaign.replied_count || 0,
      bounced_count: campaign.bounced_count || 0
    };

    // Check if any counts need updating
    const needsUpdate = Object.keys(actualCounts).some(key =>
      actualCounts[key] !== currentCounts[key]
    );

    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({
          ...actualCounts,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaign.id);

      if (updateError) {
        console.error(`❌ Error updating campaign ${campaign.id}:`, updateError);
      } else {
        console.log(`✅ ${campaign.name || 'Unnamed Campaign'}`);
        console.log(`   Opens: ${currentCounts.opened_count} → ${actualCounts.opened_count}`);
        console.log(`   Clicks: ${currentCounts.clicked_count} → ${actualCounts.clicked_count}`);
        console.log(`   Replies: ${currentCounts.replied_count} → ${actualCounts.replied_count}`);
        console.log(`   Bounces: ${currentCounts.bounced_count} → ${actualCounts.bounced_count}`);
        console.log('');
        fixedCount++;
      }
    }
  }

  console.log(`🎉 Fixed ${fixedCount} campaigns. All analytics now synchronized!`);
}

fixAllCampaignCounts().catch(console.error);