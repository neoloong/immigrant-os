# Immigrant OS mobile shell

## Delivery status — 2026-11-09

This is a **partial scaffold, not a buildable native release**. Branch `app-capacitor`
starts at `independent-hosting` commit `6a7a629` in the isolated local clone
`work/app-capacitor`. The original checkout's `.git` is read-only in the agent
sandbox, so the original checkout stays on `independent-hosting`.

- Configuration, npm entry points, asset generation wiring, and this runbook exist.
- Capacitor packages are **not installed or added to the lockfile**. Registry access
  fails with `ENOTFOUND registry.npmjs.org`; offline install fails with `ENOTCACHED`.
  `app:install-tooling` completes this step when network access is available and
  saves exact versions as dev dependencies. The existing web lockfile remains valid.
- Neither `ios/` nor `android/` has been generated. Attempts to run the official
  CLI for both platforms stopped at package resolution (`ENOTCACHED`), before
  native generation. No native build, sync, signing, or asset output is verified.
- Only Apple Command Line Tools are selected (`/Library/Developer/CommandLineTools`).
  Full Xcode is absent; `xcodebuild -version` fails. Android Studio and the default
  Android SDK directory are absent; `/usr/libexec/java_home -V` finds no Java runtime.

## Validation in this environment

`npm ci --offline --no-audit --no-fund` passed from the existing project cache.
`npm test` ran the web build and artifact validation successfully, then reported
15 passing tests and three Miniflare initialization failures because localhost
listeners are denied (`listen EPERM: operation not permitted 127.0.0.1`).
`npx --no-install tsc --noEmit` passed. Full tests remain required outside this
sandbox, as do all checks after the missing Capacitor dependencies are installed.
Web/auth sources, production `wrangler.jsonc`, and `package-lock.json` are unchanged.

## Architecture

`capacitor.config.ts` describes an iOS WKWebView / Android WebView shell loading
`https://immigrant-os.neoloong.workers.dev`. `server.cleartext` is `false`.
The app name is `Immigrant OS`; `com.neoloong.immigrantos` is a **placeholder
pending the owner's confirmation**, before registering either store identifier.

This keeps server rendering, API requests, sessions, D1/R2 data, and web updates
on the existing live service. Native builds package the shell and native assets;
web changes become visible through the service without copying a stale web build.
`mobile/www/index.html` is only a minimal packaging stub, not a static export,
offline app, or automatic network-error screen. Do not set `webDir` to `dist`,
`public`, or a copied production build. `npm run app:sync` does not build or deploy
the web app. Live hosting and Access/auth are unchanged by this scaffold.

