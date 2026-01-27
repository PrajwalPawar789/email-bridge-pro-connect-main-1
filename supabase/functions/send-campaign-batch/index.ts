// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTransport } from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

interface EmailConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  security: 'SSL' | 'TLS';
  sender_name?: string | null;
}

interface EmailConfigRow {
  id: string;
  smtp_host: string;
  smtp_port: number | null;
  smtp_username: string;
  smtp_password: string;
  security: 'SSL' | 'TLS' | null;
  sender_name?: string | null;
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  send_delay_minutes: number | null;
  status: string | null;
  last_batch_sent_at: string | null;
  email_config_id: string | null;
  user_id: string;
}

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  status: string | null;
  campaign_id: string;
  clicked_at: string | null;
  opened_at: string | null;
  track_click_link: string | null;
  track_open_link: string | null;
  assigned_email_config_id: string | null;
  message_id?: string;
  thread_id?: string;
}

type PersonalizationData = {
  company?: string;
  phone?: string;
  sender_name?: string;
  sender_email?: string;
};

// Utility functions
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateUniqueId = () => crypto.randomUUID();

const STEP0_DAILY_QUOTA_RATIO = 0.5;

const getDailyQuotaForStep = (dailyLimit: number, step: number) => {
  if (dailyLimit <= 0) return 0;
  const step0Limit = Math.max(1, Math.floor(dailyLimit * STEP0_DAILY_QUOTA_RATIO));
  const followupLimit = Math.max(0, dailyLimit - step0Limit);
  return step === 0 ? step0Limit : followupLimit;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch (_) {
    return 'Unknown error';
  }
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const looksLikeHtml = (value: string) => /<\s*[a-z][\w-]*(\s[^>]*)?>/i.test(value);

const hasMarkdownFormatting = (value: string) =>
  /(\*\*|__|^\s*(?:[-*]|\u2022)\s+|^\s*\d+[.)]\s+)/m.test(value);

const formatPlainTextToHtml = (value: string) => {
  if (!value) return '';
  const escaped = escapeHtml(value);

  const formatInline = (text: string) => {
    const withBold = text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    return withBold.replace(/__([\s\S]+?)__/g, '<u>$1</u>');
  };

  const lines = escaped.split(/\r?\n/);
  const chunks: string[] = [];
  const paragraphLines: string[] = [];
  let activeList: 'ul' | 'ol' | null = null;

  const bulletRegex = /^\s*(?:[-*]|\u2022)\s+(.*)$/;
  const orderedRegex = /^\s*(\d+)[.)]\s+(.*)$/;

  const closeList = () => {
    if (!activeList) return;
    chunks.push(activeList === 'ul' ? '</ul>' : '</ol>');
    activeList = null;
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const html = paragraphLines.map(line => formatInline(line)).join('<br />');
    chunks.push(`<p>${html}</p>`);
    paragraphLines.length = 0;
  };

  lines.forEach((line) => {
    const bulletMatch = line.match(bulletRegex);
    if (bulletMatch) {
      flushParagraph();
      if (activeList !== 'ul') {
        closeList();
        chunks.push('<ul>');
        activeList = 'ul';
      }
      chunks.push(`<li>${formatInline(bulletMatch[1])}</li>`);
      return;
    }

    const orderedMatch = line.match(orderedRegex);
    if (orderedMatch) {
      flushParagraph();
      const startValue = Number.parseInt(orderedMatch[1], 10);
      if (activeList !== 'ol') {
        closeList();
        const startAttr = Number.isFinite(startValue) ? ` start="${startValue}"` : '';
        chunks.push(`<ol${startAttr}>`);
        activeList = 'ol';
      }
      chunks.push(`<li>${formatInline(orderedMatch[2])}</li>`);
      return;
    }

    if (line.trim() === '') {
      flushParagraph();
      return;
    }

    closeList();
    paragraphLines.push(line);
  });

  flushParagraph();
  closeList();
  return chunks.join('');
};

