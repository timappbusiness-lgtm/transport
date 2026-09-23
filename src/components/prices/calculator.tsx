'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { pricesCopy } from '@/content/preturi';
import { CITY_GROUPS, cityFromValue, cityLabel, cityValue, type City } from '@/lib/cities';
import { EMPTY_PREFILL, prefillQuery, type Prefill } from '@/lib/price-prefill';
import {
  VEHICLE_CLASS_LABELS,
  VEHICLE_CLASS_ORDER,
  ZONE_LABELS,
  estimate,
  formatRange,
  type PriceRate,
  type PriceSettings,
  type VehicleClass,
} from '@/lib/pricing';
import { cn } from '@/lib/utils';

const c = pricesCopy.calculator;
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body';

/**
 * The calculator.
 *
 * Every rule it applies lives in `src/lib/pricing.ts`, which knows nothing
 * about React or SQL and is covered by unit tests — this component only
 * collects five answers and formats one range. Nothing is sent anywhere:
 * the arithmetic happens in the browser from figures the page already has,
 * so there is no round trip and nothing to log about someone's route.
 */
export function Calculator({
  rates,
  settings,
  express,
  onExpressChange,
  initial,
}: {
  rates: PriceRate[];
  settings: PriceSettings;
  express: boolean;
  onExpressChange: (value: boolean) => void;
  initial: Prefill;
}) {
  const id = useId();
  const [from, setFrom] = useState<City | null>(initial.from);
  const [to, setTo] = useState<City | null>(initial.to);
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>(
    initial.vehicleClass ?? firstClass(rates),
  );
  const [isRunning, setIsRunning] = useState(initial.isRunning ?? true);

  const rate = rates.find((row) => row.vehicle_class === vehicleClass);

  const result = useMemo(() => {
    if (!from || !to || !rate) return null;
    if (from.name === to.name && from.country === to.country) return null;
    return estimate({ from, to, vehicleClass, isRunning, express }, rate, settings);
  }, [from, to, rate, vehicleClass, isRunning, express, settings]);

  const sameCity =
    from !== null && to !== null && from.name === to.name && from.country === to.country;

  const query = prefillQuery({
    ...EMPTY_PREFILL,
    from,
    to,
    vehicleClass,
    isRunning,
    express,
  });

  return (
    <div className="rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-lg">{c.title}</h2>
      <p className="mt-2 text-sm text-muted">{c.lede}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={c.from} htmlFor={`${id}-from`}>
          <CityPicker id={`${id}-from`} value={from} onChange={setFrom} />
        </Field>
        <Field label={c.to} htmlFor={`${id}-to`}>
          <CityPicker id={`${id}-to`} value={to} onChange={setTo} />
        </Field>

        <Field label={c.vehicleClass} htmlFor={`${id}-class`}>
          <select
            id={`${id}-class`}
            className={CONTROL}
            value={vehicleClass}
            onChange={(event) => setVehicleClass(event.target.value as VehicleClass)}
          >
            {VEHICLE_CLASS_ORDER.filter((value) =>
              rates.some((row) => row.vehicle_class === value),
            ).map((value) => (
              <option key={value} value={value}>
                {VEHICLE_CLASS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        {/* One fieldset per grid cell. Nesting both in a single cell puts
            two radio groups in half a sidebar, where they overlap. */}
        <Choice
          legend={c.running}
          name={`${id}-running`}
          value={isRunning ? 'da' : 'nu'}
          options={[
            ['da', c.yes],
            ['nu', c.no],
          ]}
          onChange={(value) => setIsRunning(value === 'da')}
        />
        <Choice
          legend={pricesCopy.service.legend}
          name={`${id}-service`}
          value={express ? 'expres' : 'standard'}
          options={[
            ['standard', pricesCopy.service.standard],
            ['expres', pricesCopy.service.express],
          ]}
          onChange={(value) => onExpressChange(value === 'expres')}
        />
      </div>

      <p className="mt-4 text-xs text-muted">{c.cityNote}</p>

      <div
        aria-live="polite"
        className="mt-5 rounded-card border border-border bg-ground-alt px-5 py-4"
      >
        {result ? (
          <>
            <p className="font-mono text-label uppercase tracking-[0.12em] text-muted">
              {c.result}
            </p>
            <p className="mt-1 font-display text-h2 tabular-nums">
              {formatRange(result)}
            </p>
            <p className="mt-2 text-small text-muted">
              {c.distance(new Intl.NumberFormat('ro-RO').format(result.roadKm))} ·{' '}
              {c.zone}: {ZONE_LABELS[result.zone]}
            </p>
            {(!isRunning || express || result.minimumApplied) ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {!isRunning ? <Tag>{c.notRunningTag}</Tag> : null}
                {express ? <Tag>{c.expressTag}</Tag> : null}
                {result.minimumApplied ? <Tag>{c.minimumApplied}</Tag> : null}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">{sameCity ? c.same : c.empty}</p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">{c.disclaimer}</p>

      <div className="mt-5">
        <Link href={`${ROUTES.newRequest}${query}`} className={buttonClasses('primary', 'md')}>
          {c.cta}
        </Link>
      </div>
    </div>
  );
}

/** Falls back to the first class the database actually sent. */
function firstClass(rates: PriceRate[]): VehicleClass {
  const ordered = VEHICLE_CLASS_ORDER.find((value) =>
    rates.some((row) => row.vehicle_class === value),
  );
  return ordered ?? 'sedan';
}

/**
 * A grouped native select rather than a typeahead.
 *
 * With seventy-odd localities it is shorter to use, it works on a phone
 * without a keyboard, and it cannot be left holding a name that means
 * nothing — which is what a free-text field would do to the estimate.
 */
function CityPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: City | null;
  onChange: (city: City | null) => void;
}) {
  return (
    <select
      id={id}
      className={CONTROL}
      value={value ? cityValue(value) : ''}
      onChange={(event) => onChange(cityFromValue(event.target.value))}
    >
      <option value="">{c.choose}</option>
      {CITY_GROUPS.map((group) => (
        <optgroup key={group.key} label={group.key === 'ro' ? c.romania : c.europe}>
          {group.cities.map((city) => (
            <option key={cityValue(city)} value={cityValue(city)}>
              {cityLabel(city)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Choice({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map(([option, label]) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="size-4 accent-foreground"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <li
      className={cn(
        'inline-flex items-center rounded-pill border border-border-strong/45 bg-surface px-2.5 py-1',
        'font-mono text-label uppercase tracking-[0.1em] text-muted',
      )}
    >
      {children}
    </li>
  );
}
