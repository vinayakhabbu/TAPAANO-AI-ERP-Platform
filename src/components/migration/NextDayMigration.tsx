import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Upload, FileSpreadsheet, Sparkles, CheckCircle2, AlertTriangle, 
  ArrowRight, Database, RefreshCw, Zap, FileText, Download,
  ChevronRight, Loader2, XCircle, BarChart3
} from "lucide-react";
import { toast } from "sonner";

interface SourceSystem {
  id: string;
  name: string;
  type: "erp" | "accounting" | "crm" | "spreadsheet";
  icon: string;
  supported: boolean;
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
  dataType: string;
  confidence: number;
  status: "mapped" | "suggested" | "unmapped" | "conflict";
  transformation?: string;
}

interface MigrationJob {
  id: string;
  name: string;
  sourceSystem: string;
  status: "pending" | "validating" | "migrating" | "completed" | "failed";
  progress: number;
  recordsTotal: number;
  recordsMigrated: number;
  errors: number;
  startedAt?: string;
  completedAt?: string;
}

interface ValidationResult {
  field: string;
  issue: string;
  severity: "error" | "warning" | "info";
  affectedRows: number;
  suggestion?: string;
}

const sourceSystems: SourceSystem[] = [
  { id: "quickbooks", name: "QuickBooks", type: "accounting", icon: "QB", supported: true },
  { id: "xero", name: "Xero", type: "accounting", icon: "XR", supported: true },
  { id: "sage", name: "Sage", type: "erp", icon: "SG", supported: true },
  { id: "netsuite", name: "NetSuite", type: "erp", icon: "NS", supported: true },
  { id: "sap", name: "SAP B1", type: "erp", icon: "SAP", supported: true },
  { id: "dynamics", name: "Dynamics 365", type: "erp", icon: "D365", supported: true },
  { id: "salesforce", name: "Salesforce", type: "crm", icon: "SF", supported: true },
  { id: "excel", name: "Excel/CSV", type: "spreadsheet", icon: "XLS", supported: true },
];

const mockFieldMappings: FieldMapping[] = [
  { sourceField: "CustomerName", targetField: "name", dataType: "string", confidence: 98, status: "mapped" },
  { sourceField: "CustomerEmail", targetField: "email", dataType: "string", confidence: 95, status: "mapped" },
  { sourceField: "Phone", targetField: "phone", dataType: "string", confidence: 92, status: "mapped" },
  { sourceField: "BillingAddress", targetField: "address", dataType: "string", confidence: 88, status: "suggested" },
  { sourceField: "CreditLimit", targetField: "credit_limit", dataType: "number", confidence: 85, status: "suggested", transformation: "Multiply by 100 (cents)" },
  { sourceField: "PaymentTerms", targetField: "payment_terms", dataType: "number", confidence: 72, status: "suggested", transformation: "Extract numeric days" },
  { sourceField: "TaxID", targetField: "", dataType: "string", confidence: 0, status: "unmapped" },
  { sourceField: "CustomField1", targetField: "", dataType: "string", confidence: 0, status: "unmapped" },
];

const mockValidationResults: ValidationResult[] = [
  { field: "email", issue: "Invalid email format", severity: "error", affectedRows: 12, suggestion: "Fix format or leave blank" },
  { field: "credit_limit", issue: "Negative values detected", severity: "error", affectedRows: 3, suggestion: "Convert to positive or set to 0" },
  { field: "phone", issue: "Non-standard format", severity: "warning", affectedRows: 45, suggestion: "Will be normalized during import" },
  { field: "payment_terms", issue: "Empty values", severity: "info", affectedRows: 28, suggestion: "Will default to 30 days" },
];

const mockMigrationJobs: MigrationJob[] = [
  { id: "mig_001", name: "Customers Import", sourceSystem: "QuickBooks", status: "completed", progress: 100, recordsTotal: 1250, recordsMigrated: 1247, errors: 3, startedAt: "2025-01-19T10:00:00", completedAt: "2025-01-19T10:15:00" },
  { id: "mig_002", name: "Vendors Import", sourceSystem: "QuickBooks", status: "completed", progress: 100, recordsTotal: 380, recordsMigrated: 380, errors: 0, startedAt: "2025-01-19T10:20:00", completedAt: "2025-01-19T10:25:00" },
  { id: "mig_003", name: "Products Import", sourceSystem: "Excel/CSV", status: "migrating", progress: 65, recordsTotal: 2500, recordsMigrated: 1625, errors: 8, startedAt: "2025-01-20T09:00:00" },
  { id: "mig_004", name: "Historical Invoices", sourceSystem: "QuickBooks", status: "pending", progress: 0, recordsTotal: 15000, recordsMigrated: 0, errors: 0 },
];