const personalizeContent = (
  content: string,
  recipient: Recipient,
  campaignData: PersonalizationData = {},
  isSubject = false
) => {
  let personalized = content;
  
  // Use name field or extract from email
  const fullName = recipient.name || recipient.email.split('@')[0];
  const firstName = fullName.split(' ')[0] || fullName;
  const lastName = fullName.split(' ').slice(1).join(' ') || '';
  const company = campaignData.company || recipient.email.split('@')[1].split('.')[0];
  const phone = campaignData.phone || '';
  const senderName = campaignData.sender_name || '';
  const senderEmail = campaignData.sender_email || '';
  
  const replaceToken = (token: string, value: string) => {
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const braceOpen = '(?:\\{|&#123;|&#x7b;|&#x007b;|&lcub;|&lbrace;|&amp;#123;|&amp;#x7b;|&amp;#x007b;|\\uFF5B)';
    const braceClose = '(?:\\}|&#125;|&#x7d;|&#x007d;|&rcub;|&rbrace;|&amp;#125;|&amp;#x7d;|&amp;#x007d;|\\uFF5D)';
    const ws = '(?:\\s|&nbsp;|&#160;|&#xA0;|&#x00A0;)*';
    const pattern = new RegExp(
      `${braceOpen}${braceOpen}${ws}${escapedToken}${ws}${braceClose}${braceClose}|${braceOpen}${ws}${escapedToken}${ws}${braceClose}`,
      'gi'
    );
    personalized = personalized.replace(pattern, value || '');
  };

  const tokenValues = {
    name: fullName,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email: recipient.email,
    company,
    phone,
    sender_name: senderName,
    sender_email: senderEmail,
  };

  Object.entries(tokenValues).forEach(([token, value]) => {
    replaceToken(token, value ?? '');
  });

  if (/sender_name/i.test(personalized)) {
    console.warn('Personalization warning: sender_name token still present after replacement');
  }

  return personalized;
};

const generateTrackingPixel = (campaignId: string, recipientId: string) => {
  const trackingUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/track-email-open?campaign_id=${campaignId}&recipient_id=${recipientId}`;
  return `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="">`;
};

const addTrackingToLinks = (htmlContent: string, campaignId: string, recipientId: string) => {
  console.log('Processing links for tracking (v2.2)...');
  const trackingUrls: string[] = [];
  let urlCounter = 0;

  // Regex to match URLs inside href attributes OR naked URLs
  // Group 1, 2, 3: href="url"
  // Group 4: naked url
  const regex = /(href\s*=\s*["'])(https?:\/\/[^\s"']+)(["'])|(https?:\/\/[^\s<>"']+)/gi;

  const modifiedContent = htmlContent.replace(
    regex,
    (match, hrefPrefix, hrefUrl, hrefSuffix, nakedUrl) => {
      urlCounter++;
      
      const originalUrl = hrefUrl || nakedUrl;
      if (!originalUrl) return match;

      const encodedUrl = encodeURIComponent(originalUrl);
      const trackingUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/track-email-click?campaign_id=${campaignId}&recipient_id=${recipientId}&url=${encodedUrl}`;
      trackingUrls.push(trackingUrl);
      
      console.log(`Generated click tracking URL ${urlCounter} for ${hrefUrl ? 'href' : 'text'} URL`);

      if (hrefUrl) {
        // Replace URL inside href
        return `${hrefPrefix}${trackingUrl}${hrefSuffix}`;
      } else {
        // Wrap naked URL in anchor tag to hide tracking link
        return `<a href="${trackingUrl}">${nakedUrl}</a>`;
      }
    }
  );

  return { content: modifiedContent, trackingUrls };
};

const normalizeEmailConfig = (row: EmailConfigRow): EmailConfig => ({
  host: row.smtp_host,
  port: row.smtp_port ?? (row.security === 'TLS' ? 587 : 465),
  username: row.smtp_username,
  password: row.smtp_password,
  security: row.security === 'TLS' ? 'TLS' : 'SSL',
  sender_name: row.sender_name ?? null,
});

