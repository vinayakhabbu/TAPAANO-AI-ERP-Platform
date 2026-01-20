import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { 
  Wallet, Building2, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, 
  Landmark, PiggyBank, CreditCard, DollarSign, Globe, Shield, Plus, 
  RefreshCw, BarChart3, CircleDollarSign, Banknote
} from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface CashPool {
  id: string;
  name: string;
  currency: string;
  totalBalance: number;
  participatingAccounts: number;
  interestRate: number;
  lastSweep: string;
  status: "active" | "pending" | "inactive";
}

interface Investment {
  id: string;
  type: "money_market" | "cd" | "treasury" | "commercial_paper" | "bond";
  institution: string;
  principal: number;
  currentValue: number;
  interestRate: number;
  maturityDate: string;
  currency: string;
  status: "active" | "maturing" | "matured";
}

interface BankRelationship {
  id: string;
  bankName: string;
  relationship: "primary" | "secondary" | "credit" | "investment";
  totalExposure: number;
  creditFacilities: number;
  utilizationRate: number;
  rating: string;
  lastReview: string;
}

interface CashPosition {
  date: string;
  balance: number;
  forecast: number;
}

const cashPositionData: CashPosition[] = [
  { date: "Jan 15", balance: 4500000, forecast: 4500000 },
  { date: "Jan 16", balance: 4350000, forecast: 4400000 },
  { date: "Jan 17", balance: 4600000, forecast: 4550000 },
  { date: "Jan 18", balance: 4450000, forecast: 4500000 },
  { date: "Jan 19", balance: 4700000, forecast: 4650000 },
  { date: "Jan 20", balance: 4850000, forecast: 4800000 },
  { date: "Jan 21", balance: 0, forecast: 4900000 },
  { date: "Jan 22", balance: 0, forecast: 5000000 },
  { date: "Jan 23", balance: 0, forecast: 4850000 },
  { date: "Jan 24", balance: 0, forecast: 4950000 },
];

const mockCashPools: CashPool[] = [
  { id: "pool_001", name: "USD Master Pool", currency: "USD", totalBalance: 3250000, participatingAccounts: 5, interestRate: 4.25, lastSweep: "2025-01-20T06:00:00", status: "active" },
  { id: "pool_002", name: "EUR Regional Pool", currency: "EUR", totalBalance: 1850000, participatingAccounts: 3, interestRate: 3.50, lastSweep: "2025-01-20T05:00:00", status: "active" },
  { id: "pool_003", name: "GBP Pool", currency: "GBP", totalBalance: 420000, participatingAccounts: 2, interestRate: 4.75, lastSweep: "2025-01-19T18:00:00", status: "pending" }
];

const mockInvestments: Investment[] = [
  { id: "inv_001", type: "money_market", institution: "Vanguard", principal: 500000, currentValue: 502500, interestRate: 5.10, maturityDate: "2025-02-28", currency: "USD", status: "active" },
  { id: "inv_002", type: "treasury", institution: "US Treasury", principal: 1000000, currentValue: 1008000, interestRate: 4.65, maturityDate: "2025-06-30", currency: "USD", status: "active" },
  { id: "inv_003", type: "cd", institution: "Chase Bank", principal: 250000, currentValue: 253750, interestRate: 4.80, maturityDate: "2025-01-25", currency: "USD", status: "maturing" },
  { id: "inv_004", type: "commercial_paper", institution: "Microsoft Corp", principal: 500000, currentValue: 501200, interestRate: 5.25, maturityDate: "2025-03-15", currency: "USD", status: "active" },
  { id: "inv_005", type: "bond", institution: "Apple Inc", principal: 300000, currentValue: 305400, interestRate: 4.25, maturityDate: "2026-01-15", currency: "USD", status: "active" }
];

const mockBankRelationships: BankRelationship[] = [
  { id: "bank_001", bankName: "JPMorgan Chase", relationship: "primary", totalExposure: 2500000, creditFacilities: 5000000, utilizationRate: 45, rating: "AA-", lastReview: "2025-01-10" },
  { id: "bank_002", bankName: "Bank of America", relationship: "secondary", totalExposure: 1200000, creditFacilities: 3000000, utilizationRate: 35, rating: "A+", lastReview: "2024-12-15" },
  { id: "bank_003", bankName: "Wells Fargo", relationship: "credit", totalExposure: 800000, creditFacilities: 2000000, utilizationRate: 40, rating: "A", lastReview: "2025-01-05" },
  { id: "bank_004", bankName: "Goldman Sachs", relationship: "investment", totalExposure: 1500000, creditFacilities: 0, utilizationRate: 0, rating: "A+", lastReview: "2024-11-20" }
];