This follows the requested architecture deliberately: Capacitor documents
[`server.url`](https://capacitorjs.com/docs/config) as a live-reload feature not
intended for production. Treat this as an explicit architectural limitation and
validate the remote shell on actual devices before distributing it.

## Finish installation and generate the projects

Use a network-enabled terminal in `work/app-capacitor`, on branch `app-capacitor`.
Node 22.13+ is the repository minimum. Install full Xcode 26+ for iOS; use a
Capacitor 8-compatible Android Studio with its bundled JDK and the SDK/build tools
requested by the generated Gradle project for Android. See the official
[environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup).

```sh
cd ~/Projects/immigrant-os/work/app-capacitor
git branch --show-current
npm ci
npm run app:install-tooling
npx cap add ios
npx cap add android
npm run app:assets
npm run app:sync
npm ci
npm run build
npm test
npx tsc --noEmit
```

`app:install-tooling` adds only official Capacitor packages: core, CLI, iOS,
Android (major 8), and assets (major 3). It saves resolved exact versions in
`package.json` and `package-lock.json`. This is a one-time bootstrap; use `npm ci`
after committing that lockfile. No push, notification, browser, or other runtime
plugin is requested. Capacitor 8 defaults to Swift Package Manager for iOS, so
CocoaPods is not required for this setup.

Run `cap add` only for a missing platform; if a failed attempt left a native
project, inspect it and finish with `cap sync ios` or `cap sync android` instead
of deleting it. When generation and checks pass, record their results here and
in `docs/project_state.md`, clear the partial status, then commit explicit paths:

```sh
git add package.json package-lock.json ios android docs/mobile-app.md docs/project_state.md
git diff --cached --stat
git commit -m "Generate Capacitor iOS and Android projects"
```

Keep signing keys, provisioning profiles, local SDK paths, build outputs, and
credentials out of that commit. Do not push, merge, deploy, or run Wrangler cloud
commands as part of this procedure.

## Icons and splash screens

The source artwork already exists at `public/favicon.svg`; no new IO placeholder
was needed. `npm run app:assets` copies that SVG to an ignored staging directory,
enlarges its canvas while retaining its viewBox, and invokes the official
[`@capacitor/assets` generator](https://github.com/ionic-team/capacitor-assets).
Icon and splash backgrounds use the site's paper color `#f8f9f6` in both modes.
Explicit iOS/Android flags prevent PWA/web-manifest changes. Generated native
assets must be committed with their projects after visual inspection. Generation
has not succeeded in this environment; the existing blue favicon also needs owner
approval as the final store artwork.

After any source icon change, rerun `app:assets` and `app:sync`. Inspect iOS icon
opacity, Android adaptive-icon cropping, and launch screens on both platforms.
No splash-screen runtime plugin or custom launch timing is included.

## iOS: device run and TestFlight

1. Install/open Xcode, finish its first-run components and iOS platform download.
   Select it in Xcode Settings > Locations, or run:
   ```sh
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   xcodebuild -version
   ```
2. Complete installation/generation above. Run `npm run app:ios`, or open
   `ios/App/App.xcodeproj` for the default SPM project. Let packages resolve.
3. The owner signs in to Xcode with their Apple ID. Apple Developer Program is
   already active: choose **Chao Wang**, Team ID **WV28UW2GZS**, in the App target's
   Signing & Capabilities settings and enable automatic signing. Do not enroll or
   buy another membership. Confirm the bundle ID first; if changed, update both
   `capacitor.config.ts` and the native target's bundle identifier.
4. Connect/unlock an iPhone, trust the Mac, enable Developer Mode if prompted,
   select it as the run destination, and Run. Test login and the flows below.
5. In App Store Connect, the owner creates the app record using the confirmed
   bundle ID, name, primary language and SKU; accept any pending agreements.
6. Set the native target's version/build number (increment build for each upload),
   select a generic iOS device destination, then Product > Archive. In Organizer,
   Validate App, then Distribute App > App Store Connect > Upload using the team.
7. After processing, answer export-compliance questions based on the actual app.
   In TestFlight, create an internal group, assign the build and add authorized
   App Store Connect testers. External testing needs the additional beta review.
   Follow Apple's [TestFlight workflow](https://developer.apple.com/testflight/).

Signing, store record creation, agreements, upload, and tester invitations are
owner steps; none have been performed by this task. Uploading a shell does not
change the service audience or authorize testers in Cloudflare Access.

## Android: device run and Play internal testing

1. Install Android Studio, its bundled JDK, Android SDK, platform tools, and the
   SDK versions requested by the generated project. Select its bundled JDK in
   Gradle settings. For terminal builds, set `JAVA_HOME` to that JDK and
   `ANDROID_HOME` to the SDK (typically `~/Library/Android/sdk` on macOS).
2. Complete installation/generation above, then `npm run app:android`. Allow
   Gradle sync and SDK installation. Select an emulator or a connected device
   with USB debugging enabled; Run. A local debug build needs no Play account.
   For a terminal debug build, run `./gradlew assembleDebug` inside `android/`.
3. Confirm the package identifier before registration. If changing it after
   generation, update the Gradle application ID/namespace, Java package paths,
   any native references, and Capacitor config together.
4. The owner registers for Google Play Console when ready: registration is a
   future [one-time US$25 step](https://support.google.com/googleplay/android-developer/answer/6112435).
   Complete identity/account verification and agreements personally.
5. Set `versionCode`/`versionName` in `android/app/build.gradle`. In Android Studio,
   Build > Generate Signed Bundle / APK > Android App Bundle. Create/select an
   upload keystore stored **outside the repository**, securely back it up, and
   generate a release `.aab`. Do not commit passwords or signing properties.
6. Create the Play app with the confirmed ID and configure Play App Signing.
   Under Testing > Internal testing, create a release, upload the signed bundle,
   enter release notes, select an internal tester list, review and roll it out.
   Give testers the opt-in link and separately arrange authorized Access login.
   See Google's [internal-testing instructions](https://support.google.com/googleplay/android-developer/answer/9845334).
   Internal testing does not satisfy all later production-access requirements.

## Device checks and known limitations

- Push notifications are not wired: no APNs/FCM registration, tokens, notification
  permission flow, or server delivery. No native background scheduling.
- **Access cookie/session behavior in WKWebView/WebView is unverified.** Test fresh
  sign-in, Access/IdP redirects, relaunch, expiry, logout, and switching accounts.
  Safari/Chrome cookies must not be assumed shared with the embedded view.
  Cross-origin navigation may leave the WebView under Capacitor defaults; a login
  finishing in the browser may not authenticate the app. No wildcard navigation
  allowlist or auth workaround is added. Resolve any observed failure as separate
  scoped work before distributing the app.
- Network and production-service availability are required; no offline data,
  fallback app, or guaranteed graceful error UI is implemented. Test airplane mode,
  recovery, slow service, and cold starts.
- Validate safe areas, keyboard, back navigation, rotation, text scaling and screen
  readers. Test profile/checklist persistence, case tracking, uploads, authenticated
  downloads, PDF viewing, calendar `.ics` export and external USCIS links. Web file
  and download APIs may need native work; none is claimed tested here.
- No native deep links, share integration, biometrics, or custom permissions are
  added. Web content can change independently of the installed shell, so repeat
  mobile smoke checks after material site changes.

## Store-submission checklist

- [ ] Both native projects generated, committed, synced and built; clean `npm ci`,
  web build, tests and TypeScript checks pass after adding dependencies.
- [ ] Owner confirms app ID and final icons, signs the builds, and approves tester
  invitations and any separately required audience changes.
- [ ] Physical-device auth/session and functional checks above pass for two
  authorized accounts, including owner isolation and logout.
- [ ] Record app version/build, supported devices, release notes, screenshots,
  support URL, privacy-policy URL, age/content ratings and category.
- [ ] Complete App Privacy / Data safety declarations against actual hosted data,
  uploads, retention and SDK behavior; review privacy manifests and required-reason
  APIs. Verify an appropriate account/data deletion route for store requirements.
- [ ] Provide review access and clear sign-in instructions without publishing
  credentials or weakening Access. Keep the backend available during review.
- [ ] Check the current target-SDK/Xcode submission requirements and store policies
  at submission time. A thin wrapper is not assured acceptance: Apple's
  [guideline 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)
  evaluates utility beyond repackaging a website. Internal builds are a validation
  milestone, not evidence of public-store approval.
