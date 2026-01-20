import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Shield,
  Loader2,
  FileSearch,
  Scale,
} from "lucide-react";
import { toast } from "sonner";

interface ContractTerm {
  category: string;
  term: string;
  riskLevel: "low" | "medium" | "high";
  notes: string;
}

interface AnalysisResult {
  summary: string;
  contractType: string;
  parties: string[];
  effectiveDate: string;
  expirationDate: string;
  totalValue: number;
  terms: ContractTerm[];
  complianceScore: number;
  recommendations: string[];
}

const mockAnalysis: AnalysisResult = {
  summary: "Master Services Agreement for software development and maintenance services with auto-renewal provisions.",
  contractType: "Master Services Agreement",
  parties: ["Acme Corporation", "TechVendor Inc."],
  effectiveDate: "2026-01-01",
  expirationDate: "2027-12-31",
  totalValue: 250000,
  terms: [
    { category: "Payment", term: "Net 30 payment terms", riskLevel: "low", notes: "Standard terms" },
    { category: "Liability", term: "Unlimited liability for data breaches", riskLevel: "high", notes: "Recommend negotiating cap" },
    { category: "Termination", term: "90-day termination notice required", riskLevel: "medium", notes: "Review operational impact" },
    { category: "IP Rights", term: "All deliverables are work-for-hire", riskLevel: "low", notes: "Favorable terms" },
    { category: "Auto-Renewal", term: "12-month auto-renewal if not cancelled 60 days prior", riskLevel: "medium", notes: "Set calendar reminder" },
    { category: "Indemnification", term: "Mutual indemnification for third-party claims", riskLevel: "low", notes: "Standard provision" },
  ],
  complianceScore: 72,
  recommendations: [
    "Negotiate liability cap for data breaches (currently unlimited)",
    "Set calendar reminder for renewal decision 90 days before expiration",
    "Review SLA terms and ensure they align with business requirements",
    "Confirm insurance requirements are met by vendor",
  ],
};

const riskConfig = {
  low: { label: "Low Risk", className: "bg-success/10 text-success", icon: CheckCircle },
  medium: { label: "Medium Risk", className: "bg-warning/10 text-warning", icon: Clock },
  high: { label: "High Risk", className: "bg-destructive/10 text-destructive", icon: AlertTriangle },
};

export function ContractAnalyzer() {
  const [contractText, setContractText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = async () => {
    if (!contractText.trim()) {
      toast.error("Please paste contract text to analyze");
      return;
    }

    setIsAnalyzing(true);
    // Simulate AI analysis delay
    await new Promise((resolve) => setTimeout(resolve, 2500));
    setResult(mockAnalysis);
    setIsAnalyzing(false);
    toast.success("Contract analysis complete");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setContractText(event.target?.result as string || "");
        toast.success(`Loaded ${file.name}`);
      };
      reader.readAsText(file);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" />
            AI Contract Analyzer
          </CardTitle>
          <CardDescription>
            Upload or paste contract text for AI-powered term extraction and compliance analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" className="gap-2" asChild>
              <label>
                <Upload className="h-4 w-4" />
                Upload File
                <input
                  type="file"
                  accept=".txt,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </Button>
            <span className="text-sm text-muted-foreground">or paste text below</span>
          </div>
          <Textarea
            placeholder="Paste contract text here..."
            className="min-h-[200px] font-mono text-sm"
            value={contractText}
            onChange={(e) => setContractText(e.target.value)}
          />
          <div className="flex justify-end">
            <Button onClick={handleAnalyze} disabled={isAnalyzing} className="gap-2">
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Scale className="h-4 w-4" />
                  Analyze Contract
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Contract Type</CardTitle>
                <FileText className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-foreground">{result.contractType}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
                <DollarSign className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-foreground">{formatCurrency(result.totalValue)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Expiration</CardTitle>
                <Clock className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-foreground">{result.expirationDate}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Compliance Score</CardTitle>
                <Shield className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold text-foreground">{result.complianceScore}%</div>
                  <Progress value={result.complianceScore} className="flex-1 h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Contract Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">{result.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {result.parties.map((party, idx) => (
                  <Badge key={idx} variant="secondary">{party}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Key Terms */}
          <Card>
            <CardHeader>
              <CardTitle>Key Terms & Risk Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {result.terms.map((term, idx) => {
                  const config = riskConfig[term.riskLevel];
                  const Icon = config.icon;
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-4 rounded-lg border border-border p-4"
                    >
                      <div className={`rounded-full p-2 ${config.className}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{term.category}</Badge>
                          <Badge className={config.className}>{config.label}</Badge>
                        </div>
                        <p className="mt-2 font-medium text-foreground">{term.term}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{term.notes}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-foreground">{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
