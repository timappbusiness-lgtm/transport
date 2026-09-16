import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';

/**
 * Historical entry point, kept because it is printed on material already in
 * circulation. It carries the carrier type into company sign-up.
 */
export default function Page() {
  redirect(`${ROUTES.signUpCompany}?tip=transport`);
}
