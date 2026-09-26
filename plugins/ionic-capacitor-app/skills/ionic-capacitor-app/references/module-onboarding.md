# Modulo opzionale: onboarding

**Solo se il progetto lo chiede.** Non è obbligatorio, non precede necessariamente un
paywall, non richiede un video. Chiedi: quante schermate, quali contenuti (titolo, testo,
illustrazione), se è saltabile, se c'è un video/animazione di sfondo, cosa succede alla
fine (tab, login, paywall). Fonti: Swiper Element <https://swiperjs.com/element>, Ionic +
Swiper <https://ionicframework.com/docs/angular/slides>, Preferences
<https://capacitorjs.com/docs/apis/preferences>.

## Stato e guardia

- Flag `onboardingDone` in Preferences (`'true'`); la route `/onboarding` sta fuori dai
  tab; la guardia su `/tabs` redirige se il flag manca (codice per framework nelle sezioni
  "solo se richiesto" di `navigation-tabs.md`, `react.md`, `vue.md`).
- Al termine: salva il flag, **aggiorna lo stato letto dalla guardia** e naviga con
  **replace** verso la destinazione decisa dal progetto:
  - Angular: `await onboardingService.markDone(); router.navigateByUrl('/tabs', { replaceUrl: true })`
    (la guardia rilegge Preferences a ogni navigazione).
  - React: la guardia legge `appState` caricato una volta al bootstrap → usa
    `await appState.markOnboardingDone()` (persiste **e** aggiorna lo store), poi
    `router.push('/tabs', 'root', 'replace')`. Chiamare solo `setOnboardingDone()` lascia
    la guardia sul valore vecchio e l'utente resta bloccato sull'onboarding.
  - Vue: `await setOnboardingDone(); router.replace('/tabs/home')` (la guardia rilegge
    Preferences).
- "Ripeti onboarding" nelle Impostazioni solo se voluto; utile in sviluppo (anche qui
  aggiorna lo store in React: `appState.onboardingDone = false`).

```ts
// src/core/onboarding.ts
import { Preferences } from '@capacitor/preferences';
const KEY = 'onboardingDone';
export const isOnboardingDone = async () => (await Preferences.get({ key: KEY })).value === 'true';
export const setOnboardingDone = () => Preferences.set({ key: KEY, value: 'true' });
export const resetOnboarding = () => Preferences.remove({ key: KEY });
```

## Slide

Due opzioni; non installare `swiper` se non lo usi (era un bug: dipendenza installata e
mai usata).

**A. Senza dipendenze** (2-4 schermate semplici): contenitore orizzontale con
`scroll-snap-type: x mandatory`, una `<section>` per slide (`scroll-snap-align: start`),
indicatori a pallini aggiornati con un `IntersectionObserver` o `scroll` + tasto
"Avanti"/"Inizia". Leggero, accessibile, nessun build step.

**B. Swiper 14** (gesture ricche, pagination, effetti): Swiper Element (web component).

```bash
npm i swiper@14
```

```ts
// una volta, in main.ts / main.tsx
import { register } from 'swiper/element/bundle';
register();
```

```html
<swiper-container [modules]="swiperModules" pagination="true" class="onboarding-slides">
  <swiper-slide> ... </swiper-slide>
</swiper-container>
```

- Angular: `swiperModules = [IonicSlides]` (`IonicSlides` da `@ionic/angular`) e
  `schemas: [CUSTOM_ELEMENTS_SCHEMA]` nel componente.
- React: JSX con elementi custom (`<swiper-container>`), dichiarazione dei tipi in un
  `.d.ts` (`declare namespace JSX { interface IntrinsicElements { 'swiper-container': any; ... } }`
  o i tipi forniti da Swiper); `modules={[IonicSlides]}` da `@ionic/react`.
- Vue: `compilerOptions.isCustomElement = (tag) => tag.startsWith('swiper-')` nel plugin
  Vue di Vite; `:modules="[IonicSlides]"` da `@ionic/vue`.
- Consulta la doc Swiper Element per gli attributi (kebab-case) e gli eventi
  (`swiperslidechange`).

## Sfondo video (solo se richiesto)

- Asset **locale** (`src/assets/video/onboarding.mp4`, H.264, poche MB, durata breve, loop
  pulito), mai URL esterni o video di esempio.
- `<video autoplay muted loop playsinline poster="assets/img/onboarding.jpg">`: `muted` e
  `playsinline` sono necessari per l'autoplay su iOS.
- Rispetta `prefers-reduced-motion`: mostra il poster statico se attivo.
- Non bloccare la UI in attesa del video; il poster copre il caricamento.

```css
.onboarding { position: relative; height: 100%; }
.onboarding video, .onboarding .overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
.onboarding video { object-fit: cover; }
.onboarding .overlay { background: linear-gradient(to bottom, rgb(0 0 0 / 0.2), rgb(0 0 0 / 0.7)); }
.onboarding .content { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; padding: 24px; padding-bottom: calc(24px + var(--ion-safe-area-bottom, 0px)); }
```

## Contenuti

- Titoli e testi dalle traduzioni (`onboarding.slide1.title`...), illustrazioni con
  versione chiara/scura se l'app ha il dark mode.
- Pulsanti: "Avanti", "Salta" (se saltabile), "Inizia" nell'ultima slide. Il permesso
  notifiche o il paywall, se previsti, vanno **dopo** l'onboarding e in una schermata che
  ne spiega il motivo, non nella prima slide.
- Massimo 3-5 slide; ogni slide un concetto.
