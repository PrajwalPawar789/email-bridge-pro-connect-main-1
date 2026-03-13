import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type JsonObject = Record<string, unknown>;

type FormField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

const safeObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as JsonObject) }
    : {};

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value ?? "").trim();
    if (candidate) return candidate;
  }
  return "";
};

const normalizeSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeFieldKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeFieldType = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["email", "textarea", "tel", "select"].includes(normalized)) return normalized;
  return "text";
};

const truncate = (value: unknown, limit: number) => String(value ?? "").trim().slice(0, limit);

const normalizeFields = (value: unknown): FormField[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item === "string") {
        const label = truncate(item, 120) || `Field ${index + 1}`;
        const key = normalizeFieldKey(label) || `field_${index + 1}`;
        return {
          id: key,
          key,
          label,
          type: label.toLowerCase().includes("email")
            ? "email"
            : label.toLowerCase().includes("phone")
              ? "tel"
              : label.toLowerCase().includes("message")
                ? "textarea"
                : "text",
          required: label.toLowerCase().includes("email") || label.toLowerCase().includes("name"),
        } satisfies FormField;
      }

      const row = safeObject(item);
      const key = normalizeFieldKey(row.key ?? row.name ?? row.id ?? row.label);
      if (!key) return null;

      return {
        id: truncate(row.id ?? key ?? `field_${index + 1}`, 120),
        key,
        label: truncate(row.label ?? key, 120),
        type: normalizeFieldType(row.type),
        required: Boolean(row.required),
      } satisfies FormField;
    })
    .filter((field): field is FormField => Boolean(field));
};

const sanitizeValues = (value: unknown) => {
  const raw = safeObject(value);
  const output: Record<string, string> = {};

  Object.entries(raw).forEach(([key, rawValue]) => {
    const normalizedKey = normalizeFieldKey(key);
    if (!normalizedKey) return;
    output[normalizedKey] = truncate(rawValue, 4000);
  });

  return output;
};

