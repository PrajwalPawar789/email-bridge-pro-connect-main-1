
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectMessages() {
  console.log('Inspecting bounce messages...');

  // Look for messages from mailer-daemon
  const { data: messages, error } = await supabase
    .from('email_messages')
    .select('id, from_email, subject, body, date')
    .ilike('from_email', '%mailer-daemon%')
    .order('date', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }

  console.log(`Found ${messages.length} bounce messages.`);
  
  messages.forEach((msg, i) => {
    console.log(`\n--- Message ${i + 1} ---`);
    console.log(`From: ${msg.from_email}`);
    console.log(`Subject: ${msg.subject}`);
    console.log(`Date: ${msg.date}`);
    console.log(`Body Preview: ${msg.body ? msg.body.substring(0, 500) : 'NO BODY'}`);
  });
}

inspectMessages();
