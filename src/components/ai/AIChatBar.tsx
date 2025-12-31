import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Send, Bot, User, Loader2, Wrench, MessageSquare, ChevronLeft, ChevronRight, Trash2, Zap } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolCalls?: number;
  agentsUsed?: string[];
}

interface AIChatBarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const SUGGESTED_PROMPTS = [
  "Give me an overview of the business",
  "What needs my attention today?",
  "Show pipeline and AR summary",
  "What are my at-risk deals?",
  "How is inventory looking?",
  "Show production status",
  "Any open service calls?",
  "Show top opportunities over $50k",
];

export function AIChatBar({ collapsed, onToggle }: AIChatBarProps) {
  const { orgId } = useAuth();
  const location = useLocation();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getInitialMessage = (): Message => ({
    id: "1",
    role: "assistant",
    content: "Hi, I am Agent River, How can I help you today?",
    timestamp: new Date(),
  });

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([getInitialMessage()]);
    }
  }, []);

  useEffect(() => {
    if (!collapsed && inputRef.current) {
      inputRef.current.focus();
    }
  }, [collapsed]);

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

    try {
      const { data, error } = await supabase.functions.invoke("agent-river", {
        body: {
          messages: [...messages.filter((m) => m.id !== "1"), userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          org_id: orgId,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "I apologize, but I couldn't process that request.",
        timestamp: new Date(),
        toolCalls: data.tool_calls,
        agentsUsed: data.agents_used,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error connecting to the AI service. Please try again.",
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

  const clearChat = () => {
    setMessages([getInitialMessage()]);
  };

  const formatAgentName = (name: string) => {
    return name.replace('_agent', '').replace('_', ' ');
  };

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-card transition-all duration-300",
        collapsed ? "w-14" : "w-80"
      )}
    >
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className="absolute -left-3 top-20 z-50 h-6 w-6 rounded-full border border-border bg-background shadow-md hover:bg-accent"
      >
        {collapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </Button>

      {/* Header */}
      <div className={cn("flex items-center border-b border-border h-16", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        {collapsed ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Agent River</h3>
                <p className="text-xs text-muted-foreground">Unified AI Assistant</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={clearChat} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Collapsed State */}
      {collapsed ? (
        <div className="flex flex-1 flex-col items-center py-4 space-y-3">
          <Button variant="ghost" size="icon" onClick={onToggle} className="h-10 w-10 rounded-lg hover:bg-primary/10">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={cn("flex gap-2 animate-fade-in", message.role === "user" ? "flex-row-reverse" : "")}>
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", message.role === "user" ? "bg-primary" : "bg-gradient-to-br from-primary/20 to-muted")}>
                  {message.role === "user" ? <User className="h-3.5 w-3.5 text-primary-foreground" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className={cn("max-w-[85%]", message.role === "user" ? "text-right" : "")}>
                  <div className={cn("rounded-lg px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed", message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                    {message.content}
                  </div>
                  {(message.toolCalls || message.agentsUsed) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {message.agentsUsed?.map((agent) => (
                        <span key={agent} className="flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                          <Zap className="h-2 w-2" />
                          {formatAgentName(agent)}
                        </span>
                      ))}
                      {message.toolCalls && message.toolCalls > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Wrench className="h-2.5 w-2.5" />
                          {message.toolCalls} tools
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 animate-fade-in">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-muted">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Analyzing with specialized agents...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Prompts */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2">
              <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Try asking</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handlePromptClick(prompt)}
                    className="rounded-md border border-border bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3">
            <form onSubmit={handleSubmit} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={orgId ? "Ask Agent River anything..." : "Sign in to chat"}
                disabled={!orgId}
                className="h-10 w-full rounded-lg border border-border bg-muted/50 pl-3 pr-10 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <Button type="submit" size="icon" disabled={!input.trim() || isLoading || !orgId} className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </>
      )}
    </aside>
  );
}
