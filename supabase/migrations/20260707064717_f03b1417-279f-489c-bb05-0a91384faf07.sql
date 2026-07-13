
CREATE POLICY "pin-images authenticated read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'pin-images');

CREATE POLICY "pin-images owner insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pin-images' AND owner = auth.uid());

CREATE POLICY "pin-images owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'pin-images' AND owner = auth.uid())
WITH CHECK (bucket_id = 'pin-images' AND owner = auth.uid());

CREATE POLICY "pin-images owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'pin-images' AND owner = auth.uid());
