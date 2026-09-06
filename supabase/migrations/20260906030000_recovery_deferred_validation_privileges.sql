BEGIN;

-- Deferred triggers fire when the outer transaction commits, after a posting
-- SECURITY DEFINER RPC has returned to the authenticated role. Their wrappers
-- need owner rights to call private validators and inspect the complete graph.
-- Keep the internal functions inaccessible as client-callable RPCs.
DO $$
DECLARE v_name text; v_routine regprocedure;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'validate_posted_journal',
    'validate_customer_invoice_trigger',
    'validate_customer_credit_note_trigger',
    'validate_customer_receipt_trigger',
    'validate_customer_receipt_correction_trigger',
    'validate_customer_receipt_replacement_trigger',
    'validate_supplier_bill_trigger',
    'validate_supplier_bill_credit_trigger',
    'validate_supplier_payment_trigger',
    'validate_supplier_payment_correction_trigger',
    'validate_supplier_payment_replacement_trigger'
  ] LOOP
    v_routine := to_regprocedure(format('public.%I()',v_name));
    IF v_routine IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_routine AND prorettype='trigger'::regtype) THEN
      RAISE EXCEPTION 'unexpected deferred validator signature: %',v_name;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER',v_routine);
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, auth, pg_temp',v_routine);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',v_routine);
  END LOOP;
END;
$$;

COMMIT;
