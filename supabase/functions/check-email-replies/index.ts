// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import imaps from "npm:imap-simple@5.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

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
        }
    };

    try {
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const searchCriteria = [
            ['SINCE', yesterday]
        ];
        
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            struct: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        
        let processedCount = 0;
        let updatedCount = 0;
        let bouncedCount = 0;

        for (const message of messages) {
            const headerPart = message.parts.find((part: any) => part.which === 'HEADER');
            if (!headerPart) continue;

            const headers = headerPart.body;
            const from = headers.from ? headers.from[0] : '';
            const subject = headers.subject ? headers.subject[0] : '';
            
            // --- 1. CHECK FOR REPLIES ---
            const inReplyTo = headers['in-reply-to'] ? headers['in-reply-to'][0] : null;
            const references = headers['references'] ? headers['references'][0] : null;
            
            const messageIdsToCheck: string[] = [];
            if (inReplyTo) messageIdsToCheck.push(inReplyTo);
            if (references) {
                const refs = references.split(/\s+/);
                messageIdsToCheck.push(...refs);
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
            const isBounceSender = /mailer-daemon|postmaster|bounce|delivery/i.test(from);
            const isBounceSubject = /failure|failed|undelivered|returned|rejected/i.test(subject);

            if (isBounceSender || isBounceSubject) {
                console.log(`Potential bounce detected: ${subject} from ${from}`);
                
                const textPart = message.parts.find((part: any) => part.which === 'TEXT');
                const body = textPart ? textPart.body : "";
                
                // Extract emails from body
                const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+/gi;
                const foundEmails = body.match(emailRegex) || [];
                const uniqueEmails = [...new Set(foundEmails.map((e: string) => e.toLowerCase()))];

                if (uniqueEmails.length > 0) {
                    // Check if any of these emails are in our recipients list for this user's campaigns
                    // We need to find recipients who were sent an email recently and are NOT yet bounced
                    const { data: recipients } = await supabase
                        .from('recipients')
                        .select('id, email, campaign_id')
                        .in('email', uniqueEmails)
                        .eq('bounced', false) // Only mark if not already bounced
                        .order('last_email_sent_at', { ascending: false }) // Get most recent
                        .limit(5); // Limit to avoid huge queries

                    if (recipients && recipients.length > 0) {
                        for (const recipient of recipients) {
                            console.log(`Confirmed bounce for ${recipient.email} (Campaign ${recipient.campaign_id})`);
                            
                            // Mark recipient as bounced
                            await supabase
                                .from('recipients')
                                .update({ 
                                    bounced: true, 
                                    bounced_at: new Date().toISOString(),
                                    status: 'bounced'
                                })
                                .eq('id', recipient.id);
                            
                            // Increment campaign bounced_count
                            await supabase.rpc('increment_bounced_count', { campaign_id: recipient.campaign_id });
                            
                            bouncedCount++;
                        }
                    }
                }
            }
            
            processedCount++;
        }

        connection.end();
        return { count: messages.length, processed: processedCount, replies: updatedCount, bounces: bouncedCount };

    } catch (err: any) {
        console.error(`Error checking emails for ${config.smtp_username}:`, err);
        throw err;
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

        const results = [];
        for (const config of configs) {
            try {
                console.log(`Checking inbox for ${config.smtp_username}...`);
                const result = await checkRepliesAndBouncesForConfig(config);
                results.push({ email: config.smtp_username, result });
            } catch (err: any) {
                results.push({ email: config.smtp_username, error: err.message });
            }
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
