import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { ordersCopy } from '@/content/comenzi';
import { buildReturn, returnQuery } from '@/lib/return-route';

const c = ordersCopy.returnLeg;

/**
 * „Publică returul", de pe pagina comenzii.
 *
 * Apare din clipa în care livrarea este programată — acela este
 * momentul în care transportatorul știe unde va fi și când, și încă are
 * timp să caute marfă pentru drumul înapoi. Peste trei zile a plecat
 * deja gol și nu mai are ce face cu butonul.
 *
 * Nu publică nimic: duce la formularul obișnuit, completat. Verificarea
 * și apăsarea rămân ale omului.
 */
export function ReturnLeg({
  fromCity,
  toCity,
  vehicleId,
  deliveryDate,
  today,
}: {
  /** Localitatea de încărcare a comenzii. */
  fromCity: string;
  /** Localitatea de livrare — de acolo pleacă returul. */
  toCity: string;
  vehicleId: string | null;
  deliveryDate: string | null;
  today: string;
}) {
  const prefill = buildReturn(
    {
      fromCity,
      fromCountry: null,
      fromCounty: null,
      toCity,
      toCountry: null,
      toCounty: null,
      vehicleId,
      deliveryDate,
    },
    today,
  );

  return (
    <Card className="p-4">
      <h2 className="text-h3">{c.title}</h2>
      <p className="mt-1 max-w-[60ch] text-body text-muted">{c.lede}</p>

      <p className="mt-3 text-small text-muted">
        {prefill.fromCity} → {prefill.toCity} · {prefill.availableFrom}
      </p>

      {vehicleId === null ? (
        <p className="mt-3 text-small font-medium text-foreground">{c.noVehicle}</p>
      ) : (
        <Link
          href={`${ROUTES.accountDepartureNew}?${returnQuery(prefill)}`}
          className={`${buttonClasses('secondary', 'md')} mt-4`}
        >
          {c.action}
        </Link>
      )}
    </Card>
  );
}
