-- Tax assessments are sourced, independently approved amounts. No jurisdiction
-- or tax rate is inferred from a customer's address or from a journal balance.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.pre_tax_validate(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO pre_tax_validate;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO pre_tax_snapshot;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO pre_tax_execute;
  ALTER FUNCTION public.post_customer_invoice(uuid,uuid,text,date,date,text,numeric,text,jsonb,text) RENAME TO pre_tax_post_invoice;
  ALTER FUNCTION public.post_supplier_bill(uuid,uuid,text,date,date,text,numeric,text,jsonb,text) RENAME TO pre_tax_post_bill;
  ALTER FUNCTION public.customer_credit_preview(uuid,jsonb) RENAME TO pre_tax_credit_preview;
  ALTER FUNCTION public.get_customer_adjustments(uuid,date) RENAME TO pre_tax_adjustments;
  ALTER FUNCTION public.get_finance_close_check(uuid,date,date) RENAME TO pre_tax_close;
 END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.finance_tax_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,
 sales_account uuid NOT NULL,recoverable_account uuid NOT NULL,expense_account uuid NOT NULL,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(entity_id),UNIQUE(request_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,sales_account) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,recoverable_account) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,expense_account) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 CHECK(sales_account<>recoverable_account AND sales_account<>expense_account AND recoverable_account<>expense_account)
);
CREATE TABLE IF NOT EXISTS public.finance_tax_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('AR','AP')),
 invoice_id uuid,bill_id uuid,policy_id uuid NOT NULL,request_id uuid NOT NULL,
 assessment jsonb NOT NULL,source_lines jsonb NOT NULL,line_bindings jsonb NOT NULL,journal_lines jsonb NOT NULL,
 subtotal numeric(15,2) NOT NULL,tax numeric(15,2) NOT NULL,total numeric(15,2) NOT NULL,
 UNIQUE(org_id,id),UNIQUE(invoice_id),UNIQUE(bill_id),UNIQUE(request_id),
 FOREIGN KEY(org_id,entity_id,invoice_id) REFERENCES public.invoices(org_id,entity_id,id),
 FOREIGN KEY(org_id,entity_id,bill_id) REFERENCES public.bills(org_id,entity_id,id),
 FOREIGN KEY(org_id,policy_id) REFERENCES public.finance_tax_policies(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 CHECK((kind='AR' AND invoice_id IS NOT NULL AND bill_id IS NULL) OR (kind='AP' AND bill_id IS NOT NULL AND invoice_id IS NULL)),
 CHECK(subtotal>0 AND tax>=0 AND total=subtotal+tax AND total::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE TABLE IF NOT EXISTS public.finance_tax_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,policy_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('SALES_PAYMENT','RECOVERABLE_REFUND')),as_of date NOT NULL,amount numeric(15,2) NOT NULL CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 cash_account uuid NOT NULL,reference text NOT NULL,journal_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL UNIQUE,
 reversal_date date,reversal_journal uuid UNIQUE,reversal_request uuid UNIQUE,
 UNIQUE(org_id,id),UNIQUE(org_id,reference),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),FOREIGN KEY(org_id,policy_id) REFERENCES public.finance_tax_policies(org_id,id),
 FOREIGN KEY(org_id,cash_account) REFERENCES public.accounts(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(journal_id) REFERENCES public.journal_entries(id),FOREIGN KEY(reversal_journal) REFERENCES public.journal_entries(id),
 CHECK((reversal_date IS NULL AND reversal_journal IS NULL AND reversal_request IS NULL) OR (reversal_date>=as_of AND reversal_journal IS NOT NULL AND reversal_request IS NOT NULL))
);

