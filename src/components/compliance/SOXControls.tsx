import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Shield, CheckCircle2, AlertTriangle, XCircle, Clock, FileText,
  Play, Pause, RotateCcw, Calendar, Users, TrendingUp, AlertCircle,
  ClipboardCheck, Lock, Eye, Search, Plus, Download, ChevronRight
} from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";

interface Control {
  id: string;
  controlId: string;
  name: string;
  category: "itgc" | "financial" | "access" | "change_management" | "operations";
  frequency: "continuous" | "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  owner: string;
  status: "effective" | "partially_effective" | "ineffective" | "not_tested";
  lastTestDate: string;
  nextTestDate: string;
  riskLevel: "high" | "medium" | "low";
  automationLevel: "full" | "partial" | "manual";
}

interface TestResult {
  id: string;
  controlId: string;
  testDate: string;
  tester: string;
  result: "pass" | "fail" | "exception";
  findings: string;
  sampleSize: number;
  exceptionsFound: number;
}

interface Deficiency {
  id: string;
  controlId: string;
  title: string;
  severity: "material_weakness" | "significant_deficiency" | "control_deficiency";
  status: "open" | "remediation" | "testing" | "closed";
  identifiedDate: string;
  targetDate: string;
  owner: string;
  remediationPlan: string;
  progress: number;
}

interface AuditEvidence {
  id: string;
  controlId: string;
  type: "screenshot" | "report" | "log" | "document";
  name: string;
  uploadedBy: string;
  uploadedAt: string;
  period: string;
}

const mockControls: Control[] = [
  { id: "ctrl_001", controlId: "ITGC-01", name: "User Access Review", category: "access", frequency: "quarterly", owner: "IT Security", status: "effective", lastTestDate: "2025-01-15", nextTestDate: "2025-04-15", riskLevel: "high", automationLevel: "partial" },
  { id: "ctrl_002", controlId: "ITGC-02", name: "Segregation of Duties", category: "access", frequency: "monthly", owner: "Internal Audit", status: "effective", lastTestDate: "2025-01-10", nextTestDate: "2025-02-10", riskLevel: "high", automationLevel: "full" },
  { id: "ctrl_003", controlId: "FIN-01", name: "Journal Entry Approval", category: "financial", frequency: "continuous", owner: "Controller", status: "effective", lastTestDate: "2025-01-20", nextTestDate: "2025-01-21", riskLevel: "high", automationLevel: "full" },
  { id: "ctrl_004", controlId: "FIN-02", name: "Bank Reconciliation", category: "financial", frequency: "monthly", owner: "Treasury", status: "partially_effective", lastTestDate: "2025-01-05", nextTestDate: "2025-02-05", riskLevel: "high", automationLevel: "partial" },
  { id: "ctrl_005", controlId: "CHG-01", name: "Change Management Approval", category: "change_management", frequency: "continuous", owner: "IT Operations", status: "effective", lastTestDate: "2025-01-18", nextTestDate: "2025-01-19", riskLevel: "medium", automationLevel: "full" },
  { id: "ctrl_006", controlId: "OPS-01", name: "Backup Verification", category: "operations", frequency: "daily", owner: "IT Operations", status: "ineffective", lastTestDate: "2025-01-19", nextTestDate: "2025-01-20", riskLevel: "high", automationLevel: "full" },
];

const mockTestResults: TestResult[] = [
  { id: "test_001", controlId: "ITGC-01", testDate: "2025-01-15", tester: "John Smith", result: "pass", findings: "All user access reviewed and appropriate", sampleSize: 50, exceptionsFound: 0 },
  { id: "test_002", controlId: "FIN-01", testDate: "2025-01-20", tester: "AI Automation", result: "pass", findings: "100% of journal entries had proper approval", sampleSize: 1250, exceptionsFound: 0 },
  { id: "test_003", controlId: "FIN-02", testDate: "2025-01-05", tester: "Sarah Johnson", result: "exception", findings: "3 reconciliations completed late", sampleSize: 12, exceptionsFound: 3 },
  { id: "test_004", controlId: "OPS-01", testDate: "2025-01-19", tester: "AI Automation", result: "fail", findings: "Backup verification failed for 2 systems", sampleSize: 10, exceptionsFound: 2 },
];

const mockDeficiencies: Deficiency[] = [
  { id: "def_001", controlId: "FIN-02", title: "Late Bank Reconciliations", severity: "control_deficiency", status: "remediation", identifiedDate: "2025-01-05", targetDate: "2025-02-28", owner: "Treasury Manager", remediationPlan: "Implement automated reconciliation tool and add calendar reminders", progress: 45 },
  { id: "def_002", controlId: "OPS-01", title: "Backup Verification Failures", severity: "significant_deficiency", status: "open", identifiedDate: "2025-01-19", targetDate: "2025-02-15", owner: "IT Director", remediationPlan: "Replace failing backup infrastructure and implement monitoring", progress: 10 },
];

