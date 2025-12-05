import { AppLayout } from "@/components/layout/AppLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ARAgingChart } from "@/components/dashboard/ARAgingChart";
import { CloseStatusCard } from "@/components/dashboard/CloseStatusCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { DollarSign, TrendingUp, Wallet, Clock } from "lucide-react";

const Index = () => {
  return (
    <AppLayout title="Dashboard" subtitle="Financial overview and insights">
      {/* Key Metrics */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Monthly Revenue"
          value="$565,200"
          change={{ value: "+8.6%", isPositive: true }}
          icon={DollarSign}
          colorClass="text-revenue"
          description="vs last month"
        />
        <MetricCard
          title="Net Income"
          value="$185,000"
          change={{ value: "+12.3%", isPositive: true }}
          icon={TrendingUp}
          colorClass="text-primary"
          description="vs last month"
        />
        <MetricCard
          title="Cash Balance"
          value="$1.2M"
          change={{ value: "+$45k", isPositive: true }}
          icon={Wallet}
          colorClass="text-cash"
          description="this period"
        />
        <MetricCard
          title="DSO"
          value="42 days"
          change={{ value: "-3 days", isPositive: true }}
          icon={Clock}
          colorClass="text-overdue"
          description="vs 45 days prior"
        />
      </div>

      {/* Charts Row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RevenueChart />
        <ARAgingChart />
      </div>

      {/* Bottom Row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CloseStatusCard />
        <RecentActivity />
      </div>
    </AppLayout>
  );
};

export default Index;
