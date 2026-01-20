import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Building2, 
  Shield, 
  Lock, 
  ChevronRight,
  Loader2,
  CheckCircle2,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

// Simulated bank institutions data (in production, this would come from Plaid/Yodlee API)
const BANK_INSTITUTIONS = [
  { id: "chase", name: "Chase", logo: "🏦", popular: true, supportedFeatures: ["realtime", "oauth"] },
  { id: "bofa", name: "Bank of America", logo: "🏛️", popular: true, supportedFeatures: ["realtime", "oauth"] },
  { id: "wells", name: "Wells Fargo", logo: "🏦", popular: true, supportedFeatures: ["realtime"] },
  { id: "citi", name: "Citibank", logo: "🏦", popular: true, supportedFeatures: ["realtime", "oauth"] },
  { id: "usbank", name: "US Bank", logo: "🏛️", popular: false, supportedFeatures: ["realtime"] },
  { id: "pnc", name: "PNC Bank", logo: "🏦", popular: false, supportedFeatures: ["realtime"] },
  { id: "capital", name: "Capital One", logo: "💳", popular: true, supportedFeatures: ["realtime", "oauth"] },
  { id: "td", name: "TD Bank", logo: "🏦", popular: false, supportedFeatures: ["realtime"] },
  { id: "ally", name: "Ally Bank", logo: "🏦", popular: false, supportedFeatures: ["realtime", "oauth"] },
  { id: "discover", name: "Discover Bank", logo: "💳", popular: false, supportedFeatures: ["realtime"] },
  { id: "schwab", name: "Charles Schwab", logo: "📈", popular: false, supportedFeatures: ["realtime", "oauth"] },
  { id: "amex", name: "American Express", logo: "💳", popular: true, supportedFeatures: ["realtime", "oauth"] },
  { id: "marcus", name: "Marcus by Goldman Sachs", logo: "🏦", popular: false, supportedFeatures: ["realtime"] },
  { id: "svb", name: "Silicon Valley Bank", logo: "🏛️", popular: false, supportedFeatures: ["realtime"] },
  { id: "mercury", name: "Mercury", logo: "💜", popular: true, supportedFeatures: ["realtime", "oauth", "api"] },
];

interface BankInstitutionSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectInstitution: (institution: typeof BANK_INSTITUTIONS[0]) => void;
}

export function BankInstitutionSelector({ 
  open, 
  onOpenChange, 
  onSelectInstitution 
}: BankInstitutionSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectionStep, setConnectionStep] = useState<"select" | "auth" | "success">("select");
  const [selectedBank, setSelectedBank] = useState<typeof BANK_INSTITUTIONS[0] | null>(null);

  const filteredBanks = BANK_INSTITUTIONS.filter((bank) =>
    bank.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const popularBanks = filteredBanks.filter((b) => b.popular);
  const otherBanks = filteredBanks.filter((b) => !b.popular);

  const handleSelectBank = async (bank: typeof BANK_INSTITUTIONS[0]) => {
    setSelectedBank(bank);
    setConnecting(bank.id);
    setConnectionStep("auth");
    
    // Simulate OAuth/credential flow
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    setConnectionStep("success");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    onSelectInstitution(bank);
    setConnecting(null);
    setConnectionStep("select");
    setSelectedBank(null);
    onOpenChange(false);
  };

  const resetAndClose = () => {
    setConnecting(null);
    setConnectionStep("select");
    setSelectedBank(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {connectionStep === "select" && "Select Your Bank"}
            {connectionStep === "auth" && `Connecting to ${selectedBank?.name}`}
            {connectionStep === "success" && "Connection Successful"}
          </DialogTitle>
        </DialogHeader>

        {connectionStep === "select" && (
          <>
            {/* Security Badge */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Shield className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground">
                Bank-grade 256-bit encryption • Read-only access • SOC 2 certified
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search 13,000+ banks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Bank List */}
            <ScrollArea className="flex-1 max-h-[400px] -mx-2 px-2">
              {searchQuery === "" && (
                <>
                  <p className="text-xs font-medium text-muted-foreground mb-2 px-1">POPULAR</p>
                  <div className="space-y-1 mb-4">
                    {popularBanks.map((bank) => (
                      <BankRow 
                        key={bank.id} 
                        bank={bank} 
                        onClick={() => handleSelectBank(bank)}
                        loading={connecting === bank.id}
                      />
                    ))}
                  </div>
                </>
              )}
              
              {otherBanks.length > 0 && (
                <>
                  {searchQuery === "" && (
                    <p className="text-xs font-medium text-muted-foreground mb-2 px-1">ALL BANKS</p>
                  )}
                  <div className="space-y-1">
                    {otherBanks.map((bank) => (
                      <BankRow 
                        key={bank.id} 
                        bank={bank} 
                        onClick={() => handleSelectBank(bank)}
                        loading={connecting === bank.id}
                      />
                    ))}
                  </div>
                </>
              )}

              {filteredBanks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No banks found matching "{searchQuery}"</p>
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {connectionStep === "auth" && selectedBank && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-4xl">
                {selectedBank.logo}
              </div>
              <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="font-medium text-foreground">Securely connecting...</p>
              <p className="text-sm text-muted-foreground">
                Establishing encrypted connection with {selectedBank.name}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>Your credentials are never stored</span>
            </div>
          </div>
        )}

        {connectionStep === "success" && selectedBank && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="font-medium text-foreground">Connected!</p>
              <p className="text-sm text-muted-foreground">
                {selectedBank.name} is now linked. Transactions will sync automatically.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BankRow({ 
  bank, 
  onClick, 
  loading 
}: { 
  bank: typeof BANK_INSTITUTIONS[0]; 
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
        "hover:bg-muted/50 focus:bg-muted/50 focus:outline-none",
        loading && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-lg">
        {bank.logo}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{bank.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {bank.supportedFeatures.includes("realtime") && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              <Zap className="h-2.5 w-2.5 mr-0.5" />
              Real-time
            </Badge>
          )}
          {bank.supportedFeatures.includes("oauth") && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              <Shield className="h-2.5 w-2.5 mr-0.5" />
              OAuth
            </Badge>
          )}
        </div>
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
