# Tema e dark mode

Fonti: dark mode <https://ionicframework.com/docs/theming/dark-mode>, colori
<https://ionicframework.com/docs/theming/colors>, CSS variables
<https://ionicframework.com/docs/theming/css-variables>, Status Bar
<https://capacitorjs.com/docs/apis/status-bar>.

## Come funziona in Ionic 8/9

Ionic non applica più la palette scura da solo: va **importato** uno dei tre fogli
`palettes/dark.*.css`. Senza import, aggiungere la classe `ion-palette-dark` non cambia
nulla (era il bug della vecchia skill).

| File | Comportamento |
|---|---|
| `dark.always.css` | Sempre scuro |
| `dark.system.css` | Segue `prefers-color-scheme`, nessun controllo manuale |
| `dark.class.css` | Scuro solo quando `<html>` ha la classe `ion-palette-dark`: **usa questo** se l'utente può scegliere (sistema / chiaro / scuro) |

Import (uno solo dei tre):

```scss
/* Angular: src/global.scss */
@import '@ionic/angular/css/palettes/dark.class.css';
```

```ts
// React: src/main.tsx            // Vue: src/main.ts
import '@ionic/react/css/palettes/dark.class.css';   // import '@ionic/vue/css/palettes/dark.class.css';
```

In `src/index.html` aggiungi `<meta name="color-scheme" content="light dark" />` così
scrollbar e controlli nativi del WebView seguono il tema. Esistono anche le palette
`high-contrast*.css` per l'accessibilità.

## Logica condivisa (tutti i framework)

```ts
// src/core/theme.ts
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';   // solo se installato

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
let current: ThemeMode = 'system';

export async function initTheme(): Promise<ThemeMode> {
  const { value } = await Preferences.get({ key: KEY });
  current = (value as ThemeMode | null) ?? 'system';
  apply();
  media.addEventListener('change', () => { if (current === 'system') apply(); });
  return current;
}

export async function setTheme(mode: ThemeMode): Promise<void> {
  current = mode;
  await Preferences.set({ key: KEY, value: mode });
  apply();
}

export const getTheme = () => current;

export function isDark(): boolean {
  return current === 'dark' || (current === 'system' && media.matches);
}

function apply() {
  const dark = isDark();
  document.documentElement.classList.toggle('ion-palette-dark', dark);
  if (Capacitor.isNativePlatform()) {
    // testo della status bar: Style.Dark = testo chiaro su sfondo scuro
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  }
}
```

`initTheme()` va chiamato **prima del primo render** (Angular `provideAppInitializer`,
React/Vue nella funzione `bootstrap()` di `main.ts[x]`), altrimenti l'app lampeggia in
chiaro. Il `setTheme` viene chiamato dalla pagina Impostazioni.

### Angular: servizio con signal

```ts
// src/app/core/theme.service.ts
import { Injectable, signal } from '@angular/core';
import { initTheme, setTheme, ThemeMode } from './theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('system');
  async init() { this.mode.set(await initTheme()); }
  async set(mode: ThemeMode) { await setTheme(mode); this.mode.set(mode); }
}
```

```html
<ion-item>
  <ion-select label="Theme" [value]="theme.mode()" (ionChange)="theme.set($event.detail.value)">
    <ion-select-option value="system">System</ion-select-option>
    <ion-select-option value="light">Light</ion-select-option>
    <ion-select-option value="dark">Dark</ion-select-option>
  </ion-select>
</ion-item>
```

(`theme = inject(ThemeService)` nel componente; `IonSelect`, `IonSelectOption`, `IonItem`
negli `imports`; con il modulo multilingua le etichette passano da `| translate`.) In React: `useState(getTheme())` + `setTheme` nell'`onIonChange`; in
Vue: `ref(getTheme())` + `@ionChange`.

## Colori del progetto

`src/theme/variables.scss` (Angular) o `variables.css` (React/Vue): definisci i colori
Ionic (`--ion-color-primary` e le sue varianti `-rgb`, `-contrast`, `-contrast-rgb`,
`-shade`, `-tint`) per il tema chiaro in `:root`, e le varianti scure sotto la classe
della palette:

```css
:root {
  --ion-color-primary: #2f6fed;
  --ion-color-primary-rgb: 47, 111, 237;
  --ion-color-primary-contrast: #ffffff;
  --ion-color-primary-contrast-rgb: 255, 255, 255;
  --ion-color-primary-shade: #2962d1;
  --ion-color-primary-tint: #447def;
}

html.ion-palette-dark {
  --ion-color-primary: #6b9cff;
  --ion-color-primary-rgb: 107, 156, 255;
  --ion-color-primary-contrast: #000000;
  --ion-color-primary-contrast-rgb: 0, 0, 0;
  --ion-color-primary-shade: #5e89e0;
  --ion-color-primary-tint: #7aa6ff;
  /* sfondi/testi: --ion-background-color, --ion-text-color, --ion-color-step-* già
     coperti da dark.class.css; sovrascrivi solo ciò che il brand richiede */
}
```

Genera le varianti con il "Color Generator" della doc Ionic (theming/colors) invece di
inventarle. I colori arrivano dal brand del progetto: non inventare una palette se
l'utente ne ha una.

Regole:

- Mai `.dark` su `body` o selettori custom: la classe è `ion-palette-dark` su `html`.
- Per override di piattaforma usa selettori ad alta specificità (`:root.ios`, `:root.md`),
  non `.ios`/`.md` da soli.
- `mode: 'md'`/`'ios'` in `provideIonicAngular`/`setupIonicReact`/`IonicVue` solo se il
  progetto vuole lo stesso aspetto su entrambe le piattaforme; il default adattivo è
  quello che gli utenti si aspettano.
- Immagini/loghi con versione chiara e scura: `<picture>` con `media="(prefers-color-scheme: dark)"`
  non basta in modalità manuale; scegli l'asset in base a `isDark()` o usa una classe.

## Splash e icone coerenti

`@capacitor/assets` genera splash chiari e scuri (`splash.png`, `splash-dark.png`) e
icone con sfondo diverso (`--iconBackgroundColorDark`): tienili coerenti con la palette.
