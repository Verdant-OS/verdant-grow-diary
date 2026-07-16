import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOpenCustomerPortalState } from "@/lib/customerPortal";
import { usePaddleCancelNotice } from "@/hooks/usePaddleCancelNotice";

import {
  DELETE_ACCOUNT_CONFIRMATION,
  requestAccountDeletion,
} from "@/lib/accountDeletion";
import { useAuth } from "@/store/auth";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import AccountPlanBadge from "@/components/AccountPlanBadge";
import { PRICING_TIERS } from "@/config/pricing";
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
        <Button
          size="sm"
          onClick={onSave}
          data-testid="temperature-unit-save"
          aria-label="Save temperature unit preference"
        >
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

/**
 * Subscription tile — READ-ONLY presenter.
 *
 * Reads the caller's entitlement via useMyEntitlements (RLS-protected select-own).
 * Features are read from PRICING_TIERS (single source of truth).
 * Manage/Cancel buttons are placeholders — they never call Paddle, never call
 * the billing API, and never write account status. They open an informational
 * dialog only.
 */
function SubscriptionTile() {
  const { loading, entitlement } = useMyEntitlements();
  const { opening, error: portalError, open: openPortal, clearError } = useOpenCustomerPortalState();
  const cancelNotice = usePaddleCancelNotice();

  const planId = entitlement?.displayPlanId ?? null;

  const tier = planId ? PRICING_TIERS.find((t) => t.id === planId) ?? null : null;

  const label = loading
    ? "Loading…"
    : tier
      ? tier.name
      : "Plan status unavailable";

  const isFree = !loading && (planId === "free" || (!tier && !planId));
  const isPaid = !loading && !!tier && planId !== "free";
  const isLifetime = planId === "founder_lifetime";
  const isStaff = !!entitlement?.isStaff;

  return (
    <Tile name="Subscription" state="available">
      <div
        className="flex items-center justify-between gap-2 mb-2"
        data-testid="settings-subscription"
        data-plan={planId ?? "unknown"}
        data-staff={isStaff ? "true" : "false"}
      >
        <div>
          <p className="text-sm flex items-center gap-2 flex-wrap">
            <span>Current plan:</span>
            <span
              className="font-medium text-foreground"
              data-testid="settings-subscription-plan"
            >
              {label}
            </span>
            <AccountPlanBadge entitlement={entitlement} loading={loading} />
          </p>
          {isStaff && (
            <p
              className="text-xs text-muted-foreground mt-1"
              data-testid="settings-subscription-staff-note"
            >
              Internal staff — Pro capabilities, 10,000 AI credits/month.
            </p>
          )}
          {entitlement?.status === "past_due" && (
            <p
              className="text-xs text-amber-700 mt-1"
              data-testid="settings-subscription-past-due"
            >
              Payment retry in progress — update your payment method to avoid interruption.
            </p>
          )}
          {entitlement?.status === "canceled" && (
            <p className="text-xs text-muted-foreground mt-1">
              Canceled — access continues until the end of your paid period.
            </p>
          )}
          {cancelNotice.visible && entitlement?.status !== "canceled" && (
            <p
              className="text-xs text-muted-foreground mt-1"
              data-testid="settings-subscription-cancel-notice"
            >
              {cancelNotice.accessUntilLabel
                ? `Cancellation scheduled — access continues until ${cancelNotice.accessUntilLabel}.`
                : "Cancellation scheduled — access continues until the end of your current period."}
            </p>
          )}

          {!loading && !tier && (
            <p className="text-xs text-muted-foreground">
              We couldn't determine your plan right now. Your grow data is safe
              — try refreshing in a moment.
            </p>
          )}
        </div>
      </div>

      {tier && (
        <ul
          className="mt-2 space-y-1 text-xs text-muted-foreground"
          data-testid="settings-subscription-features"
        >
          {tier.features.map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {isFree && (
          <Button
            asChild
            size="sm"
            data-testid="settings-subscription-upgrade"
          >
            <Link to="/pricing">Upgrade to Pro</Link>
          </Button>
        )}
        {isPaid && !isLifetime && (
          <Button
            size="sm"
            variant="outline"
            data-testid="settings-subscription-manage"
            onClick={() => {
              clearError();
              void openPortal();
            }}
            disabled={opening}
            aria-busy={opening}
          >
            {opening ? "Opening…" : "Manage subscription"}
          </Button>
        )}
        {isLifetime && (
          <p className="text-xs text-muted-foreground">
            Founder Lifetime is a one-time purchase — nothing to cancel or renew.
          </p>
        )}
      </div>

      {portalError ? (
        <p
          role="alert"
          className="text-xs text-destructive mt-2"
          data-testid="settings-subscription-portal-error"
        >
          {portalError}
        </p>
      ) : null}

      {isPaid && !isLifetime ? (
        <p className="text-[11px] text-muted-foreground mt-2">
          Cancel, change payment method, or download invoices in the Paddle
          customer portal. Opens in a new tab.
        </p>
      ) : null}
    </Tile>
  );
}

/**
 * DeleteAccountTile — destructive, self-serve account deletion.
 *
 * Guards:
 *  - Typed confirmation ("DELETE") required before the request fires.
 *  - The edge function re-verifies the caller JWT and requires the same
 *    literal in the body; a click-through cannot silently delete.
 *  - Rows in public.* cascade via existing FKs on auth.users(id).
 */
function DeleteAccountTile() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canConfirm = confirmation === DELETE_ACCOUNT_CONFIRMATION && !busy;

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await requestAccountDeletion(confirmation);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    // On success the session is invalidated; redirect out.
    window.location.replace("/welcome");
  }

  return (
    <Tile name="Delete account" state="available">
      <p className="text-sm text-muted-foreground mb-3">
        Permanently delete your Verdant account and all associated grow data.
        This cannot be undone.
      </p>
      <Button
        size="sm"
        variant="destructive"
        data-testid="settings-delete-account"
        onClick={() => {
          setConfirmation("");
          setError(null);
          setOpen(true);
        }}
      >
        Delete my account
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return;
          setOpen(o);
        }}
      >
        <DialogContent data-testid="settings-delete-account-dialog">
          <DialogHeader>
            <DialogTitle>Delete your Verdant account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your account, grows, tents, plants,
              diary entries, photos, and sensor snapshots. This cannot be
              undone. If you have an active paid subscription, cancel it in
              the billing portal first — deletion does not automatically
              cancel Paddle billing.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <label htmlFor="delete-confirm" className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm.
            </label>
            <Input
              id="delete-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              data-testid="settings-delete-account-confirm-input"
              disabled={busy}
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
              data-testid="settings-delete-account-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!canConfirm}
              aria-busy={busy}
              data-testid="settings-delete-account-confirm"
            >
              {busy ? "Deleting…" : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

        <Tile name="Preferences" state="available">
          <p className="text-sm text-muted-foreground mb-3">
            Communication choices, including marketing opt-in.
          </p>
          <Button asChild size="sm" data-testid="account-preferences-link">
            <Link to="/account/preferences">Open preferences</Link>
          </Button>
        </Tile>

        {user?.id ? <StartScreenTile userId={user.id} /> : null}

        <SubscriptionTile />

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

        <Tile name="Agent integrations" state="available">
          <p className="text-sm text-muted-foreground mb-3">
            Connect ChatGPT, Claude, or another MCP-capable assistant. Read-only
            access to your grows, recent diary entries, and latest sensor
            snapshots — never writes, AI Doctor runs, or device control.
          </p>
          <Button asChild size="sm" data-testid="agent-integrations-link">
            <Link to="/settings/agent-integrations">Open agent integrations</Link>
          </Button>
        </Tile>

        <DeleteAccountTile />
      </div>
    </div>
  );
}

