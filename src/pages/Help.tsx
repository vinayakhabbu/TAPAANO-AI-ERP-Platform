import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  HelpCircle, 
  BookOpen, 
  MessageSquare, 
  Mail, 
  FileText,
  Users,
  CreditCard,
  Package,
  Factory,
  Wrench,
  TrendingUp,
  Building2
} from "lucide-react";

const moduleGuides = [
  {
    icon: Users,
    title: "CRM",
    description: "Manage customers, opportunities, and sales pipeline",
    topics: ["Creating leads", "Managing opportunities", "Pipeline tracking", "Customer communications"]
  },
  {
    icon: CreditCard,
    title: "Accounts Receivable",
    description: "Track invoices, payments, and customer aging",
    topics: ["Creating invoices", "Recording payments", "Aging reports", "Credit management"]
  },
  {
    icon: FileText,
    title: "Accounts Payable",
    description: "Manage bills, vendor payments, and purchase orders",
    topics: ["Processing bills", "Payment runs", "Vendor management", "Purchase requisitions"]
  },
  {
    icon: Package,
    title: "Inventory",
    description: "Control stock levels, warehouses, and transfers",
    topics: ["Stock management", "Warehouse setup", "Cycle counts", "Transfer orders"]
  },
  {
    icon: Factory,
    title: "Production",
    description: "Plan and track manufacturing operations",
    topics: ["Bills of materials", "Production orders", "Work centers", "Capacity planning"]
  },
  {
    icon: Wrench,
    title: "Service Management",
    description: "Handle service contracts, calls, and field visits",
    topics: ["Service contracts", "Service calls", "Field visits", "Warranty tracking"]
  },
  {
    icon: TrendingUp,
    title: "Controlling",
    description: "Track costs, budgets, and profitability",
    topics: ["Cost centers", "Budget management", "Internal orders", "Variance analysis"]
  },
  {
    icon: Building2,
    title: "Banking",
    description: "Reconcile accounts and manage cash flow",
    topics: ["Bank reconciliation", "Statement imports", "Matching rules", "Cash forecasting"]
  }
];

const faqs = [
  {
    question: "How do I get started with the ERP system?",
    answer: "Start by setting up your organization in Settings, then configure your chart of accounts in General Ledger. From there, you can begin adding customers, vendors, and products to start processing transactions."
  },
  {
    question: "How does Agent River help me?",
    answer: "Agent River is your AI assistant that understands the entire ERP system. Simply ask questions in natural language like 'Show me overdue invoices' or 'What's my inventory status?' and it will provide insights using specialized agents for each module."
  },
  {
    question: "Can I import data from my existing system?",
    answer: "Yes, most modules support data import. Go to the specific module and look for the Import option. Bank statements can be imported in various formats including CSV, OFX, and QIF."
  },
  {
    question: "How do I set up approval workflows?",
    answer: "Approval workflows are configured in Settings > Organization. You can set up approval rules based on document types, amounts, and department hierarchies."
  },
  {
    question: "What reports are available?",
    answer: "The Financial Reports module includes Balance Sheet, Income Statement, Cash Flow Statement, and Trial Balance. Each module also has specific reports like Aging Reports, Inventory Valuation, and Production Analysis."
  },
  {
    question: "How do I close a fiscal period?",
    answer: "Navigate to Period Close to manage your closing process. The system provides a checklist of tasks that need to be completed before closing, including reconciliations and accruals."
  }
];

export default function Help() {
  return (
    <AppLayout title="Help Center" subtitle="Get help with the ERP system and learn how to use each module">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Help Center</h1>
          <p className="text-muted-foreground mt-1">
            Get help with the ERP system and learn how to use each module
          </p>
        </div>

        {/* Quick Help Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">Ask Agent River</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Use the AI chat on the right sidebar to ask questions about any module or get help with tasks.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">Documentation</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Browse detailed documentation for each module with step-by-step guides and best practices.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">Contact Support</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Need more help? Reach out to our support team for personalized assistance.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Module Guides */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Module Guides
            </CardTitle>
            <CardDescription>
              Learn how to use each module of the ERP system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {moduleGuides.map((module) => (
                <div
                  key={module.title}
                  className="p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <module.icon className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">{module.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{module.description}</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {module.topics.map((topic) => (
                      <li key={topic} className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-primary/50" />
                        {topic}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* FAQs */}
        <Card>
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
            <CardDescription>
              Quick answers to common questions about the ERP system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
