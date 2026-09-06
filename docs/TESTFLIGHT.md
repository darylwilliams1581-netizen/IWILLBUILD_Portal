# TestFlight with no Mac

Apple app **IWIllBUIlD** (`6793437566`)  
Bundle `com.iwillbuild.portal` · Team `L287H9J7L3`

GitHub Actions archives on a cloud Mac and uploads to the **same** TestFlight. You do this from the iPhone.

## 0. Appflow off

Turn off iOS auto-deploy in Appflow so it cannot fight this build.

## 1. Apple API key (Safari on the phone)

1. Open [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
2. **Generate API Key** — role **Admin** (needs certificates)
3. Copy **Issuer ID** (top of the page) and **Key ID**
4. Download the `.p8` file (once). Open it in Files / a text app and copy the whole text  
   (`-----BEGIN PRIVATE KEY-----` …)

## 2. GitHub secrets (Safari on the phone)

Open  
https://github.com/darylwilliams1581-netizen/IWILLBUILD_Portal/settings/secrets/actions  

**New repository secret** four times:

| Name | Value |
|---|---|
| `ASC_KEY_ID` | the Key ID |
| `ASC_ISSUER_ID` | the Issuer ID |
| `ASC_KEY_CONTENT` | full `.p8` text |
| `MATCH_PASSWORD` | a long passphrase you invent (signing locker) |

## 3. Run the build

1. https://github.com/darylwilliams1581-netizen/IWILLBUILD_Portal/actions/workflows/testflight.yml
2. **Run workflow** → **Run**
3. Wait ~15–20 min
4. TestFlight app on the phone → IWIllBUIlD → new build (29 or higher)

You should see Field jobs / camera / HazChat, not the website tiles.

If the Action fails, screenshot the red log and send it here.
