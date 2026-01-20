import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addMonths, differenceInMonths } from "date-fns";

// ASC 606 Recognition Methods
type RecognitionMethod = "point_in_time" | "over_time_output" | "over_time_input" | "straight_line";

interface RevenueContract {
  id: string;
  contractNumber: string;
  customerName: string;
  totalValue: number;
  recognizedAmount: number;
  deferredAmount: number;
  startDate: string;
  endDate: string;
  recognitionMethod: RecognitionMethod;
  performanceObligations: PerformanceObligation[];
  status: "active" | "completed" | "pending";
}

interface PerformanceObligation {
  id: string;
  description: string;
  standalonePrice: number;
  allocatedPrice: number;
  recognizedAmount: number;
  satisfactionProgress: number;
  method: RecognitionMethod;
}

// Sample data for demonstration
const SAMPLE_CONTRACTS: RevenueContract[] = [
  {
    id: "1",
    contractNumber: "REV-2024-001",
    customerName: "Acme Corporation",
    totalValue: 120000,
    recognizedAmount: 80000,
    deferredAmount: 40000,
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    recognitionMethod: "straight_line",
    status: "active",
    performanceObligations: [
      { id: "po1", description: "Software License", standalonePrice: 60000, allocatedPrice: 60000, recognizedAmount: 50000, satisfactionProgress: 83, method: "straight_line" },
      { id: "po2", description: "Implementation Services", standalonePrice: 40000, allocatedPrice: 40000, recognizedAmount: 30000, satisfactionProgress: 75, method: "over_time_input" },
      { id: "po3", description: "Training", standalonePrice: 20000, allocatedPrice: 20000, recognizedAmount: 0, satisfactionProgress: 0, method: "point_in_time" },
    ],
  },
  {
    id: "2",
    contractNumber: "REV-2024-002",
    customerName: "TechStart Inc",
    totalValue: 48000,
    recognizedAmount: 48000,
    deferredAmount: 0,
    startDate: "2024-03-01",
    endDate: "2025-02-28",
    recognitionMethod: "over_time_output",
    status: "completed",
    performanceObligations: [
      { id: "po4", description: "Annual Subscription", standalonePrice: 48000, allocatedPrice: 48000, recognizedAmount: 48000, satisfactionProgress: 100, method: "straight_line" },
    ],
  },
  {
    id: "3",
    contractNumber: "REV-2024-003",
    customerName: "Global Enterprises",
    totalValue: 250000,
    recognizedAmount: 62500,
    deferredAmount: 187500,
    startDate: "2024-06-01",
    endDate: "2025-05-31",
    recognitionMethod: "over_time_input",
    status: "active",
    performanceObligations: [
      { id: "po5", description: "Enterprise License", standalonePrice: 150000, allocatedPrice: 150000, recognizedAmount: 37500, satisfactionProgress: 25, method: "straight_line" },
      { id: "po6", description: "Professional Services", standalonePrice: 75000, allocatedPrice: 75000, recognizedAmount: 18750, satisfactionProgress: 25, method: "over_time_input" },
      { id: "po7", description: "Support (Year 1)", standalonePrice: 25000, allocatedPrice: 25000, recognizedAmount: 6250, satisfactionProgress: 25, method: "straight_line" },
    ],
  },
];

const METHOD_LABELS: Record<RecognitionMethod, string> = {
  point_in_time: "Point in Time",
  over_time_output: "Over Time (Output)",
  over_time_input: "Over Time (Input)",
  straight_line: "Straight Line",
};

