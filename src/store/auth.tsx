import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import {
  flushPendingOAuthSignupAcquisition,
  type SignupAcquisitionRpcClient,
} from "@/lib/oauthSignupAcquisitionRules";

interface Ctx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
const AuthCtx = createContext<Ctx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
  /**
   * Synchronous identity-transition fence. The app uses this to remove
   * private query cache entries before consumers can observe the next user.
   */
  onBeforeAuthIdentityChange?: (previousUserId: string | null, nextUserId: string | null) => void;
}

export function AuthProvider({ children, onBeforeAuthIdentityChange }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);
  const sessionUserId = session?.user.id ?? null;

  const applySession = useCallback(
    (nextSession: Session | null) => {
      const previousUserId = currentUserIdRef.current;
      const nextUserId = nextSession?.user.id ?? null;
      if (previousUserId !== nextUserId) {
        // This callback must remain before both the identity ref and React
        // state update. Query cache removal is synchronous, so no render can
        // expose the next owner while the previous owner's rows remain.
        onBeforeAuthIdentityChange?.(previousUserId, nextUserId);
      }
      currentUserIdRef.current = nextUserId;
      setSession(nextSession);
    },
    [onBeforeAuthIdentityChange],
  );

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => applySession(s));
    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [applySession]);

  useEffect(() => {
    if (!sessionUserId) return;
    void flushPendingOAuthSignupAcquisition(supabase as unknown as SignupAcquisitionRpcClient);
  }, [sessionUserId]);

  return (
    <AuthCtx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