export function NextDayMigration() {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>(mockFieldMappings);
  const [step, setStep] = useState<"source" | "mapping" | "validation" | "migrate">("source");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSource(sourceId);
    setIsAnalyzing(true);
    
    // Simulate AI analysis
    setTimeout(() => {
      setIsAnalyzing(false);
      setStep("mapping");
      toast.success("AI Analysis Complete", {
        description: "Field mappings have been suggested based on your data structure"
      });
    }, 2000);
  };

  const handleMappingChange = (index: number, targetField: string) => {
    const updated = [...mappings];
    updated[index] = {
      ...updated[index],
      targetField,
      status: targetField ? "mapped" : "unmapped",
      confidence: targetField ? 100 : 0
    };
    setMappings(updated);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 90) return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{confidence}%</Badge>;
    if (confidence >= 70) return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">{confidence}%</Badge>;
    if (confidence > 0) return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">{confidence}%</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">-</Badge>;
  };

  const getStatusIcon = (status: FieldMapping["status"]) => {
    switch (status) {
      case "mapped": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "suggested": return <Sparkles className="h-4 w-4 text-amber-500" />;
      case "conflict": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default: return <XCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getJobStatusBadge = (status: MigrationJob["status"]) => {
    const styles = {
      pending: "bg-muted text-muted-foreground",
      validating: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      migrating: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      failed: "bg-destructive/10 text-destructive border-destructive/20"
    };
    return <Badge variant="outline" className={styles[status]}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2">
        {["source", "mapping", "validation", "migrate"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : ["source", "mapping", "validation", "migrate"].indexOf(step) > i
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {["source", "mapping", "validation", "migrate"].indexOf(step) > i ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            <span className="text-sm capitalize hidden sm:inline">{s === "source" ? "Select Source" : s}</span>
            {i < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <Tabs defaultValue="wizard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="wizard">Migration Wizard</TabsTrigger>
          <TabsTrigger value="jobs">Migration Jobs</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="wizard">
          {step === "source" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Select Source System
                </CardTitle>
                <CardDescription>Choose your current system to migrate data from</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {sourceSystems.map((system) => (
                    <button
                      key={system.id}
                      onClick={() => handleSourceSelect(system.id)}
                      disabled={!system.supported || isAnalyzing}
                      className={`p-4 border rounded-lg text-center hover:border-primary transition-colors ${
                        selectedSource === system.id ? "border-primary bg-primary/5" : ""
                      } ${!system.supported ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                        {system.icon}
                      </div>
                      <p className="font-medium text-sm">{system.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{system.type}</p>
                    </button>
                  ))}
                </div>

                {isAnalyzing && (
                  <div className="mt-6 p-4 bg-muted rounded-lg flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div>
                      <p className="font-medium">Analyzing data structure...</p>
                      <p className="text-sm text-muted-foreground">AI is mapping your fields automatically</p>
                    </div>
                  </div>
                )}

                <div className="mt-6 p-4 border rounded-lg border-dashed">
                  <div className="flex items-center gap-4">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Or upload a file</p>
                      <p className="text-sm text-muted-foreground">Drop Excel, CSV, or JSON files here</p>
                    </div>
                    <Button variant="outline" className="ml-auto">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Browse Files
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "mapping" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      AI-Assisted Field Mapping
                    </CardTitle>
                    <CardDescription>Review and adjust the suggested mappings</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep("source")}>Back</Button>
                    <Button onClick={() => setStep("validation")}>
                      Validate Data
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 p-3 bg-primary/5 rounded-lg flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>AI mapped {mappings.filter(m => m.status !== "unmapped").length} of {mappings.length} fields automatically</span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Source Field</TableHead>
                      <TableHead></TableHead>
                      <TableHead>Target Field</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Transformation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping, index) => (
                      <TableRow key={index}>
                        <TableCell>{getStatusIcon(mapping.status)}</TableCell>
                        <TableCell className="font-mono text-sm">{mapping.sourceField}</TableCell>
                        <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                        <TableCell>
                          <Select
                            value={mapping.targetField}
                            onValueChange={(value) => handleMappingChange(index, value)}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Select field" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">-- Skip --</SelectItem>
                              <SelectItem value="name">name</SelectItem>
                              <SelectItem value="email">email</SelectItem>
                              <SelectItem value="phone">phone</SelectItem>
                              <SelectItem value="address">address</SelectItem>
                              <SelectItem value="credit_limit">credit_limit</SelectItem>
                              <SelectItem value="payment_terms">payment_terms</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{getConfidenceBadge(mapping.confidence)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {mapping.transformation || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {step === "validation" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Data Validation
                    </CardTitle>
                    <CardDescription>Review issues before migrating</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep("mapping")}>Back</Button>
                    <Button onClick={() => setStep("migrate")}>
                      Start Migration
                      <Zap className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-destructive/10 rounded-lg text-center">
                    <p className="text-2xl font-bold text-destructive">
                      {mockValidationResults.filter(r => r.severity === "error").length}
                    </p>
                    <p className="text-sm text-muted-foreground">Errors</p>
                  </div>
                  <div className="p-4 bg-amber-500/10 rounded-lg text-center">
                    <p className="text-2xl font-bold text-amber-500">
                      {mockValidationResults.filter(r => r.severity === "warning").length}
                    </p>
                    <p className="text-sm text-muted-foreground">Warnings</p>
                  </div>
                  <div className="p-4 bg-blue-500/10 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-500">
                      {mockValidationResults.filter(r => r.severity === "info").length}
                    </p>
                    <p className="text-sm text-muted-foreground">Info</p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Affected Rows</TableHead>
                      <TableHead>Suggestion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockValidationResults.map((result, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              result.severity === "error"
                                ? "bg-destructive/10 text-destructive"
                                : result.severity === "warning"
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-blue-500/10 text-blue-500"
                            }
                          >
                            {result.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{result.field}</TableCell>
                        <TableCell>{result.issue}</TableCell>
                        <TableCell>{result.affectedRows}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{result.suggestion}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {step === "migrate" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Migration in Progress
                </CardTitle>
                <CardDescription>Your data is being migrated</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-6 border rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-medium">Customers Import</p>
                      <p className="text-sm text-muted-foreground">from QuickBooks</p>
                    </div>
                    <Badge className="bg-amber-500/10 text-amber-500">In Progress</Badge>
                  </div>
                  <Progress value={65} className="h-3 mb-2" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>1,625 of 2,500 records</span>
                    <span>~3 min remaining</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">2,500</p>
                    <p className="text-sm text-muted-foreground">Total Records</p>
                  </div>
                  <div className="p-4 bg-emerald-500/10 rounded-lg">
                    <p className="text-2xl font-bold text-emerald-500">1,617</p>
                    <p className="text-sm text-muted-foreground">Successful</p>
                  </div>
                  <div className="p-4 bg-destructive/10 rounded-lg">
                    <p className="text-2xl font-bold text-destructive">8</p>
                    <p className="text-sm text-muted-foreground">Errors</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">875</p>
                    <p className="text-sm text-muted-foreground">Pending</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Migration
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Download Error Log
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Migration Jobs
                  </CardTitle>
                  <CardDescription>Track all migration activities</CardDescription>
                </div>
                <Button onClick={() => setStep("source")}>
                  <Zap className="h-4 w-4 mr-2" />
                  New Migration
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockMigrationJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.name}</TableCell>
                      <TableCell>{job.sourceSystem}</TableCell>
                      <TableCell>
                        <div className="w-24">
                          <Progress value={job.progress} className="h-2" />
                          <span className="text-xs text-muted-foreground">{job.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {job.recordsMigrated.toLocaleString()} / {job.recordsTotal.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {job.errors > 0 ? (
                          <span className="text-destructive">{job.errors}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>{getJobStatusBadge(job.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {job.status === "pending" && (
                            <Button variant="ghost" size="icon" title="Start">
                              <Zap className="h-4 w-4" />
                            </Button>
                          )}
                          {job.status === "completed" && job.errors > 0 && (
                            <Button variant="ghost" size="icon" title="View Errors">
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Retry">
                            <RefreshCw className="h-4 w-4" />
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

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Migration History</CardTitle>
              <CardDescription>View past migration activities and logs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Migration history will appear here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
