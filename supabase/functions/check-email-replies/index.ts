// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1.0.164";
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

const updateCampaignBounceCount = async (campaignId: string) => {
    if (!campaignId) return;

    const { error: rpcError } = await supabase.rpc('increment_bounced_count', { campaign_id: campaignId });
    if (!rpcError) return;

    console.error(`increment_bounced_count failed for campaign ${campaignId}:`, rpcError);

    const { count, error: countError } = await supabase
        .from('recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('bounced', true);

    if (countError) {
        console.error(`Failed to recount bounces for campaign ${campaignId}:`, countError);
        return;
    }

    const { error: updateError } = await supabase
        .from('campaigns')
        .update({ bounced_count: count ?? 0, updated_at: new Date().toISOString() })
        .eq('id', campaignId);

    if (updateError) {
        console.error(`Failed to update bounced_count for campaign ${campaignId}:`, updateError);
    }
};

const normalizeSecurity = (security?: string | null) => {
    const value = (security || '').toUpperCase();
    if (value === 'TLS') return 'TLS';
    if (value === 'SSL') return 'SSL';
    return 'SSL';
};

const AUTO_REPLY_SUBJECT_REGEX = /automatic reply|out of office|vacation|abwesend|auto-response|auto response/i;
const BOUNCE_SENDER_REGEX = /mailer-daemon|postmaster|mail delivery subsystem/i;
const BOUNCE_SUBJECT_REGEX = /delivery status notification|failure|failed|undelivered|undeliverable|returned|rejected/i;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);

const classifyMessage = (from: string, subject: string) => {
    const safeFrom = from || '';
    const safeSubject = subject || '';
    const isAutoReply = AUTO_REPLY_SUBJECT_REGEX.test(safeSubject);
    const isBounceSender = BOUNCE_SENDER_REGEX.test(safeFrom);
    const isBounceSubject = BOUNCE_SUBJECT_REGEX.test(safeSubject);
    return { isAutoReply, isBounce: isBounceSender || isBounceSubject };
};

const sanitizeBounceEmails = (emails: string[], senderEmail: string) => {
    const sender = (senderEmail || '').toLowerCase();
    const unique = new Set<string>();

    for (const email of emails) {
        const normalized = (email || '').toLowerCase();
        if (!normalized || normalized === sender) continue;
        const domain = normalized.split('@')[1] || '';
        const ext = domain.split('.').pop() || '';
        if (IMAGE_EXTENSIONS.has(ext)) continue;
        unique.add(normalized);
    }

    return [...unique];
};

const getImapHostCandidates = (config: any) => {
    const candidates: string[] = [];
    const add = (host?: string | null) => {
        const cleaned = (host || '').trim();
        if (cleaned && !candidates.includes(cleaned)) {
            candidates.push(cleaned);
        }
    };

    const imapHost = (config.imap_host || '').trim();
    const smtpHost = (config.smtp_host || '').toLowerCase();
    const imapLower = imapHost.toLowerCase();

    const prefersTitan = smtpHost.includes('titan.email');
    const isHostinger = smtpHost.includes('hostinger.com') || imapLower.includes('hostinger.com');

    // Hostinger business mailboxes are typically Titan-backed.
    if (prefersTitan || isHostinger) {
        add('imap.titan.email');
    }

    add(imapHost);

    if (isHostinger) {
        add('imap.hostinger.com');
        add('mail.hostinger.com');
    }

    return candidates;
};

const buildConnectionProfiles = (config: any, security: string, overrides?: any) => {
    const profiles: Array<{ port: number; secure: boolean; doStartTls: boolean; label: string }> = [];
    const add = (port: number, secure: boolean, doStartTls: boolean, label: string) => {
        if (!profiles.some(p => p.port === port && p.secure === secure && p.doStartTls === doStartTls)) {
            profiles.push({ port, secure, doStartTls, label });
        }
    };

    if (overrides?.force_legacy_hostinger && !overrides?.force_starttls && !overrides?.force_direct_tls && !Number.isFinite(overrides?.force_port)) {
        add(993, true, false, 'direct-tls');
        return profiles;
    }

    if (overrides?.force_direct_tls) {
        add(993, true, false, 'direct-tls');
        return profiles;
    }

    if (overrides?.force_starttls) {
        add(143, false, true, 'starttls');
        return profiles;
    }

    if (Number.isFinite(overrides?.force_port)) {
        const port = Number(overrides.force_port);
        if (port === 993) add(993, true, false, 'direct-tls');
        else if (port === 143) add(143, false, true, 'starttls');
        else add(port, port === 993, port === 143 || security === 'TLS', 'custom');
        return profiles;
    }

    const parsed = Number(config.imap_port);
    if (Number.isFinite(parsed) && parsed > 0) {
        if (parsed === 993) {
            add(993, true, false, 'direct-tls');
        } else if (parsed === 143) {
            add(143, false, true, 'starttls');
        } else {
            add(parsed, parsed === 993, parsed === 143 || security === 'TLS', 'custom');
        }
    }

    // Common fallbacks
    add(993, true, false, 'direct-tls');
    add(143, false, true, 'starttls');

    return profiles;
};

