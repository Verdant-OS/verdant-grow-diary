import { renderErrorPage, type ErrorPageKind } from "@/lib/error-page";
import {
  SUPABASE_INITIALIZATION_ERROR_CODE,
  isSupabaseInitializationError,
} from "@/lib/supabaseInitializationError";

export type SsrErrorCode = typeof SUPABASE_INITIALIZATION_ERROR_CODE | "SSR_RENDER_FAILED";

export interface SsrErrorResponseResult {
  response: Response;
  code: SsrErrorCode;
  reference: string;
  pathname: string;
}

function createReference(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `ssr-${Date.now().toString(36)}`;
  }
}

function safePathname(request: Request): string {
  try {
    return new URL(request.url).pathname || "/";
  } catch {
    return "/";
  }
}

export function classifySsrError(error: unknown): {
  code: SsrErrorCode;
  pageKind: ErrorPageKind;
} {
  if (isSupabaseInitializationError(error)) {
    return {
      code: SUPABASE_INITIALIZATION_ERROR_CODE,
      pageKind: "supabase_initialization",
    };
  }
  return { code: "SSR_RENDER_FAILED", pageKind: "generic" };
}

export function createSsrErrorResponse(input: {
  error: unknown;
  request: Request;
  reference?: string;
}): SsrErrorResponseResult {
  const classification = classifySsrError(input.error);
  const reference = input.reference?.trim() || createReference();
  const pathname = safePathname(input.request);
  const response = new Response(renderErrorPage({ kind: classification.pageKind, reference }), {
    status: 500,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-verdant-error-code": classification.code,
      "x-verdant-error-id": reference,
    },
  });

  return {
    response,
    code: classification.code,
    reference,
    pathname,
  };
}
