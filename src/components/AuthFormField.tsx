import type { ChangeEvent, Ref } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthTextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  type?: "email" | "text";
  autoComplete?: string;
  required?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}

interface AuthPasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  showPassword: boolean;
  onToggleShowPassword?: () => void;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  hintId?: string;
  hint?: string;
}

interface AuthInlineMessageProps {
  id?: string;
  children: string;
  tone?: "error" | "muted";
  role?: "alert" | "status";
}

export function AuthTextField({
  id,
  label,
  value,
  onChange,
  inputRef,
  type = "email",
  autoComplete = "email",
  required,
  ariaInvalid,
  ariaDescribedBy,
}: AuthTextFieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={inputRef}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        aria-invalid={ariaInvalid ? true : undefined}
        aria-describedby={ariaDescribedBy}
        required={required}
      />
    </div>
  );
}

export function AuthPasswordField({
  id,
  label,
  value,
  onChange,
  showPassword,
  onToggleShowPassword,
  autoComplete,
  minLength,
  required,
  ariaInvalid,
  ariaDescribedBy,
  hintId,
  hint,
}: AuthPasswordFieldProps) {
  const describedBy = [ariaDescribedBy, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          aria-invalid={ariaInvalid ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          className={onToggleShowPassword ? "pr-10" : undefined}
        />
        {onToggleShowPassword ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleShowPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-1 h-full w-8 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>
      {hint && hintId ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function AuthInlineMessage({
  id,
  children,
  tone = "muted",
  role = "status",
}: AuthInlineMessageProps) {
  return (
    <p
      id={id}
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
      className={tone === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
    >
      {children}
    </p>
  );
}
