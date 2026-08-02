/**
 * React 19 removed the ambient global `JSX` namespace that React 18's types
 * declared. A number of existing modules annotate return values as
 * `JSX.Element`. Rather than rewrite every call site during the framework
 * migration, re-declare the global namespace as an alias of React's own.
 *
 * New code should prefer `React.JSX.Element` (or `ReactElement`) directly.
 */
import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementType = ReactJSX.ElementType;
    type ElementClass = ReactJSX.ElementClass;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
  }
}

export {};