CREATE OR REPLACE FUNCTION public.validate_tax_policy(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.finance_tax_policies%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.finance_tax_policies WHERE id=p_id;
 IF p.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=p.request_id AND org_id=p.org_id AND entity_id=p.entity_id AND kind='TAX_POLICY' AND state IN ('EXECUTING','APPROVED') AND requested_by<>decided_by AND payload=jsonb_build_object('sales_account',p.sales_account,'recoverable_account',p.recoverable_account,'expense_account',p.expense_account)) OR
  NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p.sales_account AND org_id=p.org_id AND account_type='liability') OR
  NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p.recoverable_account AND org_id=p.org_id AND account_type='asset') OR
  NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p.expense_account AND org_id=p.org_id AND account_type='expense') THEN RAISE EXCEPTION 'tax policy approval or account graph is invalid'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.tax_assessment(p_entity uuid,p_kind text,p_date date,p_lines jsonb,p_tax jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.finance_tax_policies%ROWTYPE;l jsonb;t jsonb;n integer:=0;net numeric:=0;amount numeric:=0;basis numeric;line_net numeric;account uuid;parts jsonb:='[]';seen text[]:='{}';key text;
BEGIN
 SELECT * INTO p FROM public.finance_tax_policies WHERE entity_id=p_entity;
 IF p.id IS NULL THEN RAISE EXCEPTION 'approve tax control accounts first'; END IF;
 PERFORM public.validate_tax_policy(p.id);
 IF p_kind NOT IN ('AR','AP') OR p_date IS NULL OR p_date>CURRENT_DATE OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'tax document requires a valid date and one to 200 lines'; END IF;
 IF p_tax-ARRAY['source','reference','assessed_on','evidence','lines']<>'{}'::jsonb OR jsonb_typeof(p_tax) IS DISTINCT FROM 'object' OR
  coalesce(p_tax->>'source','') NOT IN ('PROVIDER','REVIEWED') OR length(btrim(coalesce(p_tax->>'reference',''))) NOT BETWEEN 1 AND 160 OR
  length(btrim(coalesce(p_tax->>'evidence',''))) NOT BETWEEN 1 AND 2000 OR coalesce(p_tax->>'assessed_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
  (p_tax->>'assessed_on')::date>p_date OR jsonb_typeof(p_tax->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_tax->'lines') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'dated tax assessment and source evidence required'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF l-ARRAY['description','quantity','unit_price']<>'{}'::jsonb OR length(btrim(coalesce(l->>'description',''))) NOT BETWEEN 1 AND 500 OR
   coalesce(l->>'quantity','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' OR coalesce(l->>'unit_price','') !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' OR
   jsonb_typeof(l->'quantity') IS DISTINCT FROM 'string' OR jsonb_typeof(l->'unit_price') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'tax document lines require exact positive quantity and price'; END IF;
  line_net:=round((l->>'quantity')::numeric*(l->>'unit_price')::numeric,2);n:=n+1;
  IF line_net<=0 OR line_net>9999999999999.99 THEN RAISE EXCEPTION 'tax document line amount outside supported range'; END IF;
  net:=net+line_net;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_tax->'lines') a WHERE a->>'line_number'=n::text) THEN RAISE EXCEPTION 'every source line needs a tax or exemption assessment'; END IF;
 END LOOP;
 FOR t IN SELECT value FROM jsonb_array_elements(p_tax->'lines') LOOP
  IF t-ARRAY['line_number','jurisdiction','treatment','basis','amount']<>'{}'::jsonb OR coalesce(t->>'line_number','') !~ '^[1-9][0-9]{0,2}$' OR (t->>'line_number')::int>n OR
   coalesce(t->>'jurisdiction','') !~ '^US-[A-Z0-9][A-Z0-9 ._/-]{0,77}$' OR jsonb_typeof(t->'basis') IS DISTINCT FROM 'string' OR jsonb_typeof(t->'amount') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'tax component requires its original line, US jurisdiction and exact amounts'; END IF;
  key:=(t->>'line_number')||':'||(t->>'jurisdiction');
  IF key=ANY(seen) THEN RAISE EXCEPTION 'duplicate tax jurisdiction on a source line'; END IF;seen:=array_append(seen,key);
  l:=p_lines->((t->>'line_number')::int-1);line_net:=round((l->>'quantity')::numeric*(l->>'unit_price')::numeric,2);
  basis:=public.cash_amount(t->>'basis');
  IF basis<0 OR basis>line_net OR public.cash_amount(t->>'amount')<0 OR public.cash_amount(t->>'amount')>basis OR
   (p_kind='AR' AND coalesce(t->>'treatment','') NOT IN ('SALES','EXEMPT')) OR (p_kind='AP' AND coalesce(t->>'treatment','') NOT IN ('RECOVERABLE','EXPENSE','EXEMPT')) OR
   (t->>'treatment'='EXEMPT' AND (public.cash_amount(t->>'amount')<>0 OR basis<>0)) THEN RAISE EXCEPTION 'tax treatment, basis or assessed amount is invalid'; END IF;
  account:=CASE t->>'treatment' WHEN 'SALES' THEN p.sales_account WHEN 'RECOVERABLE' THEN p.recoverable_account WHEN 'EXPENSE' THEN p.expense_account END;
  amount:=amount+public.cash_amount(t->>'amount');
  parts:=parts||jsonb_build_array(t||jsonb_build_object('account_id',account));
 END LOOP;
 IF net+amount>9999999999999.99 THEN RAISE EXCEPTION 'tax document total outside supported range'; END IF;
 RETURN jsonb_build_object('policyId',p.id,'assessment',p_tax,'lines',p_lines,'parts',parts,'subtotal',round(net,2)::text,'tax',round(amount,2)::text,'total',round(net+amount,2)::text);
END; $$;

CREATE OR REPLACE FUNCTION public.attach_document_tax(p_document uuid,p_kind text,p_lines jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.finance_requests%ROWTYPE;d record;s jsonb;jlines jsonb;bindings jsonb;part record;control uuid;operating uuid;n integer;
BEGIN
 SELECT * INTO r FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid();
 IF r.id IS NULL OR r.kind NOT IN ('TAX_INVOICE','TAX_BILL','CONTRACT_BILL') OR NOT r.payload?'tax' THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_tax_documents WHERE invoice_id=p_document OR bill_id=p_document) THEN RETURN; END IF;
 IF p_kind='AR' THEN
  SELECT id,org_id,entity_id,issue_date,journal_entry_id,subtotal,posted_by INTO d FROM public.invoices WHERE id=p_document;
  SELECT ar_account_id,revenue_account_id INTO control,operating FROM public.entity_invoice_account_controls WHERE entity_id=r.entity_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'number',line_number,'net',line_total::text) ORDER BY line_number) INTO bindings FROM public.invoice_lines WHERE invoice_id=p_document;
 ELSE
  SELECT id,org_id,entity_id,issue_date,journal_entry_id,subtotal,posted_by INTO d FROM public.bills WHERE id=p_document;
  SELECT ap_account_id,expense_account_id INTO control,operating FROM public.entity_supplier_bill_account_controls WHERE entity_id=r.entity_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'number',line_number,'net',line_total::text) ORDER BY line_number) INTO bindings FROM public.bill_lines WHERE bill_id=p_document;
 END IF;
 IF d.org_id IS DISTINCT FROM r.org_id OR d.entity_id IS DISTINCT FROM r.entity_id OR d.posted_by IS DISTINCT FROM auth.uid() OR (p_kind='AP') IS DISTINCT FROM (r.kind='TAX_BILL') THEN RAISE EXCEPTION 'tax document approval ownership mismatch'; END IF;
 s:=public.tax_assessment(r.entity_id,p_kind,d.issue_date,p_lines,r.payload->'tax');
 IF s IS DISTINCT FROM r.source_snapshot->'taxAssessment' OR d.subtotal IS DISTINCT FROM (s->>'subtotal')::numeric THEN RAISE EXCEPTION 'tax source no longer matches its approved assessment'; END IF;
 jlines:=CASE p_kind WHEN 'AR' THEN jsonb_build_array(jsonb_build_object('account_id',control,'debit',s->>'total','credit','0.00'),jsonb_build_object('account_id',operating,'debit','0.00','credit',s->>'subtotal')) ELSE jsonb_build_array(jsonb_build_object('account_id',operating,'debit',s->>'subtotal','credit','0.00'),jsonb_build_object('account_id',control,'debit','0.00','credit',s->>'total')) END;
 FOR part IN SELECT (a->>'account_id')::uuid AS account,sum((a->>'amount')::numeric) AS amount FROM jsonb_array_elements(s->'parts') a WHERE (a->>'amount')::numeric>0 GROUP BY 1 ORDER BY 1 LOOP
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=part.account AND org_id=r.org_id AND is_active) THEN RAISE EXCEPTION 'approved tax posting account is inactive'; END IF;
  jlines:=jlines||jsonb_build_array(jsonb_build_object('account_id',part.account,'debit',CASE p_kind WHEN 'AP' THEN round(part.amount,2)::text ELSE '0.00' END,'credit',CASE p_kind WHEN 'AR' THEN round(part.amount,2)::text ELSE '0.00' END));
 END LOOP;
 INSERT INTO public.finance_tax_documents(org_id,entity_id,kind,invoice_id,bill_id,policy_id,request_id,assessment,source_lines,line_bindings,journal_lines,subtotal,tax,total)
  VALUES(r.org_id,r.entity_id,p_kind,CASE WHEN p_kind='AR' THEN d.id END,CASE WHEN p_kind='AP' THEN d.id END,(s->>'policyId')::uuid,r.id,r.payload->'tax',p_lines,bindings,jlines,(s->>'subtotal')::numeric,(s->>'tax')::numeric,(s->>'total')::numeric);
 -- The base posting and these tax lines are one approval transaction; no issued
 -- historical document can enter this path or be retaxed later.
 IF p_kind='AR' THEN UPDATE public.invoices SET tax=(s->>'tax')::numeric,total=(s->>'total')::numeric,functional_total=(s->>'total')::numeric WHERE id=d.id;
 ELSE UPDATE public.bills SET tax=(s->>'tax')::numeric,total=(s->>'total')::numeric,functional_total=(s->>'total')::numeric WHERE id=d.id;END IF;
 UPDATE public.journal_lines SET debit=CASE WHEN p_kind='AR' THEN (s->>'total')::numeric ELSE 0 END,credit=CASE WHEN p_kind='AP' THEN (s->>'total')::numeric ELSE 0 END WHERE journal_entry_id=d.journal_entry_id AND account_id=control;
 n:=2;
 FOR part IN SELECT value FROM jsonb_array_elements(jlines) WITH ORDINALITY a(value,ord) WHERE ord>2 LOOP
  n:=n+1;INSERT INTO public.journal_lines(journal_entry_id,account_id,debit,credit,memo,org_id,entity_id,line_number) VALUES(d.journal_entry_id,(part.value->>'account_id')::uuid,(part.value->>'debit')::numeric,(part.value->>'credit')::numeric,'Assessed tax',r.org_id,r.entity_id,n);
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.post_customer_invoice(p_entity_id uuid,p_customer_id uuid,p_invoice_number text,p_issue_date date,p_due_date date,p_currency text,p_tax numeric,p_notes text,p_lines jsonb,p_idempotency_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE id uuid;
BEGIN
 id:=public.pre_tax_post_invoice(p_entity_id,p_customer_id,p_invoice_number,p_issue_date,p_due_date,p_currency,p_tax,p_notes,p_lines,p_idempotency_key);
 PERFORM public.attach_document_tax(id,'AR',p_lines);PERFORM public.validate_customer_invoice_graph(id);RETURN id;
END; $$;
CREATE OR REPLACE FUNCTION public.post_supplier_bill(p_entity_id uuid,p_vendor_id uuid,p_bill_number text,p_issue_date date,p_due_date date,p_currency text,p_tax numeric,p_notes text,p_lines jsonb,p_idempotency_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE id uuid;
BEGIN
 id:=public.pre_tax_post_bill(p_entity_id,p_vendor_id,p_bill_number,p_issue_date,p_due_date,p_currency,p_tax,p_notes,p_lines,p_idempotency_key);
 PERFORM public.attach_document_tax(id,'AP',p_lines);PERFORM public.validate_supplier_bill_graph(id);RETURN id;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_document_tax(p_kind text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.finance_tax_documents%ROWTYPE;r public.finance_requests%ROWTYPE;d record;s jsonb;bindings jsonb;actual jsonb;expected jsonb;control uuid;operating uuid;part record;jlines jsonb;
BEGIN
 IF p_kind='AR' THEN
  SELECT id,org_id,entity_id,customer_id AS party,invoice_number AS number,issue_date,due_date,notes,subtotal,tax,total,journal_entry_id,accounting_event_id,currency INTO d FROM public.invoices WHERE id=p_id;
  SELECT * INTO t FROM public.finance_tax_documents WHERE invoice_id=p_id;
  SELECT ar_account_id,revenue_account_id INTO control,operating FROM public.entity_invoice_account_controls WHERE entity_id=d.entity_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'number',line_number,'net',line_total::text) ORDER BY line_number) INTO bindings FROM public.invoice_lines WHERE invoice_id=p_id;
 ELSE
  SELECT id,org_id,entity_id,vendor_id AS party,bill_number AS number,issue_date,due_date,notes,subtotal,tax,total,journal_entry_id,accounting_event_id,currency INTO d FROM public.bills WHERE id=p_id;
  SELECT * INTO t FROM public.finance_tax_documents WHERE bill_id=p_id;
  SELECT ap_account_id,expense_account_id INTO control,operating FROM public.entity_supplier_bill_account_controls WHERE entity_id=d.entity_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'number',line_number,'net',line_total::text) ORDER BY line_number) INTO bindings FROM public.bill_lines WHERE bill_id=p_id;
 END IF;
 IF t.id IS NULL THEN
  IF d.tax IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'tax-bearing document has no approved assessment'; END IF;RETURN false;
 END IF;
 SELECT * INTO r FROM public.finance_requests WHERE id=t.request_id;
 s:=public.tax_assessment(t.entity_id,t.kind,d.issue_date,t.source_lines,t.assessment);
 IF t.org_id IS DISTINCT FROM d.org_id OR t.entity_id IS DISTINCT FROM d.entity_id OR t.kind IS DISTINCT FROM p_kind OR
  t.subtotal IS DISTINCT FROM d.subtotal OR t.tax IS DISTINCT FROM d.tax OR t.total IS DISTINCT FROM d.total OR t.line_bindings IS DISTINCT FROM bindings OR
  t.policy_id IS DISTINCT FROM (s->>'policyId')::uuid OR t.subtotal IS DISTINCT FROM (s->>'subtotal')::numeric OR t.tax IS DISTINCT FROM (s->>'tax')::numeric OR
  r.id IS NULL OR r.org_id IS DISTINCT FROM t.org_id OR r.entity_id IS DISTINCT FROM t.entity_id OR r.state NOT IN ('EXECUTING','APPROVED') OR r.requested_by=r.decided_by OR
  r.payload->'tax' IS DISTINCT FROM t.assessment OR r.source_snapshot->'taxAssessment' IS DISTINCT FROM s OR
  (p_kind='AP' AND r.kind<>'TAX_BILL') OR (p_kind='AR' AND r.kind NOT IN ('TAX_INVOICE','CONTRACT_BILL')) THEN RAISE EXCEPTION 'tax assessment approval or document graph is invalid'; END IF;
 IF r.kind IN ('TAX_INVOICE','TAX_BILL') AND (r.payload->'lines' IS DISTINCT FROM t.source_lines OR r.payload->>'party_id' IS DISTINCT FROM d.party::text OR r.payload->>'number' IS DISTINCT FROM d.number OR (r.payload->>'date')::date IS DISTINCT FROM d.issue_date OR (r.payload->>'due_date')::date IS DISTINCT FROM d.due_date OR r.payload->>'notes' IS DISTINCT FROM d.notes) THEN RAISE EXCEPTION 'tax document differs from the approved source'; END IF;
 IF r.kind='CONTRACT_BILL' AND NOT EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE id=(r.payload->>'cycle_id')::uuid AND org_id=t.org_id AND price=t.subtotal AND (invoice_id=p_id OR (invoice_id IS NULL AND r.state='EXECUTING'))) THEN RAISE EXCEPTION 'tax-bearing contract invoice source is invalid'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(t.source_lines) WITH ORDINALITY a(value,ord) FULL JOIN jsonb_array_elements(bindings) b ON (b->>'number')::int=a.ord WHERE a.value IS NULL OR b IS NULL OR round((a.value->>'quantity')::numeric*(a.value->>'unit_price')::numeric,2) IS DISTINCT FROM (b->>'net')::numeric) THEN RAISE EXCEPTION 'tax source lines do not reconcile to the document'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(t.source_lines) WITH ORDINALITY a(value,ord) JOIN (SELECT line_number,description,quantity,unit_price FROM public.invoice_lines WHERE p_kind='AR' AND invoice_id=p_id UNION ALL SELECT line_number,description,quantity,unit_price FROM public.bill_lines WHERE p_kind='AP' AND bill_id=p_id) l ON l.line_number=a.ord WHERE l.description IS DISTINCT FROM a.value->>'description' OR l.quantity IS DISTINCT FROM (a.value->>'quantity')::numeric OR l.unit_price IS DISTINCT FROM (a.value->>'unit_price')::numeric) THEN RAISE EXCEPTION 'assessed document line terms differ from the approved source';END IF;
 jlines:=CASE p_kind WHEN 'AR' THEN jsonb_build_array(jsonb_build_object('account_id',control,'debit',s->>'total','credit','0.00'),jsonb_build_object('account_id',operating,'debit','0.00','credit',s->>'subtotal')) ELSE jsonb_build_array(jsonb_build_object('account_id',operating,'debit',s->>'subtotal','credit','0.00'),jsonb_build_object('account_id',control,'debit','0.00','credit',s->>'total')) END;
 FOR part IN SELECT (a->>'account_id')::uuid AS account,sum((a->>'amount')::numeric) AS amount FROM jsonb_array_elements(s->'parts') a WHERE (a->>'amount')::numeric>0 GROUP BY 1 ORDER BY 1 LOOP
  jlines:=jlines||jsonb_build_array(jsonb_build_object('account_id',part.account,'debit',CASE p_kind WHEN 'AP' THEN round(part.amount,2)::text ELSE '0.00' END,'credit',CASE p_kind WHEN 'AR' THEN round(part.amount,2)::text ELSE '0.00' END));
 END LOOP;
 SELECT jsonb_agg(jsonb_build_array(account_id,debit::numeric,credit::numeric) ORDER BY account_id,debit,credit) INTO actual FROM public.journal_lines WHERE journal_entry_id=d.journal_entry_id;
 SELECT jsonb_agg(jsonb_build_array((a->>'account_id')::uuid,(a->>'debit')::numeric,(a->>'credit')::numeric) ORDER BY (a->>'account_id')::uuid,(a->>'debit')::numeric,(a->>'credit')::numeric) INTO expected FROM jsonb_array_elements(jlines) a;
 IF t.journal_lines IS DISTINCT FROM jlines OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'tax-inclusive journal lines do not reconcile'; END IF;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.tax_request_assessment(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.finance_contract_cycles%ROWTYPE;contract public.finance_contracts%ROWTYPE;lines jsonb;day date;
BEGIN
 IF p_kind='CONTRACT_BILL' THEN
  SELECT * INTO c FROM public.finance_contract_cycles WHERE id=(p_payload->>'cycle_id')::uuid;
  SELECT * INTO contract FROM public.finance_contracts WHERE id=c.contract_id AND entity_id=p_entity;
  IF contract.id IS NULL OR c.price<=0 THEN RAISE EXCEPTION 'tax-bearing billing requires a positive finalized cycle'; END IF;
  lines:=jsonb_build_array(jsonb_build_object('description',contract.reference||' cycle '||c.cycle_number,'quantity','1','unit_price',c.price::text));day:=(p_payload->>'issue_date')::date;
 ELSE lines:=p_payload->'lines';day:=(p_payload->>'date')::date;END IF;
 RETURN public.tax_assessment(p_entity,CASE WHEN p_kind='TAX_BILL' THEN 'AP' ELSE 'AR' END,day,lines,p_payload->'tax');
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.get_user_org_id();a uuid;t public.finance_tax_documents%ROWTYPE;s public.finance_tax_settlements%ROWTYPE;
BEGIN
 IF p_kind='CONTRACT_CREATE' AND p_payload?'tax_required' THEN
  IF jsonb_typeof(p_payload->'tax_required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'contract tax assessment requirement must be explicit';END IF;
  PERFORM public.pre_tax_validate(p_entity,p_kind,p_payload-'tax_required');RETURN p_payload;
 END IF;
 IF p_kind='CONTRACT_BILL' AND NOT p_payload?'tax' AND EXISTS(SELECT 1 FROM public.finance_contract_cycles c JOIN public.finance_contracts contract ON contract.id=c.contract_id WHERE c.id=(p_payload->>'cycle_id')::uuid AND contract.terms->>'tax_required'='true') THEN RAISE EXCEPTION 'this contract requires a fresh tax or exemption assessment for every bill';END IF;
 IF p_kind='TAX_POLICY' THEN
  IF NOT public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.finance_tax_policies WHERE entity_id=p_entity) THEN RAISE EXCEPTION 'tax accounts require two administrators and a new policy'; END IF;
  IF p_payload-ARRAY['sales_account','recoverable_account','expense_account']<>'{}'::jsonb OR
   NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'sales_account')::uuid AND org_id=org AND is_active AND account_type='liability') OR
   NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'recoverable_account')::uuid AND org_id=org AND is_active AND account_type='asset') OR
   NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'expense_account')::uuid AND org_id=org AND is_active AND account_type='expense') THEN RAISE EXCEPTION 'dedicated active sales-tax liability, recoverable-tax asset and tax-expense accounts required'; END IF;
  FOREACH a IN ARRAY ARRAY[(p_payload->>'sales_account')::uuid,(p_payload->>'recoverable_account')::uuid,(p_payload->>'expense_account')::uuid] LOOP
   IF EXISTS(SELECT 1 FROM public.journal_lines WHERE account_id=a AND entity_id=p_entity) OR EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=p_entity AND account_id=a) OR
    EXISTS(SELECT 1 FROM public.entity_invoice_account_controls WHERE entity_id=p_entity AND a IN (ar_account_id,revenue_account_id)) OR
    EXISTS(SELECT 1 FROM public.entity_supplier_bill_account_controls WHERE entity_id=p_entity AND a IN (ap_account_id,expense_account_id)) OR
    EXISTS(SELECT 1 FROM public.finance_customer_credit_controls WHERE entity_id=p_entity AND liability_account_id=a) THEN RAISE EXCEPTION 'tax accounts must be dedicated and unused'; END IF;
  END LOOP;
 ELSIF p_kind='TAX_DOCUMENT_CREDIT' THEN
  SELECT * INTO t FROM public.finance_tax_documents WHERE id=(p_payload->>'document_id')::uuid AND entity_id=p_entity AND org_id=org;
  IF t.id IS NULL OR p_payload-ARRAY['document_id','number','date']<>'{}'::jsonb OR length(btrim(coalesce(p_payload->>'number',''))) NOT BETWEEN 1 AND 80 OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'date')::date>CURRENT_DATE THEN RAISE EXCEPTION 'assessed document and dated full-credit evidence required'; END IF;
  IF t.kind='AR' AND EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE invoice_id=t.invoice_id) THEN RAISE EXCEPTION 'use the contract credit workflow for a contract invoice'; END IF;
 ELSIF p_kind='TAX_SETTLE' THEN
  IF p_payload-ARRAY['kind','date','amount','cash_account','reference']<>'{}'::jsonb OR coalesce(p_payload->>'kind','') NOT IN ('SALES_PAYMENT','RECOVERABLE_REFUND') OR
   coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'date')::date>CURRENT_DATE OR jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'string' OR public.cash_amount(p_payload->>'amount')<=0 OR
   length(btrim(coalesce(p_payload->>'reference',''))) NOT BETWEEN 1 AND 160 OR NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE org_id=org AND entity_id=p_entity AND account_id=(p_payload->>'cash_account')::uuid) OR
   NOT EXISTS(SELECT 1 FROM public.finance_tax_policies WHERE entity_id=p_entity AND org_id=org) THEN RAISE EXCEPTION 'tax settlement requires a confirmed bank amount, registered cash account and policy'; END IF;
 ELSIF p_kind='TAX_SETTLEMENT_REVERSE' THEN
  SELECT * INTO s FROM public.finance_tax_settlements WHERE id=(p_payload->>'settlement_id')::uuid AND entity_id=p_entity AND org_id=org;
  IF s.id IS NULL OR s.reversal_date IS NOT NULL OR p_payload-ARRAY['settlement_id','date']<>'{}'::jsonb OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'date')::date NOT BETWEEN s.as_of AND CURRENT_DATE THEN RAISE EXCEPTION 'active tax settlement and subsequent correction date required'; END IF;
 ELSIF p_kind IN ('TAX_INVOICE','TAX_BILL') THEN
  IF p_payload-ARRAY['party_id','number','date','due_date','notes','lines','tax']<>'{}'::jsonb OR length(btrim(coalesce(p_payload->>'number',''))) NOT BETWEEN 1 AND 80 OR
   coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'due_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'due_date')::date<(p_payload->>'date')::date OR
   (p_kind='TAX_INVOICE' AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=(p_payload->>'party_id')::uuid AND org_id=org)) OR
   (p_kind='TAX_BILL' AND NOT EXISTS(SELECT 1 FROM public.vendors WHERE id=(p_payload->>'party_id')::uuid AND org_id=org)) THEN RAISE EXCEPTION 'tax document party, number and dates are required'; END IF;
  PERFORM public.tax_request_assessment(p_entity,p_kind,p_payload);
 ELSIF p_kind='CONTRACT_BILL' AND p_payload?'tax' THEN
  PERFORM public.pre_tax_validate(p_entity,p_kind,p_payload-'tax');PERFORM public.tax_request_assessment(p_entity,p_kind,p_payload);
 ELSE RETURN public.pre_tax_validate(p_entity,p_kind,p_payload);END IF;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
 IF p_kind='TAX_POLICY' THEN RETURN jsonb_build_object('policy',(SELECT to_jsonb(p) FROM public.finance_tax_policies p WHERE entity_id=p_entity));END IF;
 IF p_kind='TAX_DOCUMENT_CREDIT' THEN RETURN jsonb_build_object('document',(SELECT to_jsonb(t) FROM public.finance_tax_documents t WHERE id=(p_payload->>'document_id')::uuid),'register',public.get_tax_register(p_entity,DATE '0001-01-01',(p_payload->>'date')::date));END IF;
 IF p_kind IN ('TAX_SETTLE','TAX_SETTLEMENT_REVERSE') THEN RETURN jsonb_build_object('register',public.get_tax_register(p_entity,DATE '0001-01-01',(p_payload->>'date')::date));END IF;
 IF p_kind IN ('TAX_INVOICE','TAX_BILL') THEN RETURN jsonb_build_object('taxAssessment',public.tax_request_assessment(p_entity,p_kind,p_payload));END IF;
 s:=public.pre_tax_snapshot(p_entity,p_kind,CASE WHEN p_kind='CONTRACT_BILL' THEN p_payload-'tax' ELSE p_payload END);
 IF p_kind='CONTRACT_BILL' AND p_payload?'tax' THEN s:=s||jsonb_build_object('taxAssessment',public.tax_request_assessment(p_entity,p_kind,p_payload));END IF;
 RETURN s;
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb:=p_request.payload;id uuid;currency text;t public.finance_tax_documents%ROWTYPE;policy public.finance_tax_policies%ROWTYPE;s public.finance_tax_settlements%ROWTYPE;journal uuid;lines jsonb;
BEGIN
 IF p_request.kind='TAX_POLICY' THEN
  INSERT INTO public.finance_tax_policies(org_id,entity_id,sales_account,recoverable_account,expense_account,request_id) VALUES(p_request.org_id,p_request.entity_id,(p->>'sales_account')::uuid,(p->>'recoverable_account')::uuid,(p->>'expense_account')::uuid,p_request.id) RETURNING finance_tax_policies.id INTO id;
  RETURN jsonb_build_object('policyId',id);
 END IF;
 IF p_request.kind='TAX_DOCUMENT_CREDIT' THEN
  SELECT * INTO t FROM public.finance_tax_documents WHERE finance_tax_documents.id=(p->>'document_id')::uuid;
  IF t.kind='AR' THEN id:=public.post_customer_credit_note(t.invoice_id,p->>'number',(p->>'date')::date,p_request.reason,'finance:'||p_request.id||':tax-credit');
  ELSE id:=public.post_supplier_bill_credit(t.bill_id,p->>'number',(p->>'date')::date,p_request.reason,'finance:'||p_request.id||':tax-credit');END IF;
  RETURN jsonb_build_object('creditId',id);
 END IF;
 IF p_request.kind='TAX_SETTLE' THEN
  SELECT * INTO policy FROM public.finance_tax_policies WHERE entity_id=p_request.entity_id;
  lines:=CASE p->>'kind' WHEN 'SALES_PAYMENT' THEN public.finance_pair_lines(policy.sales_account,(p->>'cash_account')::uuid,public.cash_amount(p->>'amount')) ELSE public.finance_pair_lines((p->>'cash_account')::uuid,policy.recoverable_account,public.cash_amount(p->>'amount')) END;
  journal:=public.post_manual_journal(p_request.entity_id,'TAX-SETTLE-'||p_request.id,(p->>'date')::date,'Confirmed tax settlement: '||(p->>'reference'),lines,'finance:'||p_request.id||':tax-settle');
  INSERT INTO public.finance_tax_settlements(org_id,entity_id,policy_id,kind,as_of,amount,cash_account,reference,journal_id,request_id) VALUES(p_request.org_id,p_request.entity_id,policy.id,p->>'kind',(p->>'date')::date,public.cash_amount(p->>'amount'),(p->>'cash_account')::uuid,p->>'reference',journal,p_request.id) RETURNING finance_tax_settlements.id INTO id;
  RETURN jsonb_build_object('settlementId',id,'journalId',journal);
 END IF;
 IF p_request.kind='TAX_SETTLEMENT_REVERSE' THEN
  SELECT * INTO s FROM public.finance_tax_settlements WHERE finance_tax_settlements.id=(p->>'settlement_id')::uuid;
  journal:=public.reverse_posted_journal(s.journal_id,(p->>'date')::date,p_request.reason,'finance:'||p_request.id||':tax-reverse');
  UPDATE public.finance_tax_settlements SET reversal_date=(p->>'date')::date,reversal_journal=journal,reversal_request=p_request.id WHERE finance_tax_settlements.id=s.id;
  RETURN jsonb_build_object('settlementId',s.id,'journalId',journal);
 END IF;
 IF p_request.kind IN ('TAX_INVOICE','TAX_BILL') THEN
  SELECT e.currency INTO currency FROM public.entities e WHERE e.id=p_request.entity_id;
  IF p_request.kind='TAX_INVOICE' THEN id:=public.post_customer_invoice(p_request.entity_id,(p->>'party_id')::uuid,p->>'number',(p->>'date')::date,(p->>'due_date')::date,currency,0,p->>'notes',p->'lines','finance:'||p_request.id||':tax');
  ELSE id:=public.post_supplier_bill(p_request.entity_id,(p->>'party_id')::uuid,p->>'number',(p->>'date')::date,(p->>'due_date')::date,currency,0,p->>'notes',p->'lines','finance:'||p_request.id||':tax');END IF;
  RETURN jsonb_build_object(CASE p_request.kind WHEN 'TAX_INVOICE' THEN 'invoiceId' ELSE 'billId' END,id);
 END IF;
 RETURN public.pre_tax_execute(p_request);
