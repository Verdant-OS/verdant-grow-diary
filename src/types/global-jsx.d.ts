/**
 * React 19 @types/react only exports JSX under the React namespace.
 * Legacy call sites still annotate returns as `JSX.Element`; this ambient
 * re-exports the React 19 JSX.Element type into the global JSX namespace so
 * those annotations typecheck under strictNullChecks without a mass rewrite.
 */
import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementType = ReactJSX.ElementType;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

export {};
