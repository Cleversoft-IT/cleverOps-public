# Modulo opzionale: abbonamenti e paywall con RevenueCat

**Solo se il progetto vende abbonamenti o acquisti in-app.** Fonti: installazione Capacitor
<https://www.revenuecat.com/docs/getting-started/installation/capacitor>, acquisti
<https://www.revenuecat.com/docs/getting-started/making-purchases>, restore
<https://www.revenuecat.com/docs/getting-started/restoring-purchases>, Paywalls
<https://www.revenuecat.com/docs/tools/paywalls/displaying-paywalls>, README del plugin UI
<https://github.com/RevenueCat/purchases-capacitor>. Verificato il 2026-09-26:
`@revenuecat/purchases-capacitor` **13.6.x** (Capacitor ≥ 8) e
`@revenuecat/purchases-capacitor-ui` alla **stessa versione** (Paywalls e Customer Center).

## Prima di scrivere codice, chiedi

- ID dell'**entitlement** (es. `pro`), offering e package configurati nella dashboard
  RevenueCat (identici su App Store Connect e Play Console).
- Chiavi API pubbliche per piattaforma (`appl_...`, `goog_...`); se serve il web,
  RevenueCat Web Billing ha una chiave diversa e un SDK diverso.
- Paywall: **Paywalls di RevenueCat** (configurato nella dashboard, mostrato con
  `RevenueCatUI`) o paywall custom nell'app. Preferisci il primo se non ci sono vincoli di
  design: gestisce prezzi, localizzazione, restore e conformità.
- Quando mostrarlo (dopo l'onboarding, da "Passa a Premium" nelle Impostazioni, al primo
  accesso a una funzione premium) e se l'app ha un **livello gratuito** (paywall
  chiudibile) o è solo a pagamento (hard paywall): lo decide il progetto.

## Installazione

```bash
npm i @revenuecat/purchases-capacitor@13 @revenuecat/purchases-capacitor-ui@13 && npx cap sync
```

- iOS: Xcode → target App → Signing & Capabilities → `+ In-App Purchase`; per i test locali
  un file StoreKit Configuration nello scheme.
- Android: in `AndroidManifest.xml` l'activity deve avere `android:launchMode="singleTop"`
  (o `standard`), altrimenti l'acquisto si annulla quando l'app va in background per la
  verifica del pagamento.

## Servizio condiviso

L'inizializzazione è una **promessa memoizzata**: chiunque (bootstrap, pagina paywall,
Impostazioni) chiama `initPurchases()` e ottiene la stessa promessa; nessuna doppia
`configure()`, nessun doppio listener. **Tutte** le operazioni passano da `ensureStore()`,
che attende l'init e lancia `StoreUnavailableError` su web o init fallita: nessuna chiamata
raggiunge il plugin se lo store non c'è, e le query ("sono premium?", "che package ci
sono?") traducono l'errore in un valore esplicito.

```ts
// src/core/purchases.ts
import { Capacitor } from '@capacitor/core';
import {
  Purchases, LOG_LEVEL, PURCHASES_ERROR_CODE,
  type CustomerInfo, type PurchasesPackage, type PurchasesError,
} from '@revenuecat/purchases-capacitor';
import { RevenueCatUI, PaywallResultEnum } from '@revenuecat/purchases-capacitor-ui';

export const ENTITLEMENT = 'pro';                          // dal progetto
const API_KEYS = { ios: 'appl_xxx', android: 'goog_xxx' }; // dal progetto (chiavi pubbliche SDK)
const DEV = import.meta.env.DEV;                           // Angular: isDevMode()

export class StoreUnavailableError extends Error {
  constructor() { super('store-unavailable'); this.name = 'StoreUnavailableError'; }
}

const listeners = new Set<(premium: boolean) => void>();
let initPromise: Promise<boolean> | null = null;           // true = SDK configurato

export const hasEntitlement = (info: CustomerInfo) => info.entitlements.active[ENTITLEMENT] !== undefined;

/** Una sola volta all'avvio; memoizzata. Su errore la promessa viene scartata: retry possibile. */
export function initPurchases(): Promise<boolean> {
  if (!initPromise) {
    initPromise = configure().catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}

async function configure(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;         // web: nessuno store (Web Billing è un altro SDK)
  await Purchases.setLogLevel({ level: DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN });
  await Purchases.configure({ apiKey: Capacitor.getPlatform() === 'ios' ? API_KEYS.ios : API_KEYS.android });
  // tiene lo stato premium aggiornato (rinnovi, scadenze, restore, acquisti da altri device)
  await Purchases.addCustomerInfoUpdateListener((info) => listeners.forEach((l) => l(hasEntitlement(info))));
  return true;
}

/** Unico punto di controllo: attende l'init; StoreUnavailableError su web o init fallita. */
async function ensureStore(): Promise<void> {
  const ok = await initPurchases().catch(() => false);
  if (!ok) throw new StoreUnavailableError();
}

export function onPremiumChange(cb: (premium: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** false anche quando lo store non è disponibile (web, init fallita). */
export async function isPremium(): Promise<boolean> {
  try { await ensureStore(); } catch { return false; }
  const { customerInfo } = await Purchases.getCustomerInfo();
  return hasEntitlement(customerInfo);
}

/** null = store non disponibile; [] = offering corrente senza package. */
export async function getPackages(): Promise<PurchasesPackage[] | null> {
  try { await ensureStore(); } catch { return null; }
  const offerings = await Purchases.getOfferings();          // restituisce PurchasesOfferings
  return offerings.current?.availablePackages ?? [];
}

/** Acquisto reale. true = entitlement attivo; false = annullato; StoreUnavailableError o PurchasesError altrimenti. */
export async function purchase(pkg: PurchasesPackage): Promise<boolean> {
  await ensureStore();
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    return hasEntitlement(customerInfo);
  } catch (e) {
    const err = e as PurchasesError;
    if (err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw err;                                               // mostra un messaggio tradotto/generico
  }
}

/** Solo da un tasto "Ripristina acquisti" premuto dall'utente. */
export async function restore(): Promise<boolean> {
  await ensureStore();
  const { customerInfo } = await Purchases.restorePurchases();
  return hasEntitlement(customerInfo);
}

/** Paywall configurato nella dashboard (Paywalls, solo nativo). true = l'utente ha accesso al termine. */
export async function showPaywallIfNeeded(): Promise<boolean> {
  try { await ensureStore(); } catch { return false; }
  const { result } = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: ENTITLEMENT,
    displayCloseButton: true,                                // false per un hard paywall (scelta di prodotto)
  });
  return result === PaywallResultEnum.PURCHASED || result === PaywallResultEnum.RESTORED || result === PaywallResultEnum.NOT_PRESENTED;
}

/** Customer Center (solo nativo): gestione/cancellazione abbonamento, richieste di rimborso. */
export async function showCustomerCenter(): Promise<void> {
  await ensureStore();
  await RevenueCatUI.presentCustomerCenter();
}
```

