import { useRef,useState } from "react";
import { Building,ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEntityMaintenance } from "@/hooks/useEntityMaintenance";

export function EntityMaintenanceSettings(){
  const maintenance=useEntityMaintenance();
  const [name,setName]=useState("");
  const [currency,setCurrency]=useState("USD");
  const [createReason,setCreateReason]=useState("");
  const createRequest=useRef<{signature:string;key:string}|null>(null);
  const [entityId,setEntityId]=useState("");
  const [renamedName,setRenamedName]=useState("");
  const [renameReason,setRenameReason]=useState("");
  const renameRequest=useRef<{signature:string;key:string}|null>(null);

  const submitCreate=async(event:React.FormEvent)=>{
    event.preventDefault();
    const normalizedName=name.trim();const normalizedCurrency=currency.trim().toUpperCase();
    const normalizedReason=createReason.trim();
    const signature=`${normalizedName}|${normalizedCurrency}|${normalizedReason}`;
    if(!createRequest.current||createRequest.current.signature!==signature)
      createRequest.current={signature,key:crypto.randomUUID()};
    try{
      await maintenance.createEntity.mutateAsync({name:normalizedName,currency:normalizedCurrency,
        reason:normalizedReason,idempotencyKey:createRequest.current.key});
      createRequest.current=null;setName("");setCurrency("USD");setCreateReason("");
      toast.success("Entity created with immutable functional currency and audit evidence");
    }catch(error:unknown){toast.error(error instanceof Error?error.message:"Entity creation failed closed");}
  };

  const selectEntity=(id:string)=>{
    setEntityId(id);setRenamedName(maintenance.entities.find((entity)=>entity.id===id)?.name??"");
    setRenameReason("");
  };

  const submitRename=async(event:React.FormEvent)=>{
    event.preventDefault();
    const normalizedName=renamedName.trim();const normalizedReason=renameReason.trim();
    const signature=`${entityId}|${normalizedName}|${normalizedReason}`;
    if(!renameRequest.current||renameRequest.current.signature!==signature)
      renameRequest.current={signature,key:crypto.randomUUID()};
    try{
      await maintenance.renameEntity.mutateAsync({entityId,name:normalizedName,
        reason:normalizedReason,idempotencyKey:renameRequest.current.key});
      renameRequest.current=null;setEntityId("");setRenamedName("");setRenameReason("");
      toast.success("Entity renamed with immutable audit evidence");
    }catch(error:unknown){toast.error(error instanceof Error?error.message:"Entity rename failed closed");}
  };

  if(!maintenance.isAdmin)return <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5"/>Entity maintenance</CardTitle><CardDescription>Tenant-admin access required</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">Entity maintenance is unavailable for your role.</CardContent></Card>;
  if(maintenance.entitiesError)return <Card><CardHeader><CardTitle>Entity maintenance</CardTitle></CardHeader><CardContent className="text-sm text-destructive">Entity history is unavailable; maintenance is disabled.</CardContent></Card>;

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><Building className="h-5 w-5"/>Legal entities</CardTitle><CardDescription>Functional currency and tenant identity are immutable after creation. Currency change, deletion, and retirement remain unavailable.</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      <div className="grid gap-2 md:grid-cols-2">{maintenance.entities.map((entity)=><div key={entity.id} className="flex justify-between rounded-md border px-3 py-2 text-sm"><span>{entity.name}</span><span className="text-muted-foreground">{entity.currency}</span></div>)}</div>
      <form className="grid gap-4 border-t pt-5 md:grid-cols-2" onSubmit={submitCreate}>
        <div className="space-y-2"><Label htmlFor="entity-name">New entity name</Label><Input id="entity-name" value={name} onChange={(event)=>setName(event.target.value)} maxLength={200} required/></div>
        <div className="space-y-2"><Label htmlFor="entity-currency">Functional currency</Label><Input id="entity-currency" value={currency} onChange={(event)=>setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} pattern="[A-Z]{3}" required/></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="entity-create-reason">Audit reason</Label><Textarea id="entity-create-reason" value={createReason} onChange={(event)=>setCreateReason(event.target.value)} maxLength={500} required/></div>
        <Button className="md:col-span-2 md:w-fit" type="submit" disabled={maintenance.createEntity.isPending||!name.trim()||!/^[A-Z]{3}$/.test(currency)||!createReason.trim()}>{maintenance.createEntity.isPending?"Creating entity…":"Create entity"}</Button>
      </form>
      <form className="space-y-4 border-t pt-5" onSubmit={submitRename}>
        <h4 className="font-medium">Rename an entity</h4>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={entityId} onChange={(event)=>selectEntity(event.target.value)} required><option value="">Select an entity</option>{maintenance.entities.map((entity)=><option key={entity.id} value={entity.id}>{entity.name} — {entity.currency}</option>)}</select>
        <div className="space-y-2"><Label htmlFor="entity-renamed-name">New name</Label><Input id="entity-renamed-name" value={renamedName} onChange={(event)=>setRenamedName(event.target.value)} maxLength={200} required/></div>
        <div className="space-y-2"><Label htmlFor="entity-rename-reason">Audit reason</Label><Textarea id="entity-rename-reason" value={renameReason} onChange={(event)=>setRenameReason(event.target.value)} maxLength={500} required/></div>
        <Button type="submit" variant="outline" disabled={maintenance.renameEntity.isPending||!entityId||!renamedName.trim()||!renameReason.trim()}>{maintenance.renameEntity.isPending?"Renaming entity…":"Rename entity"}</Button>
      </form>
      <p className="text-xs text-muted-foreground">New entities start without periods or accounting controls. Configure each supported accounting boundary separately before posting.</p>
    </CardContent>
  </Card>;
}
