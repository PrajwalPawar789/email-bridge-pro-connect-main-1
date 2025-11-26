
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

async function inspectCampaign() {
  const campaignName = 'Prajwal 3333';
  
  console.log(`Searching for campaign: ${campaignName}`);

  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .ilike('name', `%${campaignName}%`);

  if (error) {
    console.error('Error fetching campaign:', error);
    return;
  }

  if (campaigns.length === 0) {
    console.log('No campaign found.');
    return;
  }

  const campaign = campaigns[0];
  console.log(`Found campaign: ${campaign.name} (${campaign.id})`);
  console.log(`Replied Count: ${campaign.replied_count}`);

  const { data: recipients, error: rError } = await supabase
    .from('recipients')
    .select('*')
    .eq('campaign_id', campaign.id);

  if (rError) {
    console.error('Error fetching recipients:', rError);
    return;
  }

  console.log(`Found ${recipients.length} recipients.`);
  recipients.forEach(r => {
    console.log(`- Email: ${r.email}`);
    console.log(`  Status: ${r.status}`);
    console.log(`  Message ID: ${r.message_id}`);
    console.log(`  Replied: ${r.replied}`);
  });
}

inspectCampaign();
