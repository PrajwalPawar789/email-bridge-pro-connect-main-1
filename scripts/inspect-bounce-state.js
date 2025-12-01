
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectBounceState() {
  console.log('Inspecting bounce state in DB...');

  // 1. Check total bounced recipients
  const { count, error } = await supabase
    .from('recipients')
    .select('*', { count: 'exact', head: true })
    .eq('bounced', true);

  if (error) {
    console.error('Error counting bounced recipients:', error);
  } else {
    console.log(`Total recipients with bounced=true: ${count}`);
  }

  // 2. Check a specific campaign that should have bounces
  // From previous logs: "Full Stack Dev Role (3+ Years Exp) Prajwal Pawar"
  // ID: cf60f3e0-8487-4a48-a52e-da40c23ab552 (from cleanup script output)
  
  const campaignId = 'cf60f3e0-8487-4a48-a52e-da40c23ab552';
  
  const { data: recipients, error: rError } = await supabase
    .from('recipients')
    .select('id, email, status, bounced, bounced_at')
    .eq('campaign_id', campaignId)
    .eq('bounced', true);
    
  if (rError) {
      console.error('Error fetching campaign recipients:', rError);
  } else {
      console.log(`Bounced recipients in "Full Stack Dev Role": ${recipients.length}`);
      if (recipients.length > 0) {
          console.log('Sample:', recipients[0]);
      }
  }

  // 3. Check if there are any recipients with status='failed' but bounced=false
  const { count: failedCount, error: fError } = await supabase
    .from('recipients')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .eq('bounced', false);
    
  console.log(`Recipients with status='failed' but bounced=false: ${failedCount}`);

}

inspectBounceState();
