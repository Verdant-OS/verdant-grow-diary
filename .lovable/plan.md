# Re-activate managed auth emails (answer only, nothing changed)

1. Is the hook off? Very likely yes, but I can't confirm the hook setting directly. A read-only status check reports: notify.verdantgrowdiary.com is Active, the queue is healthy, 0 emails sent in 7 days, and the auth setup shows "No authentication emails yet". That means the platform no longer counts this project as having managed auth emails set up. I have no read-only tool that shows the Send Email hook value, so "off" is an inference (it fits the 0 hook runs at 14:57).
2. The single supported action: re-run the auth email setup (the managed scaffold, overwrite confirmed), or ask in chat for the email update again. That is the step that registers the project's auth hook with the platform. Turning on project emails is a separate switch, and the status doesn't show it as off.
3. What that action touches:
   - Repo files: yes. It rewrites the auth hook and the six auth templates. Branding would need to be re-applied, and other email files may be re-rendered.
   - supabase/migrations: none added or edited, as far as I know. The scaffold doesn't run migrations.
   - Database objects: not expected. I can't fully confirm this for the managed activation step.
   - Deploys: the auth hook only. The live site is unchanged until publish.
4. Changing none of these: not with any tool I have. Redeploying alone (done at 14:08) doesn't re-activate the hook. The hook can't be safely switched on by hand. If Cloud > Emails offers a re-activate or "restore update" button, that might work without file changes. I can't verify that button exists.
