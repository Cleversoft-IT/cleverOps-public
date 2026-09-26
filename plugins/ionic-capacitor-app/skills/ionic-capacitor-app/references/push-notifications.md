# Notifiche push (@capacitor/push-notifications 8.x)

Fonte: <https://capacitorjs.com/docs/apis/push-notifications>. Verificato il 2026-09-26:
`@capacitor/push-notifications` 8.1.x (Capacitor ≥ 8). Solo se il progetto le richiede.
Il plugin usa **APNs** su iOS e **FCM** su Android; per token FCM anche su iOS (backend
unico via Firebase) valuta `@capacitor-firebase/messaging`
(<https://github.com/capawesome-team/capacitor-firebase/tree/main/packages/messaging>).

```bash
npm i @capacitor/push-notifications@8 && npx cap sync
```

## Regole

1. I **listener** si registrano all'avvio, **una sola volta** e **prima** di `register()`:
   altrimenti si perdono `registration` e la notifica che ha aperto l'app, oppure si
   duplicano (doppio invio token, doppia navigazione). `enablePush()` attende l'init,
   quindi non può registrare senza listener.
2. `register()` solo dopo `requestPermissions()` con esito `granted`; il permesso si chiede
   in un momento sensato (toggle in Impostazioni, passo di onboarding, dopo un'azione che
   lo giustifica), **non** al primo avvio a freddo. Su Android 13+ è un permesso runtime
   (`POST_NOTIFICATIONS`), su Android < 13 `requestPermissions` risponde `granted` subito.
3. Se il permesso era già `granted`, al boot chiama `register()` per rinnovare il token e
   inviarlo al backend (i token cambiano).
4. Tutto è nativo: proteggi con `Capacitor.isNativePlatform()`.
5. Android 8+: crea un **canale** (`createChannel`) prima della prima notifica, altrimenti
   la notifica non è visibile o non ha suono.
6. **Push silenziose iOS** (`content-available`, senza UI): dalla doc, "This plugin does not
   support iOS Silent Push (Remote Notifications)": abilitare Background Modes → Remote
   notifications **non basta**; servono codice nativo (doc Apple "Pushing background
   updates") o un altro plugin. Su Android le notifiche data-only sono supportate, ma
   `pushNotificationReceived` non viene chiamato se l'app è stata chiusa.

## Configurazione nativa

`capacitor.config.ts` (come mostrare le notifiche in foreground su iOS):

```ts
plugins: { PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] } }
```

**iOS**

- Xcode → target App → Signing & Capabilities → `+ Push Notifications`.
- Apple Developer → chiave APNs (`.p8`) da caricare sul backend (o su Firebase).
- `ios/App/App/AppDelegate.swift`: il template Capacitor 8 **non** contiene i due handler;
  aggiungili nella classe `AppDelegate`:

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}

func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
  NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

- Le push **non** funzionano nel simulatore con APNs reale; usa un device (oppure
  `xcrun simctl push <udid> <bundle.id> payload.apns` per provare solo la UI).

**Android**

- Progetto Firebase → app Android con lo stesso `applicationId` → scarica
  `google-services.json` in `android/app/`.
- Il template Capacitor applica già il plugin `com.google.gms.google-services` se il file
  è presente: verifica in `android/app/build.gradle` e `android/build.gradle`.
- Icona notifica (bianco su trasparente) nel manifest, dalla doc:
  `<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@mipmap/push_icon_name" />`;
  senza, Android usa l'icona dell'app (spesso un quadrato bianco).

## Servizio condiviso

Due fasi separate: la **registrazione dei listener** avviene una sola volta (e se fallisce
a metà rimuove gli handle già creati, così un retry non li duplica); la parte
**ritentabile** (canale, rinnovo token) può fallire e ripartire senza toccare i listener.

```ts
// src/core/push.ts
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications, type PushNotificationSchema, type ActionPerformed } from '@capacitor/push-notifications';
import { reportError } from './report-error';   // helper del progetto: console in dev, telemetria in prod

const KEY = 'pushEnabled';

export type PushHandlers = {
  onToken: (token: string) => Promise<void>;                 // invia al backend (obbligatorio)
  onReceived?: (n: PushNotificationSchema) => void;          // app in foreground: toast/badge
  onAction?: (a: ActionPerformed) => void;                   // tap: naviga usando a.notification.data
};

let listenersPromise: Promise<void> | null = null;   // fase 1: una sola volta
let initPromise: Promise<void> | null = null;        // fase 2: ritentabile

/** All'avvio, una volta: memoizzata (richiamarla è innocuo; su errore si può ritentare). */
export function initPush(handlers: PushHandlers): Promise<void> {
  if (!initPromise) {
    initPromise = doInit(handlers).catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}

async function doInit(handlers: PushHandlers): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await ensureListeners(handlers);                                 // 1) listener PRIMA di register()

  if (Capacitor.getPlatform() === 'android') {                     // 2) parte ritentabile
    await PushNotifications.createChannel({
      id: 'default', name: 'General', description: 'General notifications', importance: 4, visibility: 1,
    });
  }
  const { value } = await Preferences.get({ key: KEY });           // 3) se già consentito, rinnova il token
  const { receive } = await PushNotifications.checkPermissions();
  if (value === 'true' && receive === 'granted') await PushNotifications.register();
}

function ensureListeners(handlers: PushHandlers): Promise<void> {
  if (!listenersPromise) {
    listenersPromise = addListeners(handlers).catch((e) => { listenersPromise = null; throw e; });
  }
  return listenersPromise;
}

async function addListeners(handlers: PushHandlers): Promise<void> {
  const handles: PluginListenerHandle[] = [];
  try {
    handles.push(await PushNotifications.addListener('registration', ({ value }) => {
      handlers.onToken(value).catch((e) => reportError('push.onToken', e));
    }));
    handles.push(await PushNotifications.addListener('registrationError', (err) => reportError('push.registration', err)));
    handles.push(await PushNotifications.addListener('pushNotificationReceived', (n) => handlers.onReceived?.(n)));
    handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (a) => handlers.onAction?.(a)));
  } catch (e) {
    await Promise.all(handles.map((h) => h.remove()));             // niente listener orfani da duplicare
    throw e;
  }
}

/** Da un'azione dell'utente (toggle, passo di onboarding). Richiede initPush() all'avvio. */
export async function enablePush(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (!initPromise) throw new Error('initPush() va chiamata all\'avvio, prima di enablePush()');
  await initPromise;                                               // listener garantiti

  let { receive } = await PushNotifications.checkPermissions();
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    ({ receive } = await PushNotifications.requestPermissions());
  }
  if (receive !== 'granted') {
    await Preferences.set({ key: KEY, value: 'false' });
    return false;                       // 'denied': spiega come riattivare dalle impostazioni di sistema
  }
  await PushNotifications.register();
  await Preferences.set({ key: KEY, value: 'true' });
  return true;
}

export async function disablePush(): Promise<void> {
  await Preferences.set({ key: KEY, value: 'false' });
  if (Capacitor.isNativePlatform()) await PushNotifications.unregister();
  // e informa il backend di rimuovere il token
}
```

- Il nome del canale va tradotto (`name`/`description` dalla lingua corrente); `importance`
  1-5 (4 = alta, con suono), `visibility` -1/0/1.
- `pushNotificationActionPerformed` arriva anche quando la notifica ha **avviato** l'app:
  i listener devono esistere prima del primo redirect del router, e la navigazione deve
  attendere che l'app sia pronta (`router.isReady()` in Vue, dopo il bootstrap in
  React/Angular).
