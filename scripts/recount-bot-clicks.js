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

async function recountBotClicks() {
  console.log('🔄 Starting bot click recount for all campaigns...');

  // Get all click tracking events with recipient data
  const { data: trackingEvents, error: eventsError } = await supabase
    .from('tracking_events')
    .select(`
      id,
      campaign_id,
      recipient_id,
      event_type,
      created_at,
      user_agent,
      is_bot,
      bot_score,
      bot_reasons,
      metadata,
      recipients!inner(last_email_sent_at)
    `)
    .eq('event_type', 'click');

  if (eventsError) {
    console.error('Error fetching tracking events:', eventsError);
    return;
  }

  console.log(`📊 Found ${trackingEvents.length} click tracking events to analyze`);

  // Group events by campaign for batch processing
  const campaignEvents = {};
  trackingEvents.forEach(event => {
    if (!campaignEvents[event.campaign_id]) {
      campaignEvents[event.campaign_id] = [];
    }
    campaignEvents[event.campaign_id].push(event);
  });

  console.log(`📂 Processing ${Object.keys(campaignEvents).length} campaigns`);

  let totalBotClicks = 0;
  let totalHumanClicks = 0;
  const updatedEvents = [];

  // Process each campaign
  for (const [campaignId, events] of Object.entries(campaignEvents)) {
    console.log(`\n🔍 Processing campaign: ${campaignId} (${events.length} events)`);

    let campaignBotClicks = 0;
    let campaignHumanClicks = 0;

    // Analyze each event in the campaign
    for (const event of events) {
      let botScore = 0;
      const botReasons = [];
      let isBot = false;

      // 1. Speed Trap (Temporal Analysis) - NEW 5-second rule
      if (event.recipients?.last_email_sent_at) {
        const sentTime = new Date(event.recipients.last_email_sent_at).getTime();
        const eventTime = new Date(event.created_at).getTime();
        const timeDiff = eventTime - sentTime;

        if (timeDiff < 5000) { // < 5 seconds = bot
          botScore += 90;
          botReasons.push('speed_trap_critical');
        }
      }

      // 2. Honeypot check (from metadata)
      const isGhost = event.metadata?.is_ghost === true;
      if (isGhost) {
        botScore += 100;
        botReasons.push('honeypot_clicked');
      }

      // 3. User Agent Analysis
      const ua = (event.user_agent || '').toLowerCase();
      if (!ua) {
        botScore += 100;
        botReasons.push('empty_user_agent');
      } else if (ua.includes('bot') || ua.includes('spider') || ua.includes('crawler') ||
                 ua.includes('barracuda') || ua.includes('mimecast')) {
        botScore += 100;
        botReasons.push('known_bot_ua');
      }

      isBot = botScore >= 50;

      // Check if bot status changed
      const wasBotBefore = event.is_bot;
      const isBotNow = isBot;

      if (wasBotBefore !== isBotNow) {
        updatedEvents.push({
          id: event.id,
          is_bot: isBotNow,
          bot_score: botScore,
          bot_reasons: botReasons
        });
      }

      if (isBotNow) {
        campaignBotClicks++;
        totalBotClicks++;
      } else {
        campaignHumanClicks++;
        totalHumanClicks++;
      }
    }

    // Update campaign bot_click_count
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        bot_click_count: campaignBotClicks,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (updateError) {
      console.error(`❌ Error updating campaign ${campaignId}:`, updateError);
    } else {
      console.log(`✅ Campaign ${campaignId}: ${campaignBotClicks} bot clicks, ${campaignHumanClicks} human clicks`);
    }
  }

  // Update tracking events that changed bot status
  if (updatedEvents.length > 0) {
    console.log(`\n🔄 Updating ${updatedEvents.length} tracking events that changed bot status...`);

    for (const eventUpdate of updatedEvents) {
      const { error: eventError } = await supabase
        .from('tracking_events')
        .update({
          is_bot: eventUpdate.is_bot,
          bot_score: eventUpdate.bot_score,
          bot_reasons: eventUpdate.bot_reasons
        })
        .eq('id', eventUpdate.id);

      if (eventError) {
        console.error(`Error updating event ${eventUpdate.id}:`, eventError);
      }
    }
  }

  console.log('\n🎉 Bot click recount completed!');
  console.log(`📈 Total bot clicks: ${totalBotClicks}`);
  console.log(`👥 Total human clicks: ${totalHumanClicks}`);
  console.log(`🔄 Updated ${updatedEvents.length} tracking events`);
  console.log(`📊 Processed ${Object.keys(campaignEvents).length} campaigns`);
}

recountBotClicks().catch(console.error);