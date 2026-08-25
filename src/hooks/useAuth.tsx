import { useState, useEffect, createContext, useContext, ReactNode, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (signingOutRef.current && session) return;
        const epoch = ++identityEpoch.current;
        currentUserId.current = session?.user.id ?? null;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            void fetchProfile(session.user.id, epoch);
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    const initialEpoch = identityEpoch.current;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (signingOutRef.current || identityEpoch.current !== initialEpoch) return;
      const epoch = ++identityEpoch.current;
      currentUserId.current = session?.user.id ?? null;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void fetchProfile(session.user.id, epoch);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, epoch: number) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return;
      }

      if (identityEpoch.current === epoch && currentUserId.current === userId) {
        setProfile(data);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const signOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    ++identityEpoch.current;
    currentUserId.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);

    try {
      await queryClient.cancelQueries();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } finally {
      try {
        await queryClient.cancelQueries();
      } finally {
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
