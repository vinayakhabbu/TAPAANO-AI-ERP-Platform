import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUnifiedAgent } from "@/hooks/useUnifiedAgent";
import { Bot, Send, User, Loader2, Trash2, Sparkles, MessageSquare, X, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTEXT_PROMPTS: Record<string, string[]> = {
  crm: [
    "Show me the pipeline summary",
    "What are my at-risk deals?",
    "Analyze win/loss patterns",
    "Show top opportunities",
  ],
  finance: [
    "What's our AR aging?",
    "Show AP summary",
    "What's our cash position?",
    "Any overdue invoices?",
  ],
  inventory: [
    "Show low stock items",
    "Warehouse summary",
    "Recent stock movements",
  ],
  production: [
    "Active production orders",
    "Capacity utilization",
    "Pending work orders",
  ],
  default: [
    "How can you help me?",
    "What features are available?",
  ],
};

export function UnifiedAIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage, clearMessages, context, contextLabel } = useUnifiedAgent();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput("");
    }
  };

  const handlePromptClick = (prompt: string) => {
    if (!isLoading) {
      sendMessage(prompt);
    }
  };

  const suggestedPrompts = CONTEXT_PROMPTS[context] || CONTEXT_PROMPTS.default;

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-6 right-6 bg-card border border-border rounded-full shadow-lg z-50 flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-accent transition-colors"
        onClick={() => setIsMinimized(false)}
      >
        <Bot className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium">{contextLabel} AI</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-2"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-card border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{contextLabel} AI</p>
            <p className="text-xs text-muted-foreground">Context-aware assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearMessages}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(true)}>
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-6">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">{contextLabel} AI Assistant</h3>
            <p className="text-xs text-muted-foreground text-center mb-4 px-4">
              Ask me anything about your {contextLabel.toLowerCase()} data
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center px-2">
              {suggestedPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePromptClick(prompt)}
                  className="text-xs h-7"
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-2",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === "user" && (
                  <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${contextLabel.toLowerCase()}...`}
            disabled={isLoading}
            className="flex-1 h-9 text-sm"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="icon" className="h-9 w-9">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
