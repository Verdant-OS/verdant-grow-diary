import { describe, expect, it, vi } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AuthInlineMessage,
  AuthPasswordField,
  AuthTextField,
} from "@/components/AuthFormField";

describe("AuthFormField", () => {
  it("renders a labeled auth text field with accessibility state", () => {
    const onChange = vi.fn();
    render(
      <AuthTextField
        id="email"
        label="Email"
        value="grower@example.com"
        onChange={onChange}
        ariaInvalid
        ariaDescribedBy="email-error"
        required
      />,
    );

    const input = screen.getByLabelText("Email");
    expect(input).toHaveValue("grower@example.com");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
    expect(input).toBeRequired();

    fireEvent.change(input, { target: { value: "new@example.com" } });
    expect(onChange).toHaveBeenCalledWith("new@example.com");
  });

  it("renders password field with show/hide toggle when supplied", () => {
    const onChange = vi.fn();
    const onToggle = vi.fn();
    render(
      <AuthPasswordField
        id="password"
        label="Password"
        value="typed-value"
        onChange={onChange}
        showPassword={false}
        onToggleShowPassword={onToggle}
        autoComplete="current-password"
        ariaDescribedBy="password-error"
        required
      />,
    );

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("aria-describedby", "password-error");
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "updated-value" } });
    expect(onChange).toHaveBeenCalledWith("updated-value");
  });

  it("renders password hint and combines described-by ids", () => {
    render(
      <AuthPasswordField
        id="new-password"
        label="Password"
        value=""
        onChange={() => {}}
        showPassword={false}
        autoComplete="new-password"
        minLength={8}
        ariaDescribedBy="signup-error"
        hintId="signup-password-hint"
        hint="Minimum 8 characters."
      />,
    );

    expect(screen.getByText("Minimum 8 characters.")).toHaveAttribute(
      "id",
      "signup-password-hint",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-describedby",
      "signup-error signup-password-hint",
    );
  });

  it("renders inline auth messages with correct role and tone", () => {
    render(
      <>
        <AuthInlineMessage id="error" role="alert" tone="error">
          Something went wrong.
        </AuthInlineMessage>
        <AuthInlineMessage>Saved.</AuthInlineMessage>
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "error");
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
