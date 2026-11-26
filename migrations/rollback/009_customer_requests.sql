-- Only for empty, undeployed tables. Never discard customer records.
BEGIN;
LOCK TABLE public.aca_request_outbox, public.aca_customer_requests IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.aca_customer_requests) OR EXISTS (SELECT 1 FROM public.aca_request_outbox) THEN
 RAISE EXCEPTION 'Refusing rollback: customer records exist';
 END IF;
END $$;
DROP TABLE public.aca_request_outbox;
DROP TABLE public.aca_customer_requests;
COMMIT;
