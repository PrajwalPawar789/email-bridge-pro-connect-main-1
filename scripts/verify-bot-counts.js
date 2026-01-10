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

async function verifyBotCounts() {
  console.log('🔍 Verifying bot counts after recount...\n');

  // Get all campaigns with bot counts
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, name, bot_open_count, bot_click_count, opened_count, clicked_count')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaigns:', error);
    return;
  }

  console.log(`📊 Found ${campaigns.length} campaigns:\n`);

  campaigns.forEach((campaign, index) => {
    const totalOpens = (campaign.opened_count || 0) + (campaign.bot_open_count || 0);
    const totalClicks = (campaign.clicked_count || 0) + (campaign.bot_click_count || 0);

    console.log(`${index + 1}. ${campaign.name || 'Unnamed Campaign'}`);
    console.log(`   ID: ${campaign.id}`);
    console.log(`   Opens: ${campaign.opened_count || 0} human + ${campaign.bot_open_count || 0} bot = ${totalOpens} total`);
    console.log(`   Clicks: ${campaign.clicked_count || 0} human + ${campaign.bot_click_count || 0} bot = ${totalClicks} total`);
    console.log('');
  });

  // Get summary stats
  const totalBotOpens = campaigns.reduce((sum, c) => sum + (c.bot_open_count || 0), 0);
  const totalBotClicks = campaigns.reduce((sum, c) => sum + (c.bot_click_count || 0), 0);
  const totalHumanOpens = campaigns.reduce((sum, c) => sum + (c.opened_count || 0), 0);
  const totalHumanClicks = campaigns.reduce((sum, c) => sum + (c.clicked_count || 0), 0);

  console.log('📈 Summary Statistics:');
  console.log(`   Human Opens: ${totalHumanOpens}`);
  console.log(`   Bot Opens: ${totalBotOpens}`);
  console.log(`   Human Clicks: ${totalHumanClicks}`);
  console.log(`   Bot Clicks: ${totalBotClicks}`);
  console.log(`   Total Opens: ${totalHumanOpens + totalBotOpens}`);
  console.log(`   Total Clicks: ${totalHumanClicks + totalBotClicks}`);
}

verifyBotCounts().catch(console.error);