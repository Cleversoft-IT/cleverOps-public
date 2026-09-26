# React 19 + Ionic 9 (React Router 6)

Fonti: Ionic React navigation <https://ionicframework.com/docs/react/navigation>, "Updating to
9.0" <https://ionicframework.com/docs/updating/9-0>, BREAKING.md 9.x
<https://github.com/ionic-team/ionic-framework/blob/main/BREAKING.md#version-9x>, starter
ufficiale <https://github.com/ionic-team/starters/tree/main/react-vite/base>.

Versioni verificate il 2026-09-26: `@ionic/react` e `@ionic/react-router` 9.0.x, React
19.x, Vite 8, TypeScript ≥ 5.4 (lo starter usa 5.9).

## Router: solo React Router 6

`@ionic/react-router@9` dichiara come peer `react-router` e `react-router-dom`
**`>=6.4.0 <7`**. Su npm `latest` è la 7.x/8.x: installa esplicitamente la 6.

```bash
npm i react-router@6 react-router-dom@6
```

Le API v5 (`component=`, `render=`, `exact`, `<Redirect>`, `useHistory`,
`RouteComponentProps`, `IonRedirect`, prop `history` su `IonReactRouter`, vincoli regex nei
path) non esistono più in Ionic 9. `IonReactRouter` sostituisce `BrowserRouter`: **non** è
un data router, quindi niente `createBrowserRouter`, `loader`, `action`; le guardie si
fanno con componenti wrapper.

## Bootstrap (base: una lingua, nessun modulo opzionale)

```tsx
// src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.class.css';   // vedi theming-dark-mode.md
import './theme/variables.css';

import { initTheme } from './core/theme';

async function bootstrap() {
  await initTheme();            // classe dark applicata prima del primo render
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  );
}
bootstrap();
```

```tsx
// src/App.tsx
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Navigate } from 'react-router-dom';
import Tabs from './pages/Tabs';

setupIonicReact();   // { mode: 'md' } solo se vuoi lo stesso look su iOS e Android

const App: React.FC = () => (
  <IonApp>
    <IonReactRouter>
      <IonRouterOutlet>
        <Route path="/tabs/*" element={<Tabs />} />
        <Route path="/" element={<Navigate to="/tabs" replace />} />
      </IonRouterOutlet>
    </IonReactRouter>
  </IonApp>
);
export default App;
```

## Tab (base)

```tsx
// src/pages/Tabs.tsx
import { IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/react';
import { Route, Navigate } from 'react-router-dom';
import { homeOutline, settingsOutline } from 'ionicons/icons';
import HomePage from './HomePage';
import DetailPage from './DetailPage';
import SettingsPage from './SettingsPage';

const Tabs: React.FC = () => (
  <IonTabs>
    <IonRouterOutlet>
      <Route path="home" element={<HomePage />} />
      <Route path="home/:id" element={<DetailPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route index element={<Navigate to="home" replace />} />
    </IonRouterOutlet>
    <IonTabBar slot="bottom">
      <IonTabButton tab="home" href="/tabs/home">
        <IonIcon icon={homeOutline} />
        <IonLabel>Home</IonLabel>
      </IonTabButton>
      <IonTabButton tab="settings" href="/tabs/settings">
        <IonIcon icon={settingsOutline} />
        <IonLabel>Settings</IonLabel>
      </IonTabButton>
    </IonTabBar>
  </IonTabs>
);
export default Tabs;
```

- Il path del padre finisce con `/*`; i figli usano path **relativi**.
- `IonTabs` crea già una `IonPage`: non aggiungere `IonPage` né `ionPage` qui.
- Un `IonRouterOutlet` annidato reso direttamente da una `Route` del padre (fuori dai tab)
  deve avere la prop `ionPage`.

## Pagine

```tsx
// src/pages/DetailPage.tsx
import { IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent } from '@ionic/react';
import { useParams } from 'react-router-dom';

const DetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/tabs/home" /></IonButtons>
          <IonTitle>{id}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>{/* ... */}</IonContent>
    </IonPage>
  );
};
export default DetailPage;
```

- Ogni pagina è avvolta in `<IonPage>` (transizioni e lifecycle).
- Navigazione: `routerLink="/tabs/home/42"` su `IonItem`/`IonButton`; programmatica con
  `useIonRouter()` (`router.push('/x', 'forward', 'replace')`, `router.goBack()`) o
  `useNavigate()`. Evita `navigate(-1)`: con tab e outlet annidati usa `goBack()`.
- Lifecycle Ionic: `useIonViewWillEnter(() => {...})`, `useIonViewDidLeave`.

