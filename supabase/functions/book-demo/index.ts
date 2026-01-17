import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTransport } from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

const getEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type DbEmailConfig = {
  smtp_host: string;
  smtp_port: number | null;
  smtp_username: string;
  smtp_password: string;
  security: "SSL" | "TLS" | null;
};

const loadDbSmtpConfig = async () => {
  if (!supabase) {
    throw new Error("Supabase client not configured for demo SMTP lookup.");
  }

  const configId = Deno.env.get("DEMO_EMAIL_CONFIG_ID");
  const smtpUser = Deno.env.get("DEMO_SMTP_USER");

  let query = supabase
    .from("email_configs")
    .select("smtp_host, smtp_port, smtp_username, smtp_password, security")
    .order("created_at", { ascending: false })
    .limit(1);

  if (configId) {
    query = query.eq("id", configId);
  } else if (smtpUser) {
    query = query.eq("smtp_username", smtpUser);
  }

  const { data, error } = await query.maybeSingle<DbEmailConfig>();

  if (error || !data) {
    throw new Error("Unable to load demo SMTP settings from email configs.");
  }

  const security = data.security === "TLS" ? "TLS" : "SSL";
  const port = data.smtp_port ?? (security === "TLS" ? 587 : 465);

  return {
    host: data.smtp_host,
    port,
    secure: security === "SSL" && port === 465,
    user: data.smtp_username,
    pass: data.smtp_password,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const payload = await req.json();
    const {
      fullName = "",
      email = "",
      company = "",
      role = "",
      teamSize = "",
      crm = "",
      message = "",
      website = "",
    } = payload ?? {};

    if (website) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!fullName || !email || !company) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const useDbConfig = (Deno.env.get("DEMO_USE_DB_CONFIG") ?? "false") === "true";
    const smtpConfig = useDbConfig
      ? await loadDbSmtpConfig()
      : {
          host: getEnv("DEMO_SMTP_HOST"),
          port: Number(Deno.env.get("DEMO_SMTP_PORT") ?? "587"),
          user: getEnv("DEMO_SMTP_USER"),
          pass: getEnv("DEMO_SMTP_PASS"),
          secure: (Deno.env.get("DEMO_SMTP_SECURE") ?? "false") === "true",
        };

    const fromEmail = Deno.env.get("DEMO_FROM_EMAIL") ?? smtpConfig.user;
    const fromName = Deno.env.get("DEMO_FROM_NAME") ?? "EmailBridge Pro";
    const toEmail = Deno.env.get("DEMO_TO_EMAIL") ?? "info@theciovision.com";
    const confirmationFromEmail = Deno.env.get("DEMO_CONFIRM_FROM_EMAIL") ?? toEmail;

    const transporter = createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });

    await transporter.verify();

    const submittedAt = new Date().toISOString();
    const firstName = fullName.trim().split(/\s+/)[0] || fullName;
    const subject = `New demo request from ${company}`;
    const text = [
      "New demo request",
      "",
      `Name: ${fullName}`,
      `Email: ${email}`,
      `Company: ${company}`,
      `Role: ${role || "-"}`,
      `Team size: ${teamSize || "-"}`,
      `CRM: ${crm || "-"}`,
      `Message: ${message || "-"}`,
      `Submitted: ${submittedAt}`,
    ].join("\n");

    const safeMessage = escapeHtml(message || "-").replace(/\r?\n/g, "<br />");
    const html = `
      <h2>New demo request</h2>
      <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Company:</strong> ${escapeHtml(company)}</p>
      <p><strong>Role:</strong> ${escapeHtml(role || "-")}</p>
      <p><strong>Team size:</strong> ${escapeHtml(teamSize || "-")}</p>
      <p><strong>CRM:</strong> ${escapeHtml(crm || "-")}</p>
      <p><strong>Message:</strong><br />${safeMessage}</p>
      <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
    `;

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: toEmail,
      replyTo: `${fullName} <${email}>`,
      subject,
      text,
      html,
    });

    let confirmationSent = false;
    let confirmationError = "";

    try {
      const confirmationSubject = "Your EmailBridge Pro demo request";
      const safeCompany = escapeHtml(company);
      const safeRole = escapeHtml(role || "-");
      const safeTeamSize = escapeHtml(teamSize || "-");
      const safeCrm = escapeHtml(crm || "-");
      const safeFirstName = escapeHtml(firstName);
      const mailtoLink = `mailto:${toEmail}?subject=${encodeURIComponent(`Demo Request - ${company}`)}`;
      const confirmationText = [
        `Hi ${firstName},`,
        "",
        "Thanks for requesting a demo of EmailBridge Pro.",
        "We will reach out within 1 business day to schedule a time.",
        "",
        "Request summary:",
        `Company: ${company}`,
        `Role: ${role || "-"}`,
        `Team size: ${teamSize || "-"}`,
        `Primary CRM: ${crm || "-"}`,
        "",
        "If you need to update anything, reply to this email.",
      ].join("\n");

      const confirmationHtml = `
        <!doctype html>
        <html>
          <body style="margin:0; padding:0; background:#f4f7f6; font-family: Helvetica, Arial, sans-serif; color:#0f172a;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f7f6; padding:32px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 20px 50px rgba(15,23,42,0.12);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#ff5c3b 0%,#2dd4bf 100%); padding:28px 32px; color:#0f172a;">
                        <div style="font-size:12px; letter-spacing:0.3em; text-transform:uppercase; font-weight:700;">EmailBridge Pro</div>
                        <h1 style="margin:12px 0 6px; font-size:26px; line-height:1.2;">Your demo request is in.</h1>
                        <p style="margin:0; font-size:14px;">We will reach out within 1 business day to schedule a time.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:28px 32px;">
                        <p style="margin:0 0 16px; font-size:16px;">Hi ${safeFirstName},</p>
                        <p style="margin:0 0 18px; font-size:15px; color:#334155;">
                          Thanks for requesting a demo of EmailBridge Pro. We are preparing a tailored walkthrough based on your details.
                        </p>
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                          <tr>
                            <td style="padding:16px 18px 8px; font-size:11px; letter-spacing:0.25em; text-transform:uppercase; color:#64748b; font-weight:600;">
                              Request summary
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:0 18px 16px;">
                              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;">
                                <tr>
                                  <td style="padding:6px 0; color:#64748b;">Company</td>
                                  <td style="padding:6px 0; font-weight:600; color:#0f172a;">${safeCompany}</td>
                                </tr>
                                <tr>
                                  <td style="padding:6px 0; color:#64748b;">Role</td>
                                  <td style="padding:6px 0; font-weight:600; color:#0f172a;">${safeRole}</td>
                                </tr>
                                <tr>
                                  <td style="padding:6px 0; color:#64748b;">Team size</td>
                                  <td style="padding:6px 0; font-weight:600; color:#0f172a;">${safeTeamSize}</td>
                                </tr>
                                <tr>
                                  <td style="padding:6px 0; color:#64748b;">Primary CRM</td>
                                  <td style="padding:6px 0; font-weight:600; color:#0f172a;">${safeCrm}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        <div style="margin:20px 0 0; text-align:center;">
                          <a href="${mailtoLink}" style="display:inline-block; background:#ff5c3b; color:#0f172a; text-decoration:none; padding:12px 22px; border-radius:999px; font-weight:700; font-size:14px;">
                            Reply to confirm a time
                          </a>
                        </div>
                        <p style="margin:18px 0 0; font-size:13px; color:#64748b;">
                          Need to update anything? Just reply to this email and we will take care of it.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:16px 32px; background:#0f172a; color:#cbd5f5; font-size:12px;">
                        EmailBridge Pro - theciovision.com
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;

      await transporter.sendMail({
        from: `${fromName} <${confirmationFromEmail}>`,
        to: email,
        replyTo: `${fromName} <${toEmail}>`,
        subject: confirmationSubject,
        text: confirmationText,
        html: confirmationHtml,
      });

      confirmationSent = true;
    } catch (error) {
      confirmationError = error instanceof Error ? error.message : "Unknown error";
    }

    return new Response(
      JSON.stringify({
        success: true,
        confirmationSent,
        confirmationError: confirmationSent ? undefined : confirmationError,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