END; $$;

CREATE OR REPLACE FUNCTION public.customer_credit_net(p_lines jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(coalesce(a->>'netAmount',a->>'amount')::numeric),0) FROM jsonb_array_elements(p_lines) a
$$;
CREATE OR REPLACE FUNCTION public.invoice_line_tax(p_line uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum((a->>'amount')::numeric),0) FROM public.invoice_lines l JOIN public.finance_tax_documents t ON t.invoice_id=l.invoice_id CROSS JOIN LATERAL jsonb_array_elements(t.assessment->'lines') a WHERE l.id=p_line AND (a->>'line_number')::int=l.line_number
$$;
CREATE OR REPLACE FUNCTION public.tax_credit_components(p_tax uuid,p_line uuid,p_net numeric,p_prior jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.finance_tax_documents%ROWTYPE;l public.invoice_lines%ROWTYPE;item jsonb;before_net numeric;before_tax numeric;amount numeric;result jsonb:='[]';account uuid;
BEGIN
 SELECT * INTO t FROM public.finance_tax_documents WHERE id=p_tax AND kind='AR';SELECT * INTO l FROM public.invoice_lines WHERE id=p_line AND invoice_id=t.invoice_id;
 IF t.id IS NULL OR l.id IS NULL THEN RAISE EXCEPTION 'original assessed tax line unavailable'; END IF;
 SELECT sales_account INTO account FROM public.finance_tax_policies WHERE id=t.policy_id;
 SELECT coalesce(sum(coalesce(a->>'netAmount',a->>'amount')::numeric),0) INTO before_net FROM jsonb_array_elements(p_prior) c CROSS JOIN LATERAL jsonb_array_elements(c->'lines') a WHERE c->>'reversal_date' IS NULL AND a->>'lineId'=l.id::text;
 IF p_net<=0 OR before_net+p_net>l.line_total THEN RAISE EXCEPTION 'credit net amount exceeds its original assessed line'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(t.assessment->'lines') WHERE (value->>'line_number')::int=l.line_number ORDER BY value->>'jurisdiction' LOOP
  SELECT coalesce(sum((part->>'amount')::numeric),0) INTO before_tax FROM jsonb_array_elements(p_prior) c CROSS JOIN LATERAL jsonb_array_elements(c->'lines') cl CROSS JOIN LATERAL jsonb_array_elements(cl->'taxComponents') part WHERE c->>'reversal_date' IS NULL AND cl->>'lineId'=l.id::text AND part->>'jurisdiction'=item->>'jurisdiction';
  amount:=round((item->>'amount')::numeric*(before_net+p_net)/l.line_total,2)-before_tax;
  IF amount<0 OR amount>(item->>'amount')::numeric THEN RAISE EXCEPTION 'credit tax exceeds original jurisdiction capacity'; END IF;
  result:=result||jsonb_build_array(jsonb_build_object('jurisdiction',item->>'jurisdiction','amount',round(amount,2)::text,'accountId',account));
 END LOOP;
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_tax_credit(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.finance_customer_credits%ROWTYPE;r public.finance_requests%ROWTYPE;t public.finance_tax_documents%ROWTYPE;l jsonb;parts jsonb;net numeric;tax numeric;gross numeric:=0;debits numeric:=0;
BEGIN
 SELECT * INTO c FROM public.finance_customer_credits WHERE id=p_id;SELECT * INTO t FROM public.finance_tax_documents WHERE invoice_id=c.invoice_id;
 IF t.id IS NULL THEN RETURN;END IF;
 SELECT * INTO r FROM public.finance_requests WHERE id=c.request_id;
 FOR l IN SELECT value FROM jsonb_array_elements(c.lines) LOOP
  SELECT (a->>'amount')::numeric INTO net FROM jsonb_array_elements(r.payload->'lines') a WHERE a->>'line_id'=l->>'lineId';
  parts:=public.tax_credit_components(t.id,(l->>'lineId')::uuid,net,r.source_snapshot->'credits');
  SELECT coalesce(sum((a->>'amount')::numeric),0) INTO tax FROM jsonb_array_elements(parts) a;
  IF l->'taxComponents' IS DISTINCT FROM parts OR l->>'netAmount' IS DISTINCT FROM round(net,2)::text OR l->>'taxAmount' IS DISTINCT FROM round(tax,2)::text OR (l->>'amount')::numeric IS DISTINCT FROM net+tax THEN RAISE EXCEPTION 'customer credit tax allocation differs from its original assessment'; END IF;
  gross:=gross+net+tax;debits:=debits+tax;
 END LOOP;
 IF gross IS DISTINCT FROM c.amount OR debits IS DISTINCT FROM coalesce((SELECT sum((a->>'debit')::numeric-(a->>'credit')::numeric) FROM jsonb_array_elements(c.journal_lines) a WHERE a->>'account_id'=(SELECT sales_account::text FROM public.finance_tax_policies WHERE id=t.policy_id)),0) OR
  (jsonb_array_length(c.obligations)>0 AND (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(c.obligations) a) IS DISTINCT FROM public.customer_credit_net(c.lines)) THEN RAISE EXCEPTION 'credit net revenue and tax do not reconcile'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_credit_preview(p_entity uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN public.pre_tax_credit_preview(p_entity,p_payload);
END; $$;

-- Preserve native source, period, reversal and settlement checks; only the
-- tax-inclusive totals and separately validated tax journal shape are extended.

CREATE OR REPLACE FUNCTION public.validate_customer_invoice_graph(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_control public.entity_invoice_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_entity_currency text;
  v_invoice_line_count integer;
  v_invoice_line_total numeric;
  v_journal_line_count integer;
  v_journal_debit numeric;
  v_journal_credit numeric;
  v_ar_lines integer;
  v_revenue_lines integer;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_invoice.accounting_status = 'UNVERIFIED_LEGACY' THEN
    IF v_invoice.account_control_id IS NOT NULL
       OR v_invoice.accounting_event_id IS NOT NULL
       OR v_invoice.journal_entry_id IS NOT NULL
       OR v_invoice.posted_at IS NOT NULL
       OR v_invoice.posted_by IS NOT NULL THEN
      RAISE EXCEPTION 'unverified legacy invoice cannot claim accounting provenance';
    END IF;
    RETURN;
  END IF;

  IF v_invoice.accounting_status IS DISTINCT FROM 'POSTED'
     OR v_invoice.account_control_id IS NULL
     OR v_invoice.accounting_event_id IS NULL
     OR v_invoice.journal_entry_id IS NULL
     OR v_invoice.posted_at IS NULL
     OR v_invoice.posted_by IS NULL
     OR v_invoice.status::text IS DISTINCT FROM 'sent'
     OR v_invoice.issue_date IS NULL
     OR v_invoice.due_date IS NULL
     OR v_invoice.due_date < v_invoice.issue_date
     OR v_invoice.subtotal::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_invoice.tax::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_invoice.total::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_invoice.functional_total::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_invoice.amount_paid IS DISTINCT FROM 0
     OR v_invoice.tax < 0 OR v_invoice.tax IS NULL
     OR v_invoice.subtotal <= 0
     OR v_invoice.total IS DISTINCT FROM v_invoice.subtotal + v_invoice.tax
     OR v_invoice.exchange_rate IS DISTINCT FROM 1
     OR v_invoice.functional_total IS DISTINCT FROM v_invoice.total THEN
    RAISE EXCEPTION 'posted customer invoice header is not canonical';
  END IF;

  SELECT currency INTO v_entity_currency
  FROM public.entities WHERE id = v_invoice.entity_id AND org_id = v_invoice.org_id;
  IF upper(v_invoice.currency) IS DISTINCT FROM upper(v_entity_currency) THEN
    RAISE EXCEPTION 'posted customer invoice is not in entity functional currency';
  END IF;

  SELECT * INTO v_control FROM public.entity_invoice_account_controls
  WHERE id = v_invoice.account_control_id
    AND org_id = v_invoice.org_id AND entity_id = v_invoice.entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'posted customer invoice account control is invalid'; END IF;

  SELECT * INTO v_event FROM public.accounting_events WHERE id = v_invoice.accounting_event_id;
  IF NOT FOUND
     OR v_event.org_id IS DISTINCT FROM v_invoice.org_id
     OR v_event.entity_id IS DISTINCT FROM v_invoice.entity_id
     OR v_event.event_type IS DISTINCT FROM 'customer_invoice_posted'
     OR v_event.source_type IS DISTINCT FROM 'customer_invoice'
     OR v_event.source_id IS DISTINCT FROM v_invoice.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_invoice.journal_entry_id
     OR v_event.actor_id IS DISTINCT FROM v_invoice.posted_by THEN
    RAISE EXCEPTION 'posted customer invoice event graph is invalid';
  END IF;

  SELECT * INTO v_journal FROM public.journal_entries WHERE id = v_invoice.journal_entry_id;
  IF NOT FOUND
     OR v_journal.org_id IS DISTINCT FROM v_invoice.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_invoice.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ar'
     OR v_journal.entry_date IS DISTINCT FROM v_invoice.issue_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_invoice.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_invoice.posted_by
     OR v_journal.accounting_period_id IS NULL THEN
    RAISE EXCEPTION 'posted customer invoice journal graph is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounting_periods period
    WHERE period.id = v_journal.accounting_period_id
      AND period.org_id = v_invoice.org_id
      AND period.entity_id = v_invoice.entity_id
      AND v_invoice.issue_date BETWEEN period.period_start AND period.period_end
  ) THEN
    RAISE EXCEPTION 'posted customer invoice period graph is invalid';
  END IF;

  SELECT count(*), COALESCE(sum(line_total), 0)
  INTO v_invoice_line_count, v_invoice_line_total
  FROM public.invoice_lines
  WHERE invoice_id = v_invoice.id
    AND org_id = v_invoice.org_id
    AND entity_id = v_invoice.entity_id
    AND revenue_account_id = v_control.revenue_account_id;
  IF v_invoice_line_count < 1 OR v_invoice_line_total IS DISTINCT FROM v_invoice.subtotal THEN
    RAISE EXCEPTION 'posted customer invoice lines do not reconcile';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_lines
    WHERE invoice_id = v_invoice.id AND revenue_account_id <> v_control.revenue_account_id
  ) THEN
    RAISE EXCEPTION 'posted customer invoice uses an unauthorized revenue account';
  END IF;

  IF public.validate_document_tax('AR',v_invoice.id) THEN RETURN; END IF;
  SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0),
         count(*) FILTER (
           WHERE account_id = v_control.ar_account_id
             AND debit = v_invoice.total AND credit = 0
         ),
         count(*) FILTER (
           WHERE account_id = v_control.revenue_account_id
             AND credit = v_invoice.total AND debit = 0
         )
  INTO v_journal_line_count, v_journal_debit, v_journal_credit, v_ar_lines, v_revenue_lines
  FROM public.journal_lines WHERE journal_entry_id = v_journal.id;
  IF v_journal_line_count IS DISTINCT FROM 2
     OR v_journal_debit IS DISTINCT FROM v_invoice.total
     OR v_journal_credit IS DISTINCT FROM v_invoice.total
     OR v_ar_lines IS DISTINCT FROM 1
     OR v_revenue_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'posted customer invoice journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_bill_graph(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_bill public.bills%ROWTYPE; v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE; v_journal public.journal_entries%ROWTYPE;
  v_entity_currency text; v_ap_type public.account_type; v_expense_type public.account_type;
  v_line_count integer; v_line_total numeric; v_journal_count integer;
  v_debit numeric; v_credit numeric; v_expense_lines integer; v_ap_lines integer;
BEGIN
  SELECT * INTO v_bill FROM public.bills WHERE id=p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_bill.accounting_status='UNVERIFIED_LEGACY' THEN
    IF v_bill.account_control_id IS NOT NULL OR v_bill.accounting_event_id IS NOT NULL
       OR v_bill.journal_entry_id IS NOT NULL OR v_bill.posted_at IS NOT NULL
       OR v_bill.posted_by IS NOT NULL
       OR EXISTS(SELECT 1 FROM public.bill_lines WHERE bill_id=v_bill.id) THEN
      RAISE EXCEPTION 'unverified legacy bill cannot claim accounting provenance';
    END IF;
    RETURN;
  END IF;
  IF v_bill.accounting_status IS DISTINCT FROM 'POSTED'
     OR v_bill.account_control_id IS NULL OR v_bill.accounting_event_id IS NULL
     OR v_bill.journal_entry_id IS NULL OR v_bill.posted_at IS NULL OR v_bill.posted_by IS NULL
     OR v_bill.status::text IS DISTINCT FROM 'pending'
     OR v_bill.issue_date IS NULL OR v_bill.due_date IS NULL OR v_bill.due_date<v_bill.issue_date
     OR v_bill.subtotal::text IN ('NaN','Infinity','-Infinity')
     OR v_bill.tax::text IN ('NaN','Infinity','-Infinity')
     OR v_bill.total::text IN ('NaN','Infinity','-Infinity')
     OR v_bill.functional_total::text IN ('NaN','Infinity','-Infinity')
     OR v_bill.amount_paid IS DISTINCT FROM 0 OR v_bill.tax < 0 OR v_bill.tax IS NULL
     OR v_bill.subtotal<=0 OR v_bill.total IS DISTINCT FROM v_bill.subtotal + v_bill.tax
     OR v_bill.exchange_rate IS DISTINCT FROM 1 OR v_bill.functional_total IS DISTINCT FROM v_bill.total
     OR v_bill.purchase_order_id IS NOT NULL OR v_bill.goods_receipt_id IS NOT NULL
     OR v_bill.tax_code_id IS NOT NULL OR v_bill.match_status IS DISTINCT FROM 'unmatched' THEN
    RAISE EXCEPTION 'posted supplier bill header is not canonical';
  END IF;
  SELECT currency INTO v_entity_currency FROM public.entities
  WHERE id=v_bill.entity_id AND org_id=v_bill.org_id;
  IF upper(v_bill.currency) IS DISTINCT FROM upper(v_entity_currency) THEN
    RAISE EXCEPTION 'posted supplier bill is not in entity functional currency';
  END IF;
  SELECT * INTO v_control FROM public.entity_supplier_bill_account_controls
  WHERE id=v_bill.account_control_id AND org_id=v_bill.org_id AND entity_id=v_bill.entity_id;
  SELECT account_type INTO v_ap_type FROM public.accounts WHERE id=v_control.ap_account_id AND org_id=v_bill.org_id;
  SELECT account_type INTO v_expense_type FROM public.accounts WHERE id=v_control.expense_account_id AND org_id=v_bill.org_id;
  IF v_control.id IS NULL OR v_ap_type IS DISTINCT FROM 'liability' OR v_expense_type IS DISTINCT FROM 'expense' THEN
    RAISE EXCEPTION 'supplier bill account control is invalid';
  END IF;
  SELECT * INTO v_event FROM public.accounting_events WHERE id=v_bill.accounting_event_id;
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_bill.org_id
     OR v_event.entity_id IS DISTINCT FROM v_bill.entity_id
     OR v_event.event_type IS DISTINCT FROM 'supplier_bill_posted'
     OR v_event.source_type IS DISTINCT FROM 'supplier_bill'
     OR v_event.source_id IS DISTINCT FROM v_bill.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_bill.journal_entry_id
     OR v_event.actor_id IS DISTINCT FROM v_bill.posted_by THEN
    RAISE EXCEPTION 'supplier bill event graph is invalid';
  END IF;
  SELECT * INTO v_journal FROM public.journal_entries WHERE id=v_bill.journal_entry_id;
  IF NOT FOUND OR v_journal.org_id IS DISTINCT FROM v_bill.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_bill.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ap'
     OR v_journal.entry_date IS DISTINCT FROM v_bill.issue_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_bill.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_bill.posted_by
     OR v_journal.accounting_period_id IS NULL OR v_journal.reversal_of_id IS NOT NULL
     OR (v_journal.reversed_by_id IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM public.supplier_bill_credit_notes credit
       WHERE credit.original_bill_id=v_bill.id AND credit.journal_entry_id=v_journal.reversed_by_id
     )) THEN
    RAISE EXCEPTION 'supplier bill journal graph is invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_periods period
    WHERE period.id=v_journal.accounting_period_id AND period.org_id=v_bill.org_id
      AND period.entity_id=v_bill.entity_id
      AND v_bill.issue_date BETWEEN period.period_start AND period.period_end) THEN
    RAISE EXCEPTION 'supplier bill period graph is invalid';
  END IF;
  SELECT count(*),COALESCE(sum(line_total),0) INTO v_line_count,v_line_total
  FROM public.bill_lines WHERE bill_id=v_bill.id AND org_id=v_bill.org_id
    AND entity_id=v_bill.entity_id AND expense_account_id=v_control.expense_account_id;
  IF v_line_count<1 OR v_line_total IS DISTINCT FROM v_bill.subtotal
     OR EXISTS(SELECT 1 FROM public.bill_lines WHERE bill_id=v_bill.id
       AND expense_account_id<>v_control.expense_account_id) THEN
    RAISE EXCEPTION 'supplier bill lines do not reconcile';
  END IF;
  IF public.validate_document_tax('AP',v_bill.id) THEN RETURN; END IF;
  SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0),
    count(*) FILTER(WHERE account_id=v_control.expense_account_id AND debit=v_bill.total AND credit=0),
    count(*) FILTER(WHERE account_id=v_control.ap_account_id AND credit=v_bill.total AND debit=0)
  INTO v_journal_count,v_debit,v_credit,v_expense_lines,v_ap_lines
  FROM public.journal_lines WHERE journal_entry_id=v_journal.id;
  IF v_journal_count IS DISTINCT FROM 2 OR v_debit IS DISTINCT FROM v_bill.total
     OR v_credit IS DISTINCT FROM v_bill.total OR v_expense_lines IS DISTINCT FROM 1
     OR v_ap_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'supplier bill journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_credit_note_graph(p_credit_note_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit public.customer_credit_notes%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_event public.accounting_events%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_original_journal public.journal_entries%ROWTYPE;
  v_period public.accounting_periods%ROWTYPE;
  v_credit_line_count integer;
  v_invoice_line_count integer;
  v_credit_total numeric;