const investmentAllocation = [
  { name: "Money Market", value: 500000, color: "#10b981" },
  { name: "Treasury", value: 1000000, color: "#3b82f6" },
  { name: "CDs", value: 250000, color: "#f59e0b" },
  { name: "Commercial Paper", value: 500000, color: "#8b5cf6" },
  { name: "Bonds", value: 300000, color: "#ec4899" }
];

export function TreasuryManagement() {
  const [showPoolDialog, setShowPoolDialog] = useState(false);
  const [showInvestmentDialog, setShowInvestmentDialog] = useState(false);

  const totalCashPosition = mockCashPools.reduce((sum, pool) => sum + pool.totalBalance, 0);
  const totalInvestments = mockInvestments.reduce((sum, inv) => sum + inv.currentValue, 0);
  const totalExposure = mockBankRelationships.reduce((sum, bank) => sum + bank.totalExposure, 0);
  const availableCredit = mockBankRelationships.reduce((sum, bank) => sum + (bank.creditFacilities - bank.totalExposure), 0);

  const getInvestmentIcon = (type: Investment["type"]) => {
    const icons = {
      money_market: PiggyBank,
      cd: CircleDollarSign,
      treasury: Landmark,
      commercial_paper: Banknote,
      bond: CreditCard
    };
    const Icon = icons[type];
    return <Icon className="h-4 w-4" />;
  };

  const getInvestmentLabel = (type: Investment["type"]) => {
    const labels = {
      money_market: "Money Market",
      cd: "Certificate of Deposit",
      treasury: "Treasury Bill",
      commercial_paper: "Commercial Paper",
      bond: "Corporate Bond"
    };
    return labels[type];
  };

  const getRelationshipBadge = (type: BankRelationship["relationship"]) => {
    const styles = {
      primary: "bg-primary/10 text-primary border-primary/20",
      secondary: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      credit: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      investment: "bg-purple-500/10 text-purple-500 border-purple-500/20"
    };
    return <Badge variant="outline" className={styles[type]}>{type}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Cash Position</p>
                <p className="text-2xl font-bold">${(totalCashPosition / 1000000).toFixed(2)}M</p>
                <p className="text-xs text-emerald-500 flex items-center mt-1">
                  <ArrowUpRight className="h-3 w-3" /> +5.2% from last week
                </p>
              </div>
              <Wallet className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Investment Portfolio</p>
                <p className="text-2xl font-bold">${(totalInvestments / 1000000).toFixed(2)}M</p>
                <p className="text-xs text-emerald-500 flex items-center mt-1">
                  <TrendingUp className="h-3 w-3" /> 4.7% avg yield
                </p>
              </div>
              <PiggyBank className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Bank Exposure</p>
                <p className="text-2xl font-bold">${(totalExposure / 1000000).toFixed(2)}M</p>
                <p className="text-xs text-muted-foreground mt-1">Across {mockBankRelationships.length} institutions</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available Credit</p>
                <p className="text-2xl font-bold">${(availableCredit / 1000000).toFixed(2)}M</p>
                <p className="text-xs text-muted-foreground mt-1">Undrawn facilities</p>
              </div>
              <CreditCard className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cash Position Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Cash Position & Forecast
          </CardTitle>
          <CardDescription>10-day rolling view of actual and forecasted balances</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashPositionData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis 
                  tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
                  className="text-xs"
                />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="balance" 
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary))" 
                  fillOpacity={0.3}
                  name="Actual"
                />
                <Area 
                  type="monotone" 
                  dataKey="forecast" 
                  stroke="hsl(var(--muted-foreground))" 
                  fill="hsl(var(--muted-foreground))" 
                  fillOpacity={0.1}
                  strokeDasharray="5 5"
                  name="Forecast"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pooling" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pooling">Cash Pooling</TabsTrigger>
          <TabsTrigger value="investments">Investments</TabsTrigger>
          <TabsTrigger value="banks">Bank Relationships</TabsTrigger>
        </TabsList>

        <TabsContent value="pooling">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Cash Pools
                  </CardTitle>
                  <CardDescription>Manage notional and physical cash pooling structures</CardDescription>
                </div>
                <Button onClick={() => setShowPoolDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Pool
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pool Name</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Total Balance</TableHead>
                    <TableHead>Accounts</TableHead>
                    <TableHead>Interest Rate</TableHead>
                    <TableHead>Last Sweep</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockCashPools.map((pool) => (
                    <TableRow key={pool.id}>
                      <TableCell className="font-medium">{pool.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{pool.currency}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${pool.totalBalance.toLocaleString()}
                      </TableCell>
                      <TableCell>{pool.participatingAccounts}</TableCell>
                      <TableCell>{pool.interestRate}%</TableCell>
                      <TableCell>{format(new Date(pool.lastSweep), "MMM d, h:mm a")}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            pool.status === "active"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : pool.status === "pending"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-muted"
                          }
                        >
                          {pool.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" title="Trigger Sweep">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="investments">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Investment Portfolio
                    </CardTitle>
                    <CardDescription>Short-term investment holdings and tracking</CardDescription>
                  </div>
                  <Button onClick={() => setShowInvestmentDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Investment
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Current Value</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Maturity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockInvestments.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getInvestmentIcon(inv.type)}
                            <span className="text-sm">{getInvestmentLabel(inv.type)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{inv.institution}</TableCell>
                        <TableCell className="text-right">${inv.principal.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${inv.currentValue.toLocaleString()}
                          <span className="text-xs text-emerald-500 ml-1">
                            +${(inv.currentValue - inv.principal).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>{inv.interestRate}%</TableCell>
                        <TableCell>{format(new Date(inv.maturityDate), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              inv.status === "active"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : inv.status === "maturing"
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-muted"
                            }
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Allocation</CardTitle>
                <CardDescription>Investment type breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={investmentAllocation}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {investmentAllocation.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {investmentAllocation.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span>{item.name}</span>
                      </div>
                      <span className="font-medium">${(item.value / 1000).toFixed(0)}K</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="banks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Bank Relationships
              </CardTitle>
              <CardDescription>Manage banking partners and credit facilities</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank</TableHead>
                    <TableHead>Relationship</TableHead>
                    <TableHead className="text-right">Total Exposure</TableHead>
                    <TableHead className="text-right">Credit Facilities</TableHead>
                    <TableHead>Utilization</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Last Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockBankRelationships.map((bank) => (
                    <TableRow key={bank.id}>
                      <TableCell className="font-medium">{bank.bankName}</TableCell>
                      <TableCell>{getRelationshipBadge(bank.relationship)}</TableCell>
                      <TableCell className="text-right">${bank.totalExposure.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {bank.creditFacilities > 0 ? `$${bank.creditFacilities.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell>
                        {bank.creditFacilities > 0 ? (
                          <div className="w-24">
                            <Progress value={bank.utilizationRate} className="h-2" />
                            <span className="text-xs text-muted-foreground">{bank.utilizationRate}%</span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500">
                          {bank.rating}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(bank.lastReview), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Credit Lines</p>
                    <p className="text-xl font-bold">
                      ${mockBankRelationships.reduce((sum, b) => sum + b.creditFacilities, 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Utilized</p>
                    <p className="text-xl font-bold">${totalExposure.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Utilization</p>
                    <p className="text-xl font-bold">
                      {Math.round(mockBankRelationships.filter(b => b.creditFacilities > 0).reduce((sum, b) => sum + b.utilizationRate, 0) / mockBankRelationships.filter(b => b.creditFacilities > 0).length)}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Pool Dialog */}
      <Dialog open={showPoolDialog} onOpenChange={setShowPoolDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Cash Pool</DialogTitle>
            <DialogDescription>Set up a new cash pooling structure</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pool Name</Label>
              <Input placeholder="e.g., USD Master Pool" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select defaultValue="USD">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pool Type</Label>
                <Select defaultValue="notional">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notional">Notional</SelectItem>
                    <SelectItem value="physical">Physical</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Interest Rate (%)</Label>
              <Input type="number" step="0.01" placeholder="4.25" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPoolDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast.success("Cash pool created successfully");
              setShowPoolDialog(false);
            }}>Create Pool</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Investment Dialog */}
      <Dialog open={showInvestmentDialog} onOpenChange={setShowInvestmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Investment</DialogTitle>
            <DialogDescription>Record a new short-term investment</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Investment Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="money_market">Money Market Fund</SelectItem>
                  <SelectItem value="cd">Certificate of Deposit</SelectItem>
                  <SelectItem value="treasury">Treasury Bill</SelectItem>
                  <SelectItem value="commercial_paper">Commercial Paper</SelectItem>
                  <SelectItem value="bond">Corporate Bond</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Institution / Issuer</Label>
              <Input placeholder="e.g., Vanguard, US Treasury" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Principal Amount</Label>
                <Input type="number" placeholder="500000" />
              </div>
              <div className="space-y-2">
                <Label>Interest Rate (%)</Label>
                <Input type="number" step="0.01" placeholder="5.10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Maturity Date</Label>
              <Input type="date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvestmentDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast.success("Investment added successfully");
              setShowInvestmentDialog(false);
            }}>Add Investment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
