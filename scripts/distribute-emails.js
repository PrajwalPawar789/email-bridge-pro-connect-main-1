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

async function distributeEmailsAcrossConfigs() {
  const campaignId = '59d00bc7-08e7-4af8-83b8-c4921d3c7d12';

  console.log(`Distributing recipients across all available email configurations for campaign: ${campaignId}`);

  // Get all available email configs
  const { data: allConfigs, error: configError } = await supabase
    .from('email_configs')
    .select('id, smtp_username, smtp_host')
    .order('created_at', { ascending: false });

  if (configError) {
    console.error('Error fetching email configs:', configError);
    return;
  }

  console.log(`Found ${allConfigs.length} email configurations`);

  // Get all pending recipients for this campaign
  const { data: recipients, error: recipientError } = await supabase
    .from('recipients')
    .select('id, email, status')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('id', { ascending: true });

  if (recipientError) {
    console.error('Error fetching recipients:', recipientError);
    return;
  }

  console.log(`Found ${recipients.length} pending recipients`);

  // Clear existing campaign email configurations
  const { error: deleteError } = await supabase
    .from('campaign_email_configurations')
    .delete()
    .eq('campaign_id', campaignId);

  if (deleteError) {
    console.error('Error clearing existing configurations:', deleteError);
    return;
  }

  // Set up new configurations with balanced limits
  const configsPerAccount = Math.max(1, Math.floor(recipients.length / allConfigs.length));
  const remainder = recipients.length % allConfigs.length;

  console.log(`Distributing ${recipients.length} recipients across ${allConfigs.length} configs`);
  console.log(`Base limit per config: ${configsPerAccount}, Remainder: ${remainder}`);

  const newConfigs = [];
  for (let i = 0; i < allConfigs.length; i++) {
    const config = allConfigs[i];
    const limit = configsPerAccount + (i < remainder ? 1 : 0);

    newConfigs.push({
      campaign_id: campaignId,
      email_config_id: config.id,
      daily_limit: Math.min(limit, 500), // Cap at 500 to be safe
      created_at: new Date().toISOString()
    });

    console.log(`- ${config.smtp_username}@${config.smtp_host}: ${Math.min(limit, 500)} emails/day`);
  }

  // Insert new campaign email configurations
  const { error: insertError } = await supabase
    .from('campaign_email_configurations')
    .insert(newConfigs);

  if (insertError) {
    console.error('Error inserting new configurations:', insertError);
    return;
  }

  // Distribute recipients across configurations
  let recipientIndex = 0;
  for (const config of newConfigs) {
    const limit = config.daily_limit;
    const recipientsForConfig = recipients.slice(recipientIndex, recipientIndex + limit);

    if (recipientsForConfig.length > 0) {
      const recipientIds = recipientsForConfig.map(r => r.id);

      const { error: updateError } = await supabase
        .from('recipients')
        .update({ assigned_email_config_id: config.email_config_id })
        .in('id', recipientIds);

      if (updateError) {
        console.error(`Error assigning recipients to config ${config.email_config_id}:`, updateError);
      } else {
        console.log(`Assigned ${recipientsForConfig.length} recipients to ${allConfigs.find(c => c.id === config.email_config_id)?.smtp_username}`);
      }
    }

    recipientIndex += limit;
  }

  console.log('\n✅ Email distribution complete!');
  console.log(`📧 Recipients distributed across ${allConfigs.length} email configurations`);
  console.log('🎯 This should significantly improve deliverability and avoid Gmail rate limits');
  console.log('🚀 You can now retry sending the campaign');
}

distributeEmailsAcrossConfigs().catch(console.error);