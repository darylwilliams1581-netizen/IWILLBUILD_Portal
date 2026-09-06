# Same TestFlight slot — native replaces Capacitor

Apple app: **IWIllBUIlD**  
App ID: `6793437566`  
Bundle ID: `com.iwillbuild.portal`  
Team: `L287H9J7L3`  
This upload: **version 13, build 29** (Capacitor last was version 12, build 28)

Testers keep the same TestFlight app. They get an update, not a second icon.

## Stop the old pipeline first

In Appflow: turn **off** iOS auto-deploy / watch on `IWILLBUILD_Portal`.  
If Appflow ships build 29+ of the Capacitor wrap, Apple will reject this native upload as a duplicate build, or testers will get the website wrap again.

## On a Mac (once)

1. Clone or pull https://github.com/darylwilliams1581-netizen/IWILLBUILD-iOS
2. Open `IWILLBUILDField.xcodeproj`
3. Signing: team `L287H9J7L3`, bundle `com.iwillbuild.portal`
4. Select Any iOS Device (arm64)
5. Product → Archive
6. Distribute App → App Store Connect → Upload
7. TestFlight → same app as always → build 29

Do **not** open the portal `ios/` Xcode project for this.

## After it lands

Install the TestFlight update on the phone.  
You should see Field jobs / camera / HazChat, not the website tiles.
