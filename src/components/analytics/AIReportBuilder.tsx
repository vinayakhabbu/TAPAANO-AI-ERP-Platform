import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sparkles, 
  FileText, 
  Send,
  BarChart3,
  PieChart,
  TrendingUp,
  Table,
  Download,
  Copy,
  RefreshCw,
  Clock,
  Star,
  Bookmark,
  Plus,
  Loader2,
  CheckCircle2,
  MessageSquare
} from "lucide-react";

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  isFavorite?: boolean;
}

interface GeneratedReport {
  id: string;
  query: string;
  type: "table" | "chart" | "narrative" | "mixed";
  content: string;
  timestamp: Date;
}

const reportTemplates: ReportTemplate[] = [
  {
    id: "1",
    name: "Monthly P&L Summary",
    description: "Profit & Loss with variance analysis",
    icon: <FileText className="h-5 w-5" />,
    category: "Financial Statements",
    isFavorite: true
  },
  {
    id: "2",
    name: "Cash Flow Forecast",
    description: "13-week cash projection",
    icon: <TrendingUp className="h-5 w-5" />,
    category: "Forecasting",
    isFavorite: true
  },
  {
    id: "3",
    name: "AR Aging Analysis",
    description: "Receivables by aging bucket",
    icon: <Table className="h-5 w-5" />,
    category: "Receivables"
  },
  {
    id: "4",
    name: "Vendor Spend Analysis",
    description: "Top vendors by spend category",
    icon: <PieChart className="h-5 w-5" />,
    category: "Payables"
  },
  {
    id: "5",
    name: "Department Budget vs Actual",
    description: "Variance by cost center",
    icon: <BarChart3 className="h-5 w-5" />,
    category: "Budgeting"
  },
  {
    id: "6",
    name: "Revenue by Customer",
    description: "Top customers and trends",
    icon: <TrendingUp className="h-5 w-5" />,
    category: "Revenue"
  }
];

const sampleQueries = [
  "Show me revenue by customer for Q4 2025",
  "What are our top 10 expense categories this month?",
  "Compare actual vs budget for Marketing department",
  "List all invoices overdue more than 30 days",
  "Calculate our gross margin trend over the last 6 months",
  "Which vendors have we paid the most this quarter?"
];