const fetchEmailConfigForCampaign = async (campaign: Campaign): Promise<EmailConfig> => {
  let emailConfigRow: EmailConfigRow | null = null;

  if (campaign.email_config_id) {
    const { data, error } = await supabase
      .from('email_configs')
      .select('id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name')
      .eq('id', campaign.email_config_id)
      .maybeSingle();

    if (error) {
      throw new Error(`Error fetching email config ${campaign.email_config_id}: ${error.message}`);
    }

    emailConfigRow = data;
  }

  if (!emailConfigRow) {
    const { data: fallbackConfig, error: fallbackError } = await supabase
      .from('email_configs')
      .select('id, smtp_host, smtp_port, smtp_username, smtp_password, security, sender_name')
      .eq('user_id', campaign.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      throw new Error(`Unable to load fallback email config for user ${campaign.user_id}: ${fallbackError.message}`);
    }

    if (!fallbackConfig) {
      throw new Error(`No email configuration found for campaign ${campaign.name}. Please add one in Email Config settings.`);
    }

    console.log(`Using fallback email config ${fallbackConfig.id} for campaign ${campaign.id}`);
    emailConfigRow = fallbackConfig;
  }

  return normalizeEmailConfig(emailConfigRow);
};

type EmailContentOverride = {
  subject: string;
  body: string;
  is_html?: boolean;
};

const sendEmail = async (
  config: EmailConfig,
  recipient: Recipient,
  campaign: Campaign,
  extraData: PersonalizationData = {},
  previousMessageId?: string,
  threadId?: string,
  contentOverride?: EmailContentOverride
) => {
  console.log(`Attempting to send email to: ${recipient.email}`);

  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'SSL' && config.port === 465,
    auth: {
      user: config.username,
      pass: config.password,
    },
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
  });

  console.log(`Using SMTP config - Host: ${config.host}, Port: ${config.port}, User: ${config.username}`);

  try {
    await transporter.verify();
    console.log('SMTP connection verified successfully');
  } catch (error: unknown) {
    console.error('SMTP verification failed:', error);
    throw error instanceof Error ? error : new Error(getErrorMessage(error));
  }

  const subjectToSend = contentOverride?.subject ?? campaign.subject;
  const bodyToSend = contentOverride?.body ?? campaign.body;

  const personalizedSubject = personalizeContent(subjectToSend, recipient, extraData, true);
  console.log(`Personalized subject: ${personalizedSubject}`);

  const personalizedContent = personalizeContent(bodyToSend, recipient, extraData);
  console.log(`Personalizing content for recipient: ${recipient.id} (${recipient.email})`);

  let isHtmlContent = contentOverride?.is_html ?? looksLikeHtml(bodyToSend);
  if (hasMarkdownFormatting(bodyToSend)) {
    isHtmlContent = false;
  }
  const formattedContent = isHtmlContent
    ? personalizedContent
    : formatPlainTextToHtml(personalizedContent);

  const { content: contentWithClickTracking, trackingUrls } = addTrackingToLinks(formattedContent, campaign.id, recipient.id);
  console.log(`Added tracking to ${trackingUrls.length} total URLs for recipient ${recipient.id}`);

  // Store first tracking URL in track_click_link field
  if (trackingUrls.length > 0) {
    const { error: trackingError } = await supabase
      .from('recipients')
      .update({ track_click_link: trackingUrls[0] })
      .eq('id', recipient.id);

    if (trackingError) {
      console.error('Error storing tracking URL:', trackingError);
    } else {
      console.log(`Stored tracking URL for recipient ${recipient.id}`);
    }
  }

  const trackingPixel = generateTrackingPixel(campaign.id, recipient.id);
  console.log(`Generated tracking pixel URL: ${Deno.env.get("SUPABASE_URL")}/functions/v1/track-email-open?campaign_id=${campaign.id}&recipient_id=${recipient.id}`);

  // Generate Ghost Link (Honeypot) for Bot Detection
  // This link is invisible to humans but bots will likely follow it
  const ghostLinkUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/track-email-click?campaign_id=${campaign.id}&recipient_id=${recipient.id}&url=${encodeURIComponent('http://example.com/unsubscribe')}&type=ghost`;
  const ghostLink = `<a href="${ghostLinkUrl}" style="display:none; visibility:hidden; opacity:0; position:absolute; left:-9999px;">Unsubscribe</a>`;

  const finalContent = contentWithClickTracking + trackingPixel + ghostLink;
  console.log(`Final email content length: ${finalContent.length} characters`);

  const messageId = generateUniqueId();
  const currentDate = new Date().toUTCString();
  const senderEmail = config.username;
  const senderName = (config.sender_name || '').trim() || campaign.name;
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : 'example.com';

  console.log(`Sending email with improved anti-spam configuration to: ${recipient.email}`);

  const mailOptions: any = {
    from: `"${senderName}" <${senderEmail}>`,
    to: recipient.email,
    subject: personalizedSubject,
    html: finalContent,
    text: personalizedContent,
    messageId: `<${messageId}@${senderDomain}>`,
    headers: {
      'Date': currentDate,
      'X-Mailer': 'Supabase Email System v2.0',
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      'Importance': 'Normal',
      'List-Unsubscribe': `<mailto:unsubscribe@${senderDomain}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'Precedence': 'bulk',
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      'MIME-Version': '1.0',
    },
  };

  // Add threading headers if this is a follow-up
  if (previousMessageId) {
    mailOptions.headers['In-Reply-To'] = previousMessageId;
    
    // Improved threading: Include original thread ID in References
    const references = [];
    if (threadId) {
      references.push(threadId);
    }
    // Always include the immediate parent if it's different from threadId
    if (previousMessageId && previousMessageId !== threadId) {
      references.push(previousMessageId);
    }
    
    // If no threadId was found (legacy), just use previousMessageId
    if (references.length === 0) {
      references.push(previousMessageId);
    }
    mailOptions.headers['References'] = references.join(' ');
    console.log(`Added threading headers - In-Reply-To: ${previousMessageId}, References: ${mailOptions.headers['References']}`);
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`SMTP response: ${info.response}`);
  console.log(`Email sent successfully to: ${recipient.email}. Message ID: ${info.messageId}`);
  
  return info;
};