BEGIN
  SELECT * INTO v_credit FROM public.customer_credit_notes WHERE id = p_credit_note_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_credit.credit_note_number IS NULL
     OR v_credit.credit_note_number IS DISTINCT FROM btrim(v_credit.credit_note_number)
     OR length(v_credit.credit_note_number) NOT BETWEEN 1 AND 80
     OR v_credit.credit_note_number ~ '[[:cntrl:]]'
     OR v_credit.reason IS NULL OR v_credit.reason IS DISTINCT FROM btrim(v_credit.reason)
     OR length(v_credit.reason) NOT BETWEEN 1 AND 500
     OR v_credit.reason ~ '[[:cntrl:]]'
     OR v_credit.currency !~ '^[A-Z]{3}$'
     OR v_credit.total::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_credit.total <= 0 OR round(v_credit.total, 2) IS DISTINCT FROM v_credit.total
     OR v_credit.accounting_event_id IS NULL OR v_credit.journal_entry_id IS NULL
     OR v_credit.posted_by IS NULL OR v_credit.posted_at IS NULL THEN
    RAISE EXCEPTION 'customer credit note header is not canonical';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_credit.original_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer credit note original invoice is missing'; END IF;
  PERFORM public.validate_customer_invoice_graph(v_invoice.id);
  IF v_invoice.org_id IS DISTINCT FROM v_credit.org_id
     OR v_invoice.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_invoice.customer_id IS DISTINCT FROM v_credit.customer_id
     OR v_invoice.account_control_id IS DISTINCT FROM v_credit.account_control_id
     OR v_invoice.total IS DISTINCT FROM v_credit.total
     OR upper(v_invoice.currency) IS DISTINCT FROM v_credit.currency
     OR v_credit.issue_date < v_invoice.issue_date THEN
    RAISE EXCEPTION 'customer credit note does not match its original invoice';
  END IF;

  SELECT * INTO v_event FROM public.accounting_events WHERE id = v_credit.accounting_event_id;
  IF NOT FOUND
     OR v_event.org_id IS DISTINCT FROM v_credit.org_id
     OR v_event.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_event.event_type IS DISTINCT FROM 'customer_credit_note_posted'
     OR v_event.source_type IS DISTINCT FROM 'customer_credit_note'
     OR v_event.source_id IS DISTINCT FROM v_credit.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_credit.journal_entry_id
     OR v_event.idempotency_key IS DISTINCT FROM v_credit.idempotency_key
     OR v_event.payload_hash IS DISTINCT FROM v_credit.payload_hash
     OR v_event.actor_id IS DISTINCT FROM v_credit.posted_by THEN
    RAISE EXCEPTION 'customer credit note event graph is invalid';
  END IF;

  SELECT * INTO v_journal FROM public.journal_entries WHERE id = v_credit.journal_entry_id;
  SELECT * INTO v_original_journal FROM public.journal_entries WHERE id = v_invoice.journal_entry_id;
  IF v_journal.id IS NULL OR v_original_journal.id IS NULL
     OR v_journal.org_id IS DISTINCT FROM v_credit.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ar_credit'
     OR v_journal.entry_date IS DISTINCT FROM v_credit.issue_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_credit.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_credit.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS DISTINCT FROM v_original_journal.id
     OR v_original_journal.reversed_by_id IS DISTINCT FROM v_journal.id THEN
    RAISE EXCEPTION 'customer credit note journal graph is invalid';
  END IF;

  SELECT * INTO v_period FROM public.accounting_periods WHERE id = v_journal.accounting_period_id;
  IF v_period.id IS NULL
     OR v_period.org_id IS DISTINCT FROM v_credit.org_id
     OR v_period.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_credit.issue_date NOT BETWEEN v_period.period_start AND v_period.period_end THEN
    RAISE EXCEPTION 'customer credit note period graph is invalid';
  END IF;

  SELECT count(*), COALESCE(sum(line_total), 0)
    INTO v_credit_line_count, v_credit_total
  FROM public.customer_credit_note_lines
  WHERE credit_note_id = v_credit.id;
  SELECT count(*) INTO v_invoice_line_count
  FROM public.invoice_lines WHERE invoice_id = v_invoice.id;
  IF v_credit_line_count IS DISTINCT FROM v_invoice_line_count
     OR v_credit_line_count < 1
     OR v_credit_total IS DISTINCT FROM v_invoice.subtotal
     OR EXISTS (
       SELECT 1
       FROM public.customer_credit_note_lines credit_line
       FULL JOIN public.invoice_lines invoice_line
         ON invoice_line.id = credit_line.original_invoice_line_id
        AND invoice_line.invoice_id = v_invoice.id
       WHERE credit_line.credit_note_id = v_credit.id
         AND (
           invoice_line.id IS NULL
           OR credit_line.org_id IS DISTINCT FROM invoice_line.org_id
           OR credit_line.entity_id IS DISTINCT FROM invoice_line.entity_id
           OR credit_line.original_invoice_id IS DISTINCT FROM invoice_line.invoice_id
           OR credit_line.line_number IS DISTINCT FROM invoice_line.line_number
           OR credit_line.description IS DISTINCT FROM invoice_line.description
           OR credit_line.quantity IS DISTINCT FROM invoice_line.quantity
           OR credit_line.unit_price IS DISTINCT FROM invoice_line.unit_price
           OR credit_line.line_total IS DISTINCT FROM invoice_line.line_total
           OR credit_line.revenue_account_id IS DISTINCT FROM invoice_line.revenue_account_id
         )
     )
     OR EXISTS (
       SELECT 1 FROM public.invoice_lines invoice_line
       WHERE invoice_line.invoice_id = v_invoice.id
         AND NOT EXISTS (
           SELECT 1 FROM public.customer_credit_note_lines credit_line
           WHERE credit_line.credit_note_id = v_credit.id
             AND credit_line.original_invoice_line_id = invoice_line.id
         )
     ) THEN
    RAISE EXCEPTION 'customer credit note lines do not exactly copy the invoice';
  END IF;

  IF (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id = v_journal.id)
       IS DISTINCT FROM
     (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id = v_original_journal.id)
     OR EXISTS (
       SELECT 1
       FROM public.journal_lines original_line
       LEFT JOIN public.journal_lines credit_line
         ON credit_line.journal_entry_id = v_journal.id
        AND credit_line.line_number = original_line.line_number
       WHERE original_line.journal_entry_id = v_original_journal.id
         AND (
           credit_line.id IS NULL
           OR credit_line.org_id IS DISTINCT FROM original_line.org_id
           OR credit_line.entity_id IS DISTINCT FROM original_line.entity_id
           OR credit_line.account_id IS DISTINCT FROM original_line.account_id
           OR credit_line.debit IS DISTINCT FROM original_line.credit
           OR credit_line.credit IS DISTINCT FROM original_line.debit
         )
     ) THEN
    RAISE EXCEPTION 'customer credit note journal is not an exact offset';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_bill_credit_graph(p_credit_note_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_credit public.supplier_bill_credit_notes%ROWTYPE; v_bill public.bills%ROWTYPE;
  v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE; v_journal public.journal_entries%ROWTYPE;
  v_original public.journal_entries%ROWTYPE; v_line_count integer; v_line_total numeric;
  v_bill_line_count integer; v_journal_count integer; v_debit numeric; v_credit_total numeric;
  v_ap_lines integer; v_expense_lines integer;
BEGIN
  SELECT * INTO v_credit FROM public.supplier_bill_credit_notes WHERE id=p_credit_note_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_credit.credit_note_number IS NULL OR v_credit.credit_note_number IS DISTINCT FROM btrim(v_credit.credit_note_number)
     OR v_credit.reason IS NULL OR v_credit.reason IS DISTINCT FROM btrim(v_credit.reason)
     OR v_credit.issue_date IS NULL OR v_credit.total::text IN ('NaN','Infinity','-Infinity')
     OR v_credit.total<=0 OR round(v_credit.total,2) IS DISTINCT FROM v_credit.total
     OR v_credit.account_control_id IS NULL OR v_credit.accounting_event_id IS NULL
     OR v_credit.journal_entry_id IS NULL OR v_credit.posted_by IS NULL THEN
    RAISE EXCEPTION 'supplier credit header is not canonical';
  END IF;
  SELECT * INTO v_bill FROM public.bills WHERE id=v_credit.original_bill_id;
  IF NOT FOUND OR v_bill.org_id IS DISTINCT FROM v_credit.org_id
     OR v_bill.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_bill.vendor_id IS DISTINCT FROM v_credit.vendor_id
     OR v_bill.account_control_id IS DISTINCT FROM v_credit.account_control_id
     OR v_bill.total IS DISTINCT FROM v_credit.total
     OR upper(v_bill.currency) IS DISTINCT FROM upper(v_credit.currency)
     OR v_credit.issue_date<v_bill.issue_date THEN
    RAISE EXCEPTION 'supplier credit original bill graph is invalid';
  END IF;
  PERFORM public.validate_supplier_bill_graph(v_bill.id);
  SELECT * INTO v_control FROM public.entity_supplier_bill_account_controls WHERE id=v_credit.account_control_id;
  SELECT * INTO v_event FROM public.accounting_events WHERE id=v_credit.accounting_event_id;
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_credit.org_id
     OR v_event.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_event.event_type IS DISTINCT FROM 'supplier_bill_credit_posted'
     OR v_event.source_type IS DISTINCT FROM 'supplier_bill_credit'
     OR v_event.source_id IS DISTINCT FROM v_credit.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_credit.journal_entry_id
     OR v_event.actor_id IS DISTINCT FROM v_credit.posted_by THEN
    RAISE EXCEPTION 'supplier credit event graph is invalid';
  END IF;
  SELECT * INTO v_journal FROM public.journal_entries WHERE id=v_credit.journal_entry_id;
  SELECT * INTO v_original FROM public.journal_entries WHERE id=v_bill.journal_entry_id;
  IF v_journal.id IS NULL OR v_original.id IS NULL
     OR v_journal.org_id IS DISTINCT FROM v_credit.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ap_credit'
     OR v_journal.entry_date IS DISTINCT FROM v_credit.issue_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_credit.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_credit.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS DISTINCT FROM v_original.id
     OR v_journal.reversed_by_id IS NOT NULL
     OR v_original.reversed_by_id IS DISTINCT FROM v_journal.id THEN
    RAISE EXCEPTION 'supplier credit journal graph is invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_periods period
    WHERE period.id=v_journal.accounting_period_id AND period.org_id=v_credit.org_id
      AND period.entity_id=v_credit.entity_id
      AND v_credit.issue_date BETWEEN period.period_start AND period.period_end) THEN
    RAISE EXCEPTION 'supplier credit period graph is invalid';
  END IF;
  SELECT count(*),COALESCE(sum(line_total),0) INTO v_line_count,v_line_total
  FROM public.supplier_bill_credit_note_lines WHERE credit_note_id=v_credit.id;
  SELECT count(*) INTO v_bill_line_count FROM public.bill_lines WHERE bill_id=v_bill.id;
  IF v_line_count IS DISTINCT FROM v_bill_line_count OR v_line_count<1
     OR v_line_total IS DISTINCT FROM v_bill.subtotal
     OR EXISTS(SELECT 1 FROM public.supplier_bill_credit_note_lines credit_line
       JOIN public.bill_lines bill_line ON bill_line.id=credit_line.original_bill_line_id
       WHERE credit_line.credit_note_id=v_credit.id AND (
         credit_line.org_id IS DISTINCT FROM bill_line.org_id
         OR credit_line.entity_id IS DISTINCT FROM bill_line.entity_id
         OR credit_line.original_bill_id IS DISTINCT FROM bill_line.bill_id
         OR credit_line.line_number IS DISTINCT FROM bill_line.line_number
         OR credit_line.description IS DISTINCT FROM bill_line.description
         OR credit_line.quantity IS DISTINCT FROM bill_line.quantity
         OR credit_line.unit_price IS DISTINCT FROM bill_line.unit_price
         OR credit_line.line_total IS DISTINCT FROM bill_line.line_total
         OR credit_line.expense_account_id IS DISTINCT FROM bill_line.expense_account_id
       )) THEN
    RAISE EXCEPTION 'supplier credit lines do not exactly copy bill evidence';
  END IF;
  IF EXISTS(SELECT 1 FROM public.finance_tax_documents WHERE bill_id=v_bill.id) THEN
    IF (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id=v_journal.id) IS DISTINCT FROM (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id=v_original.id) OR EXISTS(
      SELECT 1 FROM public.journal_lines o LEFT JOIN public.journal_lines c ON c.journal_entry_id=v_journal.id AND c.line_number=o.line_number
      WHERE o.journal_entry_id=v_original.id AND (c.account_id IS DISTINCT FROM o.account_id OR c.debit IS DISTINCT FROM o.credit OR c.credit IS DISTINCT FROM o.debit)
    ) THEN RAISE EXCEPTION 'tax-inclusive supplier credit must exactly reverse original tax and cost'; END IF;
    RETURN;
  END IF;
  SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0),
    count(*) FILTER(WHERE account_id=v_control.ap_account_id AND debit=v_credit.total AND credit=0),
    count(*) FILTER(WHERE account_id=v_control.expense_account_id AND credit=v_credit.total AND debit=0)
  INTO v_journal_count,v_debit,v_credit_total,v_ap_lines,v_expense_lines
  FROM public.journal_lines WHERE journal_entry_id=v_journal.id;
  IF v_journal_count IS DISTINCT FROM 2 OR v_debit IS DISTINCT FROM v_credit.total
     OR v_credit_total IS DISTINCT FROM v_credit.total OR v_ap_lines IS DISTINCT FROM 1
     OR v_expense_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'supplier credit journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_contract_graph(p_contract uuid,p_cycle_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_contracts%ROWTYPE;v_cycle record;v_entry record;v_day record;v_revenue uuid;v_deferred uuid;v_unbilled uuid;v_total numeric;v_before numeric;v_bill numeric;v_rec numeric;v_gl_deferred numeric;v_gl_unbilled numeric;
