-- Apply after 007, before the hardened application. No grants/customer rows seeded.
BEGIN;
ALTER TABLE public.voice_stream_grants ADD COLUMN token_ciphertext TEXT;
COMMIT;
