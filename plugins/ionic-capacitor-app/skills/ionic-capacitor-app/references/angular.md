# Angular 22 + Ionic 9 (standalone, zoneless, signals)

Fonti: Ionic "Updating to 9.0" <https://ionicframework.com/docs/updating/9-0>, BREAKING.md 9.x
<https://github.com/ionic-team/ionic-framework/blob/main/BREAKING.md#version-9x>, Ionic Angular
build options <https://ionicframework.com/docs/angular/build-options>, Angular zoneless
<https://angular.dev/guide/zoneless>, contesto di iniezione
<https://angular.dev/guide/di/dependency-injection-context>, errore NG0203
<https://angular.dev/errors/NG0203>.

Versioni verificate il 2026-09-26: `@ionic/angular` 9.0.x, `@angular/core` 22.x,
`@ionic/angular-toolkit` 13.x, TypeScript **6.0.x** (peer di `@angular/compiler-cli@22`:
`>=6.0 <6.1`), Node `^22.22.3 || ^24.15.0 || >=26`. Lo starter ufficiale
`angular-standalone` genera già Angular 22 + Ionic 9 + vitest.

## Cosa è cambiato con Ionic 9 (Angular)

- Componenti, provider e `IonicRouteStrategy` si importano da **`@ionic/angular`**.
  `@ionic/angular/standalone` non è tra gli `exports` del pacchetto 9: con
  `moduleResolution: "bundler"` l'import fallisce. `@ionic/angular/lazy` contiene il
  vecchio `IonicModule` (deprecato, sarà rimosso): non usarlo in codice nuovo.
- `tsconfig.json`: `"moduleResolution": "bundler"`.
- Import CSS senza prefisso `~`: `@import '@ionic/angular/css/core.css';`.
- Angular 21+ è **zoneless** di default e Angular 22 usa **OnPush** di default: lo stato
  che cambia in callback asincroni (Preferences, plugin, HTTP) deve stare in signal, oppure
  chiamare `ChangeDetectorRef.markForCheck()`. `zone.js` non serve (peer opzionale).

## `inject()` e codice asincrono (NG0203)

`inject()` funziona solo nello **stack frame sincrono** di un contesto di iniezione
(costruttore, field initializer, factory, guardie/resolver funzionali,
`provideAppInitializer`, `runInInjectionContext`). Dopo un `await` la continuazione è un
frame nuovo, fuori contesto → errore **NG0203**. Regola: **acquisisci tutte le dipendenze
in cima alla funzione, prima del primo `await`** (vale per initializer, guardie, effetti).

## Bootstrap (base: una lingua, nessun modulo opzionale)

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAppInitializer, inject } from '@angular/core';
import { provideRouter, RouteReuseStrategy, withPreloading, PreloadAllModules } from '@angular/router';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { ThemeService } from './app/core/theme.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),                       // { mode: 'md' } solo se vuoi lo stesso look ovunque
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAppInitializer(() => {
      const theme = inject(ThemeService);        // inject() sincrono, prima di ogni await
      return theme.init();                       // tema applicato prima del primo render
    }),
  ],
});
```

```ts
// src/app/app.component.ts
import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: '<ion-app><ion-router-outlet></ion-router-outlet></ion-app>',
})
export class AppComponent {}
```

(`standalone: true` è implicito da Angular 19.) AppComponent è l'unica eccezione al
"template su file separato": è una riga.

## Pagine e componenti (base)

```ts
// src/app/home/home.page.ts
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonSpinner } from '@ionic/angular';
import { ItemsService } from '../core/items.service';

@Component({
  selector: 'app-home',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonSpinner, RouterLink],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly items = inject(ItemsService);
  readonly list = this.items.list;          // Signal<Item[]>
  readonly loading = signal(false);

  async ionViewWillEnter() {
    this.loading.set(true);
    await this.items.refresh();
    this.loading.set(false);
  }
}
```

```html
<!-- src/app/home/home.page.html -->
<ion-header><ion-toolbar><ion-title>Home</ion-title></ion-toolbar></ion-header>
<ion-content>
  @if (loading()) {
    <ion-spinner></ion-spinner>
  } @else {
    <ion-list>
      @for (item of list(); track item.id) {
        <ion-item [routerLink]="['/tabs/home', item.id]">
          <ion-label>{{ item.title }}</ion-label>
        </ion-item>
      } @empty {
        <ion-item><ion-label>No items yet</ion-label></ion-item>
      }
    </ion-list>
  }
