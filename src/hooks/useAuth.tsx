import { useState, useEffect, createContext, useContext, ReactNode, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { User, Session } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY, supabase } from "@/integrations/supabase/client";
import { safeBrowserStorage } from "@/lib/browserStorage";
import { reportClientError } from "@/lib/clientDiagnostics";

interface Profile {
  id: string;
  org_id: string | null;
  display_name: string | null;
  role: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  orgId: string | null;
  loading: boolean;
  signingOut: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  orgId: null,
  loading: true,
  signingOut: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const identityEpoch = useRef(0);
  const currentUserId = useRef<string | null>(null);
  const signingOutRef = useRef(false);

  useEffect(() => {
    let active = true;

    const fetchProfile = async (userId: string, epoch: number) => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, org_id, display_name, role")
          .eq("id", userId)
          .single();

        if (error) throw error;
        if (active && identityEpoch.current === epoch && currentUserId.current === userId) {
          setProfile(data);
        }
      } catch (error) {
        reportClientError("Profile initialization failed", error);
        if (active && identityEpoch.current === epoch && currentUserId.current === userId) {
          setProfile(null);
        }
      } finally {
        if (active && identityEpoch.current === epoch && currentUserId.current === userId) {
          setLoading(false);
        }
      }
    };

    const applySession = (nextSession: Session | null, deferred: boolean) => {
      if (!active || (signingOutRef.current && nextSession)) return;
      const epoch = ++identityEpoch.current;
      const nextUserId = nextSession?.user.id ?? null;
      currentUserId.current = nextUserId;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setProfile(null);

      if (!nextSession?.user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const startProfileFetch = () => void fetchProfile(nextSession.user.id, epoch);
      if (deferred) {
        setTimeout(startProfileFetch, 0);
      } else {
        startProfileFetch();
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        applySession(session, true);
      }
    );

    const initialEpoch = identityEpoch.current;
    void supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!active || signingOutRef.current || identityEpoch.current !== initialEpoch) return;
        if (error) {
          reportClientError("Session initialization failed", error);
          applySession(null, false);
          return;
        }
        applySession(session, false);
      })
      .catch((error: unknown) => {
        if (!active || signingOutRef.current || identityEpoch.current !== initialEpoch) return;
        reportClientError("Session initialization failed", error);
        applySession(null, false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    ++identityEpoch.current;
    currentUserId.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setLoading(false);

    try {
      await queryClient.cancelQueries();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } finally {
      try {
        await queryClient.cancelQueries();
      } finally {
        safeBrowserStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
        safeBrowserStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`);
        safeBrowserStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-user`);
        queryClient.clear();
        signingOutRef.current = false;
        setSigningOut(false);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        orgId: profile?.org_id ?? null,
        loading,
        signingOut,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