const mockEvidence: AuditEvidence[] = [
  { id: "ev_001", controlId: "ITGC-01", type: "report", name: "Q4 User Access Review Report.pdf", uploadedBy: "John Smith", uploadedAt: "2025-01-15T14:30:00", period: "Q4 2024" },
  { id: "ev_002", controlId: "FIN-01", type: "screenshot", name: "JE Approval Workflow Screenshot.png", uploadedBy: "AI Automation", uploadedAt: "2025-01-20T09:00:00", period: "January 2025" },
  { id: "ev_003", controlId: "ITGC-02", type: "log", name: "SOD Violation Report - Jan 2025.csv", uploadedBy: "AI Automation", uploadedAt: "2025-01-10T08:00:00", period: "January 2025" },
];

export function SOXControls() {
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showDeficiencyDialog, setShowDeficiencyDialog] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const effectiveControls = mockControls.filter(c => c.status === "effective").length;
  const totalControls = mockControls.length;
  const openDeficiencies = mockDeficiencies.filter(d => d.status !== "closed").length;
  const automatedControls = mockControls.filter(c => c.automationLevel === "full").length;

  const filteredControls = filterCategory === "all" 
    ? mockControls 
    : mockControls.filter(c => c.category === filterCategory);

  const getStatusBadge = (status: Control["status"]) => {
    const styles = {
      effective: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      partially_effective: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      ineffective: "bg-destructive/10 text-destructive border-destructive/20",
      not_tested: "bg-muted text-muted-foreground"
    };
    const labels = {
      effective: "Effective",
      partially_effective: "Partial",
      ineffective: "Ineffective",
      not_tested: "Not Tested"
    };
    return <Badge variant="outline" className={styles[status]}>{labels[status]}</Badge>;
  };

  const getSeverityBadge = (severity: Deficiency["severity"]) => {
    const styles = {
      material_weakness: "bg-destructive/10 text-destructive border-destructive/20",
      significant_deficiency: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      control_deficiency: "bg-blue-500/10 text-blue-500 border-blue-500/20"
    };
    const labels = {
      material_weakness: "Material Weakness",
      significant_deficiency: "Significant Deficiency",
      control_deficiency: "Control Deficiency"
    };
    return <Badge variant="outline" className={styles[severity]}>{labels[severity]}</Badge>;
  };

  const getResultBadge = (result: TestResult["result"]) => {
    const styles = {
      pass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      fail: "bg-destructive/10 text-destructive border-destructive/20",
      exception: "bg-amber-500/10 text-amber-500 border-amber-500/20"
    };
    return <Badge variant="outline" className={styles[result]}>{result}</Badge>;
  };

  const runAutomatedTest = (control: Control) => {
    toast.success(`Running automated test for ${control.controlId}`, {
      description: "Results will be available shortly"
    });
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Control Effectiveness</p>
                <p className="text-2xl font-bold">{Math.round((effectiveControls / totalControls) * 100)}%</p>
                <p className="text-xs text-muted-foreground">{effectiveControls} of {totalControls} effective</p>
              </div>
              <Shield className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Deficiencies</p>
                <p className="text-2xl font-bold">{openDeficiencies}</p>
                <p className="text-xs text-muted-foreground">Requiring remediation</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Automated Controls</p>
                <p className="text-2xl font-bold">{automatedControls}</p>
                <p className="text-xs text-muted-foreground">{Math.round((automatedControls / totalControls) * 100)}% automated</p>
              </div>
              <RotateCcw className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tests This Month</p>
                <p className="text-2xl font-bold">{mockTestResults.length}</p>
                <p className="text-xs text-muted-foreground">Across all controls</p>
              </div>
              <ClipboardCheck className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="controls" className="space-y-4">
        <TabsList>
          <TabsTrigger value="controls">Controls Matrix</TabsTrigger>
          <TabsTrigger value="testing">Control Testing</TabsTrigger>
          <TabsTrigger value="deficiencies">Deficiencies</TabsTrigger>
          <TabsTrigger value="evidence">Evidence Library</TabsTrigger>
        </TabsList>

        <TabsContent value="controls">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    SOX Controls Matrix
                  </CardTitle>
                  <CardDescription>Manage and monitor internal controls</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="itgc">ITGC</SelectItem>
                      <SelectItem value="financial">Financial</SelectItem>
                      <SelectItem value="access">Access</SelectItem>
                      <SelectItem value="change_management">Change Mgmt</SelectItem>
                      <SelectItem value="operations">Operations</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Control
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Control ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Automation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next Test</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredControls.map((control) => (
                    <TableRow key={control.id}>
                      <TableCell className="font-mono font-medium">{control.controlId}</TableCell>
                      <TableCell>{control.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {control.category.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{control.frequency}</TableCell>
                      <TableCell>{control.owner}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            control.riskLevel === "high"
                              ? "bg-destructive/10 text-destructive"
                              : control.riskLevel === "medium"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-emerald-500/10 text-emerald-500"
                          }
                        >
                          {control.riskLevel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {control.automationLevel === "full" ? (
                          <Badge className="bg-primary/10 text-primary">Auto</Badge>
                        ) : control.automationLevel === "partial" ? (
                          <Badge variant="outline">Partial</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Manual</Badge>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(control.status)}</TableCell>
                      <TableCell>{format(new Date(control.nextTestDate), "MMM d")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {control.automationLevel === "full" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Run Test"
                              onClick={() => runAutomatedTest(control)}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View Details"
                            onClick={() => setSelectedControl(control)}
                          >
                            <Eye className="h-4 w-4" />
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

        <TabsContent value="testing">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5" />
                    Control Testing Results
                  </CardTitle>
                  <CardDescription>Track testing activities and outcomes</CardDescription>
                </div>
                <Button onClick={() => setShowTestDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Record Test
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Control ID</TableHead>
                    <TableHead>Test Date</TableHead>
                    <TableHead>Tester</TableHead>
                    <TableHead>Sample Size</TableHead>
                    <TableHead>Exceptions</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Findings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockTestResults.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell className="font-mono font-medium">{result.controlId}</TableCell>
                      <TableCell>{format(new Date(result.testDate), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        {result.tester === "AI Automation" ? (
                          <div className="flex items-center gap-1">
                            <RotateCcw className="h-3 w-3 text-primary" />
                            <span className="text-primary">AI Automation</span>
                          </div>
                        ) : (
                          result.tester
                        )}
                      </TableCell>
                      <TableCell>{result.sampleSize}</TableCell>
                      <TableCell>
                        {result.exceptionsFound > 0 ? (
                          <span className="text-destructive">{result.exceptionsFound}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>{getResultBadge(result.result)}</TableCell>
                      <TableCell className="max-w-xs truncate">{result.findings}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deficiencies">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Control Deficiencies
                  </CardTitle>
                  <CardDescription>Track and remediate identified weaknesses</CardDescription>
                </div>
                <Button onClick={() => setShowDeficiencyDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log Deficiency
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockDeficiencies.map((deficiency) => (
                  <div key={deficiency.id} className="p-4 border rounded-lg space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-muted-foreground">{deficiency.controlId}</span>
                          {getSeverityBadge(deficiency.severity)}
                          <Badge
                            variant="outline"
                            className={
                              deficiency.status === "closed"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : deficiency.status === "open"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-amber-500/10 text-amber-500"
                            }
                          >
                            {deficiency.status}
                          </Badge>
                        </div>
                        <h4 className="font-medium">{deficiency.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{deficiency.remediationPlan}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">Target: {format(new Date(deficiency.targetDate), "MMM d, yyyy")}</p>
                        <p className="text-muted-foreground">Owner: {deficiency.owner}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Remediation Progress</span>
                        <span>{deficiency.progress}%</span>
                      </div>
                      <Progress value={deficiency.progress} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Evidence Library
                  </CardTitle>
                  <CardDescription>Centralized repository of audit documentation</CardDescription>
                </div>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Evidence
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Control ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockEvidence.map((evidence) => (
                    <TableRow key={evidence.id}>
                      <TableCell className="font-mono">{evidence.controlId}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{evidence.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{evidence.name}</TableCell>
                      <TableCell>{evidence.period}</TableCell>
                      <TableCell>
                        {evidence.uploadedBy === "AI Automation" ? (
                          <div className="flex items-center gap-1">
                            <RotateCcw className="h-3 w-3 text-primary" />
                            <span className="text-primary">AI</span>
                          </div>
                        ) : (
                          evidence.uploadedBy
                        )}
                      </TableCell>
                      <TableCell>{format(new Date(evidence.uploadedAt), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Record Test Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Control Test</DialogTitle>
            <DialogDescription>Document the results of a control test</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Control</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select control" />
                </SelectTrigger>
                <SelectContent>
                  {mockControls.map((control) => (
                    <SelectItem key={control.id} value={control.id}>
                      {control.controlId} - {control.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Test Date</Label>
                <Input type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} />
              </div>
              <div className="space-y-2">
                <Label>Sample Size</Label>
                <Input type="number" placeholder="25" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Result</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select result" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="exception">Exception</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Findings</Label>
              <Textarea placeholder="Describe test findings..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast.success("Test recorded successfully");
              setShowTestDialog(false);
            }}>Save Test</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Deficiency Dialog */}
      <Dialog open={showDeficiencyDialog} onOpenChange={setShowDeficiencyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Control Deficiency</DialogTitle>
            <DialogDescription>Document a control weakness requiring remediation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Control</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select control" />
                </SelectTrigger>
                <SelectContent>
                  {mockControls.map((control) => (
                    <SelectItem key={control.id} value={control.id}>
                      {control.controlId} - {control.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="Brief description of deficiency" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="control_deficiency">Control Deficiency</SelectItem>
                    <SelectItem value="significant_deficiency">Significant Deficiency</SelectItem>
                    <SelectItem value="material_weakness">Material Weakness</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Remediation Date</Label>
                <Input type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Remediation Plan</Label>
              <Textarea placeholder="Describe the remediation approach..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeficiencyDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast.success("Deficiency logged successfully");
              setShowDeficiencyDialog(false);
            }}>Log Deficiency</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
