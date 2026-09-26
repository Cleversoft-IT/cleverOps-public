# Navigazione: ion-tabs, route, dettaglio, guardie

Fonti: Angular <https://ionicframework.com/docs/angular/navigation>, React
<https://ionicframework.com/docs/react/navigation>, Vue
<https://ionicframework.com/docs/vue/navigation>, ion-tabs
<https://ionicframework.com/docs/api/tabs>, guardie funzionali Angular
<https://angular.dev/api/router/CanActivateFn>.

Regole comuni:

- `ion-tabs` + `ion-tab-bar` in fondo; **una route figlia per tab**, con lo stesso nome in
  `tab="..."`. 3-5 tab; icone `ionicons` (varianti `-outline` per un look leggero),
  etichette tradotte.
- Le pagine di **dettaglio** di una sezione stanno sotto la stessa tab
  (`/tabs/home/:id`), così il tab resta evidenziato e il back button funziona
  (`ion-back-button defaultHref="/tabs/home"`).
- Le pagine **fuori dai tab** (onboarding, paywall, login) sono route sorelle di `/tabs`
  alla radice.
- Tutte le pagine lazy (`loadComponent`, `() => import()`, `React.lazy` opzionale).
- Redirect finali con `replace` (niente pagine morte nello stack): `replaceUrl: true`
  (Angular), `<Navigate replace>` / `router.push(url, 'forward', 'replace')` (React),
  `{ path, replace: true }` / `router.replace()` (Vue).
- Le guardie leggono lo stato in modo asincrono (Preferences): in Angular restituiscono
  `UrlTree`, in Vue un oggetto route, in React sono un wrapper (vedi `react.md`).

## Angular (base)

```ts
// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.routes').then(m => m.routes),
  },
  { path: '', redirectTo: 'tabs', pathMatch: 'full' },
];
```

```ts
// src/app/tabs/tabs.routes.ts
import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      { path: 'home', loadComponent: () => import('../home/home.page').then(m => m.HomePage) },
      { path: 'home/:id', loadComponent: () => import('../home/detail.page').then(m => m.DetailPage) },
      { path: 'settings', loadComponent: () => import('../settings/settings.page').then(m => m.SettingsPage) },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
];
```

```ts
// src/app/tabs/tabs.page.ts
import { Component } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { homeOutline, settingsOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  templateUrl: './tabs.page.html',
})
export class TabsPage {
  constructor() { addIcons({ homeOutline, settingsOutline }); }
}
```

```html
<!-- src/app/tabs/tabs.page.html -->
<ion-tabs>
  <ion-tab-bar slot="bottom">
    <ion-tab-button tab="home">
      <ion-icon name="home-outline"></ion-icon>
      <ion-label>Home</ion-label>
    </ion-tab-button>
    <ion-tab-button tab="settings">
      <ion-icon name="settings-outline"></ion-icon>
      <ion-label>Settings</ion-label>
    </ion-tab-button>
  </ion-tab-bar>
</ion-tabs>
```

Con il modulo multilingua (`i18n.md`): `TranslatePipe` negli `imports` e
`<ion-label>{{ 'tabs.home' | translate }}</ion-label>`; senza `provideTranslateService` nel
bootstrap il pipe non è iniettabile.

Parametri di route: `inject(ActivatedRoute).snapshot.paramMap.get('id')`, oppure
`provideRouter(routes, withComponentInputBinding())` e `id = input.required<string>()`.

### Angular: guardia onboarding (solo se richiesto, `module-onboarding.md`)

```ts
// src/app/app.routes.ts — aggiunte
{ path: 'onboarding', loadComponent: () => import('./onboarding/onboarding.page').then(m => m.OnboardingPage) },
{ path: 'tabs', loadChildren: () => import('./tabs/tabs.routes').then(m => m.routes), canActivate: [onboardingGuard] },
```

```ts
// src/app/core/onboarding.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OnboardingService } from './onboarding.service';

export const onboardingGuard: CanActivateFn = async () => {
  // inject() solo prima del primo await: dopo, il contesto di iniezione non esiste più (NG0203)
  const onboarding = inject(OnboardingService);
  const router = inject(Router);
  return (await onboarding.isDone()) ? true : router.createUrlTree(['/onboarding']);
};
```

## React

Vedi `react.md`: `App.tsx` con `<Route path="/tabs/*" element={...}>`, componente `Tabs`
con `IonTabs` + `IonRouterOutlet` a path relativi + `IonTabBar`, `useParams` per i
parametri, `useIonRouter().goBack()` per il back; guardia wrapper `RequireOnboarding` nella
sezione "Aggiunte, solo se richieste".

## Vue

Vedi `vue.md`: route `/tabs/` con `children`, `TabsPage.vue` con `ion-tabs`,
`useRoute().params` per i parametri; guardia `router.beforeEach` con valore di ritorno
nella sezione "Aggiunte, solo se richieste".

## Pagina Impostazioni (schema)

Una tab "Impostazioni" tipica contiene solo le voci che esistono nel progetto:

- Lingua (se multilingua): `ion-select` con le lingue del progetto → `i18n.md`.
- Tema: `ion-select` sistema/chiaro/scuro → `theming-dark-mode.md`.
- Notifiche (se push): `ion-toggle` che chiede il permesso e registra → `push-notifications.md`.
- Abbonamento (se RevenueCat): stato premium, "Gestisci"/"Ripristina acquisti" → `module-purchases-revenuecat.md`.
- Privacy annunci (se AdMob con UMP): "Opzioni privacy" → `module-ads-admob.md`.
- Versione app (da `@capacitor/app` `App.getInfo()`), link a privacy policy e termini.
- "Ripeti onboarding" solo se il progetto lo vuole (utile in sviluppo).

## Modali e overlay

- Modali: `ion-modal` con `[isOpen]`/`trigger` (Angular), `IonModal` con `isOpen`
  (React), `<ion-modal :is-open>` (Vue); sheet modal con `breakpoints`. In Ionic 9
  `handleBehavior` è `cycle` di default.
- Toast/alert/loading: controller (`ToastController` Angular, `useIonToast` React,
  `toastController` Vue). Messaggi sempre tradotti.
- `ion-nav` in Ionic 9 non è più integrato col router: per la navigazione a URL usa
  sempre `ion-router-outlet`.
