import { FileText, CreditCard, Receipt, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  {
    id: 1,
    type: "invoice_paid",
    title: "Invoice #1042 Paid",
    description: "TechStart Inc - $8,200",
    time: "2 hours ago",
    icon: ArrowDownLeft,
    iconColor: "text-success",
    iconBg: "bg-success/10",
  },
  {
    id: 2,
    type: "bill_due",
    title: "Bill Due Tomorrow",
    description: "AWS Services - $4,500",
    time: "3 hours ago",
    icon: FileText,
    iconColor: "text-warning",
    iconBg: "bg-warning/10",
  },
  {
    id: 3,
    type: "bank_match",
    title: "Bank Transaction Matched",
    description: "Office Supplies - $320",
    time: "5 hours ago",
    icon: CreditCard,
    iconColor: "text-cash",
    iconBg: "bg-cash/10",
  },
  {
    id: 4,
    type: "invoice_sent",
    title: "Invoice #1043 Sent",
    description: "GlobalTech Corp - $15,600",
    time: "Yesterday",
    icon: ArrowUpRight,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
  },
  {
    id: 5,
    type: "payment_received",
    title: "Payment Received",
    description: "CloudFirst Ltd - $12,400",
    time: "Yesterday",
    icon: Receipt,
    iconColor: "text-success",
    iconBg: "bg-success/10",
  },
];

export function RecentActivity() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
          <p className="text-sm text-muted-foreground">Latest transactions and events</p>
        </div>
        <button className="text-sm font-medium text-primary hover:text-primary/80">
          View All
        </button>
      </div>

      <div className="space-y-4">
        {activities.map((activity, index) => {
          const Icon = activity.icon;
          return (
            <div
              key={activity.id}
              className={cn(
                "flex items-start gap-4 animate-fade-in",
                index < activities.length - 1 && "pb-4 border-b border-border"
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={cn("rounded-lg p-2.5", activity.iconBg)}>
                <Icon className={cn("h-4 w-4", activity.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{activity.title}</p>
                <p className="text-sm text-muted-foreground">{activity.description}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {activity.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
