import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Calendar, CreditCard, RefreshCw, TrendingUp, Users, Zap, Calculator, Clock, DollarSign, Plus, Play, Pause, RotateCcw } from "lucide-react";
import { format, addMonths, differenceInDays } from "date-fns";
import { toast } from "sonner";

interface Subscription {
  id: string;
  customerId: string;
  customerName: string;
  planName: string;
  billingCycle: "monthly" | "quarterly" | "annual";
  status: "active" | "paused" | "cancelled" | "trial";
  mrr: number;
  startDate: string;
  nextBillingDate: string;
  usageThisMonth: number;
  usageLimit: number;
  features: string[];
}

interface UsageRecord {
  id: string;
  subscriptionId: string;
  metricName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  periodStart: string;
  periodEnd: string;
}

interface ProrationCalculation {
  originalAmount: number;
  daysUsed: number;
  totalDays: number;
  proratedCredit: number;
  newPlanAmount: number;
  adjustedCharge: number;
}

const mockSubscriptions: Subscription[] = [
  {
    id: "sub_001",
    customerId: "cust_001",
    customerName: "Acme Corporation",
    planName: "Enterprise",
    billingCycle: "annual",
    status: "active",
    mrr: 2500,
    startDate: "2024-01-15",
    nextBillingDate: "2025-01-15",
    usageThisMonth: 850,
    usageLimit: 1000,
    features: ["Unlimited Users", "API Access", "Priority Support", "Custom Integrations"]
  },
  {
    id: "sub_002",
    customerId: "cust_002",
    customerName: "TechStart Inc",
    planName: "Professional",
    billingCycle: "monthly",
    status: "active",
    mrr: 499,
    startDate: "2024-06-01",
    nextBillingDate: "2025-02-01",
    usageThisMonth: 120,
    usageLimit: 500,
    features: ["10 Users", "API Access", "Email Support"]
  },
  {
    id: "sub_003",
    customerId: "cust_003",
    customerName: "Global Dynamics",
    planName: "Enterprise Plus",
    billingCycle: "quarterly",
    status: "trial",
    mrr: 5000,
    startDate: "2025-01-01",
    nextBillingDate: "2025-01-31",
    usageThisMonth: 50,
    usageLimit: 2000,
    features: ["Unlimited Users", "API Access", "24/7 Support", "Dedicated CSM", "SLA"]
  },
  {
    id: "sub_004",
    customerId: "cust_004",
    customerName: "Sunset Media",
    planName: "Starter",
    billingCycle: "monthly",
    status: "paused",
    mrr: 99,
    startDate: "2024-03-10",
    nextBillingDate: "2025-02-10",
    usageThisMonth: 0,
    usageLimit: 100,
    features: ["3 Users", "Email Support"]
  }
];

const mockUsageRecords: UsageRecord[] = [
  { id: "usage_001", subscriptionId: "sub_001", metricName: "API Calls", quantity: 45000, unitPrice: 0.001, total: 45, periodStart: "2025-01-01", periodEnd: "2025-01-31" },
  { id: "usage_002", subscriptionId: "sub_001", metricName: "Storage (GB)", quantity: 250, unitPrice: 0.10, total: 25, periodStart: "2025-01-01", periodEnd: "2025-01-31" },
  { id: "usage_003", subscriptionId: "sub_002", metricName: "API Calls", quantity: 12000, unitPrice: 0.002, total: 24, periodStart: "2025-01-01", periodEnd: "2025-01-31" },
  { id: "usage_004", subscriptionId: "sub_003", metricName: "Data Processing (GB)", quantity: 500, unitPrice: 0.05, total: 25, periodStart: "2025-01-01", periodEnd: "2025-01-31" }
];

const plans = [
  { id: "starter", name: "Starter", monthlyPrice: 99, features: ["3 Users", "Email Support"] },
  { id: "professional", name: "Professional", monthlyPrice: 499, features: ["10 Users", "API Access", "Email Support"] },
  { id: "enterprise", name: "Enterprise", monthlyPrice: 2500, features: ["Unlimited Users", "API Access", "Priority Support", "Custom Integrations"] },
  { id: "enterprise_plus", name: "Enterprise Plus", monthlyPrice: 5000, features: ["Unlimited Users", "API Access", "24/7 Support", "Dedicated CSM", "SLA"] }
];