export function AIReportBuilder() {
  const [query, setQuery] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [activeTab, setActiveTab] = useState("builder");

  const handleGenerateReport = async () => {
    if (!query.trim()) return;

    setIsGenerating(true);

    // Simulate AI report generation
    await new Promise(resolve => setTimeout(resolve, 2000));

    const newReport: GeneratedReport = {
      id: crypto.randomUUID(),
      query,
      type: "mixed",
      content: generateMockReport(query),
      timestamp: new Date()
    };

    setGeneratedReports(prev => [newReport, ...prev]);
    setIsGenerating(false);
    setQuery("");
  };

  const generateMockReport = (query: string): string => {
    if (query.toLowerCase().includes("revenue")) {
      return `## Revenue Analysis Report

### Summary
Total revenue for the selected period: **$1,250,000**

### Top Customers by Revenue
| Customer | Revenue | % of Total | YoY Change |
|----------|---------|------------|------------|
| TechCorp Industries | $320,000 | 25.6% | +18.5% |
| GlobalFin Solutions | $245,000 | 19.6% | +12.3% |
| StartupXYZ Inc | $180,000 | 14.4% | +45.2% |
| Enterprise Co | $155,000 | 12.4% | +8.1% |
| MidMarket LLC | $120,000 | 9.6% | -3.2% |

### AI Insights
- Revenue concentration is healthy with top 5 customers representing 81.6% of total
- StartupXYZ shows exceptional growth (+45.2%), consider expanding relationship
- MidMarket LLC declining - recommend account review meeting

### Recommendations
1. Schedule QBR with MidMarket LLC to address declining trend
2. Explore upsell opportunities with TechCorp given strong relationship`;
    }

    if (query.toLowerCase().includes("expense") || query.toLowerCase().includes("budget")) {
      return `## Expense Analysis Report

### Summary
Total expenses for the selected period: **$875,000**

### Top Expense Categories
| Category | Actual | Budget | Variance | % Var |
|----------|--------|--------|----------|-------|
| Salaries & Wages | $320,000 | $310,000 | $10,000 | 3.2% |
| Marketing | $185,000 | $150,000 | $35,000 | 23.3% |
| Professional Fees | $95,000 | $50,000 | $45,000 | 90.0% |
| Rent & Utilities | $85,000 | $85,000 | $0 | 0.0% |
| Software & Tools | $72,000 | $75,000 | -$3,000 | -4.0% |

### AI Insights
- Marketing overspend driven by new Q4 campaign - validate ROI metrics
- Professional fees significantly over budget due to IPO preparation (one-time)
- Software savings from vendor consolidation initiative

### Recommendations
1. Reforecast Marketing budget for Q1 based on campaign results
2. Tag professional fees as non-recurring for clean operating expense view`;
    }

    return `## Custom Analysis Report

### Query: "${query}"

### Summary
The AI has analyzed your request and compiled the following insights based on your financial data.

### Key Findings
- Analysis period: Last 30 days
- Data sources: General Ledger, Sub-ledgers, Bank Transactions
- Records analyzed: 1,247 transactions

### Data Table
| Metric | Current | Prior | Change |
|--------|---------|-------|--------|
| Total Amount | $542,000 | $498,000 | +8.8% |
| Transaction Count | 1,247 | 1,156 | +7.9% |
| Average Size | $435 | $431 | +0.9% |

### AI Recommendations
Based on the analysis, consider reviewing the trends and implementing process improvements where applicable.

*Report generated by AI Report Builder*`;
  };

  const handleTemplateClick = (template: ReportTemplate) => {
    setQuery(`Generate a ${template.name}: ${template.description}`);
  };

  const handleSampleQuery = (sample: string) => {
    setQuery(sample);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Report Builder
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Generate custom financial reports using natural language queries
          </p>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="builder" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Query Builder
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-6">
          {/* Query Input */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Textarea
                  placeholder="Ask anything about your financial data... e.g., 'Show me revenue by customer for Q4' or 'What's our cash burn rate?'"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-h-[100px] text-base"
                />
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    {sampleQueries.slice(0, 3).map((sample, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleSampleQuery(sample)}
                      >
                        {sample.length > 35 ? sample.substring(0, 35) + '...' : sample}
                      </Button>
                    ))}
                  </div>
                  <Button 
                    onClick={handleGenerateReport}
                    disabled={!query.trim() || isGenerating}
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Generate Report
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generated Reports */}
          {generatedReports.length > 0 && (
            <div className="space-y-4">
              {generatedReports.map((report) => (
                <Card key={report.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          Generated Report
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Query: "{report.query}"
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Bookmark className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1">
                          <Download className="h-4 w-4" />
                          Export
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
                        {report.content.split('\n').map((line, i) => {
                          if (line.startsWith('## ')) {
                            return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.replace('## ', '')}</h2>;
                          }
                          if (line.startsWith('### ')) {
                            return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.replace('### ', '')}</h3>;
                          }
                          if (line.startsWith('|')) {
                            return <div key={i} className="font-mono text-xs">{line}</div>;
                          }
                          if (line.startsWith('- ')) {
                            return <li key={i} className="ml-4">{line.replace('- ', '')}</li>;
                          }
                          if (line.startsWith('1. ') || line.startsWith('2. ')) {
                            return <li key={i} className="ml-4 list-decimal">{line.replace(/^\d\. /, '')}</li>;
                          }
                          return <p key={i}>{line}</p>;
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <span className="text-xs text-muted-foreground">
                        Generated {report.timestamp.toLocaleTimeString()}
                      </span>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <RefreshCw className="h-3 w-3" />
                        Regenerate
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportTemplates.map((template) => (
              <Card 
                key={template.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleTemplateClick(template)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      {template.icon}
                    </div>
                    {template.isFavorite && (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  <h3 className="font-medium mt-3">{template.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                  <Badge variant="secondary" className="mt-3">{template.category}</Badge>
                </CardContent>
              </Card>
            ))}
            
            {/* Create Custom Template */}
            <Card className="border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="pt-6 flex flex-col items-center justify-center h-full min-h-[160px]">
                <div className="p-3 bg-muted rounded-full">
                  <Plus className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium mt-3">Create Template</p>
                <p className="text-sm text-muted-foreground text-center mt-1">
                  Save your custom report queries
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Report History</CardTitle>
            </CardHeader>
            <CardContent>
              {generatedReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No reports generated yet</p>
                  <p className="text-sm mt-1">Your generated reports will appear here</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {generatedReports.map((report) => (
                      <div
                        key={report.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{report.query}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {report.timestamp.toLocaleString()}
                            </p>
                          </div>
                          <Badge variant="outline">{report.type}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