// Process a single batch of emails (max 3 emails to stay within 150s limit)
const processBatch = async (campaignId: string, batchSize = 3, step = 0, emailConfigId?: string) => {
  console.log(`Processing batch for campaign: ${campaignId} (max ${batchSize} emails, step ${step}, config ${emailConfigId || 'default'})`);
  
  try {
    // Get campaign data
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignError?.message}`);
    }

    const { data: campaignConfigRows, error: campaignConfigError } = await supabase
      .from('campaign_email_configurations')
      .select('email_config_id')
      .eq('campaign_id', campaignId);

    if (campaignConfigError) {
      console.warn(`Error loading campaign configs for ${campaignId}:`, campaignConfigError.message);
    }

    const campaignConfigIds = (campaignConfigRows || [])
      .map((row) => row.email_config_id)
      .filter((id) => !!id);

    const pickRandomConfigId = () => {
      if (campaignConfigIds.length === 0) return null;
      const choice = campaignConfigIds[Math.floor(Math.random() * campaignConfigIds.length)];
      return choice ?? null;
    };

    // Determine content based on step
    let subject = campaign.subject;
    let body = campaign.body;
    let isFollowUp = step > 0;
    let followup = null;
    let isHtml: boolean | undefined = undefined;

    if (isFollowUp) {
      const { data: f, error: followupError } = await supabase
        .from('campaign_followups')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('step_number', step)
        .single();
      
      followup = f;

      if (followupError || !followup) {
        console.log(`No follow-up found for step ${step}. Skipping.`);
        return { success: true, message: 'No follow-up step found', emailsSent: 0, hasMore: false };
      }

      // If template_id is present, fetch template content
      if (followup.template_id) {
        const { data: template } = await supabase
          .from('email_templates')
          .select('subject, content, is_html')
          .eq('id', followup.template_id)
          .single();
        
        if (template) {
          subject = followup.subject || template.subject || `Re: ${campaign.subject}`;
          body = followup.body || template.content;
          if (!followup.body) {
            isHtml = template.is_html ?? undefined;
          }
        } else {
           subject = followup.subject || `Re: ${campaign.subject}`;
           body = followup.body;
        }
      } else {
        subject = followup.subject || `Re: ${campaign.subject}`;
        body = followup.body;
      }
    }

    console.log(`Campaign found: ${campaign.name} (status: ${campaign.status})`);
    
    // Allow processing for: draft, paused, sending, or failed (resume) campaigns
    // Skip if already sent or completed
    if (campaign.status === 'sent' && !isFollowUp) {
      console.log('Campaign already completed successfully');
      return { 
        success: true, 
        message: 'Campaign already sent',
        emailsSent: 0,
        hasMore: false
      };
    }

    // Do not pause initial batches just because follow-ups exist.
    // Follow-up steps are handled by step > 0 runs and respect per-recipient delays.

    // const emailConfig = await fetchEmailConfigForCampaign(campaign); // Moved inside loop

    // Get recipients based on step
    // We first select IDs to lock them, preventing race conditions
    let recipientsQuery = supabase
      .from('recipients')
      .select('id, assigned_email_config_id')
      .eq('campaign_id', campaignId)
      .or('replied.is.null,replied.eq.false') // Don't send if they replied
      .order('id', { ascending: true })
      .limit(batchSize);

    if (emailConfigId) {
      // If a specific config is requested, only pick recipients assigned to it OR unassigned ones
      recipientsQuery = recipientsQuery.or(`assigned_email_config_id.eq.${emailConfigId},assigned_email_config_id.is.null`);
    }

    if (step === 0) {
      recipientsQuery = recipientsQuery.or('status.is.null,status.eq.pending');
    } else {
      // For follow-ups: Must have received previous step (current_step = step - 1)
      // And status must be 'sent' (meaning they got the previous one)
      
      let delayDays = followup?.delay_days || 0;
      let delayHours = followup?.delay_hours || 0;
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - delayDays);
      cutoffDate.setHours(cutoffDate.getHours() - delayHours);
      
      recipientsQuery = recipientsQuery
        .eq('current_step', step - 1)
        .eq('status', 'sent')
        .lt('last_email_sent_at', cutoffDate.toISOString());
    }

    const { data: recipientIds, error: recipientsError } = await recipientsQuery;

    if (recipientsError) {
      throw new Error(`Error fetching recipients: ${recipientsError.message}`);
    }

    if (!recipientIds || recipientIds.length === 0) {
      console.log('No recipients found for this step.');
      
      if (step === 0) {
        // Check if there are ANY pending recipients left for this campaign
        const { count } = await supabase
          .from('recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .or('status.is.null,status.eq.pending');

        if (count === 0) {
          // Only mark as sent if truly no one is left pending
          await supabase
            .from('campaigns')
            .update({ 
              status: 'sent',
              updated_at: new Date().toISOString()
            })
            .eq('id', campaignId);
        }
      }
      
      return { 
        success: true, 
        message: 'No recipients found',
        emailsSent: 0,
        hasMore: false
      };
    }

    // Check daily limits for the email config
    let effectiveBatchSize = recipientIds.length;
    if (emailConfigId) {
      const { data: configData, error: configError } = await supabase
        .from('campaign_email_configurations')
        .select('daily_limit, last_sent_at')
        .eq('campaign_id', campaignId)
        .eq('email_config_id', emailConfigId)
        .single();

      if (configError) {
        console.error(`Error fetching config limits: ${configError.message}`);
      } else if (configData) {
        const dailyLimit = configData.daily_limit || 100;
        const stepLimit = getDailyQuotaForStep(dailyLimit, step);
        const stepLabel = step === 0 ? 'step-0' : 'follow-ups';

        if (stepLimit <= 0) {
          console.log(`Daily limit of ${dailyLimit} provides no ${stepLabel} capacity for config ${emailConfigId}. Skipping batch.`);
          return { 
            success: true, 
            message: 'Daily limit reached',
            emailsSent: 0,
            hasMore: true
          };
        }
        
        // Count emails sent today from this config
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        let countQuery = supabase
          .from('recipients')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_email_config_id', emailConfigId)
          .eq('campaign_id', campaignId)
          .gte('last_email_sent_at', today.toISOString())
          .lt('last_email_sent_at', tomorrow.toISOString());

        if (step === 0) {
          countQuery = countQuery.or('current_step.eq.0,current_step.is.null');
        } else {
          countQuery = countQuery.gte('current_step', 1);
        }

        const { count: sentToday, error: countError } = await countQuery;

        if (countError) {
          console.error(`Error counting sent emails: ${countError.message}`);
        } else {
          const remainingCapacity = stepLimit - (sentToday || 0);
          if (remainingCapacity <= 0) {
            console.log(`Daily limit of ${stepLimit} reached for ${stepLabel} on config ${emailConfigId}. Skipping batch.`);
            return { 
              success: true, 
              message: 'Daily limit reached',
              emailsSent: 0,
              hasMore: true // Try again tomorrow
            };
          }
          
          effectiveBatchSize = Math.min(effectiveBatchSize, remainingCapacity);
          console.log(`Config ${emailConfigId}: ${stepLabel} sent ${sentToday} today, limit ${stepLimit}, remaining ${remainingCapacity}, will send ${effectiveBatchSize}`);
        }
      }
    }

    // Limit recipients to effective batch size
    const recipientsToProcess = recipientIds.slice(0, effectiveBatchSize);

    // LOCKING: Mark these recipients as 'processing' to prevent other workers from picking them up
    const idsToProcess = recipientsToProcess.map(r => r.id);
    const lockUpdate = { status: 'processing', updated_at: new Date().toISOString() };
    let recipients: Recipient[] = [];

    if (step === 0) {
      // Avoid PostgREST OR update return bug by locking pending and null in separate updates.
      const { data: pendingRows, error: pendingError } = await supabase
        .from('recipients')
        .update(lockUpdate)
        .in('id', idsToProcess)
        .eq('status', 'pending')
        .select('*');

      if (pendingError) {
        throw new Error(`Error locking pending recipients: ${pendingError.message}`);
      }

      recipients = (pendingRows || []).slice();

      const { data: nullRows, error: nullError } = await supabase
        .from('recipients')
        .update(lockUpdate)
        .in('id', idsToProcess)
        .is('status', null)
        .select('*');

      if (nullError) {
        throw new Error(`Error locking null recipients: ${nullError.message}`);
      }

      recipients = recipients.concat(nullRows || []);
    } else {
      const { data: sentRows, error: sentError } = await supabase
        .from('recipients')
        .update(lockUpdate)
        .in('id', idsToProcess)
        .eq('status', 'sent')
        .select('*');

      if (sentError) {
        throw new Error(`Error locking follow-up recipients: ${sentError.message}`);
      }

      recipients = sentRows || [];
    }

    if (!recipients || recipients.length === 0) {
      console.log('Could not lock any recipients (race condition?). Skipping batch.');
      return { success: true, message: 'Race condition encountered', emailsSent: 0, hasMore: true };
    }

    console.log(`Processing ${recipients.length} recipients in this batch`);

    // Fetch prospect details for these recipients to get company/phone
    const emails = recipients.map(r => r.email);
    const { data: prospects } = await supabase
      .from('prospects')
      .select('email, company, phone, sender_name, sender_email')
      .eq('user_id', campaign.user_id)
      .in('email', emails);
      
    const prospectMap = new Map();
    if (prospects) {
      prospects.forEach(p => prospectMap.set(p.email, p));
    }

    // Update campaign status to sending if step 0
    if (step === 0) {
      await supabase
        .from('campaigns')
        .update({ 
          status: 'sending',
          last_batch_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignId);

      // NEW: Update specific config timestamp if used
      if (emailConfigId) {
         const { error: configUpdateError } = await supabase
          .from('campaign_email_configurations')
          .update({ last_sent_at: new Date().toISOString() })
          .eq('campaign_id', campaignId)
          .eq('email_config_id', emailConfigId);
          
         if (configUpdateError) {
           console.warn('Failed to update last_sent_at for config (column might be missing):', configUpdateError.message);
         }
      }
    }

    let emailsSent = 0;

    // Process each recipient in the batch
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      
      try {
        // Determine which email config to use
        let configIdToUse =
          emailConfigId || recipient.assigned_email_config_id || campaign.email_config_id;

        if (!configIdToUse) {
          configIdToUse = pickRandomConfigId();
          if (configIdToUse) {
            console.log(`Assigned random sender config ${configIdToUse} for recipient ${recipient.email}`);
          }
        }
        
        if (!configIdToUse) {
           throw new Error("No email configuration assigned to recipient or campaign.");
        }

        // Fetch config details
        const { data: configData, error: configError } = await supabase
          .from('email_configs')
          .select('*')
          .eq('id', configIdToUse)
          .single();

        if (configError || !configData) {
           throw new Error(`Email config not found: ${configIdToUse}`);
        }

        const emailConfig = normalizeEmailConfig(configData);

        // Check daily limit for this config
        const { data: limitData } = await supabase
          .from('campaign_email_configurations')
          .select('daily_limit')
          .eq('campaign_id', campaignId)
          .eq('email_config_id', configIdToUse)
          .maybeSingle();
        
        const dailyLimit = limitData?.daily_limit || 100;
        const stepLimit = getDailyQuotaForStep(dailyLimit, step);
        const stepLabel = step === 0 ? 'step-0' : 'follow-ups';

        if (stepLimit <= 0) {
          console.log(`Daily limit of ${dailyLimit} provides no ${stepLabel} capacity for config ${configIdToUse}. Skipping.`);
          await supabase.from('recipients').update({ status: step === 0 ? 'pending' : 'sent' }).eq('id', recipient.id);
          continue;
        }

        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        
        let sentQuery = supabase
          .from('recipients')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_email_config_id', configIdToUse)
          .eq('status', 'sent')
          .gte('last_email_sent_at', todayStart.toISOString());

        if (step === 0) {
          sentQuery = sentQuery.or('current_step.eq.0,current_step.is.null');
        } else {
          sentQuery = sentQuery.gte('current_step', 1);
        }

        const { count: sentToday } = await sentQuery;

        if (sentToday !== null && sentToday >= stepLimit) {
          console.log(`Daily ${stepLabel} limit reached for config ${configIdToUse} (${sentToday}/${stepLimit}). Skipping.`);
          // Revert status
          await supabase.from('recipients').update({ status: step === 0 ? 'pending' : 'sent' }).eq('id', recipient.id);
          continue;
        }

        const prospectData = prospectMap.get(recipient.email) || {};

        // Send email
        const info = await sendEmail(
          emailConfig,
          recipient,
          campaign,
          prospectData,
          recipient.message_id,
          recipient.thread_id,
          { subject, body, is_html: isHtml }
        );

        // Update recipient status
        const updateData: any = { 
            status: 'sent',
            current_step: step,
            last_email_sent_at: new Date().toISOString(),
            message_id: info.messageId,
            assigned_email_config_id: configIdToUse
        };
        // If this is the first email (step 0), set the thread_id
        if (step === 0) {
            updateData.thread_id = info.messageId;
        }

        const { error: updateError } = await supabase
          .from('recipients')
          .update(updateData)
          .eq('id', recipient.id);        if (updateError) {
          console.error(`Error updating recipient ${recipient.id}:`, updateError);
        }

        emailsSent++;
        
        // Wait a bit between emails to prevent rate limiting
        await sleep(2000);

      } catch (error: unknown) {
        console.error(`Error sending to ${recipient.email}:`, error);
        
        // Mark as failed so we don't retry indefinitely without intervention
        await supabase
          .from('recipients')
          .update({ status: 'failed' })
          .eq('id', recipient.id);
      }
    }

    // Update last_sent_at for the email config if any emails were sent
    if (emailsSent > 0 && emailConfigId) {
      await supabase
        .from('campaign_email_configurations')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('campaign_id', campaignId)
        .eq('email_config_id', emailConfigId);
    }

    // Check if there are more pending recipients
    // ... (Simplified for brevity, logic remains similar but needs to account for step)

    return { 
      success: true, 
      message: `Batch completed. Sent ${emailsSent} emails.`,
      emailsSent,
      hasMore: false // Let the monitor handle re-triggering
    };

  } catch (error: unknown) {
    console.error('Error in batch processing:', error);
    const errorMessage = getErrorMessage(error);
    throw error instanceof Error ? error : new Error(errorMessage);
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaignId, batchSize, step, emailConfigId } = await req.json();
    
    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: 'Campaign ID is required' }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        }
      );
    }

    const result = await processBatch(campaignId, batchSize, step || 0, emailConfigId);
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { "Content-Type": "application/json", ...corsHeaders }
      }
    );

  } catch (error: unknown) {
    console.error('Error in send-campaign-batch function:', error);
    const errorMessage = getErrorMessage(error);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      }
    );
  }
});
