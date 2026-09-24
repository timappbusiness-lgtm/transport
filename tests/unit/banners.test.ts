import { describe, expect, it } from 'vitest';
import { TRIAL_WARNING_DAYS, pickBanner, type BannerInput } from '@/lib/banners';
import type { Company } from '@/lib/auth/account';

/**
 * One banner at a time, and the right one. Get the order wrong and a
 * suspended carrier is told about their trial while their vehicles sit off
 * the board.
 */

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'c1',
    cui: '12345678',
    legal_name: 'Autotrans Vest SRL',
    display_name: null,
    company_type: 'transport',
    verification_status: 'verified',
    verification_note: null,
    is_suspended: false,
    suspended_at: null,
    suspension_reason: null,
    county: 'Timiș',
    city: 'Timișoara',
    contact_email: null,
    contact_phone: null,
    public_profile_enabled: false,
    slug: null,
    public_description: null,
    logo_path: null,
    address: null,
    website: null,
    coverage_scope: 'national',
    coverage_counties: [],
    coverage_countries: [],
    vehicle_types_accepted: [],
    equipment: [],
    services: [],
    indicative_rate_ron_per_km: null,
    indicative_rate_note: null,
    base_address_hidden: false,
    legal_representative: null,
    alerts_enabled: false,
    alerts_email: null,
    profile_updated_at: null,
    ...over,
  };
}

function input(over: Partial<BannerInput> = {}): BannerInput {
  return {
    company: company(),
    expiringDocuments: 0,
    trialDaysLeft: null,
    quotaReached: false,
    ...over,
  };
}

describe('which one is shown', () => {
  it('says nothing when there is nothing to say', () => {
    expect(pickBanner(input())).toBeNull();
    expect(pickBanner(input({ company: null }))).toBeNull();
  });

  it('suspension outranks everything, because nothing else matters yet', () => {
    const banner = pickBanner(
      input({
        company: company({ is_suspended: true }),
        expiringDocuments: 3,
        trialDaysLeft: 1,
        quotaReached: true,
      }),
    );
    expect(banner?.kind).toBe('suspended');
  });

  it('a rejection outranks a pending review: one needs an action', () => {
    expect(pickBanner(input({ company: company({ verification_status: 'rejected' }) }))?.kind).toBe(
      'rejected',
    );
  });

  it('expiring documents outrank the trial: they are what causes a suspension', () => {
    const banner = pickBanner(input({ expiringDocuments: 1, trialDaysLeft: 2 }));
    expect(banner?.kind).toBe('documents_expiring');
  });

  it('a spent quota outranks the trial', () => {
    expect(pickBanner(input({ quotaReached: true, trialDaysLeft: 2 }))?.kind).toBe('quota_reached');
  });

  it('mentions the trial only in its last week', () => {
    expect(pickBanner(input({ trialDaysLeft: TRIAL_WARNING_DAYS }))?.kind).toBe('trial_ending');
    expect(pickBanner(input({ trialDaysLeft: TRIAL_WARNING_DAYS + 1 }))).toBeNull();
    expect(pickBanner(input({ trialDaysLeft: 0 }))?.kind).toBe('trial_ending');
  });

  it('says nothing about a trial that has already ended', () => {
    expect(pickBanner(input({ trialDaysLeft: -3 }))).toBeNull();
  });
});

describe('what may be dismissed', () => {
  it('nothing about the state of the firm', () => {
    for (const company_ of [
      company({ is_suspended: true }),
      company({ verification_status: 'rejected' }),
      company({ verification_status: 'pending' }),
    ]) {
      expect(pickBanner(input({ company: company_ }))?.blocking).toBe(true);
    }
  });

  it('the reminders may be', () => {
    expect(pickBanner(input({ expiringDocuments: 2 }))?.blocking).toBe(false);
    expect(pickBanner(input({ trialDaysLeft: 3 }))?.blocking).toBe(false);
    expect(pickBanner(input({ quotaReached: true }))?.blocking).toBe(false);
  });
});
