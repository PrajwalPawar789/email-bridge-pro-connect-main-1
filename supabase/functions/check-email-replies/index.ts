// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1.0.151";
import { simpleParser } from "npm:mailparser@3.9.0";
import { Buffer } from "node:buffer";

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
    let lastError;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`Connecting to ${config.imap_host}:${config.imap_port} for ${config.smtp_username} (Attempt ${attempt})...`);
        
        // Debug: Test raw Deno TLS connection
        try {
            console.log(`[Debug] Testing raw Deno.connectTls to ${config.imap_host}:${config.imap_port}...`);
            const conn = await Deno.connectTls({
                hostname: config.imap_host,
                port: config.imap_port,
            });
            console.log(`[Debug] Raw TLS connection successful! Handshake complete.`);
            conn.close();
        } catch (e) {
            console.error(`[Debug] Raw TLS connection failed:`, e);
        }

        let port = config.imap_port;
        let secure = config.imap_port === 993;
        
        // Force STARTTLS for Hostinger to see if it bypasses the TLS handshake issue
        if (config.imap_host.includes('hostinger')) {
            console.log(`[Override] Switching to Port 143 (STARTTLS) for Hostinger...`);
            port = 143;
            secure = false;
        }

        const client = new ImapFlow({
            host: config.imap_host,
            port: port,
            secure: secure,
            auth: {
                user: config.smtp_username,
                pass: config.smtp_password,
            },
            tls: {
                rejectUnauthorized: false,
                servername: config.imap_host,
                minVersion: 'TLSv1.2'
            },
            logger: false, // Keep false to avoid spamming logs unless necessary, we have the raw check now
            clientInfo: {
                name: 'EmailBridge',
                version: '1.0.0'
            },
            connectionTimeout: 60000,
            greetingTimeout: 60000,
            socketTimeout: 90000
        });

        client.on('error', (err: any) => {
            console.error(`IMAP Client Error for ${config.smtp_username} (Attempt ${attempt}):`, err);
        });

        try {
            await client.connect();
            
            let lock = await client.getMailboxLock('INBOX');
            try {
                const searchDate = new Date();
                searchDate.setDate(searchDate.getDate() - 3); // Look back 3 days
                
                const searchResult = await client.search({ since: searchDate });
                
                let processedCount = 0;
                let updatedCount = 0;
                let bouncedCount = 0;

                if (searchResult.length > 0) {
                    // Reduced from 50 to 10 to prevent CPU timeouts and connection closures
                    const recentMessages = searchResult.slice(-10);
                    console.log(`Found ${searchResult.length} messages, checking last ${recentMessages.length}...`);

                    for await (const message of client.fetch(recentMessages, { source: true, uid: true })) {
                        try {
                            const source = message.source;
                            const id = message.uid;
                            
                            // Ensure source is a Buffer to avoid stream issues in Deno
                            const sourceBuffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
                            const parsed = await simpleParser(sourceBuffer);
                            
                            const from = parsed.from?.text || '';
                            const subject = parsed.subject || '';
                            
                            // --- 1. CHECK FOR REPLIES ---
                            const inReplyTo = parsed.inReplyTo;
                            const references = parsed.references;
                            
                            const normalizeId = (id: any) => {
                                if (typeof id !== 'string') return '';
                                return id.replace(/[<>]/g, '').trim();
                            };

                            const rawIds: string[] = [];
                            if (inReplyTo) {
                                if (typeof inReplyTo === 'string') {
                                    rawIds.push(inReplyTo);
                                } else if (Array.isArray(inReplyTo)) {
                                    inReplyTo.forEach((id: any) => {
                                        if (typeof id === 'string') rawIds.push(id);
                                    });
                                }
                            }
                            
                            if (references) {
                                const refsArray = Array.isArray(references) ? references : [references];
                                refsArray.forEach(r => {
                                    if (typeof r === 'string') {
                                        r.split(/\s+/).forEach(id => rawIds.push(id));
                                    }
                                });
                            }

                            const idsToCheck = new Set();
                            rawIds.forEach(id => {
                                if (!id || typeof id !== 'string') return;
                                
                                const clean = normalizeId(id);
                                if (clean) {
                                    idsToCheck.add(clean);
                                    idsToCheck.add(`<${clean}>`);
                                }
                                idsToCheck.add(id.trim());
                            });

                            const messageIdsToCheck = Array.from(idsToCheck);

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
                                        
                                        await supabase.rpc('increment_replied_count', { campaign_id: recipient.campaign_id });
                                        
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
                        } catch (msgError) {
                            console.error(`Error processing message ${message.uid}:`, msgError);
                        }
                    }
                } else {
                    console.log("No recent messages found.");
                }
                
                await client.logout();
                return { processed: processedCount, replies: updatedCount, bounces: bouncedCount };

            } finally {
                lock.release();
            }
        } catch (err: any) {
            lastError = err;
            console.error(`Error checking emails for ${config.smtp_username} (Attempt ${attempt}):`, err);
            try { await client.logout(); } catch (e) {}
            
            if (attempt < 3) {
                console.log(`Retrying ${config.smtp_username} in 2s...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    throw lastError;
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    console.log("Starting check-email-replies v3 (sequential)...");

    try {
        const { data: configs, error } = await supabase
            .from('email_configs')
            .select('*')
            .not('imap_host', 'is', null);
            
        if (error) throw error;

        // Process sequentially to avoid overloading the Deno Node compat layer
        const results = [];
        
        for (const config of configs) {
            try {
                console.log(`Checking inbox for ${config.smtp_username}...`);
                const result = await checkRepliesAndBouncesForConfig(config);
                results.push({ email: config.smtp_username, result });
                
                // Add a small delay to let the event loop settle
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err: any) {
                console.error(`Error processing ${config.smtp_username}: ${err.message}`);
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