const resolveHostCandidates = (config: any, overrides?: any) => {
    if (overrides?.imap_host_candidates && Array.isArray(overrides.imap_host_candidates)) {
        const unique = overrides.imap_host_candidates
            .map((h: any) => (typeof h === 'string' ? h.trim() : ''))
            .filter(Boolean);
        if (unique.length > 0) return Array.from(new Set(unique));
    }

    if (overrides?.imap_host_override && typeof overrides.imap_host_override === 'string') {
        return [overrides.imap_host_override.trim()].filter(Boolean);
    }

    if (overrides?.force_legacy_hostinger) {
        return ['imap.hostinger.com'];
    }

    return getImapHostCandidates(config);
};

const processDbEmails = async (config: any, lookbackDays: number) => {
    console.log(`[DB Mode] Processing emails for ${config.smtp_username} from DB (Lookback: ${lookbackDays} days)...`);
    
    const searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - lookbackDays);
    
    // Fetch messages from DB
    const { data: messages, error } = await supabase
        .from('email_messages')
        .select('*')
        .eq('config_id', config.id)
        .gte('date', searchDate.toISOString())
        .order('date', { ascending: false })
        .limit(2000);

    if (error) {
        console.error(`[DB Mode] Error fetching messages:`, error);
        return { error: error.message };
    }

    console.log(`[DB Mode] Found ${messages.length} messages in DB.`);
    
    let updatedCount = 0;
    let bouncedCount = 0;

    // --- BATCH PROCESSING ---

    // 1. Identify Bounces & Auto-Replies FIRST
    const bounceCandidates: any[] = [];
    const autoReplyCandidates: any[] = [];

    for (const msg of messages) {
        const from = msg.from_email || '';
        const subject = msg.subject || '';
        const { isAutoReply, isBounce } = classifyMessage(from, subject);

        if (isBounce) {
            bounceCandidates.push(msg);
        } else if (isAutoReply) {
            autoReplyCandidates.push(msg);
        }
    }

    if (autoReplyCandidates.length > 0) {
        console.log(`[DB Mode] Found ${autoReplyCandidates.length} auto-replies (skipping for bounce count).`);
    }

    const excludedMessageIds = new Set([
        ...bounceCandidates.map(m => m.id),
        ...autoReplyCandidates.map(m => m.id)
    ]);

    // 2. Process Bounces (Extract emails from body)
    if (bounceCandidates.length > 0) {
        console.log(`[DB Mode] Found ${bounceCandidates.length} potential bounce/auto-reply messages.`);
        const allFoundEmails: string[] = [];
        
        for (const msg of bounceCandidates) {
            const body = msg.body || '';
            // Improved regex to handle emails inside brackets <email@example.com> and standard formats
            // Also handles "Undeliverable: email@example.com" in subject
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
            
            const bodyMatches = body.match(emailRegex) || [];
            const subjectMatches = (msg.subject || '').match(emailRegex) || [];
            
            allFoundEmails.push(...bodyMatches);
            allFoundEmails.push(...subjectMatches);
        }
        
        // Filter out the sender's own email (config.smtp_username) to avoid self-bouncing
        const senderEmail = (config.smtp_username || '').toLowerCase();
        const uniqueBounceEmails = sanitizeBounceEmails(allFoundEmails, senderEmail);
        
        if (uniqueBounceEmails.length > 0) {
             // Fetch ALL recipients matching these emails, regardless of current status
             // We want to mark them as bounced even if they are 'sent' or 'completed'
             const { data: potentialBounces, error: bounceError } = await supabase
                .from('recipients')
                .select('id, email, campaign_id, status, bounced')
                .in('email', uniqueBounceEmails);
                
             if (!bounceError && potentialBounces && potentialBounces.length > 0) {
                // Filter for those that are NOT YET marked as bounced
                const newBounces = potentialBounces.filter(r => !r.bounced);
                
                console.log(`[DB Mode] Found ${newBounces.length} NEW confirmed bounces out of ${potentialBounces.length} matches.`);
                
                const bounceIdsToUpdate: string[] = [];
                const campaignCounts: Record<string, number> = {};
                
                for (const recipient of newBounces) {
                    bounceIdsToUpdate.push(recipient.id);
                    campaignCounts[recipient.campaign_id] = (campaignCounts[recipient.campaign_id] || 0) + 1;
                    bouncedCount++;
                }
                
                if (bounceIdsToUpdate.length > 0) {
                    const { error: updateError } = await supabase
                        .from('recipients')
                        .update({ 
                            bounced: true, 
                            bounced_at: new Date().toISOString(),
                            status: 'bounced'
                            // Removed error_message as it doesn't exist in the schema
                        })
                        .in('id', bounceIdsToUpdate);
                        
                    if (updateError) {
                        console.error('[DB Mode] Error updating bounced recipients:', updateError);
                    } else {
                        console.log(`[DB Mode] Successfully updated ${bounceIdsToUpdate.length} recipients as bounced.`);
                    }
                }
                
                for (const campaignId of Object.keys(campaignCounts)) {
                    await updateCampaignBounceCount(campaignId);
                }
             } else {
                 console.log(`[DB Mode] No matching recipients found for ${uniqueBounceEmails.length} extracted emails.`);
             }
        }
    }
    
    // 3. Process Replies (Exclude bounces/auto-replies)
    // Only consider messages that are NOT in the bounce list
    const replyMessages = messages.filter(m => !excludedMessageIds.has(m.id));
    
    const senderEmails = replyMessages
        .map(m => m.from_email)
        .filter(e => e && e.includes('@'))
        .map(e => e.toLowerCase());
    
    const uniqueSenders = [...new Set(senderEmails)];
    
    if (uniqueSenders.length > 0) {
        // Find all recipients that match these senders and haven't replied yet
        // Also fetch last_email_sent_at to ensure the reply is NEWER than the sent email
        const { data: potentialReplies, error: replyError } = await supabase
            .from('recipients')
            .select('id, email, campaign_id, last_email_sent_at, created_at')
            .in('email', uniqueSenders)
            .eq('replied', false);
            
        if (!replyError && potentialReplies && potentialReplies.length > 0) {
            console.log(`[DB Mode] Found ${potentialReplies.length} potential replies to process.`);
            
            // Create a map of sender email -> latest message date
            const senderLastMsgDate = new Map<string, Date>();
            replyMessages.forEach(m => {
                if (m.from_email && m.date) {
                    const email = m.from_email.toLowerCase();
                    const date = new Date(m.date);
                    if (!senderLastMsgDate.has(email) || date > senderLastMsgDate.get(email)!) {
                        senderLastMsgDate.set(email, date);
                    }
                }
            });

            // Group by campaign to minimize RPC calls
            const campaignCounts: Record<string, number> = {};
            const recipientIdsToUpdate: string[] = [];
            
            for (const recipient of potentialReplies) {
                const replyDate = senderLastMsgDate.get(recipient.email.toLowerCase());
                const sentDateStr = recipient.last_email_sent_at || recipient.created_at;
                
                if (replyDate && sentDateStr) {
                    const sentDate = new Date(sentDateStr);
                    // Only count as reply if the message is AFTER the campaign email was sent
                    // Adding a small buffer (e.g. 1 minute) to avoid race conditions
                    if (replyDate.getTime() > sentDate.getTime() + 60000) {
                        recipientIdsToUpdate.push(recipient.id);
                        campaignCounts[recipient.campaign_id] = (campaignCounts[recipient.campaign_id] || 0) + 1;
                        updatedCount++;
                    } else {
                        console.log(`[DB Mode] Skipping reply from ${recipient.email}: Reply date (${replyDate.toISOString()}) is before or too close to sent date (${sentDate.toISOString()})`);
                    }
                }
            }
            
            // Bulk update recipients
            if (recipientIdsToUpdate.length > 0) {
                await supabase
                    .from('recipients')
                    .update({ replied: true, updated_at: new Date().toISOString() })
                    .in('id', recipientIdsToUpdate);
            }
            
            // Update campaign counts
            for (const [campaignId, count] of Object.entries(campaignCounts)) {
                // We can't easily increment by X, so we just call the RPC which recalculates the total
                await supabase.rpc('increment_replied_count', { campaign_id: campaignId });
            }
        }
    }

    
    return { processed: messages.length, replies: updatedCount, bounces: bouncedCount };
};

