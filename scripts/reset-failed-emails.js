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

async function resetFailedEmails() {
  const campaignId = '59d00bc7-08e7-4af8-83b8-c4921d3c7d12';

  console.log(`Resetting failed emails for campaign: ${campaignId}`);

  // Reset failed recipients back to pending status
  const { data: updatedRecipients, error } = await supabase
    .from('recipients')
    .update({
      status: 'pending',
      last_email_sent_at: null,
      message_id: null,
      thread_id: null
    })
    .eq('campaign_id', campaignId)
    .eq('status', 'failed')
    .select('id, email, name');

  if (error) {
    console.error('Error resetting failed recipients:', error);
    return;
  }

  console.log(`Reset ${updatedRecipients.length} failed recipients back to pending status`);

  // Reset campaign status to allow sending
  const { error: campaignError } = await supabase
    .from('campaigns')
    .update({
      status: 'ready',
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignId);

  if (campaignError) {
    console.error('Error resetting campaign status:', campaignError);
    return;
  }

  console.log('Campaign status reset to "ready"');

  // Reset campaign counts to 0 since we're starting fresh
  const { error: countError } = await supabase
    .from('campaigns')
    .update({
      opened_count: 0,
      clicked_count: 0,
      replied_count: 0,
      bounced_count: 0
    })
    .eq('id', campaignId);

  if (countError) {
    console.error('Error resetting campaign counts:', countError);
    return;
  }

  console.log('Campaign counts reset to 0');

  console.log('\n✅ Campaign reset complete. You can now retry sending the emails.');
  console.log('Note: Consider using a different SMTP provider with higher limits for bulk sending.');
}

resetFailedEmails().catch(console.error);