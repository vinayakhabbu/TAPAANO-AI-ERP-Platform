BEGIN;
LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF to_regprocedure('public.pre_fx_validate(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO pre_fx_validate;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO pre_fx_snapshot;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO pre_fx_execute;
  ALTER FUNCTION public.get_finance_close_check(uuid,date,date) RENAME TO pre_fx_close;
  ALTER FUNCTION public.tax_register_movements(uuid) RENAME TO pre_fx_tax_movements;
 END IF;
END; $$;
CREATE TABLE IF NOT EXISTS public.finance_fx_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,
 receivable_account uuid NOT NULL,payable_account uuid NOT NULL,unrealized_gain uuid NOT NULL,unrealized_loss uuid NOT NULL,realized_gain uuid NOT NULL,realized_loss uuid NOT NULL,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(entity_id),UNIQUE(request_id),FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,receivable_account) REFERENCES public.accounts(org_id,id),FOREIGN KEY(org_id,payable_account) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,unrealized_gain) REFERENCES public.accounts(org_id,id),FOREIGN KEY(org_id,unrealized_loss) REFERENCES public.accounts(org_id,id),FOREIGN KEY(org_id,realized_gain) REFERENCES public.accounts(org_id,id),FOREIGN KEY(org_id,realized_loss) REFERENCES public.accounts(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_fx_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,policy_id uuid NOT NULL,kind text NOT NULL,
 customer_id uuid,vendor_id uuid,number text NOT NULL,as_of date NOT NULL,due_date date NOT NULL,currency text NOT NULL,functional_currency text NOT NULL,
 foreign_net numeric(15,2) NOT NULL,foreign_tax numeric(15,2) NOT NULL,foreign_total numeric(15,2) NOT NULL,initial_rate numeric(18,8) NOT NULL,functional_total numeric(15,2) NOT NULL,
 offset_account uuid NOT NULL,tax_policy_id uuid,tax_parts jsonb NOT NULL,tax_assessment jsonb,journal_lines jsonb NOT NULL,journal_id uuid NOT NULL,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(entity_id,kind,number),UNIQUE(journal_id),UNIQUE(request_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),FOREIGN KEY(org_id,policy_id) REFERENCES public.finance_fx_policies(org_id,id),
 FOREIGN KEY(org_id,customer_id) REFERENCES public.customers(org_id,id),FOREIGN KEY(org_id,vendor_id) REFERENCES public.vendors(org_id,id),
 FOREIGN KEY(org_id,offset_account) REFERENCES public.accounts(org_id,id),FOREIGN KEY(org_id,tax_policy_id) REFERENCES public.finance_tax_policies(org_id,id),
 FOREIGN KEY(org_id,journal_id) REFERENCES public.journal_entries(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 CHECK((kind='RECEIVABLE' AND customer_id IS NOT NULL AND vendor_id IS NULL) OR (kind='PAYABLE' AND vendor_id IS NOT NULL AND customer_id IS NULL)),
 CHECK(due_date>=as_of AND foreign_net>0 AND foreign_tax>=0 AND foreign_total=foreign_net+foreign_tax AND functional_total>0 AND initial_rate>0 AND foreign_total::text NOT IN ('NaN','Infinity','-Infinity') AND functional_total::text NOT IN ('NaN','Infinity','-Infinity') AND initial_rate::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE TABLE IF NOT EXISTS public.finance_fx_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,document_id uuid NOT NULL,version integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('REMEASURE','SETTLE','VOID','REVERSE')),as_of date NOT NULL,rate numeric(18,8),foreign_amount numeric(15,2) NOT NULL,functional_cash numeric(15,2) NOT NULL,
 cash_account uuid,reverse_of uuid,before_state jsonb NOT NULL,after_state jsonb NOT NULL,journal_lines jsonb NOT NULL,journal_id uuid,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(document_id,version),UNIQUE(reverse_of),UNIQUE(journal_id),UNIQUE(request_id),
 FOREIGN KEY(org_id,document_id) REFERENCES public.finance_fx_documents(org_id,id),FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,reverse_of) REFERENCES public.finance_fx_events(org_id,id),FOREIGN KEY(org_id,cash_account) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,journal_id) REFERENCES public.journal_entries(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 CHECK(version BETWEEN 1 AND 2000 AND foreign_amount>=0 AND functional_cash>=0 AND foreign_amount::text NOT IN ('NaN','Infinity','-Infinity') AND functional_cash::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE OR REPLACE FUNCTION public.fx_rate(p_rate text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF coalesce(p_rate,'') !~ '^[0-9]{1,6}(\.[0-9]{1,8})?$' OR p_rate::numeric<=0 THEN RAISE EXCEPTION 'exchange rate must be positive, with at most eight decimals in functional currency per one foreign unit';END IF;
 RETURN p_rate::numeric;
END; $$;
CREATE OR REPLACE FUNCTION public.finance_combine_lines(p_lines jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',account,'debit',greatest(amount,0)::numeric(38,2)::text,'credit',greatest(-amount,0)::numeric(38,2)::text) ORDER BY account),'[]') FROM
 (SELECT a->>'account_id' AS account,sum((a->>'debit')::numeric-(a->>'credit')::numeric) AS amount FROM jsonb_array_elements(p_lines) a GROUP BY 1 HAVING sum((a->>'debit')::numeric-(a->>'credit')::numeric)<>0) amounts
$$;
CREATE OR REPLACE FUNCTION public.fx_signed_line(p_account uuid,p_amount numeric)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT jsonb_build_array(jsonb_build_object('account_id',p_account,'debit',greatest(p_amount,0)::numeric(38,2)::text,'credit',greatest(-p_amount,0)::numeric(38,2)::text)) $$;
CREATE OR REPLACE FUNCTION public.fx_document_preview(p_entity uuid,p_payload jsonb,p_existing uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE policy public.finance_fx_policies%ROWTYPE;functional text;net numeric;tax numeric:=0;total numeric;rate numeric;functional_total numeric;functional_tax numeric:=0;assessment jsonb;parts jsonb:='[]';lines jsonb;part jsonb;converted numeric;sign integer;day date;
BEGIN
 SELECT * INTO policy FROM public.finance_fx_policies WHERE entity_id=p_entity AND (p_existing IS NOT NULL OR org_id=public.get_user_org_id());SELECT currency INTO functional FROM public.entities WHERE id=p_entity AND org_id=policy.org_id;
 IF policy.id IS NULL OR p_payload-ARRAY['kind','party_id','number','date','due_date','currency','net_amount','rate','rate_source','evidence','offset_account','tax','tax_explanation']<>'{}'::jsonb OR coalesce(p_payload->>'kind','') NOT IN ('RECEIVABLE','PAYABLE') OR length(btrim(coalesce(p_payload->>'number',''))) NOT BETWEEN 1 AND 80 OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'due_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
  coalesce(p_payload->>'currency','') NOT IN ('USD','EUR','GBP','CAD','AUD','NZD','SGD','HKD','CHF') OR p_payload->>'currency'=functional OR functional NOT IN ('USD','EUR','GBP','CAD','AUD','NZD','SGD','HKD','CHF') OR jsonb_typeof(p_payload->'net_amount') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'rate') IS DISTINCT FROM 'string' OR length(btrim(coalesce(p_payload->>'rate_source',''))) NOT BETWEEN 1 AND 1000 OR length(btrim(coalesce(p_payload->>'evidence',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'foreign document requires approved controls, a supported currency, source amount, rate and original evidence';END IF;
 day:=(p_payload->>'date')::date;IF p_existing IS NULL THEN PERFORM public.require_revisable_finance_date(p_entity,day);END IF;rate:=public.fx_rate(p_payload->>'rate');net:=public.cash_amount(p_payload->>'net_amount');
 IF day>CURRENT_DATE OR day<DATE '0001-01-01' OR (p_payload->>'due_date')::date<day OR net<=0 OR
  (p_payload->>'kind'='RECEIVABLE' AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=(p_payload->>'party_id')::uuid AND org_id=policy.org_id)) OR
  (p_payload->>'kind'='PAYABLE' AND NOT EXISTS(SELECT 1 FROM public.vendors WHERE id=(p_payload->>'party_id')::uuid AND org_id=policy.org_id)) OR
  NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'offset_account')::uuid AND org_id=policy.org_id AND (p_existing IS NOT NULL OR is_active) AND account_type::text=CASE WHEN p_payload->>'kind'='RECEIVABLE' THEN 'revenue' ELSE 'expense' END AND id NOT IN (policy.realized_gain,policy.realized_loss,policy.unrealized_gain,policy.unrealized_loss)) THEN RAISE EXCEPTION 'foreign document party, date or operating account is invalid';END IF;
 IF EXISTS(SELECT 1 FROM public.finance_fx_documents WHERE entity_id=p_entity AND kind=p_payload->>'kind' AND number=p_payload->>'number' AND id IS DISTINCT FROM p_existing) THEN RAISE EXCEPTION 'foreign document number already used';END IF;
 IF p_payload?'tax' THEN
  assessment:=public.tax_assessment(p_entity,CASE p_payload->>'kind' WHEN 'RECEIVABLE' THEN 'AR' ELSE 'AP' END,day,jsonb_build_array(jsonb_build_object('description',p_payload->>'number','quantity','1','unit_price',net::numeric(38,2)::text)),p_payload->'tax');tax:=(assessment->>'tax')::numeric;
  FOR part IN SELECT value FROM jsonb_array_elements(assessment->'parts') LOOP
   converted:=round((part->>'amount')::numeric*rate,2);functional_tax:=functional_tax+converted;parts:=parts||jsonb_build_array(part||jsonb_build_object('foreign_amount',part->>'amount','amount',converted::numeric(38,2)::text));
  END LOOP;
 ELSIF length(btrim(coalesce(p_payload->>'tax_explanation',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'retain a tax assessment or the reviewed reason no tax is collected';END IF;
 total:=net+tax;functional_total:=round(total*rate,2);
 IF total>9999999999999.99 OR functional_total NOT BETWEEN 0.01 AND 9999999999999.99 OR functional_tax>functional_total THEN RAISE EXCEPTION 'converted foreign document is outside exact accounting bounds';END IF;
 sign:=CASE p_payload->>'kind' WHEN 'RECEIVABLE' THEN 1 ELSE -1 END;
 lines:=public.fx_signed_line(CASE WHEN sign=1 THEN policy.receivable_account ELSE policy.payable_account END,sign*functional_total)||public.fx_signed_line((p_payload->>'offset_account')::uuid,-sign*(functional_total-functional_tax));
 FOR part IN SELECT value FROM jsonb_array_elements(parts) LOOP lines:=lines||public.fx_signed_line((part->>'account_id')::uuid,-sign*(part->>'amount')::numeric);END LOOP;
 RETURN jsonb_build_object('policyId',policy.id,'functionalCurrency',functional,'foreignNet',net::numeric(38,2)::text,'foreignTax',tax::numeric(38,2)::text,'foreignTotal',total::numeric(38,2)::text,'rate',rate::numeric(18,8)::text,'functionalTotal',functional_total::numeric(38,2)::text,'taxPolicyId',assessment->>'policyId','taxParts',parts,'journalLines',public.finance_combine_lines(lines));
END; $$;
CREATE OR REPLACE FUNCTION public.fx_initial_state(p_document public.finance_fx_documents)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('foreignRemaining',p_document.foreign_total::text,'carrying',p_document.functional_total::text,'historicalRemaining',p_document.functional_total::text,'valuationDate',p_document.as_of,'rate',p_document.initial_rate::text,'voided',false)
$$;
CREATE OR REPLACE FUNCTION public.fx_document_state(p_document uuid,p_date date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT after_state FROM public.finance_fx_events WHERE document_id=p_document AND as_of<=p_date ORDER BY version DESC LIMIT 1),(SELECT public.fx_initial_state(d) FROM public.finance_fx_documents d WHERE id=p_document AND as_of<=p_date))
$$;
CREATE OR REPLACE FUNCTION public.fx_event_calculation(p_document public.finance_fx_documents,p_policy public.finance_fx_policies,p_state jsonb,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE remaining numeric:=(p_state->>'foreignRemaining')::numeric;carrying numeric:=(p_state->>'carrying')::numeric;historical numeric:=(p_state->>'historicalRemaining')::numeric;foreign_amount numeric:=0;cash numeric:=0;removed numeric:=0;historic_removed numeric:=0;next_carrying numeric;next_historical numeric;rate numeric;before_gain numeric;after_gain numeric;realized numeric:=0;sign integer:=CASE p_document.kind WHEN 'RECEIVABLE' THEN 1 ELSE -1 END;control uuid:=CASE p_document.kind WHEN 'RECEIVABLE' THEN p_policy.receivable_account ELSE p_policy.payable_account END;lines jsonb:='[]';after_state jsonb;
BEGIN
 IF p_state->>'voided'='true' OR remaining<=0 THEN RAISE EXCEPTION 'foreign monetary document has no open balance';END IF;
 next_carrying:=carrying;next_historical:=historical;before_gain:=sign*(carrying-historical);
 IF p_kind='REMEASURE' THEN
  rate:=public.fx_rate(p_payload->>'rate');next_carrying:=round(remaining*rate,2);IF next_carrying>9999999999999.99 THEN RAISE EXCEPTION 'remeasured carrying amount outside supported bounds';END IF;
  lines:=lines||public.fx_signed_line(control,sign*(next_carrying-carrying));
 ELSIF p_kind='SETTLE' THEN
  rate:=public.fx_rate(p_payload->>'rate');foreign_amount:=public.cash_amount(p_payload->>'foreign_amount');cash:=public.cash_amount(p_payload->>'cash_amount');
  IF foreign_amount<=0 OR foreign_amount>remaining OR cash<=0 OR cash<>round(foreign_amount*rate,2) THEN RAISE EXCEPTION 'settlement must match the exact foreign amount, confirmed cash and rate';END IF;
  removed:=CASE WHEN foreign_amount=remaining THEN carrying ELSE round(carrying*foreign_amount/remaining,2) END;
  historic_removed:=round(p_document.functional_total*(p_document.foreign_total-remaining+foreign_amount)/p_document.foreign_total,2)-(p_document.functional_total-historical);
  next_carrying:=carrying-removed;next_historical:=historical-historic_removed;remaining:=remaining-foreign_amount;
  realized:=sign*(cash-historic_removed);
  lines:=lines||public.fx_signed_line((p_payload->>'cash_account')::uuid,sign*cash)||public.fx_signed_line(control,-sign*removed)||public.fx_signed_line(p_policy.realized_gain,-greatest(realized,0))||public.fx_signed_line(p_policy.realized_loss,greatest(-realized,0));
 ELSE
  IF p_kind<>'VOID' OR remaining<>p_document.foreign_total THEN RAISE EXCEPTION 'void requires the complete unsettled original document';END IF;
  foreign_amount:=remaining;remaining:=0;next_carrying:=0;next_historical:=0;
  lines:=public.flip_finance_lines(p_document.journal_lines)||public.fx_signed_line(control,-sign*(carrying-p_document.functional_total));
 END IF;
 after_gain:=sign*(next_carrying-next_historical);
 lines:=lines||public.fx_signed_line(p_policy.unrealized_gain,greatest(before_gain,0)-greatest(after_gain,0))||public.fx_signed_line(p_policy.unrealized_loss,greatest(-after_gain,0)-greatest(-before_gain,0));
 after_state:=jsonb_build_object('foreignRemaining',remaining::numeric(38,2)::text,'carrying',next_carrying::numeric(38,2)::text,'historicalRemaining',next_historical::numeric(38,2)::text,'valuationDate',CASE WHEN p_kind='REMEASURE' THEN p_payload->>'date' ELSE p_state->>'valuationDate' END,'rate',CASE WHEN p_kind='REMEASURE' THEN rate::numeric(18,8)::text ELSE p_state->>'rate' END,'voided',p_kind='VOID');
 RETURN jsonb_build_object('kind',p_kind,'rate',CASE WHEN rate IS NOT NULL THEN rate::numeric(18,8)::text END,'foreignAmount',foreign_amount::numeric(38,2)::text,'functionalCash',cash::numeric(38,2)::text,'before',p_state,'after',after_state,'journalLines',public.finance_combine_lines(lines));
END; $$;

CREATE OR REPLACE FUNCTION public.validate_fx_policy(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.finance_fx_policies%ROWTYPE;r public.finance_requests%ROWTYPE;a record;
BEGIN
 SELECT * INTO p FROM public.finance_fx_policies WHERE id=p_id;SELECT * INTO r FROM public.finance_requests WHERE id=p.request_id;
 IF p.id IS NULL OR r.org_id IS DISTINCT FROM p.org_id OR r.entity_id IS DISTINCT FROM p.entity_id OR r.kind IS DISTINCT FROM 'FX_POLICY' OR r.state NOT IN ('EXECUTING','APPROVED') OR r.requested_by=r.decided_by OR r.payload IS DISTINCT FROM jsonb_build_object('receivable_account',p.receivable_account,'payable_account',p.payable_account,'unrealized_gain',p.unrealized_gain,'unrealized_loss',p.unrealized_loss,'realized_gain',p.realized_gain,'realized_loss',p.realized_loss) THEN RAISE EXCEPTION 'foreign currency control policy approval is invalid';END IF;
 FOR a IN SELECT p.receivable_account AS id,'asset' AS type UNION ALL SELECT p.payable_account,'liability' UNION ALL SELECT p.unrealized_gain,'revenue' UNION ALL SELECT p.realized_gain,'revenue' UNION ALL SELECT p.unrealized_loss,'expense' UNION ALL SELECT p.realized_loss,'expense' LOOP
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=a.id AND org_id=p.org_id AND account_type::text=a.type) THEN RAISE EXCEPTION 'foreign currency control account type or owner changed';END IF;
 END LOOP;
 IF (SELECT count(DISTINCT id) FROM unnest(ARRAY[p.receivable_account,p.payable_account,p.unrealized_gain,p.unrealized_loss,p.realized_gain,p.realized_loss]) id)<>6 THEN RAISE EXCEPTION 'foreign currency accounting requires dedicated controls';END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.fx_event_preview(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.finance_fx_documents%ROWTYPE;p public.finance_fx_policies%ROWTYPE;e public.finance_fx_events%ROWTYPE;latest public.finance_fx_events%ROWTYPE;day date;state jsonb;result jsonb;
BEGIN
 SELECT * INTO d FROM public.finance_fx_documents WHERE id=(p_payload->>'document_id')::uuid AND org_id=public.get_user_org_id() AND entity_id=p_entity;
 IF d.id IS NULL OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR length(btrim(coalesce(p_payload->>'reference',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(p_payload->>'evidence',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'foreign document, accounting date and confirmation evidence required';END IF;
 day:=(p_payload->>'date')::date;SELECT * INTO p FROM public.finance_fx_policies WHERE id=d.policy_id;SELECT * INTO latest FROM public.finance_fx_events WHERE document_id=d.id ORDER BY version DESC LIMIT 1;
 IF day<greatest(d.as_of,coalesce(latest.as_of,d.as_of)) OR day>CURRENT_DATE OR coalesce(latest.version,0)>=2000 THEN RAISE EXCEPTION 'foreign currency activity must advance in date order within the qualified history limit';END IF;
 PERFORM public.require_revisable_finance_date(p_entity,day);state:=public.fx_document_state(d.id,day);PERFORM public.validate_fx_document_graph(d.id);
 IF p_kind='FX_REVERSE' THEN
  IF p_payload-ARRAY['document_id','date','reference','evidence','event_id']<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid foreign currency correction fields';END IF;
  SELECT event.* INTO e FROM public.finance_fx_events event WHERE event.document_id=d.id AND event.kind<>'REVERSE' AND NOT EXISTS(SELECT 1 FROM public.finance_fx_events correction WHERE correction.reverse_of=event.id) ORDER BY event.version DESC LIMIT 1;
  IF e.id IS NULL OR e.id IS DISTINCT FROM (p_payload->>'event_id')::uuid OR state IS DISTINCT FROM e.after_state THEN RAISE EXCEPTION 'correct the latest active foreign currency event first';END IF;
  result:=jsonb_build_object('kind','REVERSE','rate',NULL,'foreignAmount','0.00','functionalCash','0.00','before',state,'after',e.before_state,'journalLines',public.finance_combine_lines(public.flip_finance_lines(e.journal_lines)));
 ELSE
  IF p_kind NOT IN ('FX_REMEASURE','FX_SETTLE','FX_VOID') OR p_payload-(CASE p_kind WHEN 'FX_SETTLE' THEN ARRAY['document_id','date','reference','evidence','rate','rate_source','foreign_amount','cash_amount','cash_account'] WHEN 'FX_REMEASURE' THEN ARRAY['document_id','date','reference','evidence','rate','rate_source'] ELSE ARRAY['document_id','date','reference','evidence'] END)<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid foreign currency event fields';END IF;
  IF p_kind<>'FX_VOID' AND (jsonb_typeof(p_payload->'rate') IS DISTINCT FROM 'string' OR length(btrim(coalesce(p_payload->>'rate_source',''))) NOT BETWEEN 1 AND 1000) THEN RAISE EXCEPTION 'an exact dated rate and source are required';END IF;
  IF p_kind='FX_SETTLE' AND (jsonb_typeof(p_payload->'foreign_amount') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'cash_amount') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM public.cash_registers bank JOIN public.accounts account ON account.id=bank.account_id WHERE bank.entity_id=p_entity AND bank.org_id=d.org_id AND bank.account_id=(p_payload->>'cash_account')::uuid AND account.is_active AND account.account_type='asset' AND account.id<>p.receivable_account)) THEN RAISE EXCEPTION 'foreign settlement requires exact confirmed amounts and a registered functional-currency cash account';END IF;
  result:=public.fx_event_calculation(d,p,state,substring(p_kind FROM 4),p_payload);
 END IF;
 RETURN result||jsonb_build_object('documentId',d.id,'version',coalesce(latest.version,0)+1);
END; $$;
CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_account uuid;field text;expected_type text;
BEGIN
 IF p_kind='FX_POLICY' THEN
  IF NOT public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.finance_fx_policies WHERE entity_id=p_entity) OR p_payload-ARRAY['receivable_account','payable_account','unrealized_gain','unrealized_loss','realized_gain','realized_loss']<>'{}'::jsonb OR (SELECT count(DISTINCT value) FROM jsonb_each_text(p_payload))<>6 THEN RAISE EXCEPTION 'foreign currency policy requires two administrators and six dedicated accounts';END IF;
  FOREACH field IN ARRAY ARRAY['receivable_account','payable_account','unrealized_gain','unrealized_loss','realized_gain','realized_loss'] LOOP
   v_account:=(p_payload->>field)::uuid;expected_type:=CASE field WHEN 'receivable_account' THEN 'asset' WHEN 'payable_account' THEN 'liability' WHEN 'unrealized_gain' THEN 'revenue' WHEN 'realized_gain' THEN 'revenue' ELSE 'expense' END;
   IF NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=v_account AND a.org_id=public.get_user_org_id() AND a.is_active AND a.account_type::text=expected_type) OR EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=p_entity AND l.account_id=v_account) OR EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=p_entity AND cash_registers.account_id=v_account) OR EXISTS(SELECT 1 FROM public.entity_invoice_account_controls WHERE entity_id=p_entity AND v_account IN (ar_account_id,revenue_account_id)) OR EXISTS(SELECT 1 FROM public.entity_supplier_bill_account_controls WHERE entity_id=p_entity AND v_account IN (ap_account_id,expense_account_id)) OR EXISTS(SELECT 1 FROM public.finance_tax_policies WHERE entity_id=p_entity AND v_account IN (sales_account,recoverable_account,expense_account)) THEN RAISE EXCEPTION 'foreign currency accounts must be active, dedicated and unused';END IF;
  END LOOP;RETURN p_payload;
 ELSIF p_kind='FX_DOCUMENT' THEN PERFORM public.fx_document_preview(p_entity,p_payload);RETURN p_payload;
 ELSIF p_kind IN ('FX_REMEASURE','FX_SETTLE','FX_VOID','FX_REVERSE') THEN PERFORM public.fx_event_preview(p_entity,p_kind,p_payload);RETURN p_payload;
 END IF;
 RETURN public.pre_fx_validate(p_entity,p_kind,p_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_kind='FX_POLICY' THEN RETURN jsonb_build_object('existingPolicy',(SELECT to_jsonb(p) FROM public.finance_fx_policies p WHERE entity_id=p_entity));
 ELSIF p_kind='FX_DOCUMENT' THEN RETURN jsonb_build_object('fxDocument',public.fx_document_preview(p_entity,p_payload));
 ELSIF p_kind IN ('FX_REMEASURE','FX_SETTLE','FX_VOID','FX_REVERSE') THEN RETURN jsonb_build_object('fxEvent',public.fx_event_preview(p_entity,p_kind,p_payload));END IF;
 IF p_kind IN ('CONTRACT_CREATE','CONTRACT_BILL','CONTRACT_USAGE_CLOSE') THEN RETURN public.pre_revision_snapshot(p_entity,p_kind,p_payload);END IF;
 RETURN public.pre_fx_snapshot(p_entity,p_kind,p_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload jsonb:=p_request.payload;preview jsonb;id uuid;journal uuid;
BEGIN
 IF p_request.kind='FX_POLICY' THEN
  INSERT INTO public.finance_fx_policies(org_id,entity_id,receivable_account,payable_account,unrealized_gain,unrealized_loss,realized_gain,realized_loss,request_id)
   VALUES(p_request.org_id,p_request.entity_id,(payload->>'receivable_account')::uuid,(payload->>'payable_account')::uuid,(payload->>'unrealized_gain')::uuid,(payload->>'unrealized_loss')::uuid,(payload->>'realized_gain')::uuid,(payload->>'realized_loss')::uuid,p_request.id) RETURNING finance_fx_policies.id INTO id;
  RETURN jsonb_build_object('policyId',id);
 ELSIF p_request.kind='FX_DOCUMENT' THEN
  preview:=public.fx_document_preview(p_request.entity_id,payload);
  journal:=public.post_manual_journal(p_request.entity_id,'FX-DOCUMENT-'||p_request.id,(payload->>'date')::date,'Foreign monetary document: '||(payload->>'number'),preview->'journalLines','finance:'||p_request.id||':fx-document');
  INSERT INTO public.finance_fx_documents(org_id,entity_id,policy_id,kind,customer_id,vendor_id,number,as_of,due_date,currency,functional_currency,foreign_net,foreign_tax,foreign_total,initial_rate,functional_total,offset_account,tax_policy_id,tax_parts,tax_assessment,journal_lines,journal_id,request_id)
   VALUES(p_request.org_id,p_request.entity_id,(preview->>'policyId')::uuid,payload->>'kind',CASE WHEN payload->>'kind'='RECEIVABLE' THEN (payload->>'party_id')::uuid END,CASE WHEN payload->>'kind'='PAYABLE' THEN (payload->>'party_id')::uuid END,payload->>'number',(payload->>'date')::date,(payload->>'due_date')::date,payload->>'currency',preview->>'functionalCurrency',(preview->>'foreignNet')::numeric,(preview->>'foreignTax')::numeric,(preview->>'foreignTotal')::numeric,(preview->>'rate')::numeric,(preview->>'functionalTotal')::numeric,(payload->>'offset_account')::uuid,(preview->>'taxPolicyId')::uuid,preview->'taxParts',payload->'tax',preview->'journalLines',journal,p_request.id) RETURNING finance_fx_documents.id INTO id;
  RETURN jsonb_build_object('documentId',id,'journalId',journal,'foreignAmount',preview->>'foreignTotal','functionalAmount',preview->>'functionalTotal');
 ELSIF p_request.kind IN ('FX_REMEASURE','FX_SETTLE','FX_VOID','FX_REVERSE') THEN
  preview:=public.fx_event_preview(p_request.entity_id,p_request.kind,payload);
  IF jsonb_array_length(preview->'journalLines')>0 THEN journal:=public.post_manual_journal(p_request.entity_id,'FX-EVENT-'||p_request.id,(payload->>'date')::date,'Foreign currency '||lower(preview->>'kind')||': '||(payload->>'reference'),preview->'journalLines','finance:'||p_request.id||':fx-event');END IF;
  INSERT INTO public.finance_fx_events(org_id,entity_id,document_id,version,kind,as_of,rate,foreign_amount,functional_cash,cash_account,reverse_of,before_state,after_state,journal_lines,journal_id,request_id)
   VALUES(p_request.org_id,p_request.entity_id,(payload->>'document_id')::uuid,(preview->>'version')::int,preview->>'kind',(payload->>'date')::date,(preview->>'rate')::numeric,(preview->>'foreignAmount')::numeric,(preview->>'functionalCash')::numeric,(payload->>'cash_account')::uuid,(payload->>'event_id')::uuid,preview->'before',preview->'after',preview->'journalLines',journal,p_request.id) RETURNING finance_fx_events.id INTO id;
  RETURN jsonb_build_object('eventId',id,'journalId',journal,'balance',preview->'after');
 END IF;
 RETURN public.pre_fx_execute(p_request);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_fx_document_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.finance_fx_documents%ROWTYPE;p public.finance_fx_policies%ROWTYPE;q public.finance_requests%ROWTYPE;e public.finance_fx_events%ROWTYPE;original public.finance_fx_events%ROWTYPE;preview jsonb;expected jsonb;state jsonb;version integer:=0;last_date date;
BEGIN
 SELECT * INTO d FROM public.finance_fx_documents WHERE id=p_id;SELECT * INTO p FROM public.finance_fx_policies WHERE id=d.policy_id;SELECT * INTO q FROM public.finance_requests WHERE id=d.request_id;
 IF d.id IS NULL OR p.org_id IS DISTINCT FROM d.org_id OR p.entity_id IS DISTINCT FROM d.entity_id OR q.org_id IS DISTINCT FROM d.org_id OR q.entity_id IS DISTINCT FROM d.entity_id OR q.kind IS DISTINCT FROM 'FX_DOCUMENT' OR q.state NOT IN ('EXECUTING','APPROVED') OR q.requested_by=q.decided_by OR q.payload->>'kind' IS DISTINCT FROM d.kind OR q.payload->>'party_id' IS DISTINCT FROM coalesce(d.customer_id,d.vendor_id)::text OR q.payload->>'number' IS DISTINCT FROM d.number OR (q.payload->>'date')::date IS DISTINCT FROM d.as_of OR (q.payload->>'due_date')::date IS DISTINCT FROM d.due_date OR q.payload->>'currency' IS DISTINCT FROM d.currency OR q.payload->>'offset_account' IS DISTINCT FROM d.offset_account::text OR q.payload->'tax' IS DISTINCT FROM d.tax_assessment THEN RAISE EXCEPTION 'foreign document approval or party graph is invalid';END IF;
 PERFORM public.validate_fx_policy(p.id);preview:=public.fx_document_preview(d.entity_id,q.payload,d.id);
 IF q.source_snapshot->'fxDocument' IS DISTINCT FROM preview OR preview IS DISTINCT FROM jsonb_build_object('policyId',d.policy_id,'functionalCurrency',d.functional_currency,'foreignNet',d.foreign_net::text,'foreignTax',d.foreign_tax::text,'foreignTotal',d.foreign_total::text,'rate',d.initial_rate::text,'functionalTotal',d.functional_total::text,'taxPolicyId',d.tax_policy_id,'taxParts',d.tax_parts,'journalLines',d.journal_lines) THEN RAISE EXCEPTION 'foreign document amounts, tax and original valuation do not reconcile';END IF;
 PERFORM public.assert_finance_journal(d.journal_id,d.org_id,d.entity_id,d.as_of,d.journal_lines);
 IF NOT EXISTS(SELECT 1 FROM public.journal_entries j JOIN public.accounting_events ev ON ev.id=j.accounting_event_id WHERE j.id=d.journal_id AND j.created_by=q.decided_by AND ev.idempotency_key='finance:'||q.id||':fx-document') THEN RAISE EXCEPTION 'foreign document journal ownership is invalid';END IF;
 state:=public.fx_initial_state(d);last_date:=d.as_of;
 FOR e IN SELECT * FROM public.finance_fx_events WHERE document_id=d.id ORDER BY finance_fx_events.version LOOP
  version:=version+1;SELECT * INTO q FROM public.finance_requests WHERE id=e.request_id;
  IF e.org_id<>d.org_id OR e.entity_id<>d.entity_id OR e.version<>version OR e.as_of<last_date OR e.before_state IS DISTINCT FROM state OR q.org_id IS DISTINCT FROM e.org_id OR q.entity_id IS DISTINCT FROM e.entity_id OR q.kind IS DISTINCT FROM 'FX_'||e.kind OR q.state NOT IN ('EXECUTING','APPROVED') OR q.requested_by=q.decided_by OR q.payload->>'document_id' IS DISTINCT FROM d.id::text OR (q.payload->>'date')::date IS DISTINCT FROM e.as_of OR (q.payload->>'cash_account')::uuid IS DISTINCT FROM e.cash_account OR (q.payload->>'event_id')::uuid IS DISTINCT FROM e.reverse_of THEN RAISE EXCEPTION 'foreign currency event approval, sequence or prior balance is invalid';END IF;
  IF e.kind='REVERSE' THEN
   SELECT candidate.* INTO original FROM public.finance_fx_events candidate WHERE candidate.document_id=d.id AND candidate.version<e.version AND candidate.kind<>'REVERSE' AND NOT EXISTS(SELECT 1 FROM public.finance_fx_events correction WHERE correction.reverse_of=candidate.id AND correction.version<e.version) ORDER BY candidate.version DESC LIMIT 1;
   IF e.reverse_of IS DISTINCT FROM original.id OR state IS DISTINCT FROM original.after_state THEN RAISE EXCEPTION 'foreign currency correction lost its latest active source';END IF;
   expected:=jsonb_build_object('kind','REVERSE','rate',NULL,'foreignAmount','0.00','functionalCash','0.00','before',state,'after',original.before_state,'journalLines',public.finance_combine_lines(public.flip_finance_lines(original.journal_lines)));
  ELSE
   IF e.reverse_of IS NOT NULL THEN RAISE EXCEPTION 'unexpected foreign currency correction link';END IF;
   expected:=public.fx_event_calculation(d,p,state,e.kind,q.payload);
  END IF;
  expected:=expected||jsonb_build_object('documentId',d.id,'version',e.version);
  IF expected IS DISTINCT FROM q.source_snapshot->'fxEvent' OR expected IS DISTINCT FROM jsonb_build_object('documentId',d.id,'version',e.version,'kind',e.kind,'rate',CASE WHEN e.rate IS NOT NULL THEN e.rate::text END,'foreignAmount',e.foreign_amount::text,'functionalCash',e.functional_cash::text,'before',e.before_state,'after',e.after_state,'journalLines',e.journal_lines) THEN RAISE EXCEPTION 'foreign currency event does not reconcile to its approved rate and source';END IF;
  IF jsonb_array_length(e.journal_lines)=0 THEN IF e.journal_id IS NOT NULL THEN RAISE EXCEPTION 'zero currency adjustment cannot own a journal';END IF;
  ELSE
   PERFORM public.assert_finance_journal(e.journal_id,e.org_id,e.entity_id,e.as_of,e.journal_lines);
   IF NOT EXISTS(SELECT 1 FROM public.journal_entries j JOIN public.accounting_events ev ON ev.id=j.accounting_event_id WHERE j.id=e.journal_id AND j.created_by=q.decided_by AND ev.idempotency_key='finance:'||q.id||':fx-event') THEN RAISE EXCEPTION 'currency event journal ownership is invalid';END IF;
  END IF;
  state:=e.after_state;last_date:=e.as_of;
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION public.get_foreign_currency_report(p_entity uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.get_user_org_id();currency text;policy public.finance_fx_policies%ROWTYPE;d public.finance_fx_documents%ROWTYPE;state jsonb;rows jsonb:='[]';controls jsonb;result jsonb;receivables numeric:=0;payables numeric:=0;pending integer:=0;age integer;latest uuid;
BEGIN
 SELECT e.currency INTO currency FROM public.entities e WHERE e.id=p_entity AND e.org_id=org;SELECT * INTO policy FROM public.finance_fx_policies WHERE entity_id=p_entity AND org_id=org;
 IF currency IS NULL OR p_as_of IS NULL OR p_as_of NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'foreign currency report scope unavailable';END IF;
 PERFORM public.get_entity_trial_balance(p_entity,DATE '0001-01-01',p_as_of);
 IF policy.id IS NOT NULL THEN PERFORM public.validate_fx_policy(policy.id);END IF;
 IF (SELECT count(*) FROM public.finance_fx_documents WHERE entity_id=p_entity)>2000 THEN RAISE EXCEPTION 'foreign currency report exceeds qualified document capacity';END IF;
 FOR d IN SELECT * FROM public.finance_fx_documents WHERE entity_id=p_entity AND org_id=org ORDER BY as_of,id LOOP
  PERFORM public.validate_fx_document_graph(d.id);IF d.as_of>p_as_of THEN CONTINUE;END IF;
  state:=public.fx_document_state(d.id,p_as_of);age:=greatest(p_as_of-d.due_date,0);
  IF d.kind='RECEIVABLE' THEN receivables:=receivables+(state->>'carrying')::numeric;ELSE payables:=payables+(state->>'carrying')::numeric;END IF;
  IF (state->>'foreignRemaining')::numeric>0 AND (state->>'valuationDate')::date<p_as_of THEN pending:=pending+1;END IF;
  SELECT event.id INTO latest FROM public.finance_fx_events event WHERE event.document_id=d.id AND event.kind<>'REVERSE' AND NOT EXISTS(SELECT 1 FROM public.finance_fx_events correction WHERE correction.reverse_of=event.id) ORDER BY event.version DESC LIMIT 1;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',d.id,'kind',d.kind,'number',d.number,'partyId',coalesce(d.customer_id,d.vendor_id),'party',coalesce((SELECT name FROM public.customers WHERE id=d.customer_id),(SELECT name FROM public.vendors WHERE id=d.vendor_id)),'date',d.as_of,'dueDate',d.due_date,'currency',d.currency,'foreignNet',d.foreign_net::text,'foreignTax',d.foreign_tax::text,'foreignTotal',d.foreign_total::text,'functionalTotal',d.functional_total::text,'initialRate',d.initial_rate::text,'state',state,'overdueDays',age,'agingBucket',CASE WHEN p_as_of<=d.due_date THEN 'CURRENT' WHEN age<=30 THEN '1_30' WHEN age<=60 THEN '31_60' WHEN age<=90 THEN '61_90' ELSE 'OVER_90' END,'needsRemeasurement',(state->>'foreignRemaining')::numeric>0 AND (state->>'valuationDate')::date<p_as_of,'journalId',d.journal_id,'requestId',d.request_id,'latestActiveEvent',latest,
   'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'version',e.version,'kind',e.kind,'date',e.as_of,'rate',CASE WHEN e.rate IS NOT NULL THEN e.rate::text END,'foreignAmount',e.foreign_amount::text,'functionalCash',e.functional_cash::text,'before',e.before_state,'after',e.after_state,'journalId',e.journal_id,'requestId',e.request_id,'reverses',e.reverse_of) ORDER BY e.version) FROM public.finance_fx_events e WHERE e.document_id=d.id),'[]')));
 END LOOP;
 WITH wanted AS (SELECT policy.receivable_account AS id,receivables AS expected,'asset' AS type UNION ALL SELECT policy.payable_account,payables,'liability'),balances AS (
  SELECT a.id,a.code,a.name,w.expected,coalesce((SELECT sum(CASE w.type WHEN 'asset' THEN l.debit-l.credit ELSE l.credit-l.debit END) FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.org_id=org AND j.entity_id=p_entity AND j.status='posted' AND j.entry_date<=p_as_of AND l.account_id=a.id),0) AS ledger FROM wanted w JOIN public.accounts a ON a.id=w.id)
 SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',id,'code',code,'name',name,'expected',expected::numeric(38,2)::text,'ledger',ledger::numeric(38,2)::text,'variance',(ledger-expected)::numeric(38,2)::text) ORDER BY code),'[]') INTO controls FROM balances;
 result:=jsonb_build_object('entityId',p_entity,'currency',currency,'asOf',p_as_of,'policy',CASE WHEN policy.id IS NOT NULL THEN to_jsonb(policy) END,'documents',rows,'receivables',receivables::numeric(38,2)::text,'payables',payables::numeric(38,2)::text,'controls',controls,'pendingRemeasurement',pending,'reconciled',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(controls) a WHERE (a->>'variance')::numeric<>0));
 RETURN result||jsonb_build_object('revision',md5(result::text));
END; $$;
CREATE OR REPLACE FUNCTION public.get_finance_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;fx jsonb;
BEGIN
 result:=public.pre_fx_close(p_entity,p_from,p_through)-'revision';fx:=public.get_foreign_currency_report(p_entity,p_through);
 result:=result||jsonb_build_object('fxReconciled',fx->'reconciled','fxControls',fx->'controls','fxRevision',fx->>'revision','pendingFxRemeasurement',fx->'pendingRemeasurement','canClose',(result->>'canClose')::boolean AND (fx->>'reconciled')::boolean AND (fx->>'pendingRemeasurement')::int=0);
 RETURN result||jsonb_build_object('revision',md5((result-'generatedAt')::text));
END; $$;
CREATE OR REPLACE FUNCTION public.tax_register_movements(p_entity uuid)
RETURNS TABLE(source_id uuid,source_kind text,as_of date,account_id uuid,jurisdiction text,amount numeric,journal_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT * FROM public.pre_fx_tax_movements(p_entity)
 UNION ALL SELECT d.id,'FOREIGN_DOCUMENT',d.as_of,(a->>'account_id')::uuid,a->>'jurisdiction',(a->>'amount')::numeric,d.journal_id FROM public.finance_fx_documents d CROSS JOIN LATERAL jsonb_array_elements(d.tax_parts) a WHERE d.entity_id=p_entity AND (a->>'amount')::numeric<>0
 UNION ALL SELECT e.id,'FOREIGN_VOID',e.as_of,(a->>'account_id')::uuid,a->>'jurisdiction',-(a->>'amount')::numeric,e.journal_id FROM public.finance_fx_events e JOIN public.finance_fx_documents d ON d.id=e.document_id CROSS JOIN LATERAL jsonb_array_elements(d.tax_parts) a WHERE d.entity_id=p_entity AND e.kind='VOID' AND (a->>'amount')::numeric<>0
 UNION ALL SELECT e.id,'FOREIGN_VOID_CORRECTION',e.as_of,(a->>'account_id')::uuid,a->>'jurisdiction',(a->>'amount')::numeric,e.journal_id FROM public.finance_fx_events e JOIN public.finance_fx_events original ON original.id=e.reverse_of AND original.kind='VOID' JOIN public.finance_fx_documents d ON d.id=e.document_id CROSS JOIN LATERAL jsonb_array_elements(d.tax_parts) a WHERE d.entity_id=p_entity AND (a->>'amount')::numeric<>0
$$;
DO $$ BEGIN
 IF to_regprocedure('public.pre_fx_tax_register(uuid,date,date)') IS NULL THEN ALTER FUNCTION public.get_tax_register(uuid,date,date) RENAME TO pre_fx_tax_register;END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.get_tax_register(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;d record;foreign_docs jsonb;
BEGIN
 result:=public.pre_fx_tax_register(p_entity,p_from,p_through)-'revision';
 FOR d IN SELECT id FROM public.finance_fx_documents WHERE entity_id=p_entity AND tax_policy_id IS NOT NULL LOOP PERFORM public.validate_fx_document_graph(d.id);END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'number',number,'date',as_of,'currency',currency,'foreignNet',foreign_net::text,'foreignTax',foreign_tax::text,'foreignTotal',foreign_total::text,'functionalTotal',functional_total::text,'rate',initial_rate::text,'taxParts',tax_parts,'assessment',tax_assessment,'journalId',journal_id,'requestId',request_id) ORDER BY as_of,id),'[]') INTO foreign_docs FROM public.finance_fx_documents WHERE entity_id=p_entity AND tax_policy_id IS NOT NULL AND as_of BETWEEN p_from AND p_through;
 result:=result||jsonb_build_object('foreignDocuments',foreign_docs);RETURN result||jsonb_build_object('revision',md5(result::text));
END; $$;
CREATE OR REPLACE FUNCTION public.guard_fx_source_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.reversal_of_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.finance_fx_documents WHERE journal_id=NEW.reversal_of_id) OR EXISTS(SELECT 1 FROM public.finance_fx_events WHERE journal_id=NEW.reversal_of_id)) THEN RAISE EXCEPTION 'foreign currency journals require a linked document correction';END IF;RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.check_fx_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_fx_policies' THEN PERFORM public.validate_fx_policy(NEW.id);
 ELSIF TG_TABLE_NAME='finance_fx_documents' THEN PERFORM public.validate_fx_document_graph(NEW.id);
 ELSE PERFORM public.validate_fx_document_graph(NEW.document_id);END IF;RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS fx_source_journal ON public.journal_entries;
CREATE TRIGGER fx_source_journal BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_fx_source_journal();
DO $$ DECLARE t text;f record;BEGIN
 FOREACH t IN ARRAY ARRAY['finance_fx_policies','finance_fx_documents','finance_fx_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS fx_graph ON public.%I',t);EXECUTE format('CREATE CONSTRAINT TRIGGER fx_graph AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_fx_graph_trigger()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('pre_fx_validate','pre_fx_snapshot','pre_fx_execute','pre_fx_close','pre_fx_tax_movements','pre_fx_tax_register','fx_rate','finance_combine_lines','fx_signed_line','fx_document_preview','fx_initial_state','fx_document_state','fx_event_calculation','validate_fx_policy','fx_event_preview','validate_finance_extension','finance_source_snapshot','execute_finance_extension','validate_fx_document_graph','get_foreign_currency_report','get_finance_close_check','tax_register_movements','get_tax_register','guard_fx_source_journal','check_fx_graph_trigger') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);IF f.proname IN ('get_foreign_currency_report','get_finance_close_check','get_tax_register') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
COMMIT;
