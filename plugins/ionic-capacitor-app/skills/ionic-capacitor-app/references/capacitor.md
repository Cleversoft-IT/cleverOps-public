# Capacitor 8: configurazione, plugin base, workflow nativo

Fonti: guida "Updating to 8.0" <https://capacitorjs.com/docs/updating/8-0>, config
<https://capacitorjs.com/docs/config>, CLI <https://capacitorjs.com/docs/cli>, Preferences
<https://capacitorjs.com/docs/apis/preferences>, Splash Screen
<https://capacitorjs.com/docs/apis/splash-screen>, System Bars
<https://capacitorjs.com/docs/apis/system-bars>, Assets
<https://github.com/ionic-team/capacitor-assets>. Versioni verificate il 2026-09-26:
`@capacitor/core|cli|ios|android` 8.5.x. Requisiti (dalla guida e dai template del CLI 8.5.2):

| | Requisito |
|---|---|
| Node | ≥ 22 |
| iOS | Xcode ≥ 26, deployment target iOS 15, Swift Package Manager di default (CocoaPods opzionale: `npx cap add ios --packagemanager CocoaPods`) |
| Android | Android Studio Otter 2025.2.1+, `minSdkVersion 24`, `compileSdkVersion 36`, `targetSdkVersion 36`, Gradle 8.14.3, AGP 8.13, Kotlin 2.2.20, JDK incluso in Android Studio |
| Progetto esistente su Capacitor ≤ 7 | `npm i @capacitor/cli@8` poi `npx cap migrate` |

## Configurazione

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.azienda.app',            // il bundle ID chiesto all'utente
  appName: 'Nome App',
  webDir: 'www',                       // 'dist' per React/Vue con Vite
  plugins: {
    // PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },   // push-notifications.md
  },
};

export default config;
```

- `appId` non si cambia dopo la pubblicazione. `appName` è il nome visualizzato.
- Se il progetto non ha ancora Capacitor: `npm i @capacitor/core@8 @capacitor/cli@8` e
  `npx cap init "Nome App" com.azienda.app --web-dir www`.
- Piattaforme: `npm i @capacitor/ios@8 @capacitor/android@8` poi `npx cap add ios` /
  `npx cap add android`. Le cartelle `ios/` e `android/` vanno versionate: sono codice.

## Workflow

```bash
npm run build && npx cap sync          # dopo ogni build web e ogni plugin nuovo
npx cap run ios                        # build + avvio su simulatore/device (chiede il target)
npx cap run android
npx cap open ios                       # Xcode
npx cap open android                   # Android Studio
ionic cap run android -l --external    # live reload su device (rete locale)
npx cap doctor                         # diagnostica versioni e piattaforme
```

- `npx cap sync` = `copy` (asset web in nativo) + `update` (plugin e dipendenze native).
- Errori di build nativa: aprire il progetto in Xcode/Android Studio e leggere il log
  completo; non indovinare.
- Su Android, se il device non compare: `adb devices`; se l'emulatore non vede la rete
  del live reload usa `--external` e l'IP mostrato.

## Plugin base (installa solo quelli usati, alla major 8)

| Plugin | Uso |
|---|---|
| `@capacitor/preferences` | Chiave/valore persistente (impostazioni, flag, token) |
| `@capacitor/app` | Stato foreground/background, back button Android, deep link (`appUrlOpen`) |
| `@capacitor/status-bar` | Stile/colore della status bar (`Style.Dark`/`Style.Light`) |
| `@capacitor/splash-screen` | Controllo dello splash (vedi sotto) |
| `@capacitor/keyboard` | Eventi tastiera, `resize` mode |
| `@capacitor/haptics` | Feedback aptico su azioni |
| `@capacitor/network`, `@capacitor/device`, `@capacitor/share`, `@capacitor/browser`, `@capacitor/camera`, `@capacitor/filesystem` | Secondo necessità |

Esempio: `npm i @capacitor/preferences@8 @capacitor/status-bar@8 && npx cap sync`. Per
ogni plugin leggi la sua pagina su capacitorjs.com/docs/apis: permessi iOS (`Info.plist`,
chiavi `NS...UsageDescription`) e Android (`AndroidManifest.xml`) sono documentati lì.

### Preferences (non è un database)

Salva solo stringhe: serializza JSON. Backend: `UserDefaults` (iOS), `SharedPreferences`
(Android), `localStorage` (web). Per dati grandi o interrogabili usa SQLite
(`@capacitor-community/sqlite`), non Preferences.

```ts
// src/core/storage.ts
import { Preferences } from '@capacitor/preferences';

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const { value } = await Preferences.get({ key });
  if (value === null) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

