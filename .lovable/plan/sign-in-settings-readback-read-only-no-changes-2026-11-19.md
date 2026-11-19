# Sign-in settings readback (read-only, no changes)

This is a report only. There is nothing to build and no change is proposed. Approving or skipping this card changes nothing.

Read on 2026-11-19, around 15:06 UTC, with the auth/OAuth debug tool and one public discovery-document request.

## 1. Site URL
`https://id-preview--66255e7b-892c-4be5-8686-ab1cfc3666db.verdantgrowdiary.lovable.app`

## 2. Redirect URL allow-list (20 entries, verbatim)

```text
https://verdantgrowdiary.com/**
https://www.verdantgrowdiary.com/**
https://verdantgrowdiary.org/**
https://www.verdantgrowdiary.org/**
https://growdiary.app/**
https://www.growdiary.app/**
https://www.diarygrow.app/**
https://diarygrow.app/**
https://www.verdantgrow.app/**
https://verdantgrow.app/**
https://id-preview*--66255e7b-892c-4be5-8686-ab1cfc3666db.lovable.app/**
https://project--66255e7b-892c-4be5-8686-ab1cfc3666db.lovable.app/**
https://project--66255e7b-892c-4be5-8686-ab1cfc3666db-dev.lovable.app/**
https://66255e7b-892c-4be5-8686-ab1cfc3666db.lovableproject.com/**
https://66255e7b-892c-4be5-8686-ab1cfc3666db-thr_*.lovableproject.com/**
https://id-preview*--66255e7b-892c-4be5-8686-ab1cfc3666db.verdantgrowdiary.lovable.app/**
https://live--66255e7b-892c-4be5-8686-ab1cfc3666db.verdantgrowdiary.lovable.app/**
https://live--66255e7b-892c-4be5-8686-ab1cfc3666db-thr_*.verdantgrowdiary.lovable.app/**
https://preview*--verdantgrowdiary.verdantgrowdiary.lovable.app/**
https://verdantgrowdiary.verdantgrowdiary.lovable.app/**
```

## 3. OAuth 2.1 server and dynamic client registration

Debug tool output, quoted exactly:

```text
OAuth server enabled: Disabled
Authorization path: Not configured
Dynamic client registration: Not configured
Expected consent page URL: Not configured
```

Authorization-server discovery document:
- Address requested: `https://knkwiiywfkbqznbxwqfh.supabase.co/auth/v1/.well-known/oauth-authorization-server`
- Result: `HTTP 404`
- No document was returned, so it does not list a `registration_endpoint`.

## Not read
- Whether a separate OpenID discovery document lists a `registration_endpoint` was not checked.
