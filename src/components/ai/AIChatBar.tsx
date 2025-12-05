import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Send,
  ChevronUp,
  ChevronDown,
  Bot,
  User,
  Loader2,
  X,
} from "lucide-react";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finance-chat`;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const suggestedPrompts = [
  "Show me AR aging summary",
  "What's our DSO this month?",
  "Start close for November",
  "Draft collection emails for overdue invoices",
];

export function AIChatBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm your Finance Copilot. I can help you with metrics, journal entries, collections, and period close. How can I assist you today?",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setIsExpanded(true);

    let assistantContent = "";

    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No reader available");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const json = JSON.parse(line.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return prev.map((m, i) =>
                      i === prev.length - 1 ? { ...m, content: assistantContent } : m
                    );
                  }
                  return [
                    ...prev,
                    { id: Date.now().toString(), role: "assistant", content: assistantContent, timestamp: new Date() },
                  ];
                });
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        "fixed bottom-0 left-64 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-xl transition-all duration-300",
        isExpanded ? "h-[420px]" : "h-auto"
      )}
    >
      {/* Expanded Chat View */}
      {isExpanded && (
        <div className="flex h-[calc(100%-80px)] flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Finance Copilot</h3>
                <p className="text-xs text-muted-foreground">Powered by AI</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3 animate-fade-in",
                  message.role === "user" ? "flex-row-reverse" : ""
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    message.role === "user" ? "bg-primary" : "bg-muted"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[70%] rounded-lg px-4 py-2.5 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="p-4">
        {/* Suggested Prompts */}
        {!isExpanded && (
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handlePromptClick(prompt)}
                className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>

          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your finances..."
              className="h-11 w-full rounded-lg border border-border bg-muted/50 pl-10 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getSimulatedResponse(input: string): string {
  const lowerInput = input.toLowerCase();
  
  if (lowerInput.includes("ar aging") || lowerInput.includes("receivable")) {
    return "Here's your AR aging summary:\n\n• Current (0-30 days): $125,400\n• 31-60 days: $45,200\n• 61-90 days: $12,800\n• Over 90 days: $8,600 ⚠️\n\nTotal Outstanding: $192,000\n\nI noticed 3 customers with overdue balances over 90 days. Would you like me to draft collection emails for them?";
  }
  
  if (lowerInput.includes("dso")) {
    return "Your Days Sales Outstanding (DSO) metrics:\n\n• Current Month: 42 days\n• Last Month: 45 days\n• YTD Average: 44 days\n• Industry Benchmark: 35-40 days\n\nDSO improved by 3 days this month. The main contributors were faster collections from Enterprise accounts. Would you like to see a breakdown by customer segment?";
  }
  
  if (lowerInput.includes("close") || lowerInput.includes("period")) {
    return "I'll help you start the November 2024 close. Here's the checklist I've prepared:\n\n✅ Bank reconciliation - Ready\n✅ AP cutoff verification - Ready\n⏳ AR aging review - In Progress\n⏳ Accruals review - Pending\n⏳ Intercompany eliminations - Pending\n⏳ Management review - Pending\n\n4 of 8 tasks complete. Estimated completion: 2 days. Want me to generate the detailed close checklist?";
  }
  
  if (lowerInput.includes("collection") || lowerInput.includes("email") || lowerInput.includes("overdue")) {
    return "I found 5 customers with overdue invoices totaling $21,400:\n\n1. TechStart Inc - $8,200 (45 days overdue)\n2. Global Services - $6,100 (38 days overdue)\n3. CloudFirst Ltd - $4,200 (52 days overdue)\n4. DataFlow Corp - $1,800 (31 days overdue)\n5. WebSolutions - $1,100 (35 days overdue)\n\nWould you like me to draft collection emails? I can use a friendly or firm tone based on the aging.";
  }
  
  return "I understand you're asking about your finances. I can help you with:\n\n• Metrics and reports (revenue, expenses, DSO)\n• AR/AP aging and collections\n• Bank transaction classification\n• Period close assistance\n• Journal entry proposals\n\nCould you be more specific about what you'd like to know?";
}
