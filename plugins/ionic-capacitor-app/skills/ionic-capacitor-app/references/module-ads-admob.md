# Modulo opzionale: annunci AdMob (UMP, ATT, banner/interstitial/rewarded)

**Solo se il progetto monetizza con annunci.** Fonti: README del plugin
<https://github.com/capacitor-community/admob>, UMP iOS
<https://developers.google.com/admob/ios/privacy>, messaggio IDFA/ATT
<https://developers.google.com/admob/ios/privacy/idfa>, ID di test
<https://developers.google.com/admob/android/test-ads> e
<https://developers.google.com/admob/ios/test-ads>. Verificato il 2026-09-26:
`@capacitor-community/admob` **8.1.x** (Capacitor 8, iOS ≥ 15, Android API ≥ 24), con
supporto **UMP** (User Messaging Platform, consenso GDPR/US) e **ATT** (App Tracking
Transparency, iOS) integrato.

## Prima di scrivere codice, chiedi

- App ID AdMob per iOS e Android e gli ad unit ID per ogni formato (banner, interstitial,
  rewarded). Vanno in un file di configurazione, con valori di test in sviluppo.
- Formati e posizioni (banner sotto le tab? interstitial a quali eventi? rewarded per
  cosa?).
- Se il progetto prevede un livello premium (RevenueCat) **e** se il premium rimuove gli
  annunci: è una scelta di prodotto, non un automatismo.
- Messaggi UMP (GDPR/US e, per iOS, il messaggio IDFA/ATT) nella console AdMob → Privacy &
  messaging: senza messaggi pubblicati `showConsentForm` non ha nulla da mostrare.

```bash
npm i @capacitor-community/admob@8 && npx cap sync
```

## Configurazione nativa

**iOS** (`ios/App/App/Info.plist`, nel `<dict>` principale):

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>
<key>SKAdNetworkItems</key>
<array>
  <dict><key>SKAdNetworkIdentifier</key><string>cstr6suwn9.skadnetwork</string></dict>
  <!-- aggiungi l'elenco completo dalla doc Google Mobile Ads iOS -->
</array>
<key>NSUserTrackingUsageDescription</key>
<string>Testo che spiega perché chiedi il tracciamento (tradotto in InfoPlist.strings)</string>
```

**Android** (`android/app/src/main/AndroidManifest.xml`, dentro `<application>`):

```xml
<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="@string/admob_app_id" />
```

e in `android/app/src/main/res/values/strings.xml` `<string name="admob_app_id">ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>`.

In sviluppo usa gli **App ID e ad unit ID di test** pubblicati da Google (link sopra). Ad
unit di test verificati: banner fisso Android `ca-app-pub-3940256099942544/6300978111`, iOS
`ca-app-pub-3940256099942544/2934735716`; banner adattivo Android `.../9214589741`, iOS
`.../2435281174`; interstitial Android `.../1033173712`, iOS `.../4411468910`; rewarded
Android `.../5224354917`, iOS `.../1712485313`. Emulatori e simulatori sono già device di
test; un device reale va aggiunto a `testingDevices` con l'ID stampato nel log (logcat /
console Xcode). **Mai** ID di test o `isTesting: true` in release.

## ATT su iOS: due alternative (scegline una)

- **A — messaggio IDFA in UMP (consigliata)**: nella console AdMob crei anche il messaggio
  IDFA/ATT. Dalla doc Google: "The UMP SDK lets you present an IDFA message to your users
  before requesting their consent for App Tracking Transparency (ATT)": il flusso
  `showConsentForm` mostra la spiegazione e porta al prompt di sistema. **Non** chiamare
  `requestTrackingAuthorization()` a mano. `NSUserTrackingUsageDescription` resta
  obbligatorio. Verifica su device che il prompt appaia dal form.
- **B — senza messaggio IDFA in UMP**: chiami tu `AdMob.requestTrackingAuthorization()`
  (se `trackingAuthorizationStatus()` è `notDetermined`), dopo una tua schermata di
  spiegazione e **prima** di caricare annunci (è l'esempio del README del plugin).

In entrambi i casi, se l'utente nega ATT gli annunci si richiedono lo stesso: "The Google
Mobile Ads SDK doesn't send IDFA in the ad request" (doc Google).

## Inizializzazione con consenso

Ordine documentato dal plugin: `initialize` → `requestConsentInfo` → `showConsentForm`
(se richiesto) → annunci. Init **memoizzata** con retry su errore; il consenso viene
**riletto** dopo il form delle opzioni privacy e **ricontrollato** prima di ogni richiesta.

```ts
// src/core/ads.ts
import { Capacitor } from '@capacitor/core';
import {
  AdMob, AdmobConsentStatus, AdmobConsentDebugGeography,
  BannerAdSize, BannerAdPosition, BannerAdPluginEvents,
} from '@capacitor-community/admob';

const DEV = import.meta.env.DEV;                       // Angular: isDevMode()
const ATT_MANUAL = false;                              // true = alternativa B
const IDS = {                                          // dal progetto; qui gli ID di test Google
  banner: { ios: 'ca-app-pub-3940256099942544/2934735716', android: 'ca-app-pub-3940256099942544/6300978111' },
  interstitial: { ios: 'ca-app-pub-3940256099942544/4411468910', android: 'ca-app-pub-3940256099942544/1033173712' },
  rewarded: { ios: 'ca-app-pub-3940256099942544/1712485313', android: 'ca-app-pub-3940256099942544/5224354917' },
};
const platform = () => (Capacitor.getPlatform() === 'ios' ? 'ios' : 'android');

