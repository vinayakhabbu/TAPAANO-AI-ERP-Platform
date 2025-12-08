import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, Eye, EyeOff, Save, Trash2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function APIKeysSettings() {
  const { orgId } = useAuth();
  const [openaiKey, setOpenaiKey] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgId) {
      loadAPIKey();
    }
  }, [orgId]);

  const loadAPIKey = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("openai_api_key")
        .eq("id", orgId)
        .single();

      if (error) throw error;
      
      if (data?.openai_api_key) {
        setHasExistingKey(true);
        // Show masked key
        setOpenaiKey("sk-" + "•".repeat(40));
      }
    } catch (error) {
      console.error("Error loading API key:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async () => {
    if (!openaiKey.trim() || openaiKey.includes("•")) {
      toast.error("Please enter a valid API key");
      return;
    }

    if (!openaiKey.startsWith("sk-")) {
      toast.error("Invalid OpenAI API key format");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ openai_api_key: openaiKey.trim() })
        .eq("id", orgId);

      if (error) throw error;

      toast.success("OpenAI API key saved successfully");
      setHasExistingKey(true);
      setOpenaiKey("sk-" + "•".repeat(40));
      setShowKey(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ openai_api_key: null })
        .eq("id", orgId);

      if (error) throw error;

      toast.success("OpenAI API key removed");
      setHasExistingKey(false);
      setOpenaiKey("");
    } catch (error: any) {
      toast.error(error.message || "Failed to remove API key");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyChange = (value: string) => {
    // If user starts typing in a masked field, clear it
    if (hasExistingKey && openaiKey.includes("•")) {
      setOpenaiKey(value.replace(/•/g, ""));
    } else {
      setOpenaiKey(value);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          API Keys
        </CardTitle>
        <CardDescription>
          Configure your own API keys for AI features
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Providing your own OpenAI API key allows Agent River to use your account directly. 
            Your key is stored securely and never shared.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai-key">OpenAI API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="openai-key"
                  type={showKey ? "text" : "password"}
                  value={openaiKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder="sk-..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <Button 
                onClick={handleSaveKey} 
                disabled={saving || !openaiKey.trim() || openaiKey.includes("•")}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              {hasExistingKey && (
                <Button 
                  variant="destructive" 
                  onClick={handleRemoveKey}
                  disabled={saving}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API key from{" "}
              <a 
                href="https://platform.openai.com/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                OpenAI's dashboard
              </a>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}