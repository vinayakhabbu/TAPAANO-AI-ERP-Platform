-- Add OpenAI API key column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS openai_api_key TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.organizations.openai_api_key IS 'User-provided OpenAI API key for AI features';