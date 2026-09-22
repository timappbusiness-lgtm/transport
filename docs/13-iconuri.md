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
import { Icon } from '@/components/ui/icon';
import { iconForCategory } from '@/lib/icons';

<span className="flex items-center gap-1.5">
  <Icon as={iconForCategory(request.category)} size="sm" />
  {CARGO_CATEGORY_LABELS[request.category]}
</span>
```

Componenta impune trei lucruri care altfel se strică pe rând, câte o
componentă odată:

- **o singură scară** — `sm` 13, `md` 16, `lg` 20 — și **o singură
  grosime de linie**, 1.75, ca un rând de iconuri să arate ca un rând,
  nu ca mai multe desene diferite;
- **culoarea din `currentColor`**, deci din tokenul textului de lângă.
  Un icon nu își aduce culoarea lui;
- **o decizie despre înțeles, la locul apelului.** Ori este decor lângă
  o etichetă vizibilă — `aria-hidden`, implicit — ori duce el înțelesul
  și atunci primește `label`, care îi devine nume accesibil. Nu există a
  treia variantă, și asta este ideea: un icon singur, fără nume, este un
  lucru pe care cineva nu îl poate citi.

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

Trei dintre verificările din `tests/unit/icons.test.ts` țin partea asta:
paginile legale nu importă lucide, bannerul de stare nu are icon lângă
suspendare sau respingere, și nu există emoji în `src/content/`.

## Când adaugi o valoare nouă

1. Adaugă valoarea unde trăiește (enum, tabelă de opțiuni, tip).
2. Adaugă iconul în harta din `src/lib/icons.ts`.
3. Rulează `pnpm test tests/unit/icons.test.ts`.

Dacă valoarea vine dintr-o tabelă pe care echipa o completează singură —
`equipment_options`, `service_options` — un cod fără icon este o stare
normală, nu o eroare: `iconForEquipment` întoarce `null` și chipul se
desenează ca text. Ce nu are voie să existe este invers: un icon care
arată spre un cod pe care nomenclatorul nu îl are.
