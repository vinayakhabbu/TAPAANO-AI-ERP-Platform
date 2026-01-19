import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Search, Plus, MoreHorizontal, FileText, Shield, Phone, MapPin, ArrowRight,
  AlertTriangle, CheckCircle, Clock, Calendar
} from "lucide-react";
import { format } from "date-fns";
import {
  useServiceContracts, useWarranties, useServiceCalls, useFieldServiceVisits,
  useServiceStats, useUpdateServiceCallStatus
} from "@/hooks/useServiceManagement";
import { ServiceContractForm } from "@/components/forms/ServiceContractForm";
import { WarrantyForm } from "@/components/forms/WarrantyForm";
import { ServiceCallForm } from "@/components/forms/ServiceCallForm";
import { FieldVisitForm } from "@/components/forms/FieldVisitForm";
import { useToast } from "@/hooks/use-toast";

const contractStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  active: { label: "Active", className: "bg-success/10 text-success" },
  expired: { label: "Expired", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const warrantyStatusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/10 text-success" },
  expired: { label: "Expired", className: "bg-destructive/10 text-destructive" },
  claimed: { label: "Claimed", className: "bg-warning/10 text-warning" },
  void: { label: "Void", className: "bg-muted text-muted-foreground" },
};

const callStatusConfig: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-primary/10 text-primary" },
  in_progress: { label: "In Progress", className: "bg-warning/10 text-warning" },
  on_hold: { label: "On Hold", className: "bg-muted text-muted-foreground" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-primary/10 text-primary" },
  high: { label: "High", className: "bg-warning/10 text-warning" },
  critical: { label: "Critical", className: "bg-destructive/10 text-destructive" },
};

const visitStatusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-primary/10 text-primary" },
  en_route: { label: "En Route", className: "bg-warning/10 text-warning" },
  on_site: { label: "On Site", className: "bg-cash/10 text-cash" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const ServiceManagement = () => {
  const { toast } = useToast();
  const { data: contracts, isLoading: contractsLoading } = useServiceContracts();
  const { data: warranties, isLoading: warrantiesLoading } = useWarranties();
  const { data: serviceCalls, isLoading: callsLoading } = useServiceCalls();
  const { data: visits, isLoading: visitsLoading } = useFieldServiceVisits();
  const stats = useServiceStats();
  const updateCallStatus = useUpdateServiceCallStatus();

  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [warrantyFormOpen, setWarrantyFormOpen] = useState(false);
  const [callFormOpen, setCallFormOpen] = useState(false);
  const [visitFormOpen, setVisitFormOpen] = useState(false);

  const handleUpdateCallStatus = async (id: string, status: string) => {
    try {
      await updateCallStatus.mutateAsync({ id, status });
      toast({ title: "Updated", description: `Service call marked as ${status}` });
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  return (
    <AppLayout title="Service Management" subtitle="Contracts, warranties, and service operations">
      {/* Service Flow Indicator */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground">Contract</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/50">
              <Shield className="h-4 w-4 text-secondary-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">Warranty</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10">
              <Phone className="h-4 w-4 text-warning" />
            </div>
            <span className="text-sm font-medium text-foreground">Service Call</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
              <MapPin className="h-4 w-4 text-success" />
            </div>
            <span className="text-sm font-medium text-foreground">Field Visit</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Contracts</p>
              <p className="text-2xl font-bold text-foreground">{stats.activeContracts}</p>
              {stats.expiringContracts > 0 && (
                <p className="text-xs text-warning">{stats.expiringContracts} expiring soon</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-secondary/50 p-2.5">
              <Shield className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Warranties</p>
              <p className="text-2xl font-bold text-foreground">{stats.activeWarranties}</p>
              {stats.expiringWarranties > 0 && (
                <p className="text-xs text-warning">{stats.expiringWarranties} expiring soon</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/10 p-2.5">
              <Phone className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Open Calls</p>
              <p className="text-2xl font-bold text-foreground">{stats.openCalls}</p>
              {stats.highPriorityCalls > 0 && (
                <p className="text-xs text-destructive">{stats.highPriorityCalls} high priority</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2.5">
              <Calendar className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Today's Visits</p>
              <p className="text-2xl font-bold text-foreground">{stats.todayVisits}</p>
              <p className="text-xs text-muted-foreground">{stats.scheduledVisits} scheduled</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="contracts" className="mt-6">
        <TabsList className="h-auto flex-wrap gap-1 p-1 bg-muted/50">
          <TabsTrigger value="contracts" className="gap-2 text-xs sm:text-sm">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Contracts</span>
            <span className="sm:hidden">Contr</span>
          </TabsTrigger>
          <TabsTrigger value="warranties" className="gap-2 text-xs sm:text-sm">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Warranties</span>
            <span className="sm:hidden">Warr</span>
          </TabsTrigger>
          <TabsTrigger value="service-calls" className="gap-2 text-xs sm:text-sm">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">Service Calls</span>
            <span className="sm:hidden">Calls</span>
          </TabsTrigger>
          <TabsTrigger value="field-service" className="gap-2 text-xs sm:text-sm">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Field Service</span>
            <span className="sm:hidden">Field</span>
          </TabsTrigger>
        </TabsList>

        {/* Contracts Tab */}
        <TabsContent value="contracts" className="mt-6">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Service Contracts</h3>
                <p className="text-sm text-muted-foreground">Manage service agreements</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search contracts..." className="w-64 pl-9" />
                </div>
                <Button onClick={() => setContractFormOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Contract
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Contract #</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Period</TableHead>
                  <TableHead className="text-muted-foreground text-right">Value</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : !contracts || contracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <p>No service contracts found</p>
                        <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setContractFormOpen(true)}>
                          <Plus className="h-4 w-4" />
                          Create first contract
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  contracts.map((contract) => {
                    const status = contractStatusConfig[contract.status] || contractStatusConfig.draft;
                    return (
                      <TableRow key={contract.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{contract.contract_number}</TableCell>
                        <TableCell className="text-foreground">{contract.customers?.name || "—"}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{contract.contract_type}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(contract.start_date), "MMM d, yyyy")} - {format(new Date(contract.end_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          ${contract.contract_value.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Warranties Tab */}
        <TabsContent value="warranties">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Warranties</h3>
                <p className="text-sm text-muted-foreground">Track product warranties</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search warranties..." className="w-64 pl-9" />
                </div>
                <Button onClick={() => setWarrantyFormOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Register Warranty
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Warranty #</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Product</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Expires</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warrantiesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : !warranties || warranties.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Shield className="h-8 w-8" />
                        <p>No warranties found</p>
                        <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setWarrantyFormOpen(true)}>
                          <Plus className="h-4 w-4" />
                          Register first warranty
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  warranties.map((warranty) => {
                    const status = warrantyStatusConfig[warranty.status] || warrantyStatusConfig.active;
                    return (
                      <TableRow key={warranty.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{warranty.warranty_number}</TableCell>
                        <TableCell className="text-foreground">{warranty.customers?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{warranty.products?.name || "—"}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{warranty.warranty_type}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(warranty.warranty_end_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Service Calls Tab */}
        <TabsContent value="service-calls">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Service Calls</h3>
                <p className="text-sm text-muted-foreground">Log and respond to service requests</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search calls..." className="w-64 pl-9" />
                </div>
                <Button onClick={() => setCallFormOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Log Call
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Call #</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Subject</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Priority</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : !serviceCalls || serviceCalls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Phone className="h-8 w-8" />
                        <p>No service calls found</p>
                        <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setCallFormOpen(true)}>
                          <Plus className="h-4 w-4" />
                          Log first call
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  serviceCalls.map((call) => {
                    const status = callStatusConfig[call.status] || callStatusConfig.open;
                    const priority = priorityConfig[call.priority] || priorityConfig.medium;
                    return (
                      <TableRow key={call.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{call.call_number}</TableCell>
                        <TableCell className="text-foreground">{call.customers?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">{call.subject}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{call.call_type}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", priority.className)}>{priority.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {call.status === "open" && (
                                <DropdownMenuItem onClick={() => handleUpdateCallStatus(call.id, "in_progress")}>
                                  <Clock className="h-4 w-4 mr-2" /> Start Work
                                </DropdownMenuItem>
                              )}
                              {call.status === "in_progress" && (
                                <DropdownMenuItem onClick={() => handleUpdateCallStatus(call.id, "completed")}>
                                  <CheckCircle className="h-4 w-4 mr-2" /> Complete
                                </DropdownMenuItem>
                              )}
                              {(call.status === "open" || call.status === "in_progress") && (
                                <DropdownMenuItem onClick={() => handleUpdateCallStatus(call.id, "on_hold")}>
                                  <AlertTriangle className="h-4 w-4 mr-2" /> Put On Hold
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Field Service Tab */}
        <TabsContent value="field-service">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Field Service Visits</h3>
                <p className="text-sm text-muted-foreground">Manage on-site service visits</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search visits..." className="w-64 pl-9" />
                </div>
                <Button onClick={() => setVisitFormOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Schedule Visit
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Visit #</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Service Call</TableHead>
                  <TableHead className="text-muted-foreground">Scheduled</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : !visits || visits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <MapPin className="h-8 w-8" />
                        <p>No field visits found</p>
                        <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setVisitFormOpen(true)}>
                          <Plus className="h-4 w-4" />
                          Schedule first visit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  visits.map((visit) => {
                    const status = visitStatusConfig[visit.status] || visitStatusConfig.scheduled;
                    return (
                      <TableRow key={visit.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{visit.visit_number}</TableCell>
                        <TableCell className="text-foreground">{visit.customers?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {visit.service_calls?.call_number || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(visit.scheduled_start), "MMM d, yyyy h:mm a")}
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">{visit.visit_type.replace("_", " ")}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Forms */}
      <ServiceContractForm open={contractFormOpen} onOpenChange={setContractFormOpen} />
      <WarrantyForm open={warrantyFormOpen} onOpenChange={setWarrantyFormOpen} />
      <ServiceCallForm open={callFormOpen} onOpenChange={setCallFormOpen} />
      <FieldVisitForm open={visitFormOpen} onOpenChange={setVisitFormOpen} />
    </AppLayout>
  );
};

export default ServiceManagement;
