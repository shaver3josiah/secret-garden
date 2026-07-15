# Apple one-time setup

These are the steps only a human with access to the JobDash Apple Developer account can do. Everything else — building, signing, uploading — is handled by CI on a GitHub macOS runner. Do these once, in order, and the pipeline runs from Windows forever after.

If a step here is skipped or done with the wrong role, the failure shows up minutes into a CI run with a cryptic error, not at the start. Careful once beats debugging later.

> **Do this before step 1.** Sign in at https://developer.apple.com and at App Store Connect → Business → Agreements and accept any pending Apple Developer Program License Agreement. It doesn't only break signing later (step 4) — an unaccepted agreement blocks App ID registration and new-app creation, so step 1 will wall you at the very first click until it's cleared.

## 1. Create the app record

Sign in at https://appstoreconnect.apple.com as an **Account Holder or Admin** on the JobDash team — lesser roles cannot register App IDs or create app records.

1. First register the bundle id: https://developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → **+** → App ID → `com.shaver.secretgarden`.
2. Then App Store Connect → Apps → **+** → New App: name **Secret Garden**, that bundle id, platform iOS.

## 2. Create the App Store Connect API key

App Store Connect → Users and Access → Integrations → App Store Connect API → **Team Keys** → **+**.

- **Access: App Manager or Admin. Never Developer** — a Developer key cannot create distribution certificates, and the failure only appears minutes into CI as `Cloud signing permission error`.
- **Download the `.p8` file immediately.** Apple lets you download it exactly once. Keep `AuthKey_XXXXXXXXXX.p8` somewhere safe.
- Note the **Key ID** (on the key's row) and the **Issuer ID** (top of the page).
- A key's role cannot be raised later. Wrong role? Revoke it, make a new one, update the secrets.

## 3. Add the four GitHub secrets

Go to https://github.com/shaver3josiah/secret-garden/settings/secrets/actions and add, by these exact names:

| Secret | Value |
|---|---|
| `APP_STORE_CONNECT_API_KEY` | The **raw** contents of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. **Not base64.** |
| `APP_STORE_CONNECT_API_KEY_ID` | The Key ID from step 2. |
| `APP_STORE_CONNECT_ISSUER_ID` | The Issuer ID from step 2. |
| `APPLE_TEAM_ID` | The 10-character Team ID shown in the header at https://developer.apple.com. |

For the `.p8`: open it in a plain text editor, Ctrl+A, Ctrl+C, paste. No blank line before `-----BEGIN`, no truncation at the end. Base64-encoding it produces `invalidPEMDocument` in CI. Secrets are read at run time, so after fixing one you can just "Re-run failed jobs" — no new tag needed.

## 4. Accept the license agreement

Check https://developer.apple.com and App Store Connect → Business → Agreements for any pending Apple Developer Program License Agreement banner, and accept it. A pending agreement silently breaks distribution signing and uploads.

## 5. Add internal testers

After the **first** build finishes processing (App Store Connect → TestFlight, usually a few minutes after upload), add internal testers under TestFlight → Internal Testing. Internal testers get the build on their phones within minutes, no review needed.

Internal TestFlight builds **expire 90 days after upload** — testers lose access until a newer build is shipped. Re-run `./Ship-iOS.ps1` before then to keep the app alive on her phone.

## 6. Ship

From the repo root on Windows:

```powershell
./Ship-iOS.ps1
```

or push a tag matching `ios-v*` (e.g. `ios-v1.0.0`). Either way, watch the run at https://github.com/shaver3josiah/secret-garden/actions — the `iOS Release` workflow archives, signs, and uploads to TestFlight.

A green run means the upload succeeded, **not** that Apple accepted the build — the pipeline deliberately doesn't wait for Apple's processing (to save runner minutes). After the run turns green, check App Store Connect → TestFlight → Builds (or your email) for any "Missing Compliance" or processing-failure notice before assuming the build reached testers.