let initPromise: Promise<void> | null = null;
let canRequestAds = false;

/** All'avvio; memoizzata. Su errore (rete, SDK) la promessa viene scartata: il prossimo tentativo ritenta. */
export function initAds(): Promise<void> {
  if (!initPromise) {
    initPromise = doInit().catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}

async function doInit(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await AdMob.initialize({ initializeForTesting: DEV, testingDevices: DEV ? ['DEVICE_ID_DI_TEST'] : [] });

  if (ATT_MANUAL && Capacitor.getPlatform() === 'ios') {          // alternativa B
    const { status } = await AdMob.trackingAuthorizationStatus();
    if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
  }
  await refreshConsent(true);
}

/** Rilegge lo stato UMP; con showFormIfRequired mostra il form se il consenso è richiesto. */
export async function refreshConsent(showFormIfRequired = false): Promise<boolean> {
  let consent = await AdMob.requestConsentInfo(
    DEV ? { debugGeography: AdmobConsentDebugGeography.EEA, testDeviceIdentifiers: ['DEVICE_ID_DI_TEST'] } : undefined,
  );
  if (showFormIfRequired && consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
    consent = await AdMob.showConsentForm();
  }
  canRequestAds = consent.canRequestAds;
  return canRequestAds;
}

/** Impostazioni → "Opzioni privacy": l'utente può cambiare il consenso; poi lo rileggiamo. */
export async function showPrivacyOptions(): Promise<void> {
  await AdMob.showPrivacyOptionsForm();
  await refreshConsent();
}

/** Prima di ogni richiesta: init (con retry) e consenso aggiornato. */
async function ready(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try { await initAds(); } catch { return false; }
  return canRequestAds || refreshConsent();
}

export async function showBanner(): Promise<void> {
  if (!(await ready())) return;
  await AdMob.showBanner({
    adId: IDS.banner[platform()],
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
    isTesting: DEV,
  });
}
export const hideBanner = () => AdMob.hideBanner();
export const resumeBanner = () => AdMob.resumeBanner();
export const removeBanner = () => AdMob.removeBanner();

/** Prepara in anticipo, mostra a una pausa naturale, con frequency cap. */
export async function showInterstitial(): Promise<void> {
  if (!(await ready())) return;
  await AdMob.prepareInterstitial({ adId: IDS.interstitial[platform()], isTesting: DEV });
  await AdMob.showInterstitial();
}

export async function showRewarded(): Promise<{ type: string; amount: number } | null> {
  if (!(await ready())) return null;
  await AdMob.prepareRewardVideoAd({ adId: IDS.rewarded[platform()], isTesting: DEV });
  return AdMob.showRewardVideoAd();          // { type, amount }: assegna il premio solo qui
}

export function listenBannerSize(cb: (heightPx: number) => void) {
  return AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => cb(height));
}
```

- Se l'utente **rifiuta** il consenso, `canRequestAds` può restare `false` e gli annunci
  non partono: è il comportamento corretto, non un bug. In test, con il form rifiutato,
  gli annunci possono non caricarsi anche con gli ID di test.
- `resetConsentInfo()` serve solo in sviluppo per rivedere il form.
- Ascolta `InterstitialAdPluginEvents.Dismissed` / `RewardAdPluginEvents.Rewarded` se ti
  serve reagire (ripreparare l'annuncio, sbloccare il premio).

## Se il progetto prevede "premium = senza annunci"

- All'avvio, dopo `initPurchases()`:
  `if (!(await isPremium())) initAds().catch((e) => reportError('ads.init', e));`
  (mai `void` nudo: la promessa scartata consente il retry al prossimo `ready()`).
- Iscriviti a `onPremiumChange` (vedi `module-purchases-revenuecat.md`): quando diventa
  premium → `removeBanner()` e non mostrare più interstitial; in ogni `show*` controlla
  lo stato premium prima di `ready()`.
- La voce "Rimuovi annunci" nelle Impostazioni porta al paywall e sparisce se premium.

## Banner e ion-tabs

Il banner è una vista nativa sopra il WebView: in `BOTTOM_CENTER` copre la tab bar.
Soluzione: ascolta `SizeChanged` e sposta la UI con una variabile CSS.

```ts
listenBannerSize((h) => document.documentElement.style.setProperty('--admob-banner-h', `${h}px`));
```

```css
ion-tab-bar { margin-bottom: var(--admob-banner-h, 0px); }
```

Mostra il banner entrando nelle tab (`ionViewWillEnter`/`useIonViewWillEnter`/
`onIonViewWillEnter` della pagina Tabs) e nascondilo (`hideBanner`) nelle pagine full-screen
(paywall, onboarding, player). Verifica su device reale con safe area.

## Store e policy

- iOS: ATT è obbligatorio prima di qualsiasi tracciamento; le etichette privacy in App
  Store Connect devono dichiarare i dati usati per la pubblicità.
- Android: nel Play Console dichiara "Contiene annunci" e compila Data safety
  coerentemente con l'SDK Google Mobile Ads.
- Non cliccare i propri annunci reali; in sviluppo solo ID di test o device di test.
- Utenti minori / app per famiglie: `tagForChildDirectedTreatment`,
  `tagForUnderAgeOfConsent`, `maxAdContentRating` in `initialize`.
