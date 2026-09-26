---
name: ionic-capacitor-app
description: Use when creating, modifying or migrating an Ionic 9 + Capacitor 8 mobile app with Angular, React or Vue - scaffolding, ion-tabs navigation, routing and guards, Preferences storage, dark mode, i18n, push notifications, native sync/build and App Store / Play Store release - plus the optional modules RevenueCat subscriptions and paywalls, AdMob with UMP consent and ATT, and onboarding. Also use to upgrade Ionic 8 to 9 or Capacitor 7 to 8. Not for React Native/Expo, Flutter or PWAs without Capacitor.
---

# Ionic 9 + Capacitor 8: app mobile con Angular, React o Vue

Guida operativa per costruire, modificare e pubblicare app **Ionic 9 + Capacitor 8**.
Il corpo di questa skill contiene solo le regole e la mappa dei reference: il codice
dettagliato per ogni argomento sta in `references/` e va letto **solo quando serve**.

> Questa cartella è una skill, non un progetto: mai `npm install` qui dentro, mai creare
> file di codice qui. L'app va creata nella cartella indicata dall'utente.

## 1. Prima di scrivere codice: chiedi

Non assumere nulla di quanto segue; se l'utente non lo ha detto, chiedilo in un'unica
domanda con le opzioni.

| Cosa | Perché |
|---|---|
| Framework: **Angular**, **React** o **Vue** | Cambia scaffolding, router, i18n |
| **Bundle ID** (reverse-DNS, es. `com.azienda.app`) e nome app | Serve a `ionic start --package-id` e a `capacitor.config.ts`; cambiarlo dopo costa |
| Cartella di destinazione | Mai creare il progetto dentro la skill o in cwd senza conferma |
| Piattaforme: iOS, Android o entrambe | Requisiti di build diversi (macOS/Xcode per iOS) |
| Lingue dell'app (e quale è quella principale) | Nessuna lingua di default arbitraria: la lingua di fallback la decide il progetto |
| Struttura: app a **tab** (quante, quali) o a stack | `ion-tabs` è la scelta consigliata per app con 3-5 sezioni |
| **Moduli opzionali**: abbonamenti RevenueCat, AdMob, onboarding, push | Sono opzionali: non aggiungerli mai se non richiesti |

Se il progetto esiste già: leggi `package.json`, `capacitor.config.ts`, la struttura di
`src/` e adegua le versioni solo se l'utente vuole aggiornare (vedi
`references/migration-ionic8-to-9.md`).

## 2. Versioni di riferimento

Verificate il 2026-09-26 con `npm view <pkg> version` e le doc ufficiali. **Prima di
fissare le versioni in un progetto riverificale** con `npm view <pkg> version` e
`npm view <pkg> peerDependencies`: questa tabella invecchia.

