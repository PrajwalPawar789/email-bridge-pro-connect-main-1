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

async function checkEmailConfigs() {
  console.log('Checking available email configurations...\n');

  const { data: configs, error } = await supabase
    .from('email_configs')
    .select('id, smtp_host, smtp_username, smtp_port, security, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching email configs:', error);
    return;
  }

  console.log(`Found ${configs.length} email configurations:\n`);

  configs.forEach((config, index) => {
    console.log(`${index + 1}. ${config.smtp_username}@${config.smtp_host}`);
    console.log(`   - Port: ${config.smtp_port}`);
    console.log(`   - Security: ${config.security}`);
    console.log(`   - ID: ${config.id}`);
    console.log('');
  });

  // Check campaign email configurations
  const campaignId = '59d00bc7-08e7-4af8-83b8-c4921d3c7d12';
  const { data: campaignConfigs, error: campaignError } = await supabase
    .from('campaign_email_configurations')
    .select('email_config_id, daily_limit, last_sent_at')
    .eq('campaign_id', campaignId);

  if (campaignError) {
    console.error('Error fetching campaign email configs:', campaignError);
    return;
  }

  if (campaignConfigs && campaignConfigs.length > 0) {
    console.log(`Campaign email configurations (${campaignConfigs.length}):\n`);
    campaignConfigs.forEach(config => {
      const emailConfig = configs.find(c => c.id === config.email_config_id);
      if (emailConfig) {
        console.log(`- ${emailConfig.smtp_username}@${emailConfig.smtp_host}`);
        console.log(`  - Daily limit: ${config.daily_limit}`);
        console.log(`  - Last sent: ${config.last_sent_at || 'Never'}`);
        console.log('');
      }
    });
  }

  console.log('📧 Recommendations for bulk email sending:');
  console.log('1. Gmail SMTP: 500 emails/day (free), but often blocks bulk sending');
  console.log('2. Consider professional SMTP providers:');
  console.log('   - SendGrid: 100 emails/day free, then $15+/month');
  console.log('   - Mailgun: 5,000 emails/month free, then $35+/month');
  console.log('   - AWS SES: 62,000 emails/month free, then $0.10/1,000 emails');
  console.log('   - Postmark: 100 emails/day free, then $10+/month');
  console.log('');
  console.log('💡 Tip: For this campaign, you might want to add a professional SMTP provider');
  console.log('   and distribute the load across multiple configurations.');
}

checkEmailConfigs().catch(console.error);