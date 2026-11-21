# Mobile (Android app)

A native Android shell built with [Capacitor](https://capacitorjs.com) that packages the web app from [`../frontend`](../frontend). No app code is duplicated: every feature of the website is in the app.

```
mobile/
  capacitor.config.json   app id, name, plugin settings; webDir points at ../frontend/dist
  package.json            Capacitor CLI + Android platform + native plugins
  android/                the Android Studio / Gradle project (icons, splash, manifest, signing key)
```

## Build it on GitHub (no tools needed)
Push to `main` after adding the `API_BASE_URL` repository variable. See the main README, section "Android app".

## Build it yourself
Needs Node 22, JDK 21 and Android Studio (or the Android SDK).

```bash
cd ../frontend && npm install && cd ../mobile && npm install
echo "VITE_API_BASE_URL=https://your-backend.example.com" > ../frontend/.env
npm run open             # builds ../frontend, syncs it here, opens Android Studio → press Run
npm run dev:android      # or run straight on a connected phone / emulator
```

## What lives where
- App icon, splash screen, notification icon: `android/app/src/main/res/`
- Package name / name: `capacitor.config.json` (`appId`, `appName`)
- Version: set automatically by the workflow (`versionCode` = build number)
- Signing: built-in key `android/app/achat-debug.keystore`, or your own via repository secrets