BEGIN
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=p_contract;
 IF v_c.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.entities WHERE id=v_c.entity_id AND org_id=v_c.org_id AND currency=v_c.currency) OR
  NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_c.creation_request AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='CONTRACT_CREATE' AND payload=v_c.terms AND state IN ('APPROVED','EXECUTING')) THEN RAISE EXCEPTION 'contract approval graph is invalid'; END IF;
 SELECT revenue_account_id INTO v_revenue FROM public.entity_invoice_account_controls WHERE entity_id=v_c.entity_id;
 v_deferred:=(v_c.terms->>'deferred_account_id')::uuid;v_unbilled:=(v_c.terms->>'unbilled_account_id')::uuid;
 FOR v_cycle IN SELECT * FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND (p_cycle_id IS NULL OR id=p_cycle_id) LOOP
  IF (SELECT coalesce(sum((a->>'amount')::numeric),0) FROM jsonb_array_elements(v_cycle.allocations) a)<>v_cycle.price THEN RAISE EXCEPTION 'contract obligation allocations do not equal the cycle price'; END IF;
  SELECT coalesce(sum(amount),0) INTO v_total FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id;
  IF v_total>v_cycle.price THEN RAISE EXCEPTION 'contract revenue exceeds the transaction price'; END IF;
  IF v_c.terms->>'kind'='USAGE' AND v_cycle.usage_finalized AND (
    (public.contract_usage_snapshot(v_cycle.id)->>'revision') IS DISTINCT FROM v_cycle.usage_revision OR
    (public.contract_usage_snapshot(v_cycle.id)->>'units')::numeric IS DISTINCT FROM v_cycle.usage_units OR
    v_cycle.price<>round(v_cycle.usage_units*(v_c.terms->>'unit_price')::numeric,2)) THEN RAISE EXCEPTION 'finalized usage graph is invalid'; END IF;
  IF v_cycle.invoice_id IS NOT NULL THEN
   PERFORM public.validate_customer_invoice_graph(v_cycle.invoice_id);
   IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=v_cycle.invoice_id AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND customer_id=v_c.customer_id AND subtotal=v_cycle.price AND issue_date=v_cycle.invoice_date) THEN RAISE EXCEPTION 'contract invoice graph is invalid'; END IF;
   PERFORM public.assert_contract_journal(v_cycle.deferral_journal,v_c.entity_id,v_cycle.invoice_date,v_revenue,v_deferred,v_cycle.price);
   -- Dated control balances below independently verify the amount transferred.
   IF v_cycle.unbilled_transfer_journal IS NOT NULL THEN
    SELECT debit INTO v_before FROM public.journal_lines WHERE journal_entry_id=v_cycle.unbilled_transfer_journal AND account_id=v_deferred;
    PERFORM public.assert_contract_journal(v_cycle.unbilled_transfer_journal,v_c.entity_id,v_cycle.invoice_date,v_deferred,v_unbilled,v_before);
   END IF;
  END IF;
  FOR v_entry IN SELECT * FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id LOOP
   IF v_entry.transfer_journal IS NOT NULL AND (v_cycle.invoice_id IS NULL OR v_cycle.invoice_date<=v_entry.as_of) THEN RAISE EXCEPTION 'invalid contract journal transfer timing'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_entry.request_id AND org_id=v_c.org_id AND kind='CONTRACT_RECOGNIZE' AND payload->>'cycle_id'=v_cycle.id::text AND state IN ('APPROVED','EXECUTING')) OR
    (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(v_entry.allocations) a) IS DISTINCT FROM v_entry.amount THEN RAISE EXCEPTION 'contract revenue approval or allocation graph is invalid'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_entry.allocations) a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_cycle.allocations) o WHERE o->>'key'=a->>'key') OR (a->>'amount')::numeric<0) OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(public.contract_earned(v_cycle.id,v_entry.as_of,v_entry.evidence)) earned WHERE (earned->>'amount')::numeric <
     (SELECT coalesce(sum((a->>'amount')::numeric),0) FROM public.finance_revenue_entries e CROSS JOIN LATERAL jsonb_array_elements(e.allocations) a WHERE e.cycle_id=v_cycle.id AND e.as_of<=v_entry.as_of AND a->>'key'=earned->>'key')) THEN RAISE EXCEPTION 'recognized revenue exceeds earned performance obligations'; END IF;
   -- The debit account on the immutable recognition entry identifies whether the
   -- cycle was invoiced when that recognition was approved.
   IF EXISTS(SELECT 1 FROM public.journal_lines WHERE journal_entry_id=v_entry.journal_id AND account_id=v_unbilled AND debit=v_entry.amount) THEN
    PERFORM public.assert_contract_journal(v_entry.journal_id,v_c.entity_id,v_entry.as_of,v_unbilled,v_revenue,v_entry.amount);
    IF v_entry.transfer_journal IS NOT NULL THEN PERFORM public.assert_contract_journal(v_entry.transfer_journal,v_c.entity_id,v_cycle.invoice_date,v_deferred,v_unbilled,v_entry.amount); END IF;
   ELSE PERFORM public.assert_contract_journal(v_entry.journal_id,v_c.entity_id,v_entry.as_of,v_deferred,v_revenue,v_entry.amount);
   END IF;
  END LOOP;
  IF v_cycle.credit_id IS NOT NULL THEN
   PERFORM public.validate_customer_credit_note_graph(v_cycle.credit_id);
   IF NOT EXISTS(SELECT 1 FROM public.customer_credit_notes WHERE id=v_cycle.credit_id AND original_invoice_id=v_cycle.invoice_id AND issue_date=v_cycle.credit_date) THEN RAISE EXCEPTION 'contract credit graph is invalid'; END IF;
   PERFORM public.assert_contract_journal(v_cycle.credit_journal,v_c.entity_id,v_cycle.credit_date,v_deferred,v_revenue,v_cycle.price-v_total);
  END IF;
  FOR v_day IN SELECT invoice_date AS day FROM public.finance_contract_cycles WHERE id=v_cycle.id AND invoice_date IS NOT NULL
    UNION SELECT credit_date FROM public.finance_contract_cycles WHERE id=v_cycle.id AND credit_date IS NOT NULL
    UNION SELECT as_of FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id LOOP
   SELECT coalesce(sum(amount),0) INTO v_rec FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of<=v_day.day;
   v_bill:=CASE WHEN v_cycle.invoice_id IS NOT NULL AND v_cycle.invoice_date<=v_day.day THEN v_cycle.price ELSE 0 END;
   IF v_cycle.credit_date<=v_day.day THEN v_rec:=0;v_bill:=0; END IF;
   SELECT coalesce(sum(l.credit-l.debit) FILTER(WHERE l.account_id=v_deferred),0),coalesce(sum(l.debit-l.credit) FILTER(WHERE l.account_id=v_unbilled),0)
    INTO v_gl_deferred,v_gl_unbilled FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
    WHERE j.entry_date<=v_day.day AND j.id IN (SELECT unnest(ARRAY[v_cycle.deferral_journal,v_cycle.unbilled_transfer_journal,v_cycle.credit_journal])
       UNION SELECT journal_id FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id UNION SELECT transfer_journal FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id);
   IF v_gl_deferred<>greatest(v_bill-v_rec,0) OR v_gl_unbilled<>greatest(v_rec-v_bill,0) THEN RAISE EXCEPTION 'dated contract balances do not reconcile to their journals'; END IF;
  END LOOP;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.get_contract_control_balances(p_entity_id uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_result jsonb;v_contract record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity_id AND org_id=v_org) OR p_as_of IS NULL OR p_as_of NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'contract control scope unavailable'; END IF;
 PERFORM public.get_entity_trial_balance(p_entity_id,DATE '0001-01-01',p_as_of);
 FOR v_contract IN SELECT id FROM public.finance_contracts WHERE entity_id=p_entity_id AND org_id=v_org LOOP PERFORM public.validate_contract_graph(v_contract.id); END LOOP;
 FOR v_contract IN SELECT id FROM public.finance_customer_credits WHERE entity_id=p_entity_id AND org_id=v_org LOOP PERFORM public.validate_customer_credit_graph(v_contract.id); END LOOP;
 WITH cycles AS (
  SELECT c.terms,s.*,CASE WHEN s.credit_date<=p_as_of THEN 0 ELSE coalesce((SELECT sum(amount) FROM public.finance_revenue_entries WHERE cycle_id=s.id AND as_of<=p_as_of),0)-(SELECT coalesce(sum((a->>'recognized')::numeric),0) FROM public.finance_customer_credits cr CROSS JOIN LATERAL jsonb_array_elements(cr.obligations) a WHERE cr.invoice_id=s.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of)) END AS earned,
   CASE WHEN s.credit_date<=p_as_of THEN 0 WHEN s.invoice_id IS NOT NULL AND s.invoice_date<=p_as_of THEN s.price-(SELECT coalesce(sum(public.customer_credit_net(cr.lines)),0) FROM public.finance_customer_credits cr WHERE cr.invoice_id=s.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of)) ELSE 0 END AS billed
  FROM public.finance_contracts c JOIN public.finance_contract_cycles s ON s.contract_id=c.id WHERE c.entity_id=p_entity_id AND c.org_id=v_org
 ), balances AS (
  SELECT (terms->>'deferred_account_id')::uuid AS account_id,'Deferred revenue' AS label,sum(greatest(billed-earned,0)) AS expected FROM cycles GROUP BY 1
  UNION ALL SELECT (terms->>'unbilled_account_id')::uuid,'Unbilled receivables',sum(greatest(earned-billed,0)) FROM cycles GROUP BY 1
 ), compared AS (
  SELECT b.*,a.code,a.name,coalesce((SELECT sum(CASE WHEN a.account_type='liability' THEN l.credit-l.debit ELSE l.debit-l.credit END)
   FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.org_id=v_org AND j.entity_id=p_entity_id AND j.status='posted' AND j.entry_date<=p_as_of AND l.account_id=b.account_id),0) AS ledger
  FROM balances b JOIN public.accounts a ON a.id=b.account_id
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',account_id,'code',code,'name',name,'label',label,'expected',round(expected,2)::text,'ledger',round(ledger,2)::text,'variance',round(ledger-expected,2)::text) ORDER BY code),'[]') INTO v_result FROM compared;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_contract_finance(p_contract_id uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_c public.finance_contracts%ROWTYPE;v_cycle record;v_rows jsonb:='[]';v_billed numeric:=0;v_recognized numeric:=0;v_b numeric;v_r numeric;v_deferred numeric:=0;v_unbilled numeric:=0;v_schedule jsonb;
BEGIN
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=p_contract_id AND org_id=v_org;
 IF v_c.id IS NULL THEN RAISE EXCEPTION 'contract unavailable'; END IF;
 IF p_as_of IS NULL OR p_as_of NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'invalid contract report date'; END IF;
 PERFORM public.validate_contract_graph(v_c.id);
 PERFORM public.get_entity_trial_balance(v_c.entity_id,DATE '0001-01-01',p_as_of);
 FOR v_cycle IN SELECT * FROM public.finance_contract_cycles WHERE contract_id=v_c.id ORDER BY cycle_number LOOP
  SELECT coalesce(sum(amount),0) INTO v_r FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of<=p_as_of;
  v_b:=CASE WHEN v_cycle.invoice_id IS NOT NULL AND v_cycle.invoice_date<=p_as_of THEN v_cycle.price ELSE 0 END;
  IF v_cycle.credit_date<=p_as_of THEN v_b:=0;v_r:=0; END IF;
  v_b:=v_b-(SELECT coalesce(sum(public.customer_credit_net(cr.lines)),0) FROM public.finance_customer_credits cr WHERE cr.invoice_id=v_cycle.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of));
  v_r:=v_r-(SELECT coalesce(sum((a->>'recognized')::numeric),0) FROM public.finance_customer_credits cr CROSS JOIN LATERAL jsonb_array_elements(cr.obligations) a WHERE cr.invoice_id=v_cycle.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of));
  v_billed:=v_billed+v_b;v_recognized:=v_recognized+v_r;v_deferred:=v_deferred+greatest(v_b-v_r,0);v_unbilled:=v_unbilled+greatest(v_r-v_b,0);
  SELECT coalesce(jsonb_agg(jsonb_build_object('through',month_end,'cumulativeEarned',CASE WHEN v_cycle.usage_finalized THEN public.contract_net_earned(v_cycle.id,month_end,'[]') ELSE NULL END) ORDER BY month_end),'[]') INTO v_schedule
   FROM (SELECT least((date_trunc('month',d)+INTERVAL '1 month - 1 day')::date,v_cycle.ends_on) AS month_end FROM generate_series(date_trunc('month',v_cycle.starts_on::timestamp),date_trunc('month',v_cycle.ends_on::timestamp),INTERVAL '1 month') d) m;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',v_cycle.id,'number',v_cycle.cycle_number,'startsOn',v_cycle.starts_on,'endsOn',v_cycle.ends_on,'price',v_cycle.price::text,'allocations',v_cycle.allocations,
   'usageFinalized',v_cycle.usage_finalized,'usage',public.contract_usage_snapshot(v_cycle.id),'invoiceId',v_cycle.invoice_id,'invoiceDate',v_cycle.invoice_date,'billingRequest',v_cycle.billing_request,'creditId',v_cycle.credit_id,'cancelled',v_cycle.cancel_request IS NOT NULL,
   'billed',round(v_b,2)::text,'recognized',round(v_r,2)::text,'deferred',round(greatest(v_b-v_r,0),2)::text,'unbilled',round(greatest(v_r-v_b,0),2)::text,'schedule',v_schedule,
   'recognitions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'date',as_of,'amount',amount::text,'allocations',allocations,'journalId',journal_id,'evidence',evidence) ORDER BY as_of,id) FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id),'[]'::jsonb)));
 END LOOP;
 RETURN jsonb_build_object('id',v_c.id,'reference',v_c.reference,'entityId',v_c.entity_id,'customerId',v_c.customer_id,'currency',v_c.currency,'terms',v_c.terms,'asOf',p_as_of,'billed',round(v_billed,2)::text,'recognized',round(v_recognized,2)::text,'deferred',round(v_deferred,2)::text,'unbilled',round(v_unbilled,2)::text,'cycles',v_rows,'controls',public.get_contract_control_balances(v_c.entity_id,p_as_of));
