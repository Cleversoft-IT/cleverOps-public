# Migrazione: Ionic 8 → 9 e Capacitor 7 → 8

Fonti: "Updating to 9.0" <https://ionicframework.com/docs/updating/9-0>, `BREAKING.md` 9.x
<https://github.com/ionic-team/ionic-framework/blob/main/BREAKING.md#version-9x>, "Updating
to Capacitor 8" <https://capacitorjs.com/docs/updating/8-0>, migrazione ngx-translate
<https://ngx-translate.org/getting-started/migration-guide/>, Angular zoneless
<https://angular.dev/guide/zoneless>. Verificato il 2026-09-26.

## Requisiti minimi di Ionic 9

- Angular ≥ 18 (con Angular 22: TypeScript 6.0.x, Node `^22.22.3 || ^24.15.0 || >=26`);
  React 18/19 con React Router ≥ 6.4 < 7; Vue ≥ 3.5 con vue-router 5.
- Capacitor ≥ 7 (`isPlatform('capacitor')` ora usa solo `Capacitor.isNativePlatform()`).
- Browser: iOS ≥ 16, Chrome/Edge ≥ 89, Safari ≥ 16, Firefox ≥ 75. Se l'app deve girare su
  iOS 15 resta su Ionic 8.

## Procedura

1. Git pulito, branch dedicato. Leggi versioni attuali in `package.json`.
2. Se necessario, aggiorna prima il framework (Angular con `ng update @angular/core@22 @angular/cli@22`
   una major alla volta; React/Vue con npm). Con Angular 22 `ng update` riscrive i
   componenti senza `changeDetection` esplicito in `ChangeDetectionStrategy.Eager`
   (il vecchio `Default`): il comportamento resta identico, ma il codice nuovo è OnPush.
3. Esegui la migrazione automatica di Ionic:
   `npx @ionic/migrate --dry-run` (anteprima), poi `npx @ionic/migrate`
   (flag utili: `--check`, `--experimental`, `--no-install`).
4. Aggiorna i pacchetti (major esplicite, non `@latest`):
   - Angular: `npm i @ionic/angular@9 @ionic/angular-toolkit@13`
   - React: `npm i @ionic/react@9 @ionic/react-router@9 react-router@6 react-router-dom@6`
     e rimuovi `@types/react-router*`
   - Vue: `npm i @ionic/vue@9 @ionic/vue-router@9 vue-router@5`
5. Capacitor 8: `npm i @capacitor/cli@8 @capacitor/core@8 @capacitor/ios@8 @capacitor/android@8`
   poi `npx cap migrate`; aggiorna tutti i plugin `@capacitor/*` e community alla major 8
   (`@capacitor/preferences@8`, `@capacitor-community/admob@8`,
   `@revenuecat/purchases-capacitor@13`...). Requisiti:
   Node 22, Xcode 26, iOS 15 target, Android SDK 36 / Gradle 8.14.3 / Kotlin 2.2.20.
   Rimosso `android.adjustMarginsForEdgeToEdge` → usa `SystemBars` (in `@capacitor/core`).
6. Applica a mano le modifiche sotto, build, `npx cap sync`, prova su device.

## Angular

- Import: `@ionic/angular/standalone` → **`@ionic/angular`** (trova e sostituisci);
  `IonicModule` (ora in `@ionic/angular/lazy`, deprecato) → standalone +
  `provideIonicAngular()`.
- `tsconfig.json`: `"moduleResolution": "bundler"`.
- CSS: togli il prefisso `~` dagli `@import '@ionic/angular/css/...'`.
- Zoneless (Angular 21+ default): stato aggiornato in callback asincroni → signal o
  `markForCheck()`; per restare su Zone.js aggiungi `provideZoneChangeDetection()` e
  `zone.js`.
- ngx-translate: se sei su ≤ 16, salta a 18 (`TranslateModule` rimosso,
  `provideTranslateService`, `fallbackLang`, `currentLang()` signal; vedi `i18n.md`).

## React (React Router 5 → 6)

| Prima (v5) | Ora (v6) |
|---|---|
| `<Route exact path="/x" component={X} />` | `<Route path="/x" element={<X />} />` |
| `<Route path="/tabs"><Tabs/></Route>` | `<Route path="/tabs/*" element={<Tabs />} />` con figli a path relativi |
| `<Redirect to="/x" />`, `IonRedirect` | `<Navigate to="/x" replace />` |
| `useHistory().push/goBack` | `useNavigate()` / `useIonRouter().push/goBack` |
| `RouteComponentProps`, `match.params.id` | `useParams()`, `useLocation()` |
| `render={() => ...}` | `element={...}` |
| `<IonReactRouter history={...}>` | prop rimossa |
| path con regex (`/:tab(a|b)`) | non supportati: route esplicite |
| `@types/react-router`, `@types/react-router-dom` | rimuovere |

`useIonModal`/`useIonPopover` ora tipizzano `componentProps` sul componente: prop
mancanti o extra sono errori di compilazione.

## Vue (vue-router 4 → 5)

- Guardie: `next()` deprecato → ritorna `true`/`false`/route (`return { path: '/login' }`).
- `beforeRouteLeave(to, from) { return confirm('...') }`.

## Componenti (tutti i framework)

- `ion-img` deprecato → `<img loading="lazy" decoding="async">`; `ionImgWillLoad` →
  `IntersectionObserver`; `ionImgDidLoad`/`ionError` → `load`/`error`.
- `ion-picker-legacy` e `pickerController` rimossi → `ion-picker` dentro `ion-modal`.
- `ion-nav` non è più guidato da `ion-router`: per URL usa `ion-router-outlet`.
- `ion-input`/`ion-searchbar`: `autocorrect` è `boolean`; floating label solo con focus o
  valore; DOM interno con `.input-start/.input-control/.input-end` → **rivedi i CSS custom**
  che dipendevano dalla struttura interna.
- `ion-select`: `ionChange` solo se il valore cambia davvero (chi contava sulla conferma
  dell'overlay ascolti `ionDismiss`); l'interfaccia action-sheet non assegna più il ruolo
  `selected`; floating label come `ion-input`; DOM interno
  `.select-start/.select-control/.select-end`.
- `ion-textarea`: altezza minima 72px in Material, `rows < 3` ignorati; DOM
  `.textarea-start/.textarea-control/.textarea-end`.
- `ion-modal` sheet: `handleBehavior` default `cycle` (solo su `ion-modal`); per il
  vecchio comportamento `handleBehavior="none"`.
- `ion-router-outlet`: nuova prop `swipeGesture` (iOS `true`, MD `false`);
  `swipeBackEnabled` letto solo al mount.
- `@ionic/core` ha il campo `exports`: import solo da `@ionic/core`, `/components`,
  `/loader`, `/hydrate`, `/css/*`.

## Dopo la migrazione: cosa provare

- Build web, `npx cap sync`, build nativa pulita in Xcode e Android Studio.
- Navigazione completa (tab, dettaglio, back, deep link), form con `ion-input`/`ion-select`,
  modali sheet, dark mode, i18n, plugin nativi (push, acquisti, ads) su device reale.
- Test unitari/e2e del progetto; lint e type-check.