const inferNameFromEmail = (email: string) => {
  const localPart = email.split("@")[0] || "";
  const normalized = localPart.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "Landing Page Lead";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const findFieldValue = (values: Record<string, string>, ...keys: string[]) => {
  for (const key of keys) {
    const normalizedKey = normalizeFieldKey(key);
    if (!normalizedKey) continue;
    const candidate = truncate(values[normalizedKey], 500);
    if (candidate) return candidate;
  }
  return "";
};

const getRequiredFieldError = (fields: FormField[], values: Record<string, string>) => {
  for (const field of fields) {
    if (!field.required) continue;
    const candidate = truncate(values[field.key], 4000);
    if (candidate) continue;
    return field.label || field.key;
  }
  return "";
};

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = safeObject(await request.json().catch(() => ({})));
    const pageId = truncate(payload.pageId, 120);
    const pageSlug = normalizeSlug(truncate(payload.pageSlug, 160));
    const formId = truncate(payload.formId, 160);
    const honeypot = truncate(payload.website, 200);
    const values = sanitizeValues(payload.values);
    const context = safeObject(payload.context);

    if (honeypot) {
      return jsonResponse({ success: true, ignored: true });
    }

    if (!formId) {
      return jsonResponse({ error: "Form identifier is required" }, 400);
    }

    if (!pageId && !pageSlug) {
      return jsonResponse({ error: "Landing page identifier is required" }, 400);
    }

    let pageQuery = admin
      .from("landing_pages")
      .select("id, user_id, name, slug, published, blocks")
      .eq("published", true)
      .limit(1);

    if (pageId) {
      pageQuery = pageQuery.eq("id", pageId);
    } else {
      pageQuery = pageQuery.eq("slug", pageSlug);
    }

    const { data: pageRow, error: pageError } = await pageQuery.maybeSingle();
    if (pageError) {
      return jsonResponse({ error: pageError.message }, 400);
    }
    if (!pageRow) {
      return jsonResponse({ error: "Published landing page not found" }, 404);
    }

    const blocks = Array.isArray(pageRow.blocks) ? pageRow.blocks : [];
    const formBlock = blocks.find(
      (block) =>
        safeObject(block).type === "form" &&
        truncate(safeObject(block).id, 160) === formId
    );

    if (!formBlock) {
      return jsonResponse({ error: "Configured form block not found" }, 404);
    }

    const block = safeObject(formBlock);
    const content = safeObject(block.content);
    const fields = normalizeFields(content.fields);
    const requiredField = getRequiredFieldError(fields, values);
    if (requiredField) {
      return jsonResponse({ error: `${requiredField} is required` }, 400);
    }

    const email =
      findFieldValue(values, "email", "work_email", "email_address") ||
      truncate(payload.email, 320).toLowerCase();
    const normalizedEmail = email.toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return jsonResponse({ error: "A valid email address is required" }, 400);
    }

    const targetListId = truncate(content.targetListId, 120);
    if (!targetListId) {
      return jsonResponse({ error: "This landing page form is not connected to a destination list yet" }, 409);
    }

    const { data: emailListRow, error: listError } = await admin
      .from("email_lists")
      .select("id, user_id, name")
      .eq("id", targetListId)
      .eq("user_id", String(pageRow.user_id || ""))
      .maybeSingle();

    if (listError) {
      return jsonResponse({ error: listError.message }, 400);
    }
    if (!emailListRow) {
      return jsonResponse({ error: "The destination list could not be found" }, 404);
    }

    const fullName =
      findFieldValue(values, "full_name", "name") || inferNameFromEmail(normalizedEmail);
    const company = findFieldValue(values, "company", "organization");
    const phone = findFieldValue(values, "phone", "phone_number", "mobile");
    const jobTitle = findFieldValue(values, "job_title", "jobtitle", "role", "title");
    const country = findFieldValue(values, "country");
    const industry = findFieldValue(values, "industry");
    const submittedAt = new Date().toISOString();
    const sourceUrl = truncate(context.sourceUrl ?? context.url, 2000);
    const referrer = truncate(context.referrer, 2000);

    const { data: existingProspectRows, error: prospectLookupError } = await admin
      .from("prospects")
      .select("id, name, company, phone, job_title, country, industry")
      .eq("user_id", String(pageRow.user_id || ""))
      .ilike("email", normalizedEmail)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (prospectLookupError) {
      return jsonResponse({ error: prospectLookupError.message }, 400);
    }

    const existingProspect = Array.isArray(existingProspectRows)
      ? existingProspectRows[0] ?? null
      : null;

    let prospectId = "";
    if (existingProspect?.id) {
      const { data: updatedProspect, error: updateError } = await admin
        .from("prospects")
        .update({
          name: fullName || existingProspect.name || inferNameFromEmail(normalizedEmail),
          email: normalizedEmail,
          company: company || existingProspect.company || null,
          phone: phone || existingProspect.phone || null,
          job_title: jobTitle || existingProspect.job_title || null,
          country: country || existingProspect.country || null,
          industry: industry || existingProspect.industry || null,
          last_activity_at: submittedAt,
          last_activity_type: "landing_page_submission",
        })
        .eq("id", existingProspect.id)
        .select("id")
        .single();

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400);
      }
      prospectId = String(updatedProspect?.id || existingProspect.id);
    } else {
      const { data: insertedProspect, error: insertError } = await admin
        .from("prospects")
        .insert({
          user_id: String(pageRow.user_id || ""),
          name: fullName || inferNameFromEmail(normalizedEmail),
          email: normalizedEmail,
          company: company || null,
          phone: phone || null,
          job_title: jobTitle || null,
          country: country || null,
          industry: industry || null,
          last_activity_at: submittedAt,
          last_activity_type: "landing_page_submission",
        })
        .select("id")
        .single();

      if (insertError) {
        return jsonResponse({ error: insertError.message }, 400);
      }
      prospectId = String(insertedProspect?.id || "");
    }

    const { data: existingLinkRows, error: linkLookupError } = await admin
      .from("email_list_prospects")
      .select("id")
      .eq("list_id", targetListId)
      .eq("prospect_id", prospectId)
      .limit(1);

    if (linkLookupError) {
      return jsonResponse({ error: linkLookupError.message }, 400);
    }

    const existingLink = Array.isArray(existingLinkRows) ? existingLinkRows[0] ?? null : null;
    if (!existingLink?.id) {
      const { error: linkInsertError } = await admin
        .from("email_list_prospects")
        .insert({
          list_id: targetListId,
          prospect_id: prospectId,
        });

      if (linkInsertError) {
        return jsonResponse({ error: linkInsertError.message }, 400);
      }
    }

    const metadata = {
      page_name: pickString(pageRow.name),
      page_slug: pickString(pageRow.slug),
      list_name: pickString(emailListRow.name),
      user_agent: truncate(context.userAgent, 1000) || truncate(request.headers.get("user-agent"), 1000),
      submitted_from_host: truncate(context.host, 255),
      submitted_from_path: truncate(context.path, 1000),
      locale: truncate(context.locale, 255),
    };

    const { error: submissionError } = await admin
      .from("landing_page_form_submissions")
      .insert({
        user_id: String(pageRow.user_id || ""),
        landing_page_id: String(pageRow.id || ""),
        email_list_id: targetListId,
        prospect_id: prospectId,
        form_block_id: formId,
        full_name: fullName || null,
        email: normalizedEmail,
        company: company || null,
        phone: phone || null,
        job_title: jobTitle || null,
        source_url: sourceUrl || null,
        referrer: referrer || null,
        utm_source: truncate(context.utmSource, 255) || null,
        utm_medium: truncate(context.utmMedium, 255) || null,
        utm_campaign: truncate(context.utmCampaign, 255) || null,
        utm_term: truncate(context.utmTerm, 255) || null,
        utm_content: truncate(context.utmContent, 255) || null,
        payload: values,
        metadata,
        submitted_at: submittedAt,
      });

    if (submissionError) {
      return jsonResponse({ error: submissionError.message }, 400);
    }

    return jsonResponse({
      success: true,
      pageId: String(pageRow.id || ""),
      prospectId,
      listId: targetListId,
      listName: pickString(emailListRow.name),
      submittedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