export const removeKey = (key: string) => Preferences.remove({ key });
```

Le chiavi vanno centralizzate in un `enum`/const (`STORAGE_KEYS.theme`, `.lang`,
`.onboardingDone`) per evitare stringhe sparse.

### Splash screen

Default del plugin: `launchAutoHide: true`, `launchShowDuration: 500` ms: lo splash sparisce
da solo e non serve codice. Se vuoi tenerlo finché la UI non è pronta (tema e lingua
caricati), imposta `plugins.SplashScreen.launchAutoHide: false` **e** chiama
`SplashScreen.hide()` "as soon as possible" (doc), altrimenti l'app resta bloccata sullo
splash:

- Angular: alla fine della funzione di `provideAppInitializer` (`angular.md`, "Aggiunte").
- React: in `bootstrap()` subito dopo `createRoot(...).render(...)` (`react.md`).
- Vue: in `bootstrap()` subito dopo `app.mount('#app')` (`vue.md`).

```ts
import { SplashScreen } from '@capacitor/splash-screen';
await SplashScreen.hide();
```

### Codice nativo vs web

```ts
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) { /* iOS o Android */ }
Capacitor.getPlatform();                      // 'ios' | 'android' | 'web'
Capacitor.isPluginAvailable('PushNotifications');
```

Un plugin senza implementazione web (push, AdMob, RevenueCat) lancia un errore in browser:
proteggi la chiamata e fornisci un comportamento web sensato (no-op o mock).

### System bars e safe area (Capacitor 8)

`SystemBars` è incluso in `@capacitor/core` 8 (`import { SystemBars, SystemBarsStyle } from '@capacitor/core'`)
per gli scenari edge-to-edge moderni (`setStyle`, `show`, `hide`); `@capacitor/status-bar`
resta per le funzioni classiche. Su iOS serve `UIViewControllerBasedStatusBarAppearance = YES`
in `Info.plist`. Nel CSS usa le variabili Ionic `--ion-safe-area-top/bottom` o
`env(safe-area-inset-*)`, mai padding fissi.

## Icone e splash

```bash
npm i -D @capacitor/assets@3
# sorgenti in assets/: icon-only.png, icon-foreground.png, icon-background.png (≥1024x1024),
# splash.png e splash-dark.png (≥2732x2732)
npx @capacitor/assets generate --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#111111' \
  --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#111111'
```

Genera icone (incluse le adaptive Android) e splash per iOS e Android; rilancia dopo ogni
cambio di asset e poi `npx cap sync`.

## Ciclo di vita e back button

```ts
import { App } from '@capacitor/app';

App.addListener('appStateChange', ({ isActive }) => { /* pausa/riprendi */ });
App.addListener('appUrlOpen', ({ url }) => { /* deep link / universal link */ });
```

Il back button hardware Android è gestito da Ionic (`ion-router-outlet`); intercettarlo
con `App.addListener('backButton', ...)` solo per casi specifici (chiudere l'app dalla
root, confermare l'uscita da un form).

## Aggiornare Capacitor

1. `npm i @capacitor/cli@8 @capacitor/core@8 @capacitor/ios@8 @capacitor/android@8`
2. `npx cap migrate` (aggiorna Gradle, SDK, deployment target, template)
3. Aggiorna ogni plugin `@capacitor/*` e community alla major corrispondente.
4. `npx cap sync`, apri Xcode/Android Studio, build pulita, prova su device.
