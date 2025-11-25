-- Add updated_at column to recipients table
ALTER TABLE public.recipients
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create a trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_recipients_updated_at ON public.recipients;

CREATE TRIGGER update_recipients_updated_at
    BEFORE UPDATE ON public.recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
