// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connect } from "npm:imap-simple@5.1.0";
import { simpleParser } from "npm:mailparser@3.9.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

console.log("Starting check-email-replies v2 (imap-simple)...");

const checkRepliesAndBouncesForConfig = async (config: any) => {
    const imapConfig = {
        imap: {
            user: config.smtp_username,
            password: config.smtp_password,
            host: config.imap_host,
            port: config.imap_port,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
        },
    };

    let connection;
    try {
        connection = await connect(imapConfig);
        await connection.openBox('INBOX');

        const searchDate = new Date();
        searchDate.setDate(searchDate.getDate() - 3); // Look back 3 days
        
        const searchCriteria = [['SINCE', searchDate]];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''], 
            markSeen: false,
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        
        let processedCount = 0;
        let updatedCount = 0;
        let bouncedCount = 0;

        // Limit to processing recent 50 messages to avoid timeouts
        const recentMessages = messages.slice(-50);

        for (const message of recentMessages) {
            const allPart = message.parts.find(p => p.which === '');
            const id = message.attributes.uid;
            
            if (allPart) {
                const parsed = await simpleParser(allPart.body);
                
                const from = parsed.from?.text || '';
                const subject = parsed.subject || '';
                
                // --- 1. CHECK FOR REPLIES ---
                const inReplyTo = parsed.inReplyTo;
                const references = parsed.references;
                
                const messageIdsToCheck: string[] = [];
                if (inReplyTo) messageIdsToCheck.push(inReplyTo.trim());
                
                if (references) {
                    const refsArray = Array.isArray(references) ? references : [references];
                    refsArray.forEach(r => {
                        if (typeof r === 'string') {
                             r.split(/\s+/).forEach(id => messageIdsToCheck.push(id.trim()));
                        }
                    });
                }

                if (messageIdsToCheck.length > 0) {
                    const { data: recipients } = await supabase
                        .from('recipients')
                        .select('id, email, campaign_id')
                        .in('message_id', messageIdsToCheck)
                        .eq('replied', false);

                    if (recipients && recipients.length > 0) {
                        for (const recipient of recipients) {
                            console.log(`Detected reply from ${recipient.email} (Campaign ${recipient.campaign_id})`);
                            await supabase
                                .from('recipients')
                                .update({ replied: true, updated_at: new Date().toISOString() })
                                .eq('id', recipient.id);
                            updatedCount++;
                        }
                    }
                }

                // --- 2. CHECK FOR BOUNCES ---
                const isBounceSender = /mailer-daemon|postmaster|bounce|delivery|no-reply/i.test(from);
                const isBounceSubject = /failure|failed|undelivered|returned|rejected|delivery status notification/i.test(subject);

                if (isBounceSender || isBounceSubject) {
                    console.log(`Potential bounce detected: ${subject} from ${from}`);
                    
                    const body = parsed.text || parsed.html || "";
                    const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+/gi;
                    const foundEmails = body.match(emailRegex) || [];
                    
                    const failedHeader = parsed.headers.get('x-failed-recipients');
                    if (failedHeader) {
                        if (typeof failedHeader === 'string') foundEmails.push(failedHeader);
                        else if (Array.isArray(failedHeader)) foundEmails.push(...failedHeader);
                    }

                    const uniqueEmails = [...new Set(foundEmails.map((e: string) => e.toLowerCase()))];

                    if (uniqueEmails.length > 0) {
                        const { data: recipients } = await supabase
                            .from('recipients')
                            .select('id, email, campaign_id')
                            .in('email', uniqueEmails)
                            .eq('bounced', false)
                            .order('last_email_sent_at', { ascending: false })
                            .limit(5);

                        if (recipients && recipients.length > 0) {
                            for (const recipient of recipients) {
                                console.log(`Confirmed bounce for ${recipient.email} (Campaign ${recipient.campaign_id})`);
                                
                                await supabase
                                    .from('recipients')
                                    .update({ 
                                        bounced: true, 
                                        bounced_at: new Date().toISOString(),
                                        status: 'bounced'
                                    })
                                    .eq('id', recipient.id);
                                
                                await supabase.rpc('increment_bounced_count', { campaign_id: recipient.campaign_id });
                                
                                bouncedCount++;
                            }
                        }
                    }
                }
                processedCount++;
            }
        }
        
        return { processed: processedCount, replies: updatedCount, bounces: bouncedCount };

    } catch (err: any) {
        console.error(`Error checking emails for ${config.smtp_username}:`, err);
        throw err;
    } finally {
        if (connection) {
            try {
                connection.end();
            } catch (e) {
                // ignore
            }
        }
    }
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { data: configs, error } = await supabase
            .from('email_configs')
            .select('*')
            .not('imap_host', 'is', null);
            
        if (error) throw error;

        // Process in parallel with a limit (e.g., batches of 3)
        const results = [];
        const batchSize = 3;
        
        for (let i = 0; i < configs.length; i += batchSize) {
            const batch = configs.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (config) => {
                try {
                    console.log(`Checking inbox for ${config.smtp_username}...`);
                    const result = await checkRepliesAndBouncesForConfig(config);
                    return { email: config.smtp_username, result };
                } catch (err: any) {
                    return { email: config.smtp_username, error: err.message };
                }
            }));
            results.push(...batchResults);
        }

        return new Response(
            JSON.stringify({ success: true, results }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    }
});
