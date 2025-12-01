
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectBounces() {
  console.log('Inspecting bounces in recipients table...');

  // Get total count of bounced recipients
  const { count, error: countError } = await supabase
    .from('recipients')
    .select('*', { count: 'exact', head: true })
    .eq('bounced', true);

  if (countError) {
    console.error('Error counting bounces:', countError);
    return;
  }

  console.log(`Total bounced recipients in DB: ${count}`);

  // Get breakdown by campaign
  const { data: campaigns, error: campError } = await supabase
    .from('campaigns')
    .select('id, name');

  if (campError) {
    console.error('Error fetching campaigns:', campError);
    return;
  }

  for (const campaign of campaigns) {
    const { count: campBounces, error: cbError } = await supabase
      .from('recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('bounced', true);

    if (cbError) {
        console.error(`Error checking campaign ${campaign.name}:`, cbError);
    } else {
        console.log(`Campaign "${campaign.name}" (ID: ${campaign.id}): ${campBounces} bounces`);
    }
  }
  
  // Check specifically for the email mentioned in the script output
  const { data: specificRecipients, error: srError } = await supabase
    .from('recipients')
    .select('id, email, campaign_id, bounced, status')
    .eq('email', 'prajwalrpawar2001@gmail.com'); // This was the config email, not recipient email. Wait.
    
  // The script output said: "email": "prajwalrpawar2001@gmail.com" (this is the SENDER config)
  // "bounces": 88.
  // This means 88 recipients sent FROM this email have bounced.
  
}

inspectBounces();
