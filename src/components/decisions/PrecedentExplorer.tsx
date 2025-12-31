import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Search,
  History,
  CheckCircle2,
  XCircle,
  FileText,
  ShoppingCart,
  CreditCard,
  BookOpen,
  Sparkles,
  TrendingUp,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePrecedentSearch, useRecentPrecedents, type Precedent } from "@/hooks/usePrecedentSearch";

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const decisionTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  po_approval: { label: "PO Approval", icon: ShoppingCart, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  po_rejection: { label: "PO Rejection", icon: ShoppingCart, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  payment_approval: { label: "Payment Approval", icon: CreditCard, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  payment_rejection: { label: "Payment Rejection", icon: CreditCard, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  requisition_approval: { label: "Requisition Approved", icon: FileText, color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300" },
  requisition_rejection: { label: "Requisition Rejected", icon: FileText, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  journal_post: { label: "Journal Posted", icon: BookOpen, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" },
};

function SimilarityBadge({ similarity }: { similarity: number }) {
  const percent = Math.round(similarity * 100);
  const color = percent >= 80 ? "text-green-600" : percent >= 60 ? "text-amber-600" : "text-muted-foreground";
  
  return (
    <div className={`flex items-center gap-1 text-xs ${color}`}>
      <TrendingUp className="h-3 w-3" />
      <span>{percent}% match</span>
    </div>
  );
}

function PrecedentCard({ precedent, onSelect }: { precedent: Precedent; onSelect?: (p: Precedent) => void }) {
  const config = decisionTypeConfig[precedent.decision_type] || {
    label: precedent.decision_type,
    icon: FileText,
    color: "bg-gray-100 text-gray-800",
  };
  const TypeIcon = config.icon;
  const isApproved = precedent.approval_status === "approved";
  const snapshot = precedent.input_snapshot;

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-all hover:border-primary/50"
      onClick={() => onSelect?.(precedent)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{config.label}</span>
                {isApproved ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Approved
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 text-xs">
                    <XCircle className="h-3 w-3 mr-1" />
                    Rejected
                  </Badge>
                )}
              </div>
              
              {/* Context summary */}
              <div className="mt-2 text-xs text-muted-foreground space-y-1">
                {snapshot.vendor_name && (
                  <div>Vendor: <span className="text-foreground">{String(snapshot.vendor_name)}</span></div>
                )}
                {snapshot.total && (
                  <div>Amount: <span className="text-foreground font-medium">${Number(snapshot.total).toLocaleString()}</span></div>
                )}
                {snapshot.po_number && (
                  <div>PO: <span className="text-foreground">{String(snapshot.po_number)}</span></div>
                )}
              </div>

              {/* Rationale */}
              {precedent.rationale_text && (
                <p className="mt-2 text-xs italic text-muted-foreground line-clamp-2">
                  "{precedent.rationale_text}"
                </p>
              )}

              {/* Reason codes */}
              {precedent.reason_codes && precedent.reason_codes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {precedent.reason_codes.slice(0, 3).map((code) => (
                    <Badge key={code} variant="secondary" className="text-xs">
                      {code}
                    </Badge>
                  ))}
                  {precedent.reason_codes.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{precedent.reason_codes.length - 3}
                    </Badge>
                  )}
                </div>
              )}

              <div className="mt-2 text-xs text-muted-foreground">
                {format(new Date(precedent.created_at), "MMM d, yyyy")}
              </div>
            </div>
          </div>
          
          {precedent.similarity < 1 && (
            <SimilarityBadge similarity={precedent.similarity} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PrecedentExplorer({ onSelectPrecedent }: { onSelectPrecedent?: (p: Precedent) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const debouncedQuery = useDebounce(searchQuery, 300);

  const { data: searchResults, isLoading: isSearching } = usePrecedentSearch({
    query: debouncedQuery,
    decision_type: typeFilter === "all" ? undefined : typeFilter,
    limit: 20,
    enabled: debouncedQuery.length >= 2,
  });

  const { data: recentPrecedents, isLoading: isLoadingRecent } = useRecentPrecedents({
    decision_type: typeFilter === "all" ? undefined : typeFilter,
    limit: 20,
  });

  const isSearchMode = debouncedQuery.length >= 2;
  const precedents = isSearchMode ? searchResults?.precedents || [] : recentPrecedents || [];
  const isLoading = isSearchMode ? isSearching : isLoadingRecent;

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search precedents... (e.g., '3-way match failed', 'vendor exception')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="po_approval">PO Approvals</SelectItem>
            <SelectItem value="payment_approval">Payment Approvals</SelectItem>
            <SelectItem value="requisition_approval">Requisitions</SelectItem>
            <SelectItem value="journal_post">Journal Entries</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isSearchMode ? (
            <>
              <Sparkles className="h-4 w-4" />
              <span>
                {searchResults?.total || 0} similar cases found
                {searchResults?.search_method === "vector" && (
                  <Badge variant="secondary" className="ml-2 text-xs">Semantic</Badge>
                )}
              </span>
            </>
          ) : (
            <>
              <History className="h-4 w-4" />
              <span>Recent decisions</span>
            </>
          )}
        </div>
      </div>

      {/* Results List */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3 pr-4">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : precedents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No precedents found</p>
                <p className="text-sm mt-1">
                  {isSearchMode 
                    ? "Try adjusting your search terms"
                    : "Decisions will appear here as they are recorded"
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            precedents.map((precedent) => (
              <PrecedentCard 
                key={precedent.decision_id} 
                precedent={precedent} 
                onSelect={onSelectPrecedent}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}