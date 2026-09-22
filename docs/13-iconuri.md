# Iconuri

Regula, într-o propoziție: **un icon ajută la scanat și la recunoscut, și
nu are voie să decoreze un moment serios.**

Sursa este `lucide-react`, deja în proiect. Harta este
`src/lib/icons.ts`, una singură, iar `tests/unit/icons.test.ts` cade în
ambele sensuri — o valoare fără icon și un icon fără valoare.

## Cum ajunge un icon pe pagină

Numai prin `<Icon>` din `src/components/ui/icon.tsx`. Nimic nu randează
o componentă lucide direct.

```tsx
import { IconLabel } from '@/components/ui/icon';
import { iconForCategory } from '@/lib/icons';

<IconLabel as={iconForCategory(request.category)} size="sm" tone="strong">
  {CARGO_CATEGORY_LABELS[request.category]}
</IconLabel>
```

`IconLabel` este perechea icon + etichetă, cu singurul spațiu dintre ele.
`Icon` este iconul singur, pentru cazurile care își fac singure rândul —
un buton, o insignă, șina unei cronologii.

Componenta impune patru lucruri care altfel se strică pe rând, câte o
componentă odată:

- **o singură scară** — `sm` 15, `md` 18, `lg` 22 — și **o singură
  grosime de linie**, 2, ca un rând de iconuri să arate ca un rând, nu ca
  mai multe desene diferite;
- **un singur spațiu** între icon și etichetă, `ICON_GAP`. Ajunsese la
  trei valori diferite;
- **tonul, ales la locul apelului**: `strong` (cerneală) sau `muted`,
  cu `inherit` pentru interiorul unui buton sau al unui banner colorat,
  unde părintele a decis deja. „Accent" în sistemul ăsta **este**
  cerneala: `globals.css` scrie de la început că nu există culoare de
  accent, iar accentul vine din greutate și din spațiu;
- **o decizie despre înțeles, la locul apelului.** Ori este decor lângă
  o etichetă vizibilă — `aria-hidden`, implicit — ori duce el înțelesul
  și atunci primește `label`, care îi devine nume accesibil. Nu există a
  treia variantă, și asta este ideea: un icon singur, fără nume, este un
  lucru pe care cineva nu îl poate citi.

### De ce scara a crescut

Prima versiune avea `sm` 13 și grosime 1.75. Iconul de pe cardul de
cerere stă într-un rând de 10px, mono, majuscule, `text-muted` — și,
moștenind culoarea, ieșea exact cât eticheta de lângă el, doar mai mic.
Era pe pagină și nu se vedea. Verificat pe build-ul de producție, nu în
cod: `/cereri` servea tot panoul de filtre cu zero iconuri în `main`.

De aici cele două reguli noi: **cel mai mic icon este mai mare decât cel
mai mic text de lângă care poate sta**, și **tonul se alege**, fiindcă
`inherit` peste tot a fost cauza.

**Niciodată un icon ca singur înțeles.** Întotdeauna o etichetă vizibilă
sau un nume accesibil.

**Fără emoji în interfață.** Un test peste `src/content/` cade dacă
apare unul.

## Unde punem iconuri

| Loc | De ce |
|---|---|
| Categorii de vehicule, dotări, servicii | Se scanează o listă lungă de valori cunoscute |
| Navigație, taburi, filtre | Recunoaștere, nu explicație |
| Stări goale | Un ecran gol fără nimic arată ca unul stricat |
| Butoane cu acțiune repetată | adaugă, încarcă, caută, filtrează, copiază, descarcă |
| Insigne de stare, **lângă text** | valid, expiră curând, expirat, în verificare |
| Pașii unei comenzi | Șapte pași, citiți de sus în jos |
| Tipuri de conținut într-o listă mixtă | cerere, traseu, ofertă, comandă, mesaj, document |

## Unde nu punem, niciodată

- **Pagini legale, termeni, confidențialitate, texte de consimțământ.**
- **Suspendare, respingere, dispută, ștergere, incident** și orice ecran
  de decizie al echipei.
- **Mesaje de eroare și confirmări distructive.** Text simplu, fără
  teatru cu triunghi de avertizare.
- **Oriunde un icon ar putea părea ștampilă oficială sau insignă de
  verificare.**

Motivul nu este stilistic. Un pictogram lângă „Cont suspendat" face
dintr-o frază pe care cineva trebuie să o citească o notificare pe care o
poate închide. Un scut lângă numele unei firme arată ca o verificare pe
care firma a câștigat-o. Iar un triunghi galben lângă „Ștergi definitiv?"
adaugă alarmă acolo unde trebuia claritate.

Verificările care țin partea asta:

- `tests/unit/icons.test.ts` — paginile legale nu importă lucide,
  bannerul de stare nu are icon lângă suspendare sau respingere, harta
  nu importă niciun scut, și nu există emoji în `src/content/`;
- `tests/unit/icon-coverage.test.tsx` — **numai `src/lib/icons.ts` are
  voie să importe `lucide-react`** (plus importul de tip din `Icon`).
  Regula de mai sus era scrisă aici și nerespectată în cod: douăzeci de
  fișiere importau lucide direct, fiecare cu mărimea și grosimea lui, iar
  două desenau un scut verde lângă numele unei firme — chiar exemplul cu
  care documentul ăsta explică regula. Un import direct este felul în
  care un icon ajunge pe pagină fără să treacă prin nimic, deci importul
  este ce se interzice;
- `tests/unit/navigation.test.ts` — fiecare item de meniu pe care îl
  poate produce constructorul, pentru fiecare tip de cont, are icon;
- `tests/e2e/iconuri.spec.ts` — fiecare ecran desenează cel puțin atâtea
  iconuri cât scrie acolo. Verificarea dinainte compara numărul de
  iconuri fără etichetă cu cel al iconurilor cu nume, ceea ce pe un ecran
  fără niciun icon înseamnă `0 === 0`; a trecut tot timpul cât boardul nu
  a avut niciunul.

## Când adaugi o valoare nouă

1. Adaugă valoarea unde trăiește (enum, tabelă de opțiuni, tip).
2. Adaugă iconul în harta din `src/lib/icons.ts`.
3. Rulează `pnpm test tests/unit/icons.test.ts`.

Dacă valoarea vine dintr-o tabelă pe care echipa o completează singură —
`equipment_options`, `service_options` — un cod fără icon este o stare
normală, nu o eroare: `iconForEquipment` întoarce `null` și chipul se
desenează ca text. Ce nu are voie să existe este invers: un icon care
arată spre un cod pe care nomenclatorul nu îl are.
