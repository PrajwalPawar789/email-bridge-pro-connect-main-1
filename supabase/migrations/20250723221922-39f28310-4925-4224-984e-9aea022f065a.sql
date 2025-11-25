-- Add is_html column to email_templates table
ALTER TABLE public.email_templates 
ADD COLUMN is_html BOOLEAN NOT NULL DEFAULT false;