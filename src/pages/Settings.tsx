import { useEffect, useState } from "react";
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
import {
  DEFAULT_START_SCREEN,
  START_SCREEN_OPTIONS,
  type StartScreenChoice,
  clearStartScreenChoice,
  getStartScreenChoiceOrDefault,
  setStartScreenChoice,
} from "@/lib/startScreenPreferences";
import {
  DEFAULT_TEMPERATURE_UNIT,
  TEMPERATURE_UNIT_OPTIONS,
  type TemperatureUnitPreference,
  loadTemperatureUnitPreference,
  saveTemperatureUnitPreference,
  clearTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
        <h2 className="font-display font-semibold">{name}</h2>
        <Badge variant={badge.variant} data-testid="settings-tile-badge" className="self-start sm:self-auto shrink-0">
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

function StartScreenTile({ userId }: { userId: string }) {
  const [choice, setChoice] = useState<StartScreenChoice>(DEFAULT_START_SCREEN);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setChoice(getStartScreenChoiceOrDefault(userId));
  }, [userId]);

  function onSave() {
    setStartScreenChoice(userId, choice);
    setSaved("Start screen preference saved.");
  }
  function onReset() {
    clearStartScreenChoice(userId);
    setChoice(DEFAULT_START_SCREEN);
    setSaved("Reverted to diary-first default.");
  }

  return (
    <Tile name="Start screen" state="available">
      <p className="text-sm text-muted-foreground mb-3">
        Choose where Verdant opens after sign-in.
      </p>
      <fieldset
        className="grid gap-2"
        aria-label="Start screen preference"
        data-testid="start-screen-fieldset"
      >
        <legend className="sr-only">Start screen</legend>
        {START_SCREEN_OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className="flex items-start gap-2 text-sm cursor-pointer"
          >
            <input
              type="radio"
              name="start-screen"
              value={opt.key}
              checked={choice === opt.key}
              onChange={() => {
                setChoice(opt.key);
                setSaved(null);
              }}
              data-testid={`start-screen-option-${opt.key}`}
              className="mt-1"
            />
            <span>
              <span className="font-medium">
                {opt.label}
                {opt.recommended ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (recommended)
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                {opt.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button
          size="sm"
          onClick={onSave}
          data-testid="start-screen-save"
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onReset}
          data-testid="start-screen-reset"
        >
          Use diary-first default
        </Button>
      </div>
      {saved ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="start-screen-saved"
          className="text-xs text-muted-foreground mt-3"
        >
          {saved}
        </p>
      ) : null}
    </Tile>
  );
}

function TemperatureUnitTile() {
  const [choice, setChoice] = useState<TemperatureUnitPreference>(
    DEFAULT_TEMPERATURE_UNIT,
  );
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setChoice(loadTemperatureUnitPreference());
  }, []);

  function onSave() {
    saveTemperatureUnitPreference(choice);
    setSaved("Display temperature preference saved.");
  }
  function onReset() {
    clearTemperatureUnitPreference();
    setChoice(DEFAULT_TEMPERATURE_UNIT);
    setSaved("Reverted to Fahrenheit default.");
  }

  return (
    <Tile name="Units" state="available">
      <p className="text-sm text-muted-foreground mb-1">
        Display temperature as
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        Stored sensor values are unchanged.
      </p>
      <fieldset
        className="grid gap-2"
        aria-label="Display temperature unit"
        data-testid="temperature-unit-fieldset"
      >
        <legend className="sr-only">Display temperature unit</legend>
        {TEMPERATURE_UNIT_OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className="flex items-start gap-2 text-sm cursor-pointer"
          >
            <input
              type="radio"
              name="temperature-unit"
              value={opt.key}
              checked={choice === opt.key}
              onChange={() => {
                setChoice(opt.key);
                setSaved(null);
              }}
              data-testid={`temperature-unit-option-${opt.key}`}
              className="mt-1"
            />
            <span>
              <span className="font-medium">
                {opt.label}
                {opt.recommended ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (default)
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                {opt.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" onClick={onSave} data-testid="temperature-unit-save">
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onReset}
          data-testid="temperature-unit-reset"
        >
          Use Fahrenheit default
        </Button>
      </div>
      {saved ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="temperature-unit-saved"
          className="text-xs text-muted-foreground mt-3"
        >
          {saved}
        </p>
      ) : null}
    </Tile>
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

        {user?.id ? <StartScreenTile userId={user.id} /> : null}

        <TemperatureUnitTile />

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
