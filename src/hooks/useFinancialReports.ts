import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

interface AccountWithBalance {
  id: string;
  code: string;
  name: string;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  balance: number;
}

interface ReportSection {
  title: string;
  accounts: AccountWithBalance[];
  total: number;
}

interface IncomeStatement {
  revenue: ReportSection;
  expenses: ReportSection;
  netIncome: number;
}

interface BalanceSheet {
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

interface CashFlowStatement {
  operating: { description: string; amount: number }[];
  investing: { description: string; amount: number }[];
  financing: { description: string; amount: number }[];
  netCashFlow: number;
  beginningCash: number;
  endingCash: number;
}

export const useFinancialReports = (periodStart?: string, periodEnd?: string) => {
  // Fetch all accounts
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts-for-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  // Fetch journal lines with date filtering for period-based reporting
  const { data: journalData, isLoading: journalLoading } = useQuery({
    queryKey: ["journal-data-for-reports", periodStart, periodEnd],
    queryFn: async () => {
      let query = supabase
        .from("journal_entries")
        .select(`
          id,
          entry_date,
          status,
          journal_lines(
            id,
            debit,
            credit,
            account_id
          )
        `)
        .eq("status", "posted");

      if (periodStart) {
        query = query.gte("entry_date", periodStart);
      }
      if (periodEnd) {
        query = query.lte("entry_date", periodEnd);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Calculate account balances from journal entries
  const accountBalances = useMemo(() => {
    if (!journalData || !accounts) return new Map<string, number>();

    const balances = new Map<string, number>();

    // Initialize all accounts with 0
    accounts.forEach((acc) => balances.set(acc.id, 0));

    // Sum up journal lines
    journalData.forEach((entry) => {
      entry.journal_lines?.forEach((line) => {
        const account = accounts.find((a) => a.id === line.account_id);
        if (!account) return;

        const currentBalance = balances.get(line.account_id) || 0;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;

        // Assets and Expenses: Debit increases, Credit decreases
        // Liabilities, Equity, Revenue: Credit increases, Debit decreases
        if (account.account_type === "asset" || account.account_type === "expense") {
          balances.set(line.account_id, currentBalance + debit - credit);
        } else {
          balances.set(line.account_id, currentBalance + credit - debit);
        }
      });
    });

    return balances;
  }, [journalData, accounts]);

  // Build Income Statement (P&L)
  const incomeStatement = useMemo((): IncomeStatement | null => {
    if (!accounts) return null;

    const revenueAccounts = accounts
      .filter((a) => a.account_type === "revenue")
      .map((a) => ({
        ...a,
        balance: accountBalances.get(a.id) || 0,
      }));

    const expenseAccounts = accounts
      .filter((a) => a.account_type === "expense")
      .map((a) => ({
        ...a,
        balance: accountBalances.get(a.id) || 0,
      }));

    const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.balance, 0);
    const totalExpenses = expenseAccounts.reduce((sum, a) => sum + a.balance, 0);

    return {
      revenue: {
        title: "Revenue",
        accounts: revenueAccounts as AccountWithBalance[],
        total: totalRevenue,
      },
      expenses: {
        title: "Expenses",
        accounts: expenseAccounts as AccountWithBalance[],
        total: totalExpenses,
      },
      netIncome: totalRevenue - totalExpenses,
    };
  }, [accounts, accountBalances]);

  // Build Balance Sheet
  const balanceSheet = useMemo((): BalanceSheet | null => {
    if (!accounts || !incomeStatement) return null;

    const assetAccounts = accounts
      .filter((a) => a.account_type === "asset")
      .map((a) => ({
        ...a,
        balance: accountBalances.get(a.id) || 0,
      }));

    const liabilityAccounts = accounts
      .filter((a) => a.account_type === "liability")
      .map((a) => ({
        ...a,
        balance: accountBalances.get(a.id) || 0,
      }));

    const equityAccounts = accounts
      .filter((a) => a.account_type === "equity")
      .map((a) => ({
        ...a,
        balance: accountBalances.get(a.id) || 0,
      }));

    const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.balance, 0);
    const totalEquity = equityAccounts.reduce((sum, a) => sum + a.balance, 0);
    
    // Include net income in equity for balance sheet to balance
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity + incomeStatement.netIncome;

    return {
      assets: {
        title: "Assets",
        accounts: assetAccounts as AccountWithBalance[],
        total: totalAssets,
      },
      liabilities: {
        title: "Liabilities",
        accounts: liabilityAccounts as AccountWithBalance[],
        total: totalLiabilities,
      },
      equity: {
        title: "Equity",
        accounts: equityAccounts as AccountWithBalance[],
        total: totalEquity + incomeStatement.netIncome,
      },
      totalAssets,
      totalLiabilitiesAndEquity,
      isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    };
  }, [accounts, accountBalances, incomeStatement]);

  // Build Cash Flow Statement (simplified)
  const cashFlowStatement = useMemo((): CashFlowStatement | null => {
    if (!incomeStatement || !accounts) return null;

    // Simplified cash flow - in reality this would need more complex logic
    const cashAccounts = accounts.filter(
      (a) => a.account_type === "asset" && a.name.toLowerCase().includes("cash")
    );
    
    const endingCash = cashAccounts.reduce(
      (sum, a) => sum + (accountBalances.get(a.id) || 0),
      0
    );

    return {
      operating: [
        { description: "Net Income", amount: incomeStatement.netIncome },
      ],
      investing: [],
      financing: [],
      netCashFlow: incomeStatement.netIncome,
      beginningCash: 0,
      endingCash,
    };
  }, [incomeStatement, accounts, accountBalances]);

  return {
    incomeStatement,
    balanceSheet,
    cashFlowStatement,
    isLoading: accountsLoading || journalLoading,
  };
};