## Stato e servizi

- Logica dei plugin in moduli TypeScript puri (`src/core/*.ts`) riusabili e testabili;
  gli hook (`useTheme`, `usePurchases`) espongono solo stato React (`useState`/`useSyncExternalStore`).
- Per stato globale semplice: Context + `useReducer` o `useSyncExternalStore`; librerie
  esterne solo se il progetto le usa già.
- `useEffect` con array vuoto per gli init; cleanup dei listener Capacitor
  (`handle.remove()`) nel return. In `StrictMode` (dev) gli effetti girano due volte: le
  init dei plugin sono promesse **memoizzate** (vedi i reference dei moduli), quindi
  richiamarle è innocuo.
- Le promesse di init avviate senza `await` terminano sempre con
  `.catch((e) => reportError('scope', e))` (`reportError`: helper del progetto, console in
  dev e telemetria in prod se presente); mai `void` nudo.

## Aggiunte, solo se richieste

### Multilingua (i18n.md)

- `bootstrap()`: `await initI18n();` dopo `initTheme()` e prima del render (lingua salvata
  riletta prima del primo paint).
- Nei componenti: `const { t } = useTranslation();` e `<IonLabel>{t('tabs.home')}</IonLabel>`
  al posto delle etichette statiche. Senza `initI18n()` `useTranslation()` restituisce le
  chiavi grezze.

### Splash manuale (capacitor.md)

In `bootstrap()`, subito dopo `render(...)`: `await SplashScreen.hide();` (solo con
`launchAutoHide: false`).

### Onboarding (module-onboarding.md)

Lo stato letto dalla guardia si carica **una volta** al bootstrap e va aggiornato anche
quando l'onboarding viene completato, altrimenti la guardia continua a redirigere.

```ts
// src/core/app-state.ts
import { isOnboardingDone, setOnboardingDone } from './onboarding';

export const appState = {
  onboardingDone: false,
  async load() { this.onboardingDone = await isOnboardingDone(); },
  async markOnboardingDone() { await setOnboardingDone(); this.onboardingDone = true; },
};
```

```tsx
// src/core/RequireOnboarding.tsx
import { Navigate } from 'react-router-dom';
import { appState } from './app-state';

export const RequireOnboarding: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  appState.onboardingDone ? <>{children}</> : <Navigate to="/onboarding" replace />;
```

In `bootstrap()`: `await appState.load();` prima del render. In `App.tsx`:

```tsx
<Route path="/onboarding" element={<OnboardingPage />} />
<Route path="/tabs/*" element={<RequireOnboarding><Tabs /></RequireOnboarding>} />
```

Nella pagina di onboarding: `await appState.markOnboardingDone(); router.push('/tabs', 'root', 'replace');`.

### Push (push-notifications.md)

`initPush` richiede i gestori (token → backend, tap → navigazione). La navigazione usa
`useIonRouter`, disponibile solo **dentro** `IonReactRouter`: usa un componente senza UI.

```tsx
// src/core/PushBootstrap.tsx
import { useEffect, useRef } from 'react';
import { useIonRouter } from '@ionic/react';
import { initPush } from './push';
import { api } from './api';
import { reportError } from './report-error';

export const PushBootstrap: React.FC = () => {
  const router = useIonRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    initPush({
      onToken: (token) => api.registerDevice(token),
      onAction: ({ notification }) => {
        const route = notification.data?.route;
        if (typeof route === 'string' && route.startsWith('/')) routerRef.current.push(route, 'forward', 'push');
      },
    }).catch((e) => reportError('push.init', e));
  }, []);

  return null;
};
```

In `App.tsx`, dentro `<IonReactRouter>` accanto a `<IonRouterOutlet>`: `<PushBootstrap />`.

### Acquisti (module-purchases-revenuecat.md)

```tsx
// App.tsx
useEffect(() => {
  initPurchases().catch((e) => reportError('purchases.init', e));   // memoizzata: le altre chiamate la attendono
}, []);
```

## Errori frequenti

- `react-router-dom@7`/`@8` installati → errore di peer dependency con `@ionic/react-router`.
- `<Route path="/tabs" element={<Tabs/>}>` senza `/*` → le route figlie non matchano.
- Pagina senza `IonPage` → niente transizione, header sovrapposto.
- `useHistory` → `useNavigate` / `useIonRouter`.
- `useTranslation()` in un progetto senza `initI18n()` → chiavi grezze a schermo.
- `useIonRouter()` in `App` (fuori da `IonReactRouter`) → usa un componente figlio.
- Init dei plugin non memoizzata → doppio `configure`/doppi listener in StrictMode.