END; $$;

CREATE OR REPLACE FUNCTION public.tax_credit_preview(p_entity uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_i public.invoices%ROWTYPE;v_policy public.finance_customer_credit_controls%ROWTYPE;
 v_cycle public.finance_contract_cycles%ROWTYPE;v_contract public.finance_contracts%ROWTYPE;v_line record;v_o jsonb;v_item jsonb;
 v_total numeric:=0;v_amount numeric;v_remaining numeric;v_ar numeric;v_balance numeric;v_allocated numeric:=0;v_cumulative numeric:=0;
 v_price numeric;v_rec numeric;v_prior numeric;v_rec_part numeric;v_revenue_part numeric:=0;v_deferred_part numeric:=0;
 v_tax_total numeric:=0;v_tax_line numeric;v_tax_parts jsonb;v_prior_net numeric;v_tax public.finance_tax_documents%ROWTYPE;
 v_date date:=(p_payload->>'date')::date;v_lines jsonb:='[]';v_obligations jsonb:='[]';v_journal jsonb:='[]';v_seen uuid[]:='{}';v_ar_account uuid;
BEGIN
 SELECT * INTO v_i FROM public.invoices WHERE id=(p_payload->>'invoice_id')::uuid AND entity_id=p_entity AND org_id=v_org AND accounting_status='POSTED';
 IF v_i.id IS NULL THEN RAISE EXCEPTION 'posted customer invoice unavailable'; END IF;
 SELECT * INTO v_tax FROM public.finance_tax_documents WHERE invoice_id=v_i.id;
 PERFORM public.validate_customer_invoice_graph(v_i.id);PERFORM public.validate_settlement_capacity('ar',v_i.id);
 SELECT * INTO v_policy FROM public.finance_customer_credit_controls WHERE entity_id=p_entity AND org_id=v_org;
 IF v_policy.id IS NULL THEN RAISE EXCEPTION 'approve a customer credit liability account first'; END IF;
 IF v_date<v_i.issue_date OR v_date>CURRENT_DATE OR EXISTS(SELECT 1 FROM public.customer_invoice_movements(v_i.id) WHERE as_of>v_date) OR
  EXISTS(SELECT 1 FROM public.finance_customer_credits WHERE invoice_id=v_i.id AND (as_of>v_date OR reversal_date>v_date)) THEN RAISE EXCEPTION 'credit date must follow invoice and settlement history and cannot be in the future'; END IF;
 IF EXISTS(SELECT 1 FROM public.customer_credit_notes WHERE original_invoice_id=v_i.id) THEN RAISE EXCEPTION 'invoice already has a legacy full credit'; END IF;
 IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'credit one to 200 original invoice lines'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
  IF v_item-ARRAY['line_id','amount']<>'{}'::jsonb OR jsonb_typeof(v_item->'amount') IS DISTINCT FROM 'string' OR (v_item->>'line_id')::uuid=ANY(v_seen) THEN RAISE EXCEPTION 'credit lines must be unique with exact decimal amounts'; END IF;
  SELECT * INTO v_line FROM public.invoice_lines WHERE id=(v_item->>'line_id')::uuid AND invoice_id=v_i.id AND org_id=v_org;
  IF v_line.id IS NULL THEN RAISE EXCEPTION 'original invoice line unavailable'; END IF;
  v_amount:=public.cash_amount(v_item->>'amount');
  SELECT v_line.line_total-coalesce(sum(coalesce(a->>'netAmount',a->>'amount')::numeric),0) INTO v_remaining FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) a
   WHERE c.invoice_id=v_i.id AND c.reversal_date IS NULL AND a->>'lineId'=v_line.id::text;
  IF v_amount<=0 OR v_amount>v_remaining THEN RAISE EXCEPTION 'credit exceeds the uncredited original invoice line'; END IF;
  v_total:=v_total+v_amount;v_seen:=array_append(v_seen,v_line.id);
  SELECT public.tax_credit_components(v_tax.id,v_line.id,v_amount,(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM public.finance_customer_credits c WHERE c.invoice_id=v_i.id)) INTO v_tax_parts;
  SELECT coalesce(sum((a->>'amount')::numeric),0) INTO v_tax_line FROM jsonb_array_elements(v_tax_parts) a;
  v_tax_total:=v_tax_total+v_tax_line;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('lineId',v_line.id,'description',v_line.description,'amount',round(v_amount+v_tax_line,2)::text,'netAmount',round(v_amount,2)::text,'taxAmount',round(v_tax_line,2)::text,'taxComponents',v_tax_parts,'revenueAccountId',v_line.revenue_account_id));
 END LOOP;
 SELECT ar_account_id INTO v_ar_account FROM public.entity_invoice_account_controls WHERE id=v_i.account_control_id;
 v_ar:=least(v_total+v_tax_total,public.customer_invoice_remaining(v_i.id,v_date));v_balance:=v_total+v_tax_total-v_ar;
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE invoice_id=v_i.id;
 IF v_cycle.id IS NOT NULL THEN
  SELECT * INTO v_contract FROM public.finance_contracts WHERE id=v_cycle.contract_id;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of>v_date) THEN RAISE EXCEPTION 'credit must follow recognized contract history'; END IF;
  SELECT v_cycle.price-coalesce(sum(public.customer_credit_net(lines)),0) INTO v_remaining FROM public.finance_customer_credits WHERE invoice_id=v_i.id AND reversal_date IS NULL;
  FOR v_o IN SELECT value FROM jsonb_array_elements(v_cycle.allocations) LOOP
   SELECT coalesce(sum((a->>'amount')::numeric),0),coalesce(sum((a->>'recognized')::numeric),0) INTO v_prior,v_rec_part
    FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.obligations) a WHERE c.invoice_id=v_i.id AND c.reversal_date IS NULL AND a->>'key'=v_o->>'key';
   v_price:=(v_o->>'amount')::numeric-v_prior;
   SELECT coalesce(sum((a->>'amount')::numeric),0)-v_rec_part INTO v_rec FROM public.finance_revenue_entries e CROSS JOIN LATERAL jsonb_array_elements(e.allocations) a WHERE e.cycle_id=v_cycle.id AND a->>'key'=v_o->>'key';
   v_cumulative:=v_cumulative+v_price;v_amount:=round(v_total*v_cumulative/v_remaining,2)-v_allocated;v_allocated:=v_allocated+v_amount;
   v_rec_part:=CASE WHEN v_price=0 THEN 0 ELSE round(v_amount*v_rec/v_price,2) END;
   v_revenue_part:=v_revenue_part+v_rec_part;v_deferred_part:=v_deferred_part+v_amount-v_rec_part;
   v_obligations:=v_obligations||jsonb_build_array(jsonb_build_object('key',v_o->>'key','amount',round(v_amount,2)::text,'recognized',round(v_rec_part,2)::text));
  END LOOP;
  IF v_revenue_part>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_lines->0->>'revenueAccountId','debit',round(v_revenue_part,2)::text,'credit','0.00')); END IF;
  IF v_deferred_part>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_contract.terms->>'deferred_account_id','debit',round(v_deferred_part,2)::text,'credit','0.00')); END IF;
 ELSE
  SELECT jsonb_agg(jsonb_build_object('account_id',account,'debit',round(amount,2)::text,'credit','0.00') ORDER BY account) INTO v_journal
   FROM (SELECT a->>'revenueAccountId' AS account,sum((a->>'netAmount')::numeric) AS amount FROM jsonb_array_elements(v_lines) a GROUP BY 1) x;
 END IF;
 IF v_tax_total>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',(SELECT sales_account FROM public.finance_tax_policies WHERE id=v_tax.policy_id),'debit',round(v_tax_total,2)::text,'credit','0.00'));END IF;
 IF v_ar>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_ar_account,'debit','0.00','credit',round(v_ar,2)::text)); END IF;
 IF v_balance>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_policy.liability_account_id,'debit','0.00','credit',round(v_balance,2)::text)); END IF;
 RETURN jsonb_build_object('invoiceId',v_i.id,'customerId',v_i.customer_id,'controlId',v_policy.id,'amount',round(v_total+v_tax_total,2)::text,'arAmount',round(v_ar,2)::text,'balanceAmount',round(v_balance,2)::text,'lines',v_lines,'obligations',v_obligations,'journalLines',v_journal);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_customer_credit_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_customer_credits%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_i public.invoices%ROWTYPE;v_p jsonb;v_line jsonb;v_day record;v_total numeric;
BEGIN
 SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=p_id;
 IF v_c.id IS NULL THEN RAISE EXCEPTION 'customer credit graph is missing'; END IF;
 SELECT * INTO v_i FROM public.invoices WHERE id=v_c.invoice_id;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_c.request_id;
 v_p:=v_r.source_snapshot->'creditPreview';
 IF v_r.id IS NULL OR v_r.org_id<>v_c.org_id OR v_r.entity_id<>v_c.entity_id OR v_r.kind<>'CUSTOMER_CREDIT' OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR
  v_r.payload->>'reference' IS DISTINCT FROM v_c.reference OR (v_r.payload->>'date')::date IS DISTINCT FROM v_c.as_of OR
  v_p IS DISTINCT FROM jsonb_build_object('invoiceId',v_c.invoice_id,'customerId',v_c.customer_id,'controlId',v_c.control_id,'amount',v_c.amount::text,'arAmount',v_c.ar_amount::text,'balanceAmount',v_c.balance_amount::text,'lines',v_c.lines,'obligations',v_c.obligations,'journalLines',v_c.journal_lines) OR
  v_i.org_id IS DISTINCT FROM v_c.org_id OR v_i.entity_id IS DISTINCT FROM v_c.entity_id OR v_i.customer_id IS DISTINCT FROM v_c.customer_id OR v_i.issue_date>v_c.as_of THEN RAISE EXCEPTION 'customer credit approval or invoice graph is invalid'; END IF;
 PERFORM public.validate_customer_invoice_graph(v_c.invoice_id);PERFORM public.validate_customer_credit_control_graph(v_c.control_id);
 IF (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(v_c.lines) a) IS DISTINCT FROM v_c.amount THEN RAISE EXCEPTION 'customer credit line total is invalid'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v_c.lines) LOOP
  SELECT line_total+public.invoice_line_tax(id) INTO v_total FROM public.invoice_lines WHERE id=(v_line->>'lineId')::uuid AND invoice_id=v_c.invoice_id;
  IF v_total IS NULL OR (v_line->>'amount')::numeric<=0 THEN RAISE EXCEPTION 'customer credit original line is invalid'; END IF;
  IF EXISTS(WITH movements AS (
   SELECT c.as_of AS day,(a->>'amount')::numeric AS amount FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) a WHERE c.invoice_id=v_c.invoice_id AND a->>'lineId'=v_line->>'lineId'
   UNION ALL SELECT c.reversal_date,-(a->>'amount')::numeric FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) a WHERE c.invoice_id=v_c.invoice_id AND a->>'lineId'=v_line->>'lineId' AND c.reversal_date IS NOT NULL
  ),daily AS(SELECT day,sum(amount) AS amount FROM movements GROUP BY day),balances AS(SELECT sum(amount) OVER(ORDER BY day) AS amount FROM daily) SELECT 1 FROM balances WHERE amount<0 OR amount>v_total) THEN RAISE EXCEPTION 'dated credits exceed the original invoice line'; END IF;
 END LOOP;
 PERFORM public.validate_tax_credit(v_c.id);
 PERFORM public.assert_finance_journal(v_c.journal_id,v_c.org_id,v_c.entity_id,v_c.as_of,v_c.journal_lines,v_c.reversal_journal);
 IF v_c.reversal_date IS NOT NULL THEN
  IF v_c.reversal_date<v_c.as_of OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_c.reversal_request AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='CUSTOMER_CREDIT_REVERSE' AND payload->>'credit_id'=v_c.id::text AND (payload->>'date')::date=v_c.reversal_date AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by) THEN RAISE EXCEPTION 'customer credit reversal approval is invalid'; END IF;
  PERFORM public.assert_finance_journal(v_c.reversal_journal,v_c.org_id,v_c.entity_id,v_c.reversal_date,public.flip_finance_lines(v_c.journal_lines),NULL,v_c.journal_id);
 ELSIF v_c.reversal_journal IS NOT NULL OR v_c.reversal_request IS NOT NULL THEN RAISE EXCEPTION 'incomplete customer credit reversal'; END IF;
 FOR v_day IN SELECT v_c.as_of AS day UNION SELECT v_c.reversal_date WHERE v_c.reversal_date IS NOT NULL UNION SELECT as_of FROM public.finance_customer_credit_uses WHERE credit_id=v_c.id UNION SELECT reversal_date FROM public.finance_customer_credit_uses WHERE credit_id=v_c.id AND reversal_date IS NOT NULL LOOP
  v_total:=public.customer_credit_remaining(v_c.id,v_day.day);
  IF v_total<0 OR v_total>v_c.balance_amount THEN RAISE EXCEPTION 'dated refund and application balance exceeds the customer credit'; END IF;
 END LOOP;
 PERFORM public.validate_settlement_capacity('ar',v_c.invoice_id);