- Il payload di navigazione sta in `notification.data` (es. `{ route: '/tabs/home/42' }`);
  valida sempre il valore prima di navigare.

## Chiamate complete per framework

**Angular** — servizio con dipendenze acquisite nei field initializer:

```ts
// src/app/core/push.service.ts
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { initPush } from './push';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  init(): Promise<void> {
    return initPush({
      onToken: (token) => this.api.registerDevice(token),
      onAction: ({ notification }) => {
        const route = notification.data?.route;
        if (typeof route === 'string' && route.startsWith('/')) void this.router.navigateByUrl(route);
      },
    });
  }
}
```

Registrato in `provideAppInitializer` (vedi `angular.md`, sezione "Aggiunte"): `inject(PushService)`
prima del primo `await`, poi `push.init().catch((e) => reportError('push.init', e))`.

**React** — componente `PushBootstrap` dentro `IonReactRouter` (codice in `react.md`):
`initPush({ onToken: api.registerDevice, onAction: → useIonRouter().push(route) }).catch(...)`.

**Vue** — dopo `app.mount` (codice in `vue.md`): `initPush({ onToken, onAction: → router.push(route) }).catch(...)`.

**Toggle Impostazioni** (tutti): `enablePush()` → aggiorna lo stato con il booleano
restituito; `disablePush()` sul toggle off.

## Test

- Device reale; Firebase Console → Messaging → messaggio di prova con il token stampato in
  log (solo in dev).
- Verifica i tre stati: app in foreground (`pushNotificationReceived`), in background e
  chiusa (tap → `pushNotificationActionPerformed`).
- Verifica il rifiuto del permesso e la riattivazione dalle impostazioni di sistema.
- Simula un errore nella parte ritentabile (es. `createChannel`) e verifica che il retry
  non produca doppi invii del token.

Notifiche **locali** (promemoria pianificati): plugin separato `@capacitor/local-notifications`
(<https://capacitorjs.com/docs/apis/local-notifications>).
