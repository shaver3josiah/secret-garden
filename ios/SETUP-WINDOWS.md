# Secret Garden iOS — one-time setup from Windows

Get from zero to a TestFlight-ready pipeline. Two short browser steps only you can
do (they need your Apple ID), then one PowerShell script does the rest. Total ~15 min.

`ios/APPLE-SETUP.md` is the deeper reference for *why* each step matters; this is the
fast path.

## Your values (already decided — the script uses these)

| Field | Value |
|---|---|
| Bundle ID | `com.shaver.secretgarden` (baked into the build — don't change) |
| App name | `Secret Garden - Living Sky` |
| SKU | `secretgarden-ios` |
| Primary language | English (U.S.) |
| API key role | **Admin** (never Developer) |
| GitHub repo | `shaver3josiah/secret-garden` |

Prerequisite: a **paid** Apple Developer Program membership ($99/yr) on the JobDash
account. If it isn't enrolled yet, do that first at https://developer.apple.com/enroll —
nothing below works on a free account.

---

## Step 1 (browser) — sign in and accept agreements

1. Sign in at https://appstoreconnect.apple.com as the **Account Holder / Admin**.
2. Go to **Business → Agreements** and accept any pending **Apple Developer Program
   License Agreement**. A pending agreement silently blocks *everything* below — the
   API, signing, uploads — so don't skip it.

## Step 2 (browser) — create the API key

1. App Store Connect → **Users and Access → Integrations → App Store Connect API →
   Team Keys → ➕**.
2. Name it (e.g. `secret-garden-ci`), **Access = Admin**. *(Developer can't mint the
   distribution certificate and fails minutes into CI — Admin avoids every role trap.)*
3. **Download the `.p8` immediately** — Apple lets you download it exactly once. Save
   `AuthKey_XXXXXXXXXX.p8` somewhere safe.
4. Note these three values:
   - **Key ID** — on the key's row (10 chars).
   - **Issuer ID** — at the top of the Keys page (a UUID).
   - **Team ID** — the 10-char ID in the header at https://developer.apple.com.

## Step 3 (PowerShell) — run the setup script

From the repo root (`...\secret-garden`):

```powershell
.\Setup-Apple.ps1 -P8Path "C:\path\to\AuthKey_XXXXXXXXXX.p8" `
                  -KeyId XXXXXXXXXX `
                  -IssuerId 12345678-90ab-cdef-1234-567890abcdef `
                  -TeamId ABCDE12345
```

(If PowerShell blocks it: `powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Apple.ps1 ...`)

It will, in order:
- ✅ **Validate** the key actually authenticates (catches a wrong/base64'd key *before* CI).
- ✅ **Register** the bundle id `com.shaver.secretgarden` (idempotent; a permission
  error here means the key role is too low → recreate as Admin).
- ✅ **Set the 4 GitHub secrets** for you via `gh` — the raw `.p8` (never base64, so no
  `invalidPEMDocument`), the Key ID, the Issuer ID, and the Team ID.
- ✅ **Check the app record** and, if it's missing, print the exact **New App** values
  to enter.

## Step 4 (browser, if the script says MISSING) — create the app record

Apple has no API to create a brand-new app, so this one stays manual. App Store Connect
→ **Apps → ➕ → New App**:

| Field | Value |
|---|---|
| Platform | iOS |
| Name | `Secret Garden - Living Sky` |
| Primary Language | English (U.S.) |
| Bundle ID | `com.shaver.secretgarden` *(pick from the dropdown — it's registered now)* |
| SKU | `secretgarden-ios` *(permanent, private, never shown to users)* |
| User Access | Full Access |

> If the **Name** is rejected as taken, tweak it (e.g. `Secret Garden - Living Sky by
> JobDash`) — the name is renameable later and doesn't touch the bundle id or build.

## Step 5 — ship

```powershell
.\Ship-iOS.ps1
```

Commits, pushes `main`, tags the next `ios-v*`, and the CI archives → signs → uploads to
TestFlight. Watch it at
https://github.com/shaver3josiah/secret-garden/actions/workflows/ios-release.yml — green
means the upload succeeded (Apple then processes it for a few minutes).

## Step 6 (browser, after the first build processes) — add testers

App Store Connect → **TestFlight → Internal Testing** → add yourself/her as internal
testers. They must already be **Users** on the team (Users and Access) and will accept an
email invite in the TestFlight app. Internal builds expire **90 days** after upload —
rerun `Ship-iOS.ps1` before then to keep it alive on her phone.

---

### What was automated vs. not (and why)
- **Automated by `Setup-Apple.ps1`:** key validation, bundle-id registration, all 4
  GitHub secrets. Everything reachable with just the API key.
- **Browser-only (Apple has no API, or it needs your Apple ID login):** accepting the
  license agreement, creating the API key, creating the first app record, adding testers.
  These are the four things a script genuinely cannot do for you.
