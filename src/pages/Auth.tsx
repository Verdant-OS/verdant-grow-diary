import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) nav("/", { replace: true }); }, [user, nav]);
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message); else nav("/", { replace: true });
  }
  async function signUp(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password, options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Welcome to Verdant 🌱"); nav("/", { replace: true }); }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="flex items-center gap-2 mb-8">
        <div className="h-12 w-12 rounded-2xl gradient-leaf flex items-center justify-center">
          <Leaf className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Verdant</h1>
          <p className="text-sm text-muted-foreground">Your simple grow diary</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 w-full max-w-sm">
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={signIn} className="grid gap-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button disabled={busy} className="gradient-leaf text-primary-foreground">Sign in</Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={signUp} className="grid gap-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Password</Label><Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button disabled={busy} className="gradient-leaf text-primary-foreground">Create account</Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
