
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase URL or Service Role Key');
  process.exit(1);
}

async function triggerCheck() {
  console.log('Triggering check-email-replies function with 30 day lookback (DB Mode)...');
  
  const functionUrl = `${supabaseUrl}/functions/v1/check-email-replies`;
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        lookback_days: 30,
        use_db_scan: true 
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Function failed with status ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log('Function executed successfully:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error triggering function:', error);
  }
}

await triggerCheck();
