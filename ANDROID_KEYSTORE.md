# Android Keystore Setup

A keystore is a file that signs your APK. You need it once — keep it safe forever.
If you lose it, you cannot update your app on the Play Store.

---

## Step 1 — Generate the keystore (one time only)

Run this on any machine with Java installed (Android Studio includes Java):

```bash
keytool -genkey -v \
  -keystore iwillbuild.keystore \
  -alias iwillbuild \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You'll be prompted for:
- **Keystore password** — choose a strong password, save it in a password manager
- **Key alias** — use `iwillbuild`
- **Key password** — can be the same as keystore password
- **Your name / organisation / location** — fill in your details

This creates `iwillbuild.keystore` in the current directory.

**⚠️ Back this file up immediately** — Dropbox, Google Drive, password manager attachment.
Losing it means you can never update the Play Store listing.

---

## Step 2 — Encode the keystore for GitHub

```bash
base64 -i iwillbuild.keystore | pbcopy    # Mac — copies to clipboard
base64 -i iwillbuild.keystore             # Windows/Linux — copy the output manually
```

---

## Step 3 — Add secrets to GitHub

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these four secrets:

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The base64 string from Step 2 |
| `ANDROID_KEYSTORE_PASSWORD` | Your keystore password |
| `ANDROID_KEY_ALIAS` | `iwillbuild` |
| `ANDROID_KEY_PASSWORD` | Your key password |

---

## Step 4 — Trigger a build

Push any commit to `main`, or go to:
**GitHub → Actions → Android APK Build → Run workflow → release**

The signed APK will appear as a GitHub Release artifact, ready to download and install.

---

## Installing on Android devices

1. Download the APK from the GitHub Release
2. On the Android device: **Settings → Security → Install unknown apps**
3. Allow installs from your browser or Files app
4. Open the downloaded APK → Install

For team distribution, share the GitHub Release URL directly with drivers.
They download and install in about 30 seconds.

---

## Play Store (when ready)

To submit to the Play Store, change the build step in the workflow from
`assembleRelease` to `bundleRelease` — this produces an `.aab` file instead
of an `.apk`. Upload the `.aab` to Google Play Console.

You'll need:
- Google Play Developer account ($25 USD one-time fee)
- App listing: name, description, screenshots, privacy policy URL
- Content rating questionnaire
- Review takes 1–3 days for first submission, hours for updates