END; $$;

CREATE OR REPLACE FUNCTION public.post_supplier_bill_credit(
  p_bill_id uuid,p_credit_note_number text,p_credit_date date,
  p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid; v_actor uuid; v_bill public.bills%ROWTYPE;
  v_original public.journal_entries%ROWTYPE; v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_period_id uuid; v_credit_id uuid:=gen_random_uuid(); v_event_id uuid; v_journal_id uuid;
  v_existing_id uuid; v_existing_bill_id uuid; v_existing_hash text; v_payload_hash text;
BEGIN
  v_org_id:=public.get_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor:=public.assert_accounting_actor(v_org_id);
  IF p_credit_note_number IS NULL OR p_credit_note_number IS DISTINCT FROM btrim(p_credit_note_number)
     OR length(p_credit_note_number) NOT BETWEEN 1 AND 80 OR p_credit_note_number~'[[:cntrl:]]'
     OR p_reason IS NULL OR p_reason IS DISTINCT FROM btrim(p_reason)
     OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason~'[[:cntrl:]]'
     OR p_credit_date IS NULL OR p_idempotency_key IS NULL
     OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160 OR p_idempotency_key~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid supplier credit request';
  END IF;
  v_payload_hash:=md5(jsonb_build_object('bill_id',p_bill_id,
    'credit_note_number',p_credit_note_number,'credit_date',p_credit_date,
    'reason',p_reason)::text);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.bills IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.supplier_bill_credit_notes IN SHARE ROW EXCLUSIVE MODE;
  SELECT id,original_bill_id,payload_hash INTO v_existing_id,v_existing_bill_id,v_existing_hash
  FROM public.supplier_bill_credit_notes WHERE org_id=v_org_id AND idempotency_key=p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_bill_id IS DISTINCT FROM p_bill_id OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'supplier credit idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_supplier_bill_credit_graph(v_existing_id);
    RETURN v_existing_id;
  END IF;
  SELECT * INTO v_bill FROM public.bills
  WHERE id=p_bill_id AND org_id=v_org_id AND accounting_status='POSTED'
    AND journal_entry_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'posted supplier bill not found or unavailable'; END IF;
  IF p_credit_date<v_bill.issue_date THEN RAISE EXCEPTION 'supplier credit date cannot precede bill date'; END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_bill_credit_notes WHERE original_bill_id=v_bill.id) THEN
    RAISE EXCEPTION 'supplier bill already has a full supplier credit';
  END IF;
  PERFORM public.validate_supplier_bill_graph(v_bill.id);
  SELECT * INTO v_original FROM public.journal_entries WHERE id=v_bill.journal_entry_id FOR UPDATE;
  IF v_original.id IS NULL OR v_original.status::text IS DISTINCT FROM 'posted'
     OR v_original.reversal_of_id IS NOT NULL OR v_original.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'supplier bill journal is unavailable for full credit';
  END IF;
  SELECT * INTO v_control FROM public.entity_supplier_bill_account_controls
  WHERE id=v_bill.account_control_id AND org_id=v_org_id AND entity_id=v_bill.entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'supplier bill account control is unavailable'; END IF;
  SELECT id INTO v_period_id FROM public.accounting_periods
  WHERE org_id=v_org_id AND entity_id=v_bill.entity_id
    AND p_credit_date BETWEEN period_start AND period_end AND status='OPEN' FOR UPDATE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'an OPEN accounting period is required'; END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  PERFORM set_config('tapaano.supplier_bill_write','trusted',true);
  PERFORM set_config('tapaano.supplier_bill_credit_write','trusted',true);
  INSERT INTO public.accounting_events(
    org_id,entity_id,event_type,source_type,source_id,idempotency_key,payload_hash,actor_id
  ) VALUES(v_org_id,v_bill.entity_id,'supplier_bill_credit_posted','supplier_bill_credit',
    v_credit_id,p_idempotency_key,v_payload_hash,v_actor) RETURNING id INTO v_event_id;
  INSERT INTO public.journal_entries(
    org_id,entity_id,entry_number,entry_date,memo,status,created_by,posted_at,
    source_module,accounting_period_id,accounting_event_id,reversal_of_id
  ) VALUES(v_org_id,v_bill.entity_id,
    'VC-'||left(p_credit_note_number,40)||'-'||left(md5(p_idempotency_key),8),
    p_credit_date,'Supplier credit '||p_credit_note_number||': '||p_reason,
    'posted',v_actor,now(),'ap_credit',v_period_id,v_event_id,v_original.id)
  RETURNING id INTO v_journal_id;
  IF EXISTS(SELECT 1 FROM public.finance_tax_documents WHERE bill_id=v_bill.id) THEN
    INSERT INTO public.journal_lines(journal_entry_id,account_id,debit,credit,memo,org_id,entity_id,line_number)
    SELECT v_journal_id,account_id,credit,debit,'Reverse assessed supplier cost and tax',org_id,entity_id,line_number FROM public.journal_lines WHERE journal_entry_id=v_original.id;
  ELSE
  INSERT INTO public.journal_lines(
    journal_entry_id,account_id,debit,credit,memo,org_id,entity_id,line_number
  ) VALUES
    (v_journal_id,v_control.ap_account_id,v_bill.total,0,'Reverse accounts payable',v_org_id,v_bill.entity_id,1),
    (v_journal_id,v_control.expense_account_id,0,v_bill.total,'Reverse expense',v_org_id,v_bill.entity_id,2);
  END IF;
  INSERT INTO public.supplier_bill_credit_notes(
    id,org_id,entity_id,vendor_id,original_bill_id,credit_note_number,issue_date,
    currency,total,reason,account_control_id,accounting_event_id,journal_entry_id,
    idempotency_key,payload_hash,posted_by,posted_at
  ) VALUES(v_credit_id,v_org_id,v_bill.entity_id,v_bill.vendor_id,v_bill.id,
    p_credit_note_number,p_credit_date,upper(v_bill.currency),v_bill.total,p_reason,
    v_bill.account_control_id,v_event_id,v_journal_id,p_idempotency_key,v_payload_hash,v_actor,now());
  INSERT INTO public.supplier_bill_credit_note_lines(
    org_id,entity_id,credit_note_id,original_bill_id,original_bill_line_id,
    line_number,description,quantity,unit_price,line_total,expense_account_id
  ) SELECT org_id,entity_id,v_credit_id,bill_id,id,line_number,description,
    quantity,unit_price,line_total,expense_account_id
  FROM public.bill_lines WHERE bill_id=v_bill.id ORDER BY line_number;
  UPDATE public.accounting_events SET journal_entry_id=v_journal_id WHERE id=v_event_id;
  UPDATE public.journal_entries SET reversed_by_id=v_journal_id WHERE id=v_original.id;
  PERFORM public.validate_supplier_bill_credit_graph(v_credit_id);
  RETURN v_credit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pre_tax_credit_preview(p_entity uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_preview jsonb;v_cycle public.finance_contract_cycles%ROWTYPE;v_c public.finance_contracts%ROWTYPE;v_credit numeric;v_lines jsonb:='[]';v_ar uuid;v_liability uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.finance_tax_documents WHERE invoice_id=(p_payload->>'invoice_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id()) THEN v_preview:=public.tax_credit_preview(p_entity,p_payload-ARRAY['mode','service_cutoff']);ELSE v_preview:=public.concession_credit_preview(p_entity,p_payload-ARRAY['mode','service_cutoff']);END IF;
 IF NOT (p_payload ? 'mode') THEN RETURN v_preview; END IF;
 IF p_payload->>'mode'<>'UNUSED_SERVICE' OR (p_payload->>'service_cutoff')::date<>(p_payload->>'date')::date THEN RAISE EXCEPTION 'invalid unused service credit'; END IF;
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE invoice_id=(p_payload->>'invoice_id')::uuid;
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=v_cycle.contract_id;
 IF v_c.terms->>'kind' IS DISTINCT FROM 'FIXED' OR jsonb_array_length(v_cycle.allocations)<>1 OR v_cycle.allocations->0->>'method'<>'DAILY' THEN RAISE EXCEPTION 'unused service credit requires one daily subscription obligation'; END IF;
 v_credit:=public.customer_credit_net(v_preview->'lines');
 v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_c.terms->>'deferred_account_id','debit',round(v_credit,2)::text,'credit','0.00'));
 IF (v_preview->>'amount')::numeric>v_credit THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',(SELECT p.sales_account FROM public.finance_tax_policies p WHERE p.entity_id=p_entity),'debit',round((v_preview->>'amount')::numeric-v_credit,2)::text,'credit','0.00'));END IF;
 SELECT ar_account_id INTO v_ar FROM public.entity_invoice_account_controls WHERE entity_id=p_entity;
 SELECT liability_account_id INTO v_liability FROM public.finance_customer_credit_controls WHERE id=(v_preview->>'controlId')::uuid;
 IF (v_preview->>'arAmount')::numeric>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_ar,'debit','0.00','credit',v_preview->>'arAmount')); END IF;
 IF (v_preview->>'balanceAmount')::numeric>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_liability,'debit','0.00','credit',v_preview->>'balanceAmount')); END IF;
 RETURN v_preview||jsonb_build_object('obligations',jsonb_build_array(jsonb_build_object('key',v_cycle.allocations->0->>'key','amount',round(v_credit,2)::text,'recognized','0.00')),'journalLines',v_lines);
END; $$;
CREATE OR REPLACE FUNCTION public.validate_subscription_change_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_s public.finance_subscription_changes%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_restore public.finance_requests%ROWTYPE;v_c public.finance_contracts%ROWTYPE;v_p jsonb;v_a record;v_credit public.finance_customer_credits%ROWTYPE;
BEGIN
 SELECT * INTO v_s FROM public.finance_subscription_changes WHERE id=p_id;SELECT * INTO v_r FROM public.finance_requests WHERE id=v_s.request_id;v_p:=v_r.source_snapshot;
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=v_s.contract_id;
 IF v_s.id IS NULL OR v_c.org_id IS DISTINCT FROM v_s.org_id OR v_c.entity_id IS DISTINCT FROM v_s.entity_id OR v_r.org_id IS DISTINCT FROM v_s.org_id OR v_r.entity_id IS DISTINCT FROM v_s.entity_id OR v_r.kind<>(CASE WHEN v_s.action='RENEW' THEN 'SUBSCRIPTION_RENEW' ELSE 'SUBSCRIPTION_CHANGE' END) OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR
  (v_p->>'contractId')::uuid IS DISTINCT FROM v_s.contract_id OR (v_p->>'cycleId')::uuid IS DISTINCT FROM v_s.cycle_id OR (v_p->>'effectiveOn')::date IS DISTINCT FROM v_s.effective_on OR v_p->>'action' IS DISTINCT FROM v_s.action OR to_jsonb(v_s.cancelled_cycles) IS DISTINCT FROM v_p->'cancelledCycles' THEN RAISE EXCEPTION 'subscription change approval graph is invalid'; END IF;
 IF (v_s.replacement_id IS NOT NULL) IS DISTINCT FROM coalesce(v_p->'replacementTerms'<>'null'::jsonb,false) OR
  (v_s.credit_id IS NOT NULL) IS DISTINCT FROM coalesce((v_p->>'unusedCredit')::numeric>0,false) THEN RAISE EXCEPTION 'subscription approved source links are missing or unexpected'; END IF;
 FOR v_a IN SELECT id FROM public.finance_subscription_actions WHERE parent_request=v_s.request_id LOOP PERFORM public.validate_subscription_action_graph(v_a.id);END LOOP;
 IF (SELECT count(*) FROM public.finance_subscription_actions WHERE parent_request=v_s.request_id)<>jsonb_array_length(v_p->'actions') THEN RAISE EXCEPTION 'subscription plan did not execute every approved action'; END IF;
 IF v_s.replacement_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.finance_contracts c JOIN public.finance_subscription_actions a ON a.child_request=c.creation_request WHERE c.id=v_s.replacement_id AND c.org_id=v_s.org_id AND c.entity_id=v_s.entity_id AND c.customer_id=v_c.customer_id AND c.terms=v_p->'replacementTerms' AND a.parent_request=v_s.request_id AND a.slot IN ('REPLACEMENT','RENEWAL')) THEN RAISE EXCEPTION 'replacement subscription terms differ from approved consideration'; END IF;
  PERFORM public.validate_contract_graph(v_s.replacement_id);
 END IF;
 IF v_s.credit_id IS NOT NULL THEN
  SELECT * INTO v_credit FROM public.finance_customer_credits WHERE id=v_s.credit_id;
  IF public.customer_credit_net(v_credit.lines) IS DISTINCT FROM (v_p->>'unusedCredit')::numeric OR v_credit.as_of<>v_s.effective_on OR
   NOT EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE id=v_s.cycle_id AND invoice_id=v_credit.invoice_id) OR
   NOT EXISTS(SELECT 1 FROM public.finance_subscription_actions WHERE parent_request=v_s.request_id AND child_request=v_credit.request_id AND slot='UNUSED') THEN RAISE EXCEPTION 'subscription unused credit graph is invalid'; END IF;
  PERFORM public.validate_customer_credit_graph(v_credit.id);
 END IF;
 IF v_s.reversal_request IS NULL THEN
  IF v_s.reversal_date IS NOT NULL OR v_credit.reversal_date IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE id=ANY(v_s.cancelled_cycles) AND cancel_request IS DISTINCT FROM v_s.request_id) THEN RAISE EXCEPTION 'active subscription cancellation or unused credit was detached'; END IF;
 ELSE
  IF v_s.reversal_date IS DISTINCT FROM v_s.effective_on OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_s.reversal_request AND org_id=v_s.org_id AND entity_id=v_s.entity_id AND kind='SUBSCRIPTION_REVERSE' AND payload->>'change_id'=v_s.id::text AND (payload->>'date')::date=v_s.reversal_date AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by) THEN RAISE EXCEPTION 'subscription correction approval graph is invalid'; END IF;
  SELECT * INTO v_restore FROM public.finance_requests WHERE id=v_s.reversal_request;
  IF (SELECT count(*) FROM public.finance_subscription_actions WHERE parent_request=v_s.reversal_request)<>jsonb_array_length(v_restore.source_snapshot->'actions') THEN RAISE EXCEPTION 'subscription correction plan did not execute every approved action'; END IF;
  FOR v_a IN SELECT id FROM public.finance_subscription_actions WHERE parent_request=v_s.reversal_request LOOP PERFORM public.validate_subscription_action_graph(v_a.id);END LOOP;
  IF v_s.credit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_subscription_actions WHERE parent_request=v_s.reversal_request AND child_request=v_credit.reversal_request AND slot='RESTORE_CREDIT') THEN RAISE EXCEPTION 'subscription correction credit is detached from its approved action'; END IF;
  IF v_s.credit_id IS NOT NULL AND v_credit.reversal_date IS DISTINCT FROM v_s.reversal_date THEN RAISE EXCEPTION 'subscription correction did not restore its unused credit'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE contract_id=v_s.replacement_id AND cancel_request IS DISTINCT FROM v_s.reversal_request) THEN RAISE EXCEPTION 'corrected replacement subscription remains active'; END IF;
 END IF;
 PERFORM public.validate_contract_graph(v_s.contract_id);
END; $$;
CREATE OR REPLACE FUNCTION public.validate_tax_document_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.finance_tax_documents%ROWTYPE;
BEGIN
 SELECT * INTO t FROM public.finance_tax_documents WHERE id=p_id;
 IF t.id IS NULL THEN RAISE EXCEPTION 'tax document graph missing';END IF;
 IF t.kind='AR' THEN PERFORM public.validate_customer_invoice_graph(t.invoice_id);ELSE PERFORM public.validate_supplier_bill_graph(t.bill_id);END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_tax_settlement_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.finance_tax_settlements%ROWTYPE;p public.finance_tax_policies%ROWTYPE;lines jsonb;
