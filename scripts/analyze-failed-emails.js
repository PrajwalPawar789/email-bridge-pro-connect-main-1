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

async function analyzeFailedEmails() {
  const campaignId = '59d00bc7-08e7-4af8-83b8-c4921d3c7d12';

  console.log(`Analyzing failed emails for campaign: ${campaignId}`);

  // Get failed recipients
  const { data: failedRecipients, error } = await supabase
    .from('recipients')
    .select('email, name, assigned_email_config_id, status, last_email_sent_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'failed');

  if (error) {
    console.error('Error fetching failed recipients:', error);
    return;
  }

  console.log(`\nFound ${failedRecipients.length} failed emails:`);

  // Group by email domain
  const domainStats = {};
  const configStats = {};

  failedRecipients.forEach(recipient => {
    // Extract domain
    const emailParts = recipient.email.split('@');
    if (emailParts.length === 2) {
      const domain = emailParts[1].toLowerCase();
      domainStats[domain] = (domainStats[domain] || 0) + 1;
    }

    // Count by config
    const configId = recipient.assigned_email_config_id || 'none';
    configStats[configId] = (configStats[configId] || 0) + 1;
  });

  console.log('\nFailed emails by domain:');
  Object.entries(domainStats)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([domain, count]) => {
      console.log(`- ${domain}: ${count} failures`);
    });

  console.log('\nFailed emails by email config:');
  Object.entries(configStats)
    .forEach(([configId, count]) => {
      console.log(`- Config ${configId}: ${count} failures`);
    });

  // Get email configs to see which ones are failing
  const configIds = Object.keys(configStats).filter(id => id !== 'none');
  if (configIds.length > 0) {
    const { data: configs } = await supabase
      .from('email_configs')
      .select('id, smtp_username, smtp_host')
      .in('id', configIds);

    console.log('\nEmail configurations with failures:');
    configs.forEach(config => {
      console.log(`- ${config.smtp_username}@${config.smtp_host}: ${configStats[config.id]} failures`);
    });
  }

  // Sample of failed emails
  console.log('\nSample of failed emails:');
  failedRecipients.slice(0, 5).forEach((recipient, index) => {
    console.log(`${index + 1}. ${recipient.email} (${recipient.name || 'No name'}) - Last sent: ${recipient.last_email_sent_at || 'Never'}`);
  });

  console.log(`\nTotal failed: ${failedRecipients.length}`);
}

analyzeFailedEmails().catch(console.error);