# Vue 3.5 + Ionic 9 (vue-router 5)

Fonti: Ionic Vue navigation <https://ionicframework.com/docs/vue/navigation>, "Updating to
9.0" <https://ionicframework.com/docs/updating/9-0>, BREAKING.md 9.x
<https://github.com/ionic-team/ionic-framework/blob/main/BREAKING.md#version-9x>, starter
ufficiale <https://github.com/ionic-team/starters/tree/main/vue-vite/base>, vue-router
dynamic routing <https://router.vuejs.org/guide/advanced/dynamic-routing.html>, vue-i18n v11
<https://vue-i18n.intlify.dev/guide/migration/breaking11.html>.

Versioni verificate il 2026-09-26: `@ionic/vue` e `@ionic/vue-router` 9.0.x, Vue ≥ 3.5,
**vue-router 5.x** (v4 non supportato da Ionic 9), vue-i18n 11.x, Vite 8, `vue-tsc`.

## Bootstrap (base: una lingua, nessun modulo opzionale)

```ts
// src/main.ts
import { createApp } from 'vue';
import { IonicVue } from '@ionic/vue';
import App from './App.vue';
import router from './router';
import { initTheme } from './core/theme';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';
import '@ionic/vue/css/palettes/dark.class.css';   // vedi theming-dark-mode.md
import './theme/variables.css';

async function bootstrap() {
  await initTheme();                       // prima del mount

  const app = createApp(App)
    .use(IonicVue)                         // { mode: 'md' } solo se vuoi lo stesso look ovunque
    .use(router);

  await router.isReady();
  app.mount('#app');
}
bootstrap();
```

```vue
<!-- src/App.vue -->
<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
</script>
```

## Router (base)

```ts
// src/router/index.ts
import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import TabsPage from '@/views/TabsPage.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/tabs/home' },
  {
    path: '/tabs/',
    component: TabsPage,
    children: [
      { path: '', redirect: '/tabs/home' },
      { path: 'home', component: () => import('@/views/HomePage.vue') },
      { path: 'home/:id', component: () => import('@/views/DetailPage.vue') },
      { path: 'settings', component: () => import('@/views/SettingsPage.vue') },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
```

## Tab (base)

```vue
<!-- src/views/TabsPage.vue -->
<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="home" href="/tabs/home">
          <ion-icon :icon="homeOutline" />
          <ion-label>Home</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings" href="/tabs/settings">
          <ion-icon :icon="settingsOutline" />
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonTabs, IonRouterOutlet, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/vue';
import { homeOutline, settingsOutline } from 'ionicons/icons';
</script>
```

## Pagine

```vue
<!-- src/views/DetailPage.vue -->
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button default-href="/tabs/home" /></ion-buttons>
        <ion-title>{{ id }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content><!-- ... --></ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, onIonViewWillEnter } from '@ionic/vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const id = route.params.id as string;

onIonViewWillEnter(() => { /* ricarica dati */ });
</script>
```

- Ogni pagina in `<ion-page>`; import esplicito dei componenti Ionic usati.
- Navigazione: `router-link="/tabs/home/42"` sui componenti Ionic; programmatica con
  `useIonRouter()` (`ionRouter.push('/x')`, `ionRouter.back()`) o `useRouter()`
  (`router.replace('/tabs')`).
- Icone: import da `ionicons/icons` e prop `:icon`.

## Composable e plugin

```ts
// src/core/settings.ts
import { ref, readonly } from 'vue';
import { Preferences } from '@capacitor/preferences';

const notificationsEnabled = ref(false);

export function useSettings() {
  async function load() {
    const { value } = await Preferences.get({ key: 'notificationsEnabled' });
    notificationsEnabled.value = value === 'true';
  }
  async function setNotificationsEnabled(enabled: boolean) {
    notificationsEnabled.value = enabled;
    await Preferences.set({ key: 'notificationsEnabled', value: String(enabled) });
  }
  return { notificationsEnabled: readonly(notificationsEnabled), load, setNotificationsEnabled };
}
```

- Stato condiviso: `ref` a module scope come sopra, o Pinia se il progetto lo usa già.
- **`toRaw()`** prima di passare oggetti reattivi ai plugin Capacitor (RevenueCat rifiuta
  i Proxy): `Purchases.purchasePackage({ aPackage: toRaw(pkg) })`.
- Listener Capacitor: `onMounted` → `addListener`, `onUnmounted` → `handle.remove()`.
- Le promesse di init avviate senza `await` terminano sempre con
  `.catch((e) => reportError('scope', e))` (`reportError`: helper del progetto, console in
  dev e telemetria in prod se presente); mai `void` nudo.

## Aggiunte, solo se richieste

### Multilingua (i18n.md)

```ts
// main.ts
import { createAppI18n } from './i18n';
const i18n = await createAppI18n();      // legge la lingua salvata prima del mount
createApp(App).use(IonicVue).use(router).use(i18n);
```

Nei componenti: `const { t } = useI18n();` e `<ion-label>{{ t('tabs.home') }}</ion-label>`
al posto delle etichette statiche. `useI18n()` senza `.use(i18n)` lancia al mount.

### Splash manuale (capacitor.md)

In `bootstrap()`, subito dopo `app.mount('#app')`: `await SplashScreen.hide();` (solo con
`launchAutoHide: false`).

### Onboarding (module-onboarding.md)

La route va nell'array **prima** di `createRouter()` (le route passate dopo non hanno
effetto); per registrarla a runtime esiste `router.addRoute(...)` (doc "Dynamic Routing").

```ts
// router/index.ts
import { isOnboardingDone } from '@/core/onboarding';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/tabs/home' },
  { path: '/onboarding', component: () => import('@/views/OnboardingPage.vue') },
  { path: '/tabs/', component: TabsPage, meta: { requiresOnboarding: true }, children: [ /* come nella base */ ] },
];

const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes });

// vue-router 5: guardie con valore di ritorno (next() è deprecato)
router.beforeEach(async (to) => {
  if (to.meta.requiresOnboarding && !(await isOnboardingDone())) {
    return { path: '/onboarding', replace: true };
  }
});
```

La guardia rilegge Preferences a ogni navigazione: dopo `setOnboardingDone()` basta
`router.replace('/tabs/home')`.

### Push (push-notifications.md)

```ts
// main.ts, dopo app.mount('#app')
import { initPush } from '@/core/push';
import { api } from '@/core/api';
import { reportError } from '@/core/report-error';

initPush({
  onToken: (token) => api.registerDevice(token),
  onAction: ({ notification }) => {
    const route = notification.data?.route;
    if (typeof route === 'string' && route.startsWith('/')) void router.push(route);
  },
}).catch((e) => reportError('push.init', e));
```

### Acquisti (module-purchases-revenuecat.md)

```ts
// main.ts, dopo app.mount('#app')
initPurchases().catch((e) => reportError('purchases.init', e));   // memoizzata: le altre chiamate la attendono
```

## Errori frequenti

- `router.beforeEach((to, from, next) => next('/x'))` → `next()` è deprecato in vue-router 5.
- `routes.push(...)` dopo `createRouter()` → la route non esiste; usa l'array iniziale o `router.addRoute`.
- `useI18n()` in un componente senza `app.use(i18n)` → errore al mount.
- Pagina senza `<ion-page>` → niente transizioni, `ion-content` senza altezza.
- Options API o `export default { data() }` in codice nuovo → `<script setup>`.
- Passare un `ref`/`reactive` a un plugin nativo senza `toRaw()`.
- `vue-i18n` in modalità legacy (`legacy: true`, `$tc`): deprecata in v11, rimossa in v12.