BEGIN
 SELECT * INTO s FROM public.finance_tax_settlements WHERE id=p_id;SELECT * INTO p FROM public.finance_tax_policies WHERE id=s.policy_id;
 IF s.id IS NULL OR p.org_id IS DISTINCT FROM s.org_id OR p.entity_id IS DISTINCT FROM s.entity_id OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=s.request_id AND org_id=s.org_id AND entity_id=s.entity_id AND kind='TAX_SETTLE' AND state IN ('EXECUTING','APPROVED') AND requested_by<>decided_by AND payload=jsonb_build_object('kind',s.kind,'date',s.as_of,'amount',s.amount::text,'cash_account',s.cash_account,'reference',s.reference)) OR NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE org_id=s.org_id AND entity_id=s.entity_id AND account_id=s.cash_account) THEN RAISE EXCEPTION 'tax settlement approval and bank ownership are invalid';END IF;
 PERFORM public.validate_tax_policy(p.id);
 lines:=CASE s.kind WHEN 'SALES_PAYMENT' THEN public.finance_pair_lines(p.sales_account,s.cash_account,s.amount) ELSE public.finance_pair_lines(s.cash_account,p.recoverable_account,s.amount) END;
 PERFORM public.assert_finance_journal(s.journal_id,s.org_id,s.entity_id,s.as_of,lines,s.reversal_journal);
 IF s.reversal_date IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=s.reversal_request AND org_id=s.org_id AND entity_id=s.entity_id AND kind='TAX_SETTLEMENT_REVERSE' AND state IN ('EXECUTING','APPROVED') AND requested_by<>decided_by AND payload=jsonb_build_object('settlement_id',s.id,'date',s.reversal_date)) THEN RAISE EXCEPTION 'tax settlement correction approval is invalid';END IF;
  PERFORM public.assert_finance_journal(s.reversal_journal,s.org_id,s.entity_id,s.reversal_date,public.flip_finance_lines(lines),NULL,s.journal_id);
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.tax_register_movements(p_entity uuid)
RETURNS TABLE(source_id uuid,source_kind text,as_of date,account_id uuid,jurisdiction text,amount numeric,journal_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH originals AS (
  SELECT t.id,t.org_id,t.entity_id,t.kind,t.invoice_id,t.bill_id,t.policy_id,coalesce(i.issue_date,b.issue_date) AS day,coalesce(i.journal_entry_id,b.journal_entry_id) AS journal,
   a->>'jurisdiction' AS jurisdiction,(a->>'amount')::numeric AS amount,CASE a->>'treatment' WHEN 'SALES' THEN p.sales_account WHEN 'RECOVERABLE' THEN p.recoverable_account WHEN 'EXPENSE' THEN p.expense_account END AS account
  FROM public.finance_tax_documents t JOIN public.finance_tax_policies p ON p.id=t.policy_id LEFT JOIN public.invoices i ON i.id=t.invoice_id LEFT JOIN public.bills b ON b.id=t.bill_id CROSS JOIN LATERAL jsonb_array_elements(t.assessment->'lines') a WHERE t.entity_id=p_entity
 )
 SELECT id,kind,day,account,jurisdiction,amount,journal FROM originals WHERE amount<>0
 UNION ALL SELECT o.id,'FULL_CREDIT',coalesce(c.issue_date,b.issue_date),o.account,o.jurisdiction,-o.amount,coalesce(c.journal_entry_id,b.journal_entry_id) FROM originals o LEFT JOIN public.customer_credit_notes c ON c.original_invoice_id=o.invoice_id LEFT JOIN public.supplier_bill_credit_notes b ON b.original_bill_id=o.bill_id WHERE c.id IS NOT NULL OR b.id IS NOT NULL
 UNION ALL SELECT c.id,'CUSTOMER_CREDIT',c.as_of,(a->>'accountId')::uuid,a->>'jurisdiction',-(a->>'amount')::numeric,c.journal_id FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) l CROSS JOIN LATERAL jsonb_array_elements(l->'taxComponents') a WHERE c.entity_id=p_entity
 UNION ALL SELECT c.id,'CREDIT_CORRECTION',c.reversal_date,(a->>'accountId')::uuid,a->>'jurisdiction',(a->>'amount')::numeric,c.reversal_journal FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) l CROSS JOIN LATERAL jsonb_array_elements(l->'taxComponents') a WHERE c.entity_id=p_entity AND c.reversal_date IS NOT NULL
 UNION ALL SELECT s.id,s.kind,s.as_of,CASE s.kind WHEN 'SALES_PAYMENT' THEN p.sales_account ELSE p.recoverable_account END,'US-SETTLEMENT',-s.amount,s.journal_id FROM public.finance_tax_settlements s JOIN public.finance_tax_policies p ON p.id=s.policy_id WHERE s.entity_id=p_entity
 UNION ALL SELECT s.id,'SETTLEMENT_CORRECTION',s.reversal_date,CASE s.kind WHEN 'SALES_PAYMENT' THEN p.sales_account ELSE p.recoverable_account END,'US-SETTLEMENT',s.amount,s.reversal_journal FROM public.finance_tax_settlements s JOIN public.finance_tax_policies p ON p.id=s.policy_id WHERE s.entity_id=p_entity AND s.reversal_date IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.get_tax_register(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.get_user_org_id();currency text;p public.finance_tax_policies%ROWTYPE;r record;documents jsonb;movements jsonb;controls jsonb;settlements jsonb;result jsonb;
BEGIN
 SELECT e.currency INTO currency FROM public.entities e WHERE id=p_entity AND org_id=org;
 IF currency IS NULL OR p_from IS NULL OR p_through IS NULL OR p_from>p_through THEN RAISE EXCEPTION 'tax register scope unavailable';END IF;
 PERFORM public.get_entity_trial_balance(p_entity,p_from,p_through);
 SELECT * INTO p FROM public.finance_tax_policies WHERE entity_id=p_entity AND org_id=org;
 IF (SELECT count(*) FROM public.finance_tax_documents WHERE entity_id=p_entity)>2000 OR (SELECT count(*) FROM public.finance_tax_settlements WHERE entity_id=p_entity)>2000 THEN RAISE EXCEPTION 'tax register exceeds qualified source capacity';END IF;
 IF p.id IS NOT NULL THEN PERFORM public.validate_tax_policy(p.id);END IF;
 FOR r IN SELECT id FROM public.finance_tax_documents WHERE entity_id=p_entity LOOP PERFORM public.validate_tax_document_graph(r.id);END LOOP;
 FOR r IN SELECT id FROM public.finance_customer_credits WHERE entity_id=p_entity AND invoice_id IN (SELECT invoice_id FROM public.finance_tax_documents WHERE entity_id=p_entity) LOOP PERFORM public.validate_customer_credit_graph(r.id);END LOOP;
 FOR r IN SELECT id FROM public.finance_tax_settlements WHERE entity_id=p_entity LOOP PERFORM public.validate_tax_settlement_graph(r.id);END LOOP;
 FOR r IN SELECT c.id FROM public.customer_credit_notes c JOIN public.finance_tax_documents t ON t.invoice_id=c.original_invoice_id WHERE t.entity_id=p_entity LOOP PERFORM public.validate_customer_credit_note_graph(r.id);END LOOP;
 FOR r IN SELECT c.id FROM public.supplier_bill_credit_notes c JOIN public.finance_tax_documents t ON t.bill_id=c.original_bill_id WHERE t.entity_id=p_entity LOOP PERFORM public.validate_supplier_bill_credit_graph(r.id);END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'kind',t.kind,'documentId',coalesce(t.invoice_id,t.bill_id),'number',coalesce(i.invoice_number,b.bill_number),'date',coalesce(i.issue_date,b.issue_date),'subtotal',t.subtotal::text,'tax',t.tax::text,'total',t.total::text,'assessment',t.assessment,'requestId',t.request_id,'journalId',coalesce(i.journal_entry_id,b.journal_entry_id),'canCredit',NOT EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE invoice_id=t.invoice_id)) ORDER BY coalesce(i.issue_date,b.issue_date),t.id),'[]') INTO documents FROM public.finance_tax_documents t LEFT JOIN public.invoices i ON i.id=t.invoice_id LEFT JOIN public.bills b ON b.id=t.bill_id WHERE t.entity_id=p_entity AND coalesce(i.issue_date,b.issue_date) BETWEEN p_from AND p_through;
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',source_id,'kind',source_kind,'date',as_of,'accountId',account_id,'jurisdiction',jurisdiction,'amount',round(amount,2)::text,'journalId',journal_id) ORDER BY as_of,source_id,account_id,jurisdiction),'[]') INTO movements FROM public.tax_register_movements(p_entity) WHERE as_of BETWEEN p_from AND p_through;
 WITH balances AS (
  SELECT a.id,a.code,a.name,a.account_type,coalesce((SELECT sum(amount) FROM public.tax_register_movements(p_entity) WHERE account_id=a.id AND as_of<=p_through),0) AS expected,
   coalesce((SELECT sum(CASE WHEN a.account_type='liability' THEN l.credit-l.debit ELSE l.debit-l.credit END) FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=p_entity AND j.org_id=org AND j.status='posted' AND j.entry_date<=p_through AND l.account_id=a.id),0) AS ledger
  FROM public.accounts a WHERE a.id IN (p.sales_account,p.recoverable_account)
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',id,'code',code,'name',name,'expected',round(expected,2)::text,'ledger',round(ledger,2)::text,'variance',round(ledger-expected,2)::text) ORDER BY code),'[]') INTO controls FROM balances;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'date',as_of,'amount',amount::text,'reference',reference,'journalId',journal_id,'reversedOn',CASE WHEN reversal_date<=p_through THEN reversal_date END) ORDER BY as_of,id),'[]') INTO settlements FROM public.finance_tax_settlements WHERE entity_id=p_entity AND as_of BETWEEN p_from AND p_through;
 result:=jsonb_build_object('entityId',p_entity,'currency',currency,'from',p_from,'through',p_through,'policy',CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END,'documents',documents,'movements',movements,'settlements',settlements,'controls',controls,'reconciled',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(controls) a WHERE (a->>'variance')::numeric<>0));
 RETURN result||jsonb_build_object('revision',md5(result::text));
END; $$;
CREATE OR REPLACE FUNCTION public.get_customer_adjustments(p_entity uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;invoices jsonb:='[]';i jsonb;l jsonb;lines jsonb;tax numeric;net numeric;net_used numeric;gross_used numeric;
BEGIN
 r:=public.pre_tax_adjustments(p_entity,p_as_of);
 FOR i IN SELECT value FROM jsonb_array_elements(r->'invoices') LOOP
  lines:='[]';
  FOR l IN SELECT value FROM jsonb_array_elements(i->'lines') LOOP
   SELECT line_total INTO net FROM public.invoice_lines WHERE id=(l->>'id')::uuid;tax:=public.invoice_line_tax((l->>'id')::uuid);
   SELECT coalesce(sum(coalesce(a->>'netAmount',a->>'amount')::numeric),0),coalesce(sum((a->>'amount')::numeric),0) INTO net_used,gross_used FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) a WHERE c.invoice_id=(i->>'id')::uuid AND c.as_of<=p_as_of AND (c.reversal_date IS NULL OR c.reversal_date>p_as_of) AND a->>'lineId'=l->>'id';
   lines:=lines||jsonb_build_array(l||jsonb_build_object('original',round(net+tax,2)::text,'available',round(net+tax-gross_used,2)::text,'netOriginal',round(net,2)::text,'netAvailable',round(net-net_used,2)::text,'originalTax',round(tax,2)::text));
  END LOOP;
  invoices:=invoices||jsonb_build_array(i||jsonb_build_object('lines',lines));
 END LOOP;
 r:=(r-'revision')||jsonb_build_object('invoices',invoices);RETURN r||jsonb_build_object('revision',md5(r::text));
END; $$;
CREATE OR REPLACE FUNCTION public.get_finance_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;t jsonb;
BEGIN
 r:=public.pre_tax_close(p_entity,p_from,p_through);t:=public.get_tax_register(p_entity,p_from,p_through);
 r:=r||jsonb_build_object('taxReconciled',(t->>'reconciled')::boolean,'taxControls',t->'controls','taxRevision',t->>'revision','canClose',(r->>'canClose')::boolean AND (t->>'reconciled')::boolean);RETURN r||jsonb_build_object('revision',md5((r-ARRAY['revision','generatedAt'])::text));
END; $$;
CREATE OR REPLACE FUNCTION public.guard_tax_sources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.finance_requests%ROWTYPE;document uuid;s uuid;
BEGIN
 SELECT * INTO r FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND org_id=NEW.org_id AND entity_id=NEW.entity_id AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid();
 IF TG_TABLE_NAME='journal_entries' THEN
  IF NEW.reversal_of_id IS NULL THEN RETURN NEW;END IF;
  SELECT id INTO s FROM public.finance_tax_settlements WHERE journal_id=NEW.reversal_of_id;
  IF s IS NOT NULL AND (r.id IS NULL OR r.kind<>'TAX_SETTLEMENT_REVERSE' OR r.payload->>'settlement_id' IS DISTINCT FROM s::text) THEN RAISE EXCEPTION 'tax settlements require their linked independent correction';END IF;
 ELSIF TG_TABLE_NAME='customer_credit_notes' THEN
  SELECT id INTO document FROM public.finance_tax_documents WHERE invoice_id=NEW.original_invoice_id;
  IF document IS NOT NULL AND (r.id IS NULL OR NOT ((r.kind='TAX_DOCUMENT_CREDIT' AND r.payload->>'document_id'=document::text) OR (r.kind='CONTRACT_CREDIT' AND EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE id=(r.payload->>'cycle_id')::uuid AND invoice_id=NEW.original_invoice_id)))) THEN RAISE EXCEPTION 'tax-bearing full credit requires independent source approval';END IF;
 ELSE
  SELECT id INTO document FROM public.finance_tax_documents WHERE bill_id=NEW.original_bill_id;
  IF document IS NOT NULL AND (r.id IS NULL OR r.kind<>'TAX_DOCUMENT_CREDIT' OR r.payload->>'document_id' IS DISTINCT FROM document::text) THEN RAISE EXCEPTION 'tax-bearing supplier credit requires independent source approval';END IF;
 END IF;RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.check_tax_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_tax_policies' THEN PERFORM public.validate_tax_policy(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
 ELSIF TG_TABLE_NAME='finance_tax_documents' THEN PERFORM public.validate_tax_document_graph(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
 ELSE PERFORM public.validate_tax_settlement_graph(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);END IF;RETURN NULL;
END; $$;
DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_tax_policies','finance_tax_documents','finance_tax_settlements'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS tax_graph ON public.%I',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER tax_graph AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_tax_graph_trigger()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['journal_entries','customer_credit_notes','supplier_bill_credit_notes'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS tax_source ON public.%I',t);
  EXECUTE format('CREATE TRIGGER tax_source BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_tax_sources()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'pre_tax_%' OR proname IN ('validate_tax_policy','tax_assessment','attach_document_tax','validate_document_tax','tax_request_assessment','tax_credit_preview','customer_credit_net','invoice_line_tax','tax_credit_components','validate_tax_credit','customer_credit_preview','validate_tax_document_graph','validate_tax_settlement_graph','tax_register_movements','get_tax_register','guard_tax_sources','check_tax_graph_trigger','validate_finance_extension','finance_source_snapshot','execute_finance_extension','post_customer_invoice','post_supplier_bill','get_customer_adjustments','get_finance_close_check')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('get_tax_register','post_customer_invoice','post_supplier_bill','get_customer_adjustments','get_finance_close_check') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
COMMIT;
