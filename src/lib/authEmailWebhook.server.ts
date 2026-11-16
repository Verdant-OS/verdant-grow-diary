/**
 * Server-only handler for Lovable's managed sign-in email webhook.
 *
 * The route file reads the environment and wires the real libraries in; this
 * module takes them as dependencies so tests can run the whole request path
 * without a network, a database or a signing secret. Decisions live in
 * `authEmailWebhookRules.ts`.
 */
import * as React from "react";

import {
  acceptAuthEmailPayload,
  buildAuthEmailSendRequest,
  buildAuthEmailTemplateProps,
  classifySendFailure,
  classifyWebhookVerificationError,
  truncateErrorMessage,
  type AuthEmailActionType,
  type AuthEmailLogStatus,
  type AuthEmailPayload,
  type AuthEmailSendRequest,
  type AuthEmailTemplateProps,
  type AuthEmailWebhookResponse,
} from "@/lib/authEmailWebhookRules";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { SignupEmail } from "@/lib/email-templates/signup";

// Each template reads only the props it needs from the shared prop bag.
type AuthEmailTemplate = (props: AuthEmailTemplateProps) => React.ReactElement;

export const AUTH_EMAIL_TEMPLATES: Readonly<Record<AuthEmailActionType, AuthEmailTemplate>> = {
  signup: SignupEmail as unknown as AuthEmailTemplate,
  invite: InviteEmail as unknown as AuthEmailTemplate,
  magiclink: MagicLinkEmail as unknown as AuthEmailTemplate,
  recovery: RecoveryEmail as unknown as AuthEmailTemplate,
  email_change: EmailChangeEmail as unknown as AuthEmailTemplate,
  reauthentication: ReauthenticationEmail as unknown as AuthEmailTemplate,
};

export type AuthEmailSendLogRow = {
  message_id: string;
  template_name: AuthEmailActionType;
  recipient_email: string;
  status: AuthEmailLogStatus;
  error_message: string | null;
};

export type AuthEmailWebhookDeps = {
  /** Lovable signing and send key. Missing means the server is misconfigured. */
  apiKey: string | undefined;
  sendUrl?: string;
  verify: (input: {
    req: Request;
    secret: string;
    parser: (body: string) => unknown;
  }) => Promise<{ payload: unknown }>;
  parse: (body: string) => unknown;
  /** Reads the `code` of a verification error, or null when it is not one. */
  verificationErrorCode: (error: unknown) => string | null;
  render: (element: React.ReactElement, options?: { plainText?: boolean }) => Promise<string>;
  send: (
    request: AuthEmailSendRequest,
    options: { apiKey: string; sendUrl?: string },
  ) => Promise<unknown>;
  /** Reads the `code` of a send error (e.g. recipient_suppressed), or null. */
  sendErrorCode: (error: unknown) => string | null;
  /** Writes one audit row; must never throw for a logging failure. */
  writeLog: (row: AuthEmailSendLogRow) => Promise<void>;
  newMessageId: () => string;
  logger?: Pick<Console, "error" | "info">;
};

const toResponse = (result: AuthEmailWebhookResponse): Response =>
  Response.json(result.body, { status: result.status });

export async function handleAuthEmailWebhook(
  req: Request,
  deps: AuthEmailWebhookDeps,
): Promise<Response> {
  const logger = deps.logger ?? console;

  if (!deps.apiKey) {
    logger.error("Auth email webhook: signing key not configured");
    return toResponse({ status: 500, body: { error: "Server configuration error" } });
  }

  let payload: AuthEmailPayload | null = null;
  try {
    const verified = await deps.verify({ req, secret: deps.apiKey, parser: deps.parse });
    payload = (verified.payload ?? null) as AuthEmailPayload | null;
  } catch (error) {
    const code = deps.verificationErrorCode(error);
    logger.error("Auth email webhook: verification failed", { code });
    return toResponse(classifyWebhookVerificationError(code));
  }

  const accepted = acceptAuthEmailPayload(payload);
  if (!accepted.ok) {
    logger.error("Auth email webhook: payload rejected", { status: accepted.response.status });
    return toResponse(accepted.response);
  }

  const data = payload?.data ?? {};
  const Template = AUTH_EMAIL_TEMPLATES[accepted.actionType];
  const element = React.createElement(Template, buildAuthEmailTemplateProps(accepted, data));
  const html = await deps.render(element);
  const text = await deps.render(element, { plainText: true });

  const messageId = deps.newMessageId();
  const request = buildAuthEmailSendRequest({ accepted, messageId, html, text });
  const logRow = (
    status: AuthEmailLogStatus,
    errorMessage: string | null,
  ): AuthEmailSendLogRow => ({
    message_id: messageId,
    template_name: accepted.actionType,
    recipient_email: accepted.recipient,
    status,
    error_message: errorMessage,
  });

  try {
    await deps.send(request, { apiKey: deps.apiKey, sendUrl: deps.sendUrl });
  } catch (error) {
    const status = classifySendFailure(deps.sendErrorCode(error));
    await deps.writeLog(
      logRow(status, truncateErrorMessage(error instanceof Error ? error.message : null)),
    );
    logger.error("Auth email webhook: send failed", {
      runId: accepted.runId,
      actionType: accepted.actionType,
      status,
    });
    return toResponse({ status: 500, body: { error: "Email send failed" } });
  }

  await deps.writeLog(logRow("sent", null));
  logger.info("Auth email webhook: sent", {
    runId: accepted.runId,
    actionType: accepted.actionType,
  });
  return toResponse({ status: 200, body: { success: true } });
}
