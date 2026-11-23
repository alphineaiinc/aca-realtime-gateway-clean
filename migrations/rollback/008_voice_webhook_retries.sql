-- Stop ingress and drain calls first. Do not roll back to unsafe tenant routing.
BEGIN;
ALTER TABLE public.voice_stream_grants DROP COLUMN token_ciphertext;
COMMIT;
