
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testUpdate() {
  console.log('Testing direct update on a recipient...');

  // 1. Find a candidate recipient (one that is NOT bounced)
  const { data: recipients, error: fetchError } = await supabase
    .from('recipients')
    .select('id, email, status, bounced')
    .eq('bounced', false)
    .limit(1);

  if (fetchError || !recipients || recipients.length === 0) {
    console.error('Could not find a recipient to test:', fetchError);
    return;
  }

  const target = recipients[0];
  console.log('Target recipient:', target);

  // 2. Try to update it to bounced=true, status='failed'
  console.log('Attempting update: bounced=true, status=failed');
  const { data: updateData, error: updateError } = await supabase
    .from('recipients')
    .update({ 
        bounced: true, 
        status: 'failed',
        error_message: 'Manual Test Bounce'
    })
    .eq('id', target.id)
    .select();

  if (updateError) {
      console.error('UPDATE FAILED:', updateError);
  } else {
      console.log('UPDATE SUCCESS:', updateData);
      
      // Revert changes
      console.log('Reverting changes...');
      await supabase
        .from('recipients')
        .update({ 
            bounced: false, 
            status: target.status,
            error_message: null
        })
        .eq('id', target.id);
  }
  
  // 3. Try to update with status='bounced' (to see if it's a valid enum)
  console.log('\nAttempting update: status=bounced');
  const { error: enumError } = await supabase
    .from('recipients')
    .update({ status: 'bounced' })
    .eq('id', target.id);
    
  if (enumError) {
      console.error('Status "bounced" failed:', enumError.message);
  } else {
      console.log('Status "bounced" is VALID.');
      // Revert
      await supabase.from('recipients').update({ status: target.status }).eq('id', target.id);
  }
}

testUpdate();
