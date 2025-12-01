
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupFalseReplies() {
  console.log('Starting cleanup of false positive replies...');

  // 1. Get all recipients marked as replied
  const { data: recipients, error } = await supabase
    .from('recipients')
    .select('id, email, campaign_id, name')
    .eq('replied', true);

  if (error) {
    console.error('Error fetching recipients:', error);
    return;
  }

  console.log(`Found ${recipients.length} recipients marked as replied.`);

  const toReset = [];
  const campaignIds = new Set();

  // 2. Check if we have a message from them
  for (const r of recipients) {
    // Check for any message where from_email matches recipient email
    const { count, error: msgError } = await supabase
      .from('email_messages')
      .select('*', { count: 'exact', head: true })
      .ilike('from_email', r.email);

    if (msgError) {
        console.error(`Error checking messages for ${r.email}:`, msgError);
        continue;
    }

    if (count === 0) {
        console.log(`[FALSE POSITIVE] No message found for: ${r.email} (ID: ${r.id})`);
        toReset.push(r.id);
        campaignIds.add(r.campaign_id);
    } else {
        // console.log(`[VALID] Message exists for: ${r.email}`);
    }
  }

  console.log(`\nIdentified ${toReset.length} false positives to reset.`);

  if (toReset.length > 0) {
      // 3. Reset replied status
      const { error: updateError } = await supabase
        .from('recipients')
        .update({ replied: false })
        .in('id', toReset);

      if (updateError) {
          console.error('Error updating recipients:', updateError);
      } else {
          console.log('Successfully reset replied status for recipients.');
      }

      // 4. Attempt to fix campaign counts (if the column exists)
      // We'll just log the campaigns that need a refresh. 
      // The frontend calculates counts dynamically from recipients, so the UI should fix itself immediately.
      console.log('\nAffected Campaigns (Counts will update on refresh):');
      campaignIds.forEach(cid => console.log(`- ${cid}`));
  } else {
      console.log('No false positives found.');
  }
}

cleanupFalseReplies();
