Use the managed email scaffold for authentication handlers and templates; it preserves Cloud signature and callback contracts.
Keep shared email-safe styling in styles.ts; email canvases remain white for client compatibility.
Public submission actions validate and save before internally sending a registered owner notification; the recipient is fixed and email failure never turns a saved submission into a failed form.
Send app emails through the managed server-only helper; retained email tables are audit views, never send-gating authority.
