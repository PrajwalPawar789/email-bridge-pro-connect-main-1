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

async function debugSentCountMismatch() {
  const campaignId = '59d00bc7-08e7-4af8-83b8-c4921d3c7d12';

  console.log('🔍 Debugging sent count mismatch between CampaignList and CampaignTracker...\n');

  // Simulate CampaignList data fetch (useRealtimeCampaigns)
  console.log('📊 CampaignList Data (useRealtimeCampaigns):');
  const { data: campaignListData, error: clError } = await supabase
    .from('campaigns')
    .select(`
      *,
      recipients (id, status, opened_at, clicked_at, current_step, bounced, replied, last_email_sent_at, email, name),
      campaign_followups (id, step_number, delay_days, delay_hours)
    `)
    .eq('id', campaignId)
    .single();

  if (clError) {
    console.error('Error fetching CampaignList data:', clError);
    return;
  }

  const clRecipients = campaignListData.recipients || [];
  const clSentCount = clRecipients.filter(r => r.status === 'sent').length;
  const clPendingCount = clRecipients.filter(r => r.status === 'pending').length;
  const clProcessingCount = clRecipients.filter(r => r.status === 'processing').length;

  console.log(`   Total recipients: ${clRecipients.length}`);
  console.log(`   Sent: ${clSentCount}`);
  console.log(`   Pending: ${clPendingCount}`);
  console.log(`   Processing: ${clProcessingCount}`);
  console.log('');

  // Simulate CampaignTracker data fetch
  console.log('📊 CampaignTracker Data (direct fetch):');
  const { data: trackerRecipients, error: trError } = await supabase
    .from('recipients')
    .select('*, email_configs(smtp_username)')
    .eq('campaign_id', campaignId)
    .order('id', { ascending: true });

  if (trError) {
    console.error('Error fetching CampaignTracker data:', trError);
    return;
  }

  const trSentCount = trackerRecipients.filter(r => r.status === 'sent').length;
  const trPendingCount = trackerRecipients.filter(r => r.status === 'pending').length;
  const trProcessingCount = trackerRecipients.filter(r => r.status === 'processing').length;

  console.log(`   Total recipients: ${trackerRecipients.length}`);
  console.log(`   Sent: ${trSentCount}`);
  console.log(`   Pending: ${trPendingCount}`);
  console.log(`   Processing: ${trProcessingCount}`);
  console.log('');

  // Compare the data
  console.log('⚖️  Comparison:');
  console.log(`   CampaignList sent count: ${clSentCount}`);
  console.log(`   CampaignTracker sent count: ${trSentCount}`);
  console.log(`   Difference: ${Math.abs(clSentCount - trSentCount)}`);
  console.log('');

  // Check if the recipient data is identical
  const clIds = clRecipients.map(r => r.id).sort();
  const trIds = trackerRecipients.map(r => r.id).sort();
  const idsMatch = JSON.stringify(clIds) === JSON.stringify(trIds);

  console.log('🔍 Data Integrity Check:');
  console.log(`   Same recipient IDs: ${idsMatch ? '✅' : '❌'}`);
  console.log(`   CampaignList recipients: ${clRecipients.length}`);
  console.log(`   CampaignTracker recipients: ${trackerRecipients.length}`);

  if (!idsMatch) {
    console.log('\n⚠️  Recipient data differs between fetches!');
    console.log('   This could be due to real-time updates during fetching.');
  }

  // Check status distribution
  const statusCounts = {
    cl: {},
    tr: {}
  };

  clRecipients.forEach(r => {
    statusCounts.cl[r.status] = (statusCounts.cl[r.status] || 0) + 1;
  });

  trackerRecipients.forEach(r => {
    statusCounts.tr[r.status] = (statusCounts.tr[r.status] || 0) + 1;
  });

  console.log('\n📈 Status Distribution:');
  console.log('   CampaignList:');
  Object.entries(statusCounts.cl).forEach(([status, count]) => {
    console.log(`     ${status}: ${count}`);
  });
  console.log('   CampaignTracker:');
  Object.entries(statusCounts.tr).forEach(([status, count]) => {
    console.log(`     ${status}: ${count}`);
  });

  // Check for any status differences
  const allStatuses = new Set([...Object.keys(statusCounts.cl), ...Object.keys(statusCounts.tr)]);
  const statusDiffs = [];

  for (const status of allStatuses) {
    const clCount = statusCounts.cl[status] || 0;
    const trCount = statusCounts.tr[status] || 0;
    if (clCount !== trCount) {
      statusDiffs.push(`${status}: CL=${clCount}, TR=${trCount}`);
    }
  }

  if (statusDiffs.length > 0) {
    console.log('\n⚠️  Status differences found:');
    statusDiffs.forEach(diff => console.log(`   ${diff}`));
  } else {
    console.log('\n✅ Status distributions match');
  }

  // Check if campaign is still sending
  console.log('\n📊 Campaign Status:');
  console.log(`   Status: ${campaignListData.status}`);
  console.log(`   Is actively sending: ${campaignListData.status === 'sending' ? 'Yes' : 'No'}`);

  if (campaignListData.status === 'sending') {
    console.log('\n💡 RECOMMENDATION: Campaign is actively sending, which can cause count fluctuations.');
    console.log('   Wait for sending to complete for stable counts.');
  }
}

debugSentCountMismatch().catch(console.error);