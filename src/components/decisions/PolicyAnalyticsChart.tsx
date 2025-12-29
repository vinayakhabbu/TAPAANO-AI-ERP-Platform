import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, TrendingUp, Shield } from "lucide-react";
import type { DecisionTrace } from "@/hooks/useDecisionLedger";

interface PolicyAnalyticsChartProps {
  decisions: DecisionTrace[];
}

interface PolicyRuleResult {
  rule_id: string;
  rule_name: string;
  result: string;
  threshold?: number | string;
  actual?: number | string;
}

const COLORS = {
  pass: "hsl(var(--chart-2))",
  fail: "hsl(var(--chart-1))",
  warning: "hsl(var(--chart-4))",
  approved: "hsl(var(--chart-2))",
  rejected: "hsl(var(--chart-1))",
  pending: "hsl(var(--chart-3))",
};

export function PolicyAnalyticsChart({ decisions }: PolicyAnalyticsChartProps) {
  // Extract policy evaluation data from decisions
  const policyData = useMemo(() => {
    const ruleStats: Record<string, { pass: number; fail: number; warning: number; total: number }> = {};
    const overridesByType: Record<string, { total: number; overridden: number }> = {};
    const dailyTrends: Record<string, { date: string; approved: number; rejected: number; overrides: number }> = {};

    decisions.forEach((decision) => {
      const policyEval = decision.policy_evaluation as {
        rules_checked?: PolicyRuleResult[];
        overall_result?: string;
      } | null;

      // Track rule pass/fail stats
      if (policyEval?.rules_checked) {
        policyEval.rules_checked.forEach((rule: PolicyRuleResult) => {
          if (!ruleStats[rule.rule_id]) {
            ruleStats[rule.rule_id] = { pass: 0, fail: 0, warning: 0, total: 0 };
          }
          ruleStats[rule.rule_id][rule.result as keyof typeof ruleStats[string]]++;
          ruleStats[rule.rule_id].total++;
        });
      }

      // Track overrides by decision type
      if (!overridesByType[decision.decision_type]) {
        overridesByType[decision.decision_type] = { total: 0, overridden: 0 };
      }
      overridesByType[decision.decision_type].total++;
      
      // An override is when policy says fail/warning but decision was approved
      if (policyEval?.overall_result && 
          (policyEval.overall_result === "fail" || policyEval.overall_result === "warning") &&
          decision.approval_status === "approved") {
        overridesByType[decision.decision_type].overridden++;
      }

      // Daily trends
      const dateKey = new Date(decision.created_at).toISOString().split("T")[0];
      if (!dailyTrends[dateKey]) {
        dailyTrends[dateKey] = { date: dateKey, approved: 0, rejected: 0, overrides: 0 };
      }
      if (decision.approval_status === "approved") {
        dailyTrends[dateKey].approved++;
      } else if (decision.approval_status === "rejected") {
        dailyTrends[dateKey].rejected++;
      }
      if (policyEval?.overall_result === "fail" && decision.approval_status === "approved") {
        dailyTrends[dateKey].overrides++;
      }
    });

    return { ruleStats, overridesByType, dailyTrends };
  }, [decisions]);

  // Format data for charts
  const ruleComplianceData = Object.entries(policyData.ruleStats).map(([ruleId, stats]) => ({
    rule: ruleId.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
    Pass: stats.pass,
    Fail: stats.fail,
    Warning: stats.warning,
    complianceRate: stats.total > 0 ? Math.round((stats.pass / stats.total) * 100) : 0,
  }));

  const overrideRateData = Object.entries(policyData.overridesByType)
    .filter(([, stats]) => stats.total > 0)
    .map(([type, stats]) => ({
      name: type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      value: stats.total > 0 ? Math.round((stats.overridden / stats.total) * 100) : 0,
      overridden: stats.overridden,
      total: stats.total,
    }));

  const trendData = Object.values(policyData.dailyTrends)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14); // Last 14 days

  // Summary stats
  const totalRuleChecks = Object.values(policyData.ruleStats).reduce((sum, s) => sum + s.total, 0);
  const totalPasses = Object.values(policyData.ruleStats).reduce((sum, s) => sum + s.pass, 0);
  const totalOverrides = Object.values(policyData.overridesByType).reduce((sum, s) => sum + s.overridden, 0);
  const overallComplianceRate = totalRuleChecks > 0 ? Math.round((totalPasses / totalRuleChecks) * 100) : 0;

  if (decisions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">No decision data available for analytics</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Policy Compliance</p>
                <p className="text-2xl font-bold text-green-600">{overallComplianceRate}%</p>
              </div>
              <Shield className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rules Checked</p>
                <p className="text-2xl font-bold">{totalRuleChecks}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Policy Overrides</p>
                <p className="text-2xl font-bold text-amber-600">{totalOverrides}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Decision Types</p>
                <p className="text-2xl font-bold">{Object.keys(policyData.overridesByType).length}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">Rule Compliance</TabsTrigger>
          <TabsTrigger value="overrides">Override Rates</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>Policy Rule Compliance</CardTitle>
              <CardDescription>Pass/Fail/Warning breakdown by rule</CardDescription>
            </CardHeader>
            <CardContent>
              {ruleComplianceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ruleComplianceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="rule" type="category" width={150} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Pass" stackId="a" fill={COLORS.pass} />
                    <Bar dataKey="Warning" stackId="a" fill={COLORS.warning} />
                    <Bar dataKey="Fail" stackId="a" fill={COLORS.fail} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-8">No policy rules have been evaluated yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overrides">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Override Rate by Decision Type</CardTitle>
                <CardDescription>Percentage of decisions that overrode policy warnings/failures</CardDescription>
              </CardHeader>
              <CardContent>
                {overrideRateData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={overrideRateData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis unit="%" />
                      <Tooltip 
                        formatter={(value, name, props) => [
                          `${value}% (${props.payload.overridden}/${props.payload.total})`,
                          "Override Rate"
                        ]} 
                      />
                      <Bar dataKey="value" fill={COLORS.warning} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No override data available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Overridden Rules</CardTitle>
                <CardDescription>Rules most frequently bypassed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {ruleComplianceData
                    .filter(r => r.Fail > 0 || r.Warning > 0)
                    .sort((a, b) => (b.Fail + b.Warning) - (a.Fail + a.Warning))
                    .slice(0, 5)
                    .map((rule, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{rule.rule}</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            {rule.Warning} warnings
                          </Badge>
                          <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                            {rule.Fail} failures
                          </Badge>
                        </div>
                      </div>
                    ))}
                  {ruleComplianceData.filter(r => r.Fail > 0 || r.Warning > 0).length === 0 && (
                    <p className="text-muted-foreground text-center py-4">No rule violations recorded</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Decision Trends (Last 14 Days)</CardTitle>
              <CardDescription>Approvals, rejections, and policy overrides over time</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10 }} 
                      tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(v) => new Date(v).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="approved" stroke={COLORS.approved} name="Approved" strokeWidth={2} />
                    <Line type="monotone" dataKey="rejected" stroke={COLORS.rejected} name="Rejected" strokeWidth={2} />
                    <Line type="monotone" dataKey="overrides" stroke={COLORS.warning} name="Overrides" strokeWidth={2} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-8">No trend data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