| Pacchetto | Versione | Vincoli verificati |
|---|---|---|
| `@ionic/core`, `@ionic/angular`, `@ionic/react`, `@ionic/react-router`, `@ionic/vue`, `@ionic/vue-router` | 9.0.x | Angular ≥ 18, React 18/19, Vue ≥ 3.5, Capacitor ≥ 7; browser: iOS ≥ 16, Chrome ≥ 89 |
| `@ionic/cli` | 7.2.x | `ionic start --type angular-standalone\|react\|vue` |
| `@angular/core`, `@angular/cli` | 22.x | Node `^22.22.3 \|\| ^24.15.0 \|\| >=26`; TypeScript **6.0.x** (non 5.x, non 7.x); zoneless e OnPush di default |
| `@ionic/angular-toolkit` | 13.x | Angular 21-22 |
| `react-router`, `react-router-dom` | **6.x** (6.30.x) | `@ionic/react-router@9` richiede `>=6.4.0 <7`: **non** installare v7/v8 (sono le `latest` su npm) |
| `vue-router` | 5.x | Richiesto da Ionic Vue 9 (v4 non supportato) |
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` | 8.5.x | Node ≥ 22; Xcode ≥ 26, iOS ≥ 15; Android Studio Otter 2025.2.1+, minSdk 24, compile/targetSdk 36, Gradle 8.14.3, Kotlin 2.2.20 |
| `@capacitor/preferences`, `status-bar`, `splash-screen`, `app`, `haptics`, `keyboard`, `push-notifications` | 8.x | Stessa major di `@capacitor/core` |
| `@capacitor-community/admob` | 8.1.x | Capacitor 8, iOS ≥ 15, API ≥ 24; UMP e ATT inclusi |
| `@revenuecat/purchases-capacitor` (+ `-ui`) | 13.6.x | Capacitor ≥ 8; `-ui` alla **stessa** versione del core |
| `@ngx-translate/core`, `@ngx-translate/http-loader` | 18.x | Angular ≥ 18; `TranslateModule` **non esiste più** |
| `react-i18next` / `i18next` | 17.x / 26.x | |
| `vue-i18n` | 11.x | Solo Composition API (`legacy: false`) |
| `ionicons` | 8.x | |
| `swiper` | 14.x | Solo se l'onboarding usa slide |

## 3. Creazione del progetto

```bash
npm i -g @ionic/cli            # oppure: npx @ionic/cli start ...
ionic start <nome> blank --type=angular-standalone --capacitor --package-id=<bundle.id>
ionic start <nome> blank --type=react              --capacitor --package-id=<bundle.id>
ionic start <nome> blank --type=vue                --capacitor --package-id=<bundle.id>
cd <nome>
```

Subito dopo:

1. Controlla `package.json`: `@ionic/*` deve essere `^9`; se lo starter è indietro, esegui
   i comandi di upgrade in `references/migration-ionic8-to-9.md`.
2. Porta Capacitor all'ultima 8.x e aggiungi le piattaforme richieste (major esplicite,
   mai `@latest`): `npm i @capacitor/core@8 @capacitor/cli@8 @capacitor/ios@8 @capacitor/android@8`
   poi `npx cap add ios` / `npx cap add android`.
3. Verifica `capacitor.config.ts`: `appId` = bundle ID, `appName`, `webDir` (`www` per
   Angular, `dist` per React/Vue con Vite). Dettagli in `references/capacitor.md`.
4. Installa **solo** i plugin che servono davvero, alla major 8 (`@capacitor/preferences@8`
   quasi sempre; `status-bar`, `splash-screen`, `app`, `keyboard`, `haptics` secondo
   necessità) e poi `npx cap sync`.
5. Rimuovi le pagine generate dallo starter che non userai.

Il template `tabs` dello starter va bene come base, ma controlla che rispetti le regole
qui sotto (import da `@ionic/angular`, React Router 6, vue-router 5).

## 4. Regole non negoziabili

**Tutti i framework**

- Persistenza: `@capacitor/preferences` (stringhe; JSON serializzato). Mai `localStorage`
  diretto, mai `@ionic/storage`. Per dati voluminosi o query: SQLite, non Preferences.
- Tab: `ion-tabs` + `ion-tab-bar` con una route figlia per tab. Mai tab bar custom.
- Plugin nativi: sempre `await`, sempre dietro `Capacitor.isNativePlatform()` (o
  `Capacitor.isPluginAvailable(...)`) quando la funzione non ha implementazione web.
- Solo plugin Capacitor: mai `cordova-plugin-*`, mai librerie ads/IAP deprecate.
- TypeScript strict, niente `any`; ogni stringa visibile passa dall'i18n se l'app ha
  più di una lingua.
- Nessun valore arbitrario "di default": lingue, prezzi, badge sconto, ID pubblicitari,
  URL di video demo, chiavi API. I prezzi arrivano dallo store (RevenueCat), gli ID dalla
  console del progetto, i testi dalle traduzioni.
- Inizializzazioni **all'avvio, una volta sola** e nell'ordine giusto: tema (prima del
  primo render), lingua (prima del primo render), poi i moduli richiesti (RevenueCat
  `configure`, listener push, AdMob `initialize` + consenso). Ogni init dei plugin è una
  **promessa memoizzata** (stessa promessa per tutti i chiamanti, scartata su errore per
  permettere il retry) e le operazioni dipendenti la **attendono**. Le init avviate senza
  `await` terminano con `.catch((e) => reportError('scope', e))` (`reportError`: helper del
  progetto, console in dev e telemetria in prod se presente), mai `void` nudo. Una
  funzione di init scritta ma mai chiamata è un bug.
- Gli esempi base dei reference sono **a una lingua e senza** moduli opzionali (etichette
  statiche, nessun `translate`/`useTranslation`/`useI18n`); il multilingua e i moduli
  stanno in sezioni "solo se richiesto". Non copiare le aggiunte se non sono state chieste.
- Angular: `inject()` solo in modo sincrono, **prima del primo `await`** (initializer,
  guardie), altrimenti NG0203.
- Niente flag "di test" fissi nel codice (`isTesting: true`, `initializeForTesting: true`,
  log `DEBUG`): derivali dall'ambiente di build.
- Paywall, ads, onboarding, video di sfondo: **moduli opzionali**. Non imporli mai.

**Angular** (`references/angular.md`)

- Standalone + `bootstrapApplication` + `provideIonicAngular()`; `IonicModule` è
  deprecato. In Ionic 9 componenti e provider si importano da **`@ionic/angular`**
  (il sottopercorso `@ionic/angular/standalone` non è più esportato).
- `inject()`, signals, control flow `@if/@for`, `templateUrl` + `styleUrl` su file
  separati. Angular 22 è zoneless e OnPush di default: lo stato asincrono va nei signal.
- ngx-translate 18: `provideTranslateService` + `provideTranslateHttpLoader`;
  `TranslatePipe` nei componenti.

**React** (`references/react.md`)

- Componenti funzionali; ogni pagina dentro `<IonPage>`.
- React Router **6**: `element={...}`, `<Navigate replace />`, route padre con `/*`,
  `useNavigate`/`useParams`/`useIonRouter`. Niente API v5 (`component`, `exact`,
  `Redirect`, `useHistory`, `RouteComponentProps`).

**Vue** (`references/vue.md`)

- `<script setup lang="ts">`, ogni pagina dentro `<ion-page>`.
- vue-router 5: guardie con **valore di ritorno**, non `next()`. `toRaw()` prima di
  passare oggetti reattivi ai plugin Capacitor.

## 5. Quale reference leggere

| Quando | Leggi |
|---|---|
| Configuri l'app Angular (bootstrap, provider, signal, zoneless, import) | `references/angular.md` |
| Configuri l'app React (router 6, IonReactRouter, hook) | `references/react.md` |
| Configuri l'app Vue (IonicVue, vue-router 5, composable) | `references/vue.md` |
| Capacitor: config, plugin base, Preferences, sync/run, requisiti nativi, icone/splash | `references/capacitor.md` |
| Tab, route, pagine di dettaglio, guardie, back button | `references/navigation-tabs.md` |
| Tema, colori, dark mode (palette importata, classe, preferenza persistita) | `references/theming-dark-mode.md` |
| Lingue: setup per framework, lingua persistita e fallback | `references/i18n.md` |
| Notifiche push: permessi, listener, token, canali Android | `references/push-notifications.md` |
| **Modulo opzionale** abbonamenti/paywall RevenueCat | `references/module-purchases-revenuecat.md` |
| **Modulo opzionale** AdMob (UMP, ATT, banner/interstitial/rewarded, premium senza ads) | `references/module-ads-admob.md` |
| **Modulo opzionale** onboarding (slide, video, guardia) | `references/module-onboarding.md` |
| Build di release, firma, TestFlight, Play Console, privacy | `references/release-stores.md` |
| Progetto esistente su Ionic 8 / Capacitor 7 / React Router 5 | `references/migration-ionic8-to-9.md` |

## 6. Flusso di lavoro consigliato

1. Domande (§1) → scaffolding (§3) → `capacitor.config.ts`.
2. Struttura: route, `ion-tabs`, pagine vuote con titolo. Build e `npx cap run` su un
   device o simulatore **prima** di aggiungere plugin.
3. Tema e dark mode; i18n se multilingua; pagina Impostazioni (lingua, tema, e solo se
   presenti: notifiche, abbonamento, privacy ads).
4. Plugin nativi richiesti, uno alla volta: install → `npx cap sync` → prova su device.
5. Moduli opzionali richiesti, con le loro configurazioni native (Info.plist, manifest).
6. Checklist (§8) → release (`references/release-stores.md`).

## 7. Dopo ogni modifica

```bash
npm install                      # se hai toccato package.json
npm run build                    # Angular: npx ng build; React/Vue: vite build
npx cap sync                     # SEMPRE dopo un build e dopo ogni plugin nuovo
npx cap run ios   # oppure: npx cap open ios      (Xcode)
npx cap run android # oppure: npx cap open android (Android Studio)
```

- `ionic serve` (browser) va bene per layout e logica web; tutto ciò che è nativo si
  prova su device/simulatore. Live reload su device: `ionic cap run android -l --external`.
- Lint e type-check del progetto (`npm run lint`, `tsc`/`vue-tsc`/`ng build`) devono
  passare prima di dichiarare finito.
- Se cambi `capacitor.config.ts`, plugin o versioni native: `npx cap sync`, e in caso di
  errori di build nativa apri il progetto in Xcode/Android Studio e leggi il log reale.

## 8. Checklist prima di consegnare

- [ ] Build web e `npx cap sync` puliti; app avviata su iOS e/o Android reali o simulati.
- [ ] `appId`/`appName` corretti; icone e splash generati (`@capacitor/assets`).
- [ ] Import Ionic corretti per il framework (`@ionic/angular`, `@ionic/react`, `@ionic/vue`).
- [ ] Tab e route lazy; guardie funzionanti; pagine di dettaglio con back button.
- [ ] Dark mode: palette **importata**, classe `ion-palette-dark` applicata all'avvio dalla
      preferenza salvata, opzione "sistema" che segue `prefers-color-scheme`.
- [ ] Lingua (se multilingua): salvata in Preferences, **riletta all'avvio**, fallback
      deciso dal progetto, nessuna stringa hardcoded; se una sola lingua, nessuna
      dipendenza i18n installata.
- [ ] Push (se richieste): listener registrati all'avvio prima di `register()`, permesso
      chiesto in un momento sensato, token inviato al backend, canale Android creato.
- [ ] RevenueCat (se richiesto): `configure` chiamato all'avvio, acquisto reale con
      `purchasePackage`, restore da tasto visibile, entitlement verificato per nome,
      prezzi dallo store.
- [ ] AdMob (se richiesto): UMP `requestConsentInfo`/`showConsentForm`, ATT su iOS,
      ID e flag di test solo in dev; niente annunci ai premium se previsto dal prodotto.
- [ ] Onboarding (se richiesto): flag persistito, guardia, asset locali, reset solo se voluto.
- [ ] Nessun `console.log` di debug, nessuna chiave o ID di test nel build di release.
- [ ] Permessi nativi dichiarati (Info.plist / AndroidManifest) solo per ciò che l'app usa.

## 9. Errori tipici da non ripetere

- Servizio RevenueCat/tema/lingua con `init()` scritto ma mai invocato all'avvio.
- Tasto "Abbonati" che naviga senza chiamare `purchasePackage`.
- AdMob inizializzato senza consenso UMP né ATT, con `isTesting: true` fisso.
- `classList.toggle('ion-palette-dark')` senza aver importato `palettes/dark.class.css`.
- ngx-translate con `TranslateModule.forRoot` (rimosso in v18) o `setDefaultLang` (ora
  `setFallbackLang`); `currentLang` è un signal: `currentLang()`.
- Lingua salvata in Preferences ma mai riletta al boot.
- Push: `register()` senza permesso e senza listener, o listener aggiunti dopo;
  `initPush()` chiamata senza i gestori (token → backend, tap → navigazione).
- Init non memoizzate: doppio `configure()`/doppi listener con `StrictMode` o chiamate
  concorrenti, e `getPackages()` che risponde "vuoto" mentre l'init è in corso.
- `inject()` dopo un `await` in un initializer o in una guardia (NG0203).
- `launchAutoHide: false` senza `SplashScreen.hide()`: app ferma sullo splash.
- AdMob: consenso letto una volta sola e mai riletto dopo "Opzioni privacy"; ATT chiesta
  a mano anche se il messaggio IDFA è già gestito dal form UMP.
- React con `react-router@5` o `@7`, `component=`, `Redirect`, `exact`.
- Import da `@ionic/angular/standalone` o `IonicModule` in Ionic 9.
- `swiper` in `package.json` ma nessuna slide nel codice.