const STATUS_CONFIG = {
  active: { label: "Active", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  pending: { label: "Pending", className: "bg-warning/10 text-warning" },
};

export function RevenueRecognitionSchedule() {
  const [selectedContract, setSelectedContract] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const contracts = SAMPLE_CONTRACTS;

  const filteredContracts = useMemo(() => {
    if (filterStatus === "all") return contracts;
    return contracts.filter((c) => c.status === filterStatus);
  }, [contracts, filterStatus]);

  const totals = useMemo(() => {
    return contracts.reduce(
      (acc, c) => ({
        total: acc.total + c.totalValue,
        recognized: acc.recognized + c.recognizedAmount,
        deferred: acc.deferred + c.deferredAmount,
      }),
      { total: 0, recognized: 0, deferred: 0 }
    );
  }, [contracts]);

  const selectedContractData = contracts.find((c) => c.id === selectedContract);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={DollarSign}
          label="Total Contract Value"
          value={`$${totals.total.toLocaleString()}`}
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Recognized Revenue"
          value={`$${totals.recognized.toLocaleString()}`}
          iconBg="bg-success/10"
          iconColor="text-success"
          subtext={`${Math.round((totals.recognized / totals.total) * 100)}% of total`}
        />
        <SummaryCard
          icon={Clock}
          label="Deferred Revenue"
          value={`$${totals.deferred.toLocaleString()}`}
          iconBg="bg-warning/10"
          iconColor="text-warning"
          subtext="To be recognized"
        />
        <SummaryCard
          icon={FileText}
          label="Active Contracts"
          value={contracts.filter((c) => c.status === "active").length.toString()}
          iconBg="bg-accent/10"
          iconColor="text-accent-foreground"
        />
      </div>

      <Tabs defaultValue="contracts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="contracts" className="gap-2">
            <FileText className="h-4 w-4" />
            Contracts
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2">
            <Calendar className="h-4 w-4" />
            Recognition Schedule
          </TabsTrigger>
          <TabsTrigger value="asc606" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            ASC 606 Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contracts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Revenue Contracts</CardTitle>
                <CardDescription>Track contracts and performance obligations</CardDescription>
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Recognition Progress</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.map((contract) => {
                    const progress = (contract.recognizedAmount / contract.totalValue) * 100;
                    const status = STATUS_CONFIG[contract.status];
                    return (
                      <TableRow 
                        key={contract.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedContract(contract.id === selectedContract ? null : contract.id)}
                      >
                        <TableCell className="font-medium">{contract.contractNumber}</TableCell>
                        <TableCell>{contract.customerName}</TableCell>
                        <TableCell>${contract.totalValue.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={progress} className="w-20 h-2" />
                            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {METHOD_LABELS[contract.recognitionMethod]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>
                            {status.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Performance Obligations Detail */}
              {selectedContractData && (
                <div className="mt-6 p-4 rounded-lg border border-border bg-muted/30">
                  <h4 className="font-semibold mb-4">
                    Performance Obligations - {selectedContractData.contractNumber}
                  </h4>
                  <div className="space-y-3">
                    {selectedContractData.performanceObligations.map((po) => (
                      <div key={po.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{po.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Allocated: ${po.allocatedPrice.toLocaleString()} • 
                            Method: {METHOD_LABELS[po.method]}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium">${po.recognizedAmount.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">recognized</p>
                          </div>
                          <div className="w-24">
                            <Progress value={po.satisfactionProgress} className="h-2" />
                            <p className="text-xs text-muted-foreground text-center mt-1">
                              {po.satisfactionProgress}%
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Recognition Schedule</CardTitle>
              <CardDescription>Projected revenue recognition by month</CardDescription>
            </CardHeader>
            <CardContent>
              <RecognitionScheduleTable contracts={contracts} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asc606">
          <ASC606CompliancePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ 
  icon: Icon, 
  label, 
  value, 
  iconBg, 
  iconColor,
  subtext 
}: { 
  icon: any; 
  label: string; 
  value: string; 
  iconBg: string; 
  iconColor: string;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecognitionScheduleTable({ contracts }: { contracts: RevenueContract[] }) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(new Date(), i));
  
  // Calculate monthly recognition for each contract
  const monthlyData = months.map((month) => {
    const monthStr = format(month, "MMM yyyy");
    let total = 0;
    
    contracts.forEach((contract) => {
      if (contract.status === "completed") return;
      const start = new Date(contract.startDate);
      const end = new Date(contract.endDate);
      if (month >= start && month <= end) {
        const contractMonths = differenceInMonths(end, start) + 1;
        const monthlyAmount = contract.totalValue / contractMonths;
        total += monthlyAmount;
      }
    });
    
    return { month: monthStr, amount: total };
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Projected Recognition</TableHead>
          <TableHead>Distribution</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {monthlyData.map((row, i) => {
          const maxAmount = Math.max(...monthlyData.map((d) => d.amount));
          const percentage = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0;
          return (
            <TableRow key={i}>
              <TableCell className="font-medium">{row.month}</TableCell>
              <TableCell className="text-right">${row.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
              <TableCell>
                <div className="w-full max-w-xs">
                  <Progress value={percentage} className="h-2" />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ASC606CompliancePanel() {
  const steps = [
    { id: 1, title: "Identify the Contract", status: "complete", description: "Customer contracts validated and documented" },
    { id: 2, title: "Identify Performance Obligations", status: "complete", description: "Distinct goods/services identified and allocated" },
    { id: 3, title: "Determine Transaction Price", status: "complete", description: "Variable consideration and constraints applied" },
    { id: 4, title: "Allocate Transaction Price", status: "complete", description: "Standalone selling prices used for allocation" },
    { id: 5, title: "Recognize Revenue", status: "in_progress", description: "Revenue recognized as obligations satisfied" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          ASC 606 / IFRS 15 Compliance
        </CardTitle>
        <CardDescription>Five-step revenue recognition model status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                  step.status === "complete" ? "bg-success/10 text-success" : 
                  step.status === "in_progress" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {step.status === "complete" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    step.id
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div className={cn(
                    "w-0.5 h-8 mt-2",
                    step.status === "complete" ? "bg-success" : "bg-border"
                  )} />
                )}
              </div>
              <div className="flex-1 pb-4">
                <p className="font-medium text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
              <Badge 
                variant="outline" 
                className={cn(
                  "h-6",
                  step.status === "complete" ? "border-success text-success" :
                  step.status === "in_progress" ? "border-primary text-primary" : ""
                )}
              >
                {step.status === "complete" ? "Complete" : step.status === "in_progress" ? "In Progress" : "Pending"}
              </Badge>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-lg bg-warning/5 border border-warning/20">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="font-medium text-foreground">Disclosure Requirements</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ensure quarterly and annual disclosures include disaggregated revenue, contract balances, 
                and performance obligations information per ASC 606-10-50.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
