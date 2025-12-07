import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const routeToContext: Record<string, string> = {
  "/crm": "crm",
  "/receivables": "finance",
  "/payables": "finance",
  "/general-ledger": "finance",
  "/banking": "finance",
  "/financial-reports": "finance",
  "/inventory": "inventory",
  "/production": "production",
  "/": "default",
};

export function useUnifiedAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();

  const getContext = useCallback(() => {
    return routeToContext[location.pathname] || "default";
  }, [location.pathname]);

  const getContextLabel = useCallback(() => {
    const context = getContext();
    const labels: Record<string, string> = {
      crm: "CRM & Sales",
      finance: "Finance",
      inventory: "Inventory",
      production: "Production",
      default: "General",
    };
    return labels[context] || "General";
  }, [getContext]);

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const context = getContext();
      const { data, error } = await supabase.functions.invoke("unified-agent", {
        body: {
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response || "I apologize, but I couldn't generate a response.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Unified agent error:", error);
      toast.error("Failed to get AI response");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, getContext]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    context: getContext(),
    contextLabel: getContextLabel(),
  };
}