const checkRepliesAndBouncesForConfig = async (config: any, lookbackDays: number = 7, overrides?: any) => {
    let lastError;

    const hostCandidates = resolveHostCandidates(config, overrides);
    if (!hostCandidates.length) {
        throw new Error(`IMAP host missing for ${config.smtp_username}`);
    }

    const security = normalizeSecurity(config.security);
    const connectionProfiles = buildConnectionProfiles(config, security, overrides);
    const enableTlsDebug = (Deno.env.get("IMAP_DEBUG_TLS") || "").toLowerCase() === "true";
    const maxAttempts = Number.isFinite(overrides?.max_attempts)
        ? Math.max(1, Math.min(3, Number(overrides.max_attempts)))
        : 3;
    const defaultConnectionTimeout = overrides?.force_legacy_hostinger ? 10000 : 20000;
    const connectionTimeout = Number.isFinite(overrides?.connection_timeout_ms)
        ? Math.max(3000, Number(overrides.connection_timeout_ms))
        : defaultConnectionTimeout;
    const greetingTimeout = Number.isFinite(overrides?.greeting_timeout_ms)
        ? Math.max(3000, Number(overrides.greeting_timeout_ms))
        : connectionTimeout;
    const socketTimeout = Number.isFinite(overrides?.socket_timeout_ms)
        ? Math.max(10000, Number(overrides.socket_timeout_ms))
        : 60000;

    for (const host of hostCandidates) {
        for (const profile of connectionProfiles) {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                console.log(`Connecting to ${host}:${profile.port} (${profile.label}) for ${config.smtp_username} (Attempt ${attempt})...`);
            
                if (enableTlsDebug && profile.secure) {
                    try {
                        console.log(`[Debug] Testing raw Deno.connectTls to ${host}:${profile.port}...`);
                        const conn = await Deno.connectTls({
                            hostname: host,
                            port: profile.port,
                        });
                        console.log(`[Debug] Raw TLS connection successful! Handshake complete.`);
                        conn.close();
                    } catch (e) {
                        console.error(`[Debug] Raw TLS connection failed:`, e);
                    }
                }

                // Dynamic TLS options based on attempt to handle finicky servers
                const tlsOptions: any = {
                    rejectUnauthorized: false,
                };
                
                if (attempt === 1) {
                    tlsOptions.servername = host;
                    tlsOptions.minVersion = 'TLSv1.2';
                } else if (attempt === 2) {
                    tlsOptions.servername = host;
                    // Remove minVersion
                } else {
                    // Remove servername to let default behavior take over
                }

                const auth: any = {
                    user: config.smtp_username,
                    pass: config.smtp_password,
                };

                if (attempt === 1) {
                    auth.loginMethod = 'AUTH=PLAIN';
                } else if (attempt === 2) {
                    auth.loginMethod = 'AUTH=LOGIN';
                } else {
                    auth.loginMethod = 'LOGIN';
                }

                const client = new ImapFlow({
                    host: host,
                    port: profile.port,
                    secure: profile.secure,
                    doSTARTTLS: profile.doStartTls,
                    auth,
                    tls: tlsOptions,
                    logger: {
                        debug: (obj: any) => console.log(`[IMAP DEBUG] ${obj?.msg || JSON.stringify(obj)}`),
                        info: (obj: any) => console.log(`[IMAP INFO] ${obj?.msg || JSON.stringify(obj)}`),
                        warn: (obj: any) => console.warn(`[IMAP WARN] ${obj?.msg || JSON.stringify(obj)}`),
                        error: (obj: any) => console.error(`[IMAP ERROR] ${obj?.msg || JSON.stringify(obj)}`),
                    },
                    clientInfo: {
                        name: 'EmailBridge',
                        version: '1.0.0'
                    },
                    disableAutoIdle: true,
                    disableAutoEnable: true,
                    disableCompression: true,
                    connectionTimeout,
                    greetingTimeout,
                    socketTimeout
                });

                client.on('error', (err: any) => {
                    console.error(`IMAP Client Error for ${config.smtp_username} (${host}:${profile.port}) (Attempt ${attempt}):`, err);
                });

                let lock: any = null;
                try {
                    await client.connect();
                    
                    lock = await client.getMailboxLock('INBOX');
                    try {
                const searchDate = new Date();
                searchDate.setDate(searchDate.getDate() - lookbackDays); // Look back X days
                console.log(`Searching emails since ${searchDate.toISOString()}...`);
                
                const searchResult = await client.search({ since: searchDate });
                
                let processedCount = 0;
                let updatedCount = 0;
                let bouncedCount = 0;

                if (searchResult.length > 0) {
                    // Check last 1000 messages (headers only first)
                    const messagesToCheck = searchResult.slice(-1000);
                    console.log(`Found ${searchResult.length} messages, checking headers for last ${messagesToCheck.length}...`);

                    const interestingSequenceNumbers: number[] = [];

                    // 1. Scan Headers (Envelopes)
                    const bounceSequenceNumbers: number[] = [];
                    
                    for await (const message of client.fetch(messagesToCheck, { envelope: true })) {
                        const { envelope, seq } = message;
                        if (!envelope) continue;

                        const from = envelope.from?.[0]?.address || '';
                        const subject = envelope.subject || '';
                        const inReplyTo = envelope.inReplyTo;

                        // Check for bounces
                        const { isAutoReply, isBounce } = classifyMessage(from, subject);
                        
                        // --- 1. PROCESS REPLIES IMMEDIATELY (No Body Fetch) ---
                        // CRITICAL: Do NOT process as reply if it is a bounce!
                        if (inReplyTo && !isBounce && !isAutoReply) {
                            const normalizeId = (id: any) => {
                                if (typeof id !== 'string') return '';
                                return id.replace(/[<>]/g, '').trim();
                            };

                            const rawIds: string[] = [];
                            if (typeof inReplyTo === 'string') {
                                rawIds.push(inReplyTo);
                            } else if (Array.isArray(inReplyTo)) {
                                inReplyTo.forEach((id: any) => {
                                    if (typeof id === 'string') rawIds.push(id);
                                });
                            }

                            const idsToCheck = new Set();
                            rawIds.forEach(id => {
                                if (!id) return;
                                const clean = normalizeId(id);
                                if (clean) {
                                    idsToCheck.add(clean);
                                    idsToCheck.add(`<${clean}>`);
                                }
                                idsToCheck.add(id.trim());
                            });

                            const messageIdsToCheck = Array.from(idsToCheck);

                            if (messageIdsToCheck.length > 0) {
                                // Check both message_id (latest) and thread_id (original)
                                const { data: recipientsByMessageId } = await supabase
                                    .from('recipients')
                                    .select('id, email, campaign_id')
                                    .in('message_id', messageIdsToCheck)
                                    .eq('replied', false);

                                const { data: recipientsByThreadId } = await supabase
                                    .from('recipients')
                                    .select('id, email, campaign_id')
                                    .in('thread_id', messageIdsToCheck)
                                    .eq('replied', false);
                                
                                const allRecipients = [...(recipientsByMessageId || []), ...(recipientsByThreadId || [])];
                                // Deduplicate by ID
                                const recipients = Array.from(new Map(allRecipients.map(r => [r.id, r])).values());

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
                        }

                        // --- 2. QUEUE BOUNCES FOR BODY FETCH ---
                        if (isBounce) {
                            bounceSequenceNumbers.push(seq);
                        }
                    }

                    console.log(`Found ${bounceSequenceNumbers.length} potential bounces. Fetching full content for max 20...`);

                    // Limit to 20 bounces to avoid timeout
                    const bouncesToProcess = bounceSequenceNumbers.slice(0, 20);

                    if (bouncesToProcess.length > 0) {
                        for await (const message of client.fetch(bouncesToProcess, { source: true })) {
                        try {
                            const source = message.source;
                            const id = message.uid;
                            
                            // Ensure source is a Buffer to avoid stream issues in Deno
                            const sourceBuffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
                            const parsed = await simpleParser(sourceBuffer);
                            
                            const from = parsed.from?.text || '';
                            const subject = parsed.subject || '';
                            
                            // --- CHECK FOR BOUNCES ---
                            console.log(`Processing bounce: ${subject} from ${from}`);
                            
                            const body = parsed.text || parsed.html || "";
                            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
                            const foundEmails = body.match(emailRegex) || [];
                            
                            console.log(`Extracted ${foundEmails.length} emails from bounce body: ${foundEmails.slice(0, 5).join(', ')}${foundEmails.length > 5 ? '...' : ''}`);
                            
                            const failedHeader = parsed.headers.get('x-failed-recipients');
                            if (failedHeader) {
                                if (typeof failedHeader === 'string') foundEmails.push(failedHeader);
                                else if (Array.isArray(failedHeader)) foundEmails.push(...failedHeader);
                            }

                            const senderEmail = (config.smtp_username || '').toLowerCase();
                            const uniqueEmails = sanitizeBounceEmails(foundEmails, senderEmail);

                            if (uniqueEmails.length > 0) {
                                const { data: recipients, error: recipientsError } = await supabase
                                    .from('recipients')
                                    .select('id, email, campaign_id, bounced')
                                    .in('email', uniqueEmails)
                                    .or('bounced.is.null,bounced.eq.false')
                                    .order('last_email_sent_at', { ascending: false });

                                if (recipientsError) {
                                    console.error('Error fetching recipients for bounce processing:', recipientsError);
                                } else if (recipients && recipients.length > 0) {
                                    const recipientsToUpdate = recipients.filter(r => !r.bounced);
                                    const recipientIds = recipientsToUpdate.map(r => r.id);
                                    const campaignIds = new Set(recipientsToUpdate.map(r => r.campaign_id));

                                    if (recipientIds.length > 0) {
                                        const { error: updateError } = await supabase
                                            .from('recipients')
                                            .update({ 
                                                bounced: true, 
                                                bounced_at: new Date().toISOString(),
                                                status: 'bounced'
                                            })
                                            .in('id', recipientIds);

                                        if (updateError) {
                                            console.error('Error updating bounced recipients:', updateError);
                                        } else {
                                            recipientsToUpdate.forEach((recipient) => {
                                                console.log(`Confirmed bounce for ${recipient.email} (Campaign ${recipient.campaign_id})`);
                                                bouncedCount++;
                                            });
                                        }
                                    }

                                    for (const campaignId of campaignIds) {
                                        await updateCampaignBounceCount(campaignId);
                                    }
                                }
                            }
                            processedCount++;
                        } catch (msgError) {
                            console.error(`Error processing message ${message.uid}:`, msgError);
                        }
                    }
                    }
                } else {
                    console.log("No recent messages found.");
                }
                
                    return { processed: processedCount, replies: updatedCount, bounces: bouncedCount };

                } finally {
                        try {
                            lock?.release();
                        } catch (releaseError) {
                            console.warn(`Mailbox lock release failed for ${config.smtp_username}:`, releaseError);
                        }
                    }
                } catch (err: any) {
                    lastError = err;
                    console.error(`Error checking emails for ${config.smtp_username} (${host}:${profile.port}) (Attempt ${attempt}):`, err);
                    
                    if (attempt < 3) {
                        console.log(`Retrying ${config.smtp_username} in 2s...`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } finally {
                    try { await client.logout(); } catch (e) {}
                }
            }
        }
    }
    throw lastError;
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    console.log("Starting check-email-replies v3.4 (Legacy Hostinger override support)...");

    try {
        let configId = null;
        let lookbackDays = 7;
        let useDbScan = false;
        let overrides: any = {};

        try {
            const body = await req.json();
            configId = body.config_id;
            if (body.lookback_days) lookbackDays = body.lookback_days;
            if (body.use_db_scan) useDbScan = body.use_db_scan;
            overrides = {
                force_legacy_hostinger: body.force_legacy_hostinger,
                force_direct_tls: body.force_direct_tls,
                force_starttls: body.force_starttls,
                force_port: body.force_port,
                imap_host_override: body.imap_host_override,
                imap_host_candidates: body.imap_host_candidates,
                max_attempts: body.max_attempts,
                connection_timeout_ms: body.connection_timeout_ms,
                greeting_timeout_ms: body.greeting_timeout_ms,
                socket_timeout_ms: body.socket_timeout_ms
            };
        } catch (e) {
            // Body might be empty or not JSON
        }

        let query = supabase
            .from('email_configs')
            .select('*')
            .not('imap_host', 'is', null);
            
        if (configId) {
            console.log(`Filtering for config_id: ${configId}`);
            query = query.eq('id', configId);
        }

        const { data: configs, error } = await query;
            
        if (error) throw error;

        // Process sequentially to avoid overloading the Deno Node compat layer
        const results = [];
        
        for (const config of configs) {
            try {
                let result;
                if (useDbScan) {
                    result = await processDbEmails(config, lookbackDays);
                } else {
                    console.log(`Checking inbox for ${config.smtp_username} (Lookback: ${lookbackDays} days)...`);
                    result = await checkRepliesAndBouncesForConfig(config, lookbackDays, overrides);
                }
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
