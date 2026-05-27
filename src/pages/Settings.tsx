import { Settings as SettingsIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/store/auth";
import {
  describeSettingsTile,
  settingsTileAriaLabel,
  type SettingsTileState,
} from "@/lib/settingsTilesRules";

interface TileProps {
  name: string;
  state: SettingsTileState;
  children: React.ReactNode;
}

function Tile({ name, state, children }: TileProps) {
  const badge = describeSettingsTile(state);
  return (
    <div
      className="glass rounded-2xl p-5"
      data-testid="settings-tile"
      data-tile-state={state}
      aria-label={settingsTileAriaLabel(name, state)}
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-display font-semibold">{name}</h2>
        <Badge variant={badge.variant} data-testid="settings-tile-badge">
          {badge.label}
        </Badge>
      </div>
      {children}
      <p className="text-xs text-muted-foreground mt-3" data-testid="settings-tile-helper">
        {badge.helper}
      </p>
    </div>
  );
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const integrations = ["Spider Farmer", "AC Infinity", "Vivosun", "Raspberry Pi 5"];
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Profile, units, notifications, integrations."
        icon={<SettingsIcon className="h-5 w-5" />}
      />
      <div className="grid lg:grid-cols-2 gap-4">
        <Tile name="Profile" state="available">
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{user?.email}</span>
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => signOut()}>
            Sign out
          </Button>
        </Tile>

        <Tile name="Units" state="coming_soon">
          <p className="text-sm text-muted-foreground">Temperature: °F · Nutrients: EC</p>
        </Tile>

        <Tile name="Notifications" state="coming_soon">
          <p className="text-sm text-muted-foreground">
            Critical alerts only · Email + in-app
          </p>
        </Tile>

        <Tile name="Integrations" state="disabled">
          <div className="flex flex-wrap gap-2">
            {integrations.map((i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 bg-secondary/50"
              >
                {i}
              </span>
            ))}
          </div>
        </Tile>
      </div>
    </div>
  );
}
