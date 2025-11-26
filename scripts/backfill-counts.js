
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function backfillCounts() {
  console.log('Starting backfill of campaign counts...');

  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, name');

  if (error) {
    console.error('Error fetching campaigns:', error);
    return;
  }

  console.log(`Found ${campaigns.length} campaigns.`);

  for (const campaign of campaigns) {
    console.log(`Processing campaign: ${campaign.name} (${campaign.id})`);

    // Count replies
    const { count: replyCount, error: replyError } = await supabase
      .from('recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('replied', true);

    if (replyError) {
      console.error(`Error counting replies for campaign ${campaign.id}:`, replyError);
    }

    // Count bounces
    const { count: bounceCount, error: bounceError } = await supabase
      .from('recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('bounced', true);

    if (bounceError) {
      console.error(`Error counting bounces for campaign ${campaign.id}:`, bounceError);
    }

    console.log(`  Replies: ${replyCount}, Bounces: ${bounceCount}`);

    // Update campaign
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ 
        replied_count: replyCount || 0,
        bounced_count: bounceCount || 0
      })
      .eq('id', campaign.id);

    if (updateError) {
      console.error(`Error updating campaign ${campaign.id}:`, updateError);
    } else {
      console.log(`  Updated successfully.`);
    }
  }

  console.log('Backfill completed.');
}

backfillCounts();
