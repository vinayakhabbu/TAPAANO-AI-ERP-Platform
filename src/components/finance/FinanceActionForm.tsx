import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type FinanceField = { name: string; label: string; type?: 'text' | 'date' | 'textarea'; value?: string; optional?: boolean; options?: { value: string; label: string }[] };
/** Freeze the full request on submission so a lost response can be retried safely. */
export function FinanceActionForm({ title, fields, submit, onSuccess, children }: {
  title: string; fields: FinanceField[]; submit: (values: Record<string, string>, key: string) => Promise<unknown>; onSuccess?: () => void; children?: ReactNode;
}) {
  const id=useId(), cache=useQueryClient();
  const [request,setRequest]=useState<{values:Record<string,string>;key:string}|null>(null);
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  async function send(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(pending || done)return;
    const next=request??{values:Object.fromEntries([...new FormData(e.currentTarget)].map(([k,v])=>[k,String(v)])),key:crypto.randomUUID()};
    setRequest(next);setPending(true);setError('');
    try {await submit(next.values,next.key);setDone(true);await cache.invalidateQueries();onSuccess?.();}
    catch(e){setError(e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Confirmation unavailable. Retry the same request.');}
    finally{setPending(false);}
  }
  return <form aria-label={title} onSubmit={e=>void send(e)} className="space-y-3 rounded-lg border p-4">
    <h3 className="font-semibold">{title}</h3>
    <fieldset disabled={Boolean(request)} className="grid gap-3 sm:grid-cols-2">
      {fields.map(f=><div key={f.name} className={f.type==='textarea'?'sm:col-span-2 space-y-1':'space-y-1'}>
        <Label htmlFor={id+f.name}>{f.label}</Label>
        {f.options?<select id={id+f.name} name={f.name} required={!f.optional} defaultValue={f.value??''} className="w-full rounded border bg-background p-2"><option value="">Choose…</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          :f.type==='textarea'?<textarea id={id+f.name} name={f.name} required={!f.optional} defaultValue={f.value} rows={4} maxLength={2000000} className="w-full rounded border bg-background p-2"/>
          :<Input id={id+f.name} name={f.name} type={f.type??'text'} required={!f.optional} defaultValue={f.value} maxLength={2000}/>}
      </div>)}
      {children?<div className="sm:col-span-2">{children}</div>:null}
    </fieldset>
    {done?<p role="status">Saved. Refresh the history to review the result.</p>:<Button disabled={pending} type="submit">{pending?'Saving…':request?'Retry same request':title}</Button>}
    {error?<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><p>Check history before editing a request whose outcome is uncertain.</p><Button type="button" variant="outline" disabled={pending} onClick={()=>{setRequest(null);setError('');}}>Edit after checking history</Button></div>:null}
  </form>;
}