- In Vue passa `toRaw(pkg)` a `purchase()`.
- `configure` va avviato **all'avvio** (Angular `provideAppInitializer` con
  `purchases.init().catch(...)`, React `useEffect` in `App` con `initPurchases().catch(...)`,
  Vue dopo il mount), così lo stato premium e le offerte sono pronti prima che servano. Se
  l'avvio anticipato manca, `ensureStore()` inizializza comunque alla prima operazione, ma
  quella prima chiamata paga l'attesa di `configure()`. Grazie alla memoizzazione,
  `isPremium()` chiamato subito dopo l'avvio attende la stessa `configure()`.
- Nelle azioni dell'utente (`purchase`, `restore`, `showCustomerCenter`) intercetta
  `StoreUnavailableError` e mostra "Store non disponibile, riprova" (con retry: la promessa
  fallita è stata scartata); le altre eccezioni sono `PurchasesError` (`err.code`,
  `err.message`).
- `getOfferings()` restituisce direttamente `PurchasesOfferings` (`.current`, `.all`);
  `getCustomerInfo()`/`purchasePackage()`/`restorePurchases()` restituiscono `{ customerInfo }`.
- Verifica l'entitlement **per nome**, non "almeno un entitlement attivo".
- Identità utente: se l'app ha login, `Purchases.logIn({ appUserID })` dopo
  l'autenticazione e `logOut()` all'uscita; altrimenti l'ID anonimo di RevenueCat basta.

## Paywall custom (solo se richiesto)

Stati della pagina, in ordine: **caricamento** (promessa di `getPackages()` pendente →
spinner), **`null`** (store non disponibile: messaggio + "Riprova"), **`[]`** (offering senza
package: errore di configurazione dashboard, non mostrare un paywall vuoto), **lista**.

- Ogni package si mostra con i dati dello store: `pkg.product.title`,
  `pkg.product.priceString` (già formattato nella valuta dell'utente),
  `pkg.packageType` (`WEEKLY`, `MONTHLY`, `ANNUAL`...), `pkg.product.introPrice` per
  prove gratuite. **Mai prezzi, periodi o badge "-50%" hardcoded**: un eventuale
  risparmio si calcola da `pkg.product.price` dei package reali.
- Elementi da prevedere per la review degli store: prezzo e durata chiari, rinnovo
  automatico spiegato, link a Termini e Privacy, tasto **Ripristina acquisti** visibile.
  Un tasto per continuare senza acquistare esiste solo se il progetto ha un livello
  gratuito (scelta di prodotto, non requisito).
- Il tasto principale chiama `purchase(pkg)` e naviga solo se ritorna `true`; su `false`
  (annullato) non fare nulla; su `StoreUnavailableError`/`PurchasesError` mostra un toast.
- Dopo un acquisto riuscito: aggiorna lo stato premium (signal/store); se il progetto
  prevede "premium = senza annunci", il modulo AdMob reagisce via `onPremiumChange`.

## Test

- **iOS**: account Sandbox Tester in App Store Connect (Users and Access → Sandbox) e
  device reale con quell'account in Impostazioni → App Store → Sandbox Account; oppure
  StoreKit Configuration nello scheme Xcode (nessun account). Gli abbonamenti sandbox si
  rinnovano in minuti.
- **Android**: License testers in Play Console e app caricata almeno in internal testing
  con lo stesso `applicationId` e firma; i prodotti devono essere attivi.
- Nella dashboard RevenueCat gli acquisti di prova sono marcati **Sandbox**.
- Prova: acquisto, annullamento, restore su device nuovo, scadenza/rinnovo, app riaperta
  offline (RevenueCat usa la cache di `customerInfo`), init fallita (modalità aereo al
  boot) e successivo retry, esecuzione in browser (`ionic serve`: ogni azione deve
  mostrare "store non disponibile", non un errore del plugin).

## Integrazione UI

- Impostazioni: voce "Premium" con stato; se non premium → apri paywall; se premium →
  `showCustomerCenter()` (gestione, cancellazione, refund request) e "Ripristina acquisti".
- Stato premium reattivo: Angular `signal` aggiornato da `onPremiumChange`; React
  `useSyncExternalStore`/`useState` + subscribe in `useEffect`; Vue `ref` a module scope.