</ion-content>
```

Regole:

- Importa nel componente **tutto e solo** ciò che il template usa: ogni tag `ion-*`
  (`IonSpinner` compreso), `RouterLink` per `[routerLink]`, `FormsModule` per
  `[(ngModel)]`; con il modulo multilingua anche `TranslatePipe` per `| translate`.
- Lifecycle Ionic (`ionViewWillEnter`, `ionViewDidLeave`) funziona sui componenti
  standalone caricati dal router.
- Icone: `addIcons({ homeOutline, settingsOutline })` (da `ionicons` e `ionicons/icons`)
  una volta, ad esempio nel costruttore di `AppComponent`; nel template
  `<ion-icon name="home-outline">`.

## Servizi con signal (stato asincrono, zoneless)

```ts
// src/app/core/settings.service.ts
import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly notificationsEnabled = signal(false);

  async load() {
    const { value } = await Preferences.get({ key: 'notificationsEnabled' });
    this.notificationsEnabled.set(value === 'true');
  }

  async setNotificationsEnabled(enabled: boolean) {
    this.notificationsEnabled.set(enabled);
    await Preferences.set({ key: 'notificationsEnabled', value: String(enabled) });
  }
}
```

Il template legge `notificationsEnabled()`; il `set` sul signal basta a ridisegnare anche
senza Zone.js. Usa `computed()` per derivati e `effect()` con parsimonia.

## Routing

`app.routes.ts` con `loadComponent`/`loadChildren`; guardie funzionali (`CanActivateFn`)
che restituiscono `UrlTree` per i redirect. Esempi completi in `navigation-tabs.md`.

```ts
export const onboardingGuard: CanActivateFn = async () => {
  const onboarding = inject(OnboardingService);   // dipendenze prima del primo await
  const router = inject(Router);
  return (await onboarding.isDone()) ? true : router.createUrlTree(['/onboarding']);
};
```

Navigazione programmatica: `inject(Router).navigateByUrl('/tabs', { replaceUrl: true })`;
per controllare la direzione dell'animazione `inject(NavController).navigateRoot('/tabs')`,
`navigateForward`, `navigateBack` (`NavController` da `@ionic/angular`).

## CSS globale

```scss
// src/global.scss
@import '@ionic/angular/css/core.css';
@import '@ionic/angular/css/normalize.css';
@import '@ionic/angular/css/structure.css';
@import '@ionic/angular/css/typography.css';
@import '@ionic/angular/css/padding.css';
@import '@ionic/angular/css/float-elements.css';
@import '@ionic/angular/css/text-alignment.css';
@import '@ionic/angular/css/text-transformation.css';
@import '@ionic/angular/css/flex-utils.css';
@import '@ionic/angular/css/display.css';
@import '@ionic/angular/css/palettes/dark.class.css';   // vedi theming-dark-mode.md
```

I colori del brand vanno in `src/theme/variables.scss` (vedi `theming-dark-mode.md`).

## Aggiunte, solo se richieste

### Multilingua (i18n.md)

- Provider in `main.ts`: `provideHttpClient()` e `provideTranslateService({...})`;
  `LanguageService.init()` nell'initializer (sotto).
- In ogni componente con testi: `TranslatePipe` negli `imports` e
  `<ion-title>{{ 'home.title' | translate }}</ion-title>` al posto delle etichette statiche.

### Initializer con più servizi (multilingua, moduli opzionali, splash manuale)

```ts
// src/main.ts
import { provideHttpClient } from '@angular/common/http';
import { SplashScreen } from '@capacitor/splash-screen';
import { reportError } from './app/core/report-error';   // helper del progetto: console in dev, telemetria in prod

providers: [
  // ...base...
  provideHttpClient(),                            // http-loader di ngx-translate
  // provideTranslateService({...}),              // i18n.md
  provideAppInitializer(async () => {
    // TUTTE le inject() qui, prima del primo await
    const theme = inject(ThemeService);
    const language = inject(LanguageService);     // i18n.md
    const purchases = inject(PurchasesService);   // module-purchases-revenuecat.md
    const push = inject(PushService);             // push-notifications.md
    await theme.init();
    await language.init();
    // init memoizzate, non bloccano il primo render: mai `void` nudo, gestisci il rifiuto
    purchases.init().catch((e) => reportError('purchases.init', e));
    push.init().catch((e) => reportError('push.init', e));
    await SplashScreen.hide();                    // solo se launchAutoHide: false (capacitor.md)
  }),
]
```

## Build e test

- `npm run build` → `ng build` (output `www/`, che è il `webDir` di Capacitor).
- `ng test` usa vitest nello starter Ionic 9; `ng lint` con angular-eslint.
- Angular 22 richiede TypeScript 6.0.x: `npm i -D typescript@~6.0.0`; la 7.x fallisce con
  errore di peer dependency.

## Errori frequenti

- `import { IonButton } from '@ionic/angular/standalone'` → in Ionic 9: `from '@ionic/angular'`.
- `IonicModule.forRoot()` o `importProvidersFrom(IonicModule...)` → `provideIonicAngular()`.
- `inject()` dopo un `await` (initializer, guardie) → NG0203.
- `| translate` o `TranslatePipe` senza `provideTranslateService` nel bootstrap → errore
  di iniezione: il pipe appartiene all'aggiunta multilingua.
- Proprietà aggiornate in un `await` senza signal: con OnPush zoneless la vista non cambia.
- Tag nel template senza il componente negli `imports` (es. `<ion-spinner>` senza `IonSpinner`).
- `*ngIf`/`*ngFor` funzionano ancora ma richiedono `NgIf`/`NgFor` negli import: usa `@if`/`@for`.
- Promesse di init lanciate con `void` senza `.catch`: errore invisibile, plugin "muto".
