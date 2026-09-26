# Release: App Store e Google Play

Capacitor produce progetti nativi standard: la pubblicazione segue le procedure ufficiali
di Apple e Google. Qui: cosa preparare nel progetto e i comandi verificati. Fonti:
<https://capacitorjs.com/docs/ios/deploying-to-app-store>,
<https://capacitorjs.com/docs/android/deploying-to-google-play>, `cap build`
<https://capacitorjs.com/docs/cli/commands/build>, Apple "Distributing your app"
<https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases>,
Apple privacy manifest <https://developer.apple.com/documentation/bundleresources/privacy-manifest-files>,
Google "Launch checklist" <https://developer.android.com/distribute/best-practices/launch/launch-checklist>,
Play App Signing <https://support.google.com/googleplay/android-developer/answer/9842756>.

## Checklist pre-release (ogni piattaforma)

- [ ] `capacitor.config.ts`: `appId`/`appName` definitivi; build web di **produzione**
      (`npm run build`), poi `npx cap sync`.
- [ ] Versione incrementata: iOS `MARKETING_VERSION` (Version) e `CURRENT_PROJECT_VERSION`
      (Build) nel target di Xcode; Android `versionName` e `versionCode` (intero
      crescente) in `android/app/build.gradle`.
- [ ] Icone e splash generati con `@capacitor/assets`; nome e icona coerenti.
- [ ] Nessun ID di test, `isTesting`, `initializeForTesting`, log `DEBUG`, `console.log`,
      chiavi di sviluppo; RevenueCat/AdMob con chiavi di produzione; `testingDevices` vuoto.
- [ ] Permessi dichiarati solo per ciò che l'app usa, con testi (`NS...UsageDescription`)
      tradotti nelle lingue supportate.
- [ ] Privacy policy e termini pubblicati a un URL stabile e linkati nell'app (obbligatori
      con abbonamenti, ads, account).
- [ ] Prova su device reali (iOS e Android), in tutte le lingue, chiaro/scuro, offline,
      acquisti sandbox e restore, notifiche.

## iOS (macOS + Xcode 26)

1. `npx cap open ios`; Signing & Capabilities: team, `Automatically manage signing`,
   capability necessarie (Push Notifications, In-App Purchase...).
2. `Info.plist`: `ITSAppUsesNonExemptEncryption = NO` se usi solo HTTPS standard (evita la
   domanda di export compliance a ogni build); `CFBundleLocalizations` per le lingue.
3. Privacy manifest `ios/App/App/PrivacyInfo.xcprivacy`: Apple lo richiede per le API
   "required reason" e per gli SDK di tracciamento; controlla che esista e dichiari
   i tipi di dati raccolti coerentemente con le etichette privacy.
4. Archivio: Xcode → `Product > Archive` → Organizer → `Distribute App` → App Store
   Connect (upload). In alternativa da terminale:
   `npx cap build ios --xcode-export-method app-store-connect --xcode-team-id <TEAM_ID> --xcode-signing-style automatic`
   (produce l'`.ipa` in `ios/App/output/`; caricalo con Transporter o `xcrun altool`).
5. App Store Connect: scheda app, screenshot per le dimensioni richieste, App Privacy
   (dati raccolti: coerente con RevenueCat/AdMob/push/analytics), abbonamenti configurati
   e "pronti per l'invio", TestFlight per i beta tester, poi invio in review.
6. Note per la review: account demo se serve login; con abbonamenti, spiegare come
   accedere ai contenuti premium e dove sta "Ripristina acquisti".

## Android

1. Keystore di release (una volta, custodito e salvato in modo sicuro; la perdita
   impedisce gli aggiornamenti se non usi Play App Signing):
   `keytool -genkeypair -v -keystore release.keystore -alias <alias> -keyalg RSA -keysize 2048 -validity 10000`
   Tienilo **fuori** dal repo; passa le credenziali via variabili d'ambiente o
   `keystore.properties` ignorato da git.
2. App Bundle firmato:
   `npx cap build android --androidreleasetype AAB --keystorepath <path> --keystorepass <pw> --keystorealias <alias> --keystorealiaspass <pw>`
   (output in `android/app/build/outputs/bundle/release/`), oppure Android Studio →
   `Build > Generate Signed App Bundle`.
3. Play Console: crea l'app, attiva **Play App Signing**, carica l'AAB su Internal testing
   → Closed → Production; compila Data safety (coerente con push, ads, RevenueCat),
   Content rating, Ads declaration, Target audience; Capacitor 8 targetSdk 36 rispetta il
   requisito di target API corrente (verifica la scadenza sul Play Console).
4. Con RevenueCat: prodotti attivi e license testers in Play Console prima dei test.

## Automazione (opzionale)

`npx cap build` sopra è già scriptabile in CI (macOS runner per iOS); fastlane o Ionic
Appflow per firma, upload e screenshot automatici. Le credenziali (keystore, chiavi API
App Store Connect) stanno nei secret della CI, mai nel repo.

## Dopo la pubblicazione

- Rollout graduale su Play (staged rollout) e Phased Release su App Store per limitare
  i danni di un bug.
- Monitoraggio crash (Firebase Crashlytics, Sentry) solo se il progetto lo vuole:
  ricordati di dichiararlo nelle etichette privacy.
- Aggiornamenti: ogni release ripete `build` → `cap sync` → incremento versione → archivio.
