# V327 Realtime JWT secret setup

The `adt-realtime-token` Edge Function signs the short-lived Realtime JWT with the project's Legacy JWT Secret.

## Supabase Dashboard

Go to:
Project Settings → Edge Functions → Secrets

Create one custom secret:

`ADT_REALTIME_JWT_SECRET`

Its value must be the project's **Legacy JWT secret** shown under:
Project Settings → JWT Keys → Legacy JWT Secret

Do not create `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`; those are provided by Supabase as default Edge Function secrets in this project.

Do not paste the JWT secret into the app, source code, chat, screenshots, or Git.

After saving the secret, deploy the existing function:

`adt-realtime-token`

The function remains compatible with an older environment that already exposes `SUPABASE_JWT_SECRET`, but V327 uses `ADT_REALTIME_JWT_SECRET` as the intended configuration.
