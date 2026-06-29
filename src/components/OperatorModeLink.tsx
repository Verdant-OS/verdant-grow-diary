/**
 * OperatorModeLink — role-aware nav link.
 *
 * Renders a link to /operator/demo-preview ONLY when the server-side
 * has_role('operator') check returns granted. Non-operators and loading/error
 * states render nothing; the operator path is never exposed to the DOM in
 * those cases.
 *
 * Safety:
 *  - delegates exclusively to useHasRole("operator") (server RPC).
 *  - never infers role from client storage, JWT, or user object.
 *  - performs no writes on click; navigation only.
 *  - never renders user IDs, role rows, RPC names, or tokens.
 */
import { NavLink } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHasRole } from "@/hooks/useHasRole";

export const OPERATOR_MODE_PATH = "/operator/demo-preview";
export const OPERATOR_MODE_LABEL = "Operator Mode";

export interface OperatorModeLinkProps {
  variant?: "sidebar" | "mobile";
  onNavigate?: () => void;
  className?: string;
}

export default function OperatorModeLink({
  variant = "sidebar",
  onNavigate,
  className,
}: OperatorModeLinkProps) {
  const role = useHasRole("operator");

  if (role.status !== "granted") return null;

  if (variant === "mobile") {
    return (
      <NavLink
        to={OPERATOR_MODE_PATH}
        onClick={onNavigate}
        data-testid="operator-mode-link-mobile"
        className={({ isActive }) =>
          cn(
            "flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border/50 text-xs",
            isActive
              ? "bg-primary/10 text-primary border-primary/40"
              : "bg-secondary/30 text-foreground",
            className,
          )
        }
      >
        <ShieldCheck className="h-5 w-5" />
        {OPERATOR_MODE_LABEL}
      </NavLink>
    );
  }

  return (
    <NavLink
      to={OPERATOR_MODE_PATH}
      onClick={onNavigate}
      data-testid="operator-mode-link-sidebar"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60",
          className,
        )
      }
    >
      <ShieldCheck className="h-4 w-4 shrink-0" />
      <span className="truncate">{OPERATOR_MODE_LABEL}</span>
    </NavLink>
  );
}