export function SubscriptionBilling() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(mockSubscriptions);
  const [usageRecords] = useState<UsageRecord[]>(mockUsageRecords);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [showProrationDialog, setShowProrationDialog] = useState(false);
  const [showNewSubscriptionDialog, setShowNewSubscriptionDialog] = useState(false);
  const [newPlan, setNewPlan] = useState("");
  const [prorationResult, setProrationResult] = useState<ProrationCalculation | null>(null);
  
  // New subscription form state
  const [newSubCustomer, setNewSubCustomer] = useState("");
  const [newSubPlan, setNewSubPlan] = useState("");
  const [newSubBillingCycle, setNewSubBillingCycle] = useState<"monthly" | "quarterly" | "annual">("monthly");

  const totalMRR = subscriptions.filter(s => s.status === "active").reduce((sum, s) => sum + s.mrr, 0);
  const totalARR = totalMRR * 12;
  const activeCount = subscriptions.filter(s => s.status === "active").length;
  const trialCount = subscriptions.filter(s => s.status === "trial").length;

  const calculateProration = (subscription: Subscription, newPlanId: string) => {
    const currentPlan = plans.find(p => p.name === subscription.planName);
    const targetPlan = plans.find(p => p.id === newPlanId);
    
    if (!currentPlan || !targetPlan) return;

    const billingStart = new Date(subscription.nextBillingDate);
    billingStart.setMonth(billingStart.getMonth() - 1);
    const today = new Date();
    const billingEnd = new Date(subscription.nextBillingDate);
    
    const totalDays = differenceInDays(billingEnd, billingStart);
    const daysUsed = differenceInDays(today, billingStart);
    const daysRemaining = totalDays - daysUsed;
    
    const dailyRate = currentPlan.monthlyPrice / totalDays;
    const proratedCredit = dailyRate * daysRemaining;
    const newDailyRate = targetPlan.monthlyPrice / totalDays;
    const newPlanCharge = newDailyRate * daysRemaining;
    
    setProrationResult({
      originalAmount: currentPlan.monthlyPrice,
      daysUsed,
      totalDays,
      proratedCredit: Math.round(proratedCredit * 100) / 100,
      newPlanAmount: targetPlan.monthlyPrice,
      adjustedCharge: Math.round((newPlanCharge - proratedCredit) * 100) / 100
    });
  };

  const handlePlanChange = () => {
    if (selectedSubscription && newPlan) {
      calculateProration(selectedSubscription, newPlan);
    }
  };

  const applyPlanChange = () => {
    toast.success("Plan change applied with proration", {
      description: `Credit of $${prorationResult?.proratedCredit} applied. New charge: $${prorationResult?.adjustedCharge}`
    });
    setShowProrationDialog(false);
    setProrationResult(null);
    setNewPlan("");
    setSelectedSubscription(null);
  };

  const handleCreateSubscription = () => {
    if (!newSubCustomer || !newSubPlan) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    const selectedPlan = plans.find(p => p.id === newSubPlan);
    if (!selectedPlan) return;
    
    const multiplier = newSubBillingCycle === "annual" ? 12 : newSubBillingCycle === "quarterly" ? 3 : 1;
    const newSub: Subscription = {
      id: `sub_${Date.now()}`,
      customerId: `cust_${Date.now()}`,
      customerName: newSubCustomer,
      planName: selectedPlan.name,
      billingCycle: newSubBillingCycle,
      status: "active",
      mrr: selectedPlan.monthlyPrice,
      startDate: new Date().toISOString().split('T')[0],
      nextBillingDate: addMonths(new Date(), newSubBillingCycle === "annual" ? 12 : newSubBillingCycle === "quarterly" ? 3 : 1).toISOString().split('T')[0],
      usageThisMonth: 0,
      usageLimit: selectedPlan.id === "starter" ? 100 : selectedPlan.id === "professional" ? 500 : 1000,
      features: selectedPlan.features
    };
    
    setSubscriptions(prev => [...prev, newSub]);
    toast.success("Subscription created", {
      description: `${newSubCustomer} subscribed to ${selectedPlan.name} (${newSubBillingCycle})`
    });
    setShowNewSubscriptionDialog(false);
    setNewSubCustomer("");
    setNewSubPlan("");
    setNewSubBillingCycle("monthly");
  };

  const getStatusBadge = (status: Subscription["status"]) => {
    const styles = {
      active: "bg-success/10 text-success border-success/20",
      paused: "bg-warning/10 text-warning border-warning/20",
      cancelled: "bg-destructive/10 text-destructive border-destructive/20",
      trial: "bg-primary/10 text-primary border-primary/20"
    };
    return <Badge variant="outline" className={styles[status]}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Recurring Revenue</p>
                <p className="text-2xl font-bold">${totalMRR.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Annual Recurring Revenue</p>
                <p className="text-2xl font-bold">${totalARR.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Subscriptions</p>
                <p className="text-2xl font-bold">{activeCount}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Trials</p>
                <p className="text-2xl font-bold">{trialCount}</p>
              </div>
              <Clock className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="subscriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="usage">Usage Billing</TabsTrigger>
          <TabsTrigger value="proration">Proration Engine</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Active Subscriptions
                  </CardTitle>
                  <CardDescription>Manage recurring revenue and subscription lifecycle</CardDescription>
                </div>
                <Button onClick={() => setShowNewSubscriptionDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Subscription
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Billing Cycle</TableHead>
                    <TableHead>MRR</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Next Billing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.customerName}</TableCell>
                      <TableCell>{sub.planName}</TableCell>
                      <TableCell className="capitalize">{sub.billingCycle}</TableCell>
                      <TableCell>${sub.mrr.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="w-24">
                          <Progress value={(sub.usageThisMonth / sub.usageLimit) * 100} className="h-2" />
                          <span className="text-xs text-muted-foreground">
                            {sub.usageThisMonth}/{sub.usageLimit}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(sub.nextBillingDate), "MMM d, yyyy")}</TableCell>
                      <TableCell>{getStatusBadge(sub.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {sub.status === "active" && (
                            <Button variant="ghost" size="icon" title="Pause">
                              <Pause className="h-4 w-4" />
                            </Button>
                          )}
                          {sub.status === "paused" && (
                            <Button variant="ghost" size="icon" title="Resume">
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Change Plan"
                            onClick={() => {
                              setSelectedSubscription(sub);
                              setShowProrationDialog(true);
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Usage-Based Billing
              </CardTitle>
              <CardDescription>Track and bill for metered usage across subscriptions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageRecords.map((record) => {
                    const sub = subscriptions.find(s => s.id === record.subscriptionId);
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{sub?.customerName || "Unknown"}</TableCell>
                        <TableCell>{record.metricName}</TableCell>
                        <TableCell>{record.quantity.toLocaleString()}</TableCell>
                        <TableCell>${record.unitPrice.toFixed(3)}</TableCell>
                        <TableCell className="font-medium">${record.total.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(record.periodStart), "MMM d")} - {format(new Date(record.periodEnd), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Usage Charges This Period</span>
                  <span className="text-xl font-bold">
                    ${usageRecords.reduce((sum, r) => sum + r.total, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Proration Engine
              </CardTitle>
              <CardDescription>Calculate prorated charges for mid-cycle plan changes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Subscription</Label>
                    <Select
                      value={selectedSubscription?.id || ""}
                      onValueChange={(value) => {
                        const sub = subscriptions.find(s => s.id === value);
                        setSelectedSubscription(sub || null);
                        setProrationResult(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a subscription" />
                      </SelectTrigger>
                      <SelectContent>
                        {subscriptions.filter(s => s.status === "active").map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.customerName} - {sub.planName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedSubscription && (
                    <>
                      <div className="p-4 bg-muted rounded-lg space-y-2">
                        <p className="text-sm font-medium">Current Plan Details</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <span className="text-muted-foreground">Plan:</span>
                          <span>{selectedSubscription.planName}</span>
                          <span className="text-muted-foreground">Monthly Rate:</span>
                          <span>${selectedSubscription.mrr}</span>
                          <span className="text-muted-foreground">Next Billing:</span>
                          <span>{format(new Date(selectedSubscription.nextBillingDate), "MMM d, yyyy")}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>New Plan</Label>
                        <Select value={newPlan} onValueChange={setNewPlan}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select new plan" />
                          </SelectTrigger>
                          <SelectContent>
                            {plans.filter(p => p.name !== selectedSubscription.planName).map((plan) => (
                              <SelectItem key={plan.id} value={plan.id}>
                                {plan.name} - ${plan.monthlyPrice}/mo
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button onClick={handlePlanChange} disabled={!newPlan} className="w-full">
                        Calculate Proration
                      </Button>
                    </>
                  )}
                </div>

                <div>
                  {prorationResult ? (
                    <div className="p-6 border rounded-lg space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Calculator className="h-4 w-4" />
                        Proration Breakdown
                      </h4>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Original Plan Amount</span>
                          <span>${prorationResult.originalAmount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Days Used / Total Days</span>
                          <span>{prorationResult.daysUsed} / {prorationResult.totalDays}</span>
                        </div>
                        <div className="flex justify-between text-success">
                          <span>Prorated Credit</span>
                          <span>-${prorationResult.proratedCredit}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">New Plan Amount</span>
                          <span>${prorationResult.newPlanAmount}</span>
                        </div>
                        <hr />
                        <div className="flex justify-between text-lg font-bold">
                          <span>Adjusted Charge</span>
                          <span className={prorationResult.adjustedCharge < 0 ? "text-emerald-500" : ""}>
                            ${prorationResult.adjustedCharge}
                          </span>
                        </div>
                      </div>

                      <Button onClick={applyPlanChange} className="w-full">
                        Apply Plan Change
                      </Button>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center p-6 border rounded-lg border-dashed">
                      <div className="text-center text-muted-foreground">
                        <Calculator className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Select a subscription and new plan to calculate proration</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Plan Change Dialog */}
      <Dialog open={showProrationDialog} onOpenChange={setShowProrationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Subscription Plan</DialogTitle>
            <DialogDescription>
              Select a new plan for {selectedSubscription?.customerName}. Charges will be prorated.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Plan</Label>
              <Select value={newPlan} onValueChange={(value) => {
                setNewPlan(value);
                if (selectedSubscription) {
                  calculateProration(selectedSubscription, value);
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter(p => p.name !== selectedSubscription?.planName).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - ${plan.monthlyPrice}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {prorationResult && (
              <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Credit for unused time:</span>
                  <span className="text-success">-${prorationResult.proratedCredit}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Net charge today:</span>
                  <span>${prorationResult.adjustedCharge}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProrationDialog(false)}>
              Cancel
            </Button>
            <Button onClick={applyPlanChange} disabled={!prorationResult}>
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Subscription Dialog */}
      <Dialog open={showNewSubscriptionDialog} onOpenChange={setShowNewSubscriptionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Subscription</DialogTitle>
            <DialogDescription>
              Set up a new recurring subscription for a customer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input
                placeholder="Enter customer name"
                value={newSubCustomer}
                onChange={(e) => setNewSubCustomer(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={newSubPlan} onValueChange={setNewSubPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - ${plan.monthlyPrice}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Billing Cycle</Label>
              <Select value={newSubBillingCycle} onValueChange={(v) => setNewSubBillingCycle(v as "monthly" | "quarterly" | "annual")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {newSubPlan && (
              <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                <p className="font-medium">Plan Summary</p>
                <div className="flex justify-between">
                  <span>Monthly Rate:</span>
                  <span>${plans.find(p => p.id === newSubPlan)?.monthlyPrice}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span>Billing Amount:</span>
                  <span className="font-medium">
                    ${((plans.find(p => p.id === newSubPlan)?.monthlyPrice || 0) * 
                      (newSubBillingCycle === "annual" ? 12 : newSubBillingCycle === "quarterly" ? 3 : 1)).toLocaleString()}
                    /{newSubBillingCycle === "annual" ? "year" : newSubBillingCycle === "quarterly" ? "quarter" : "month"}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSubscriptionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubscription} disabled={!newSubCustomer || !newSubPlan}>
              Create Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
