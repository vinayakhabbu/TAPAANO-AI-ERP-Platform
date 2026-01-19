-- Create storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents', 
  'employee-documents', 
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- RLS policies for employee documents bucket
-- Users can upload documents to their org's folder
CREATE POLICY "Users can upload employee documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
);

-- Users can view documents in their org's folder
CREATE POLICY "Users can view employee documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
);

-- Users can delete documents in their org's folder (admin/moderator only would be better but keeping simple)
CREATE POLICY "Users can delete employee documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM public.profiles WHERE id = auth.uid())
);