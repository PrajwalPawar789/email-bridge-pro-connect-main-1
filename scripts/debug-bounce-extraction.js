
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugBounceExtraction() {
  console.log('Debugging bounce extraction...');

  // 1. Fetch a few bounce messages from googlemail
  const { data: messages, error } = await supabase
    .from('email_messages')
    .select('*')
    .ilike('from_email', '%googlemail.com%')
    .limit(5);

  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }

  console.log(`Fetched ${messages.length} bounce messages.`);

  for (const msg of messages) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Subject: ${msg.subject}`);
    console.log(`From: ${msg.from_email}`);
    
    const body = msg.body || '';
    // The regex from the Edge Function
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    
    const bodyMatches = body.match(emailRegex) || [];
    const subjectMatches = (msg.subject || '').match(emailRegex) || [];
    
    const allFound = [...new Set([...bodyMatches, ...subjectMatches])].map(e => e.toLowerCase());
    
    console.log(`Found ${allFound.length} emails in content:`, allFound);

    if (allFound.length > 0) {
        // Check if any of these exist in recipients
        const { data: recipients, error: rError } = await supabase
            .from('recipients')
            .select('id, email, campaign_id, status')
            .in('email', allFound);
            
        if (rError) console.error('Error checking recipients:', rError);
        
        if (recipients && recipients.length > 0) {
            console.log('MATCHED RECIPIENTS:', recipients);
        } else {
            console.log('NO MATCHING RECIPIENTS FOUND IN DB.');
            // Let's try to find partial matches or see what's wrong
            // Maybe the bounce email has a different format?
        }
    }
  }
}

debugBounceExtraction();
