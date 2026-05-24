import { Settings as SettingsIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";

export default function Settings() {
  const { user, signOut } = useAuth();
  const integrations = ["Spider Farmer", "AC Infinity", "Vivosun", "Raspberry Pi 5"];
  return (
    <div>
      <PageHeader title="Settings" description="Profile, units, notifications, integrations." icon={<SettingsIcon className="h-5 w-5" />} />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <h2 className="font-display font-semibold mb-3">Profile</h2>
          <p className="text-sm text-muted-foreground">Signed in as <span className="text-foreground">{user?.email}</span></p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => signOut()}>Sign out</Button>
        </div>
        <div className="glass rounded-2xl p-5">
          <h2 className="font-display font-semibold mb-3">Units</h2>
          <p className="text-sm text-muted-foreground">Temperature: °F · Nutrients: EC</p>
        </div>
        <div className="glass rounded-2xl p-5">
          <h2 className="font-display font-semibold mb-3">Notifications</h2>
          <p className="text-sm text-muted-foreground">Critical alerts only · Email + in-app</p>
        </div>
        <div className="glass rounded-2xl p-5">
          <h2 className="font-display font-semibold mb-3">Integrations</h2>
          <div className="flex flex-wrap gap-2">
            {integrations.map((i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full border border-border/50 bg-secondary/50">{i} · soon</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
