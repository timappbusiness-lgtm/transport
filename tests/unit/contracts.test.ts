import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contractCopy } from '@/content/contract';
import {
  MAX_CONTRACT_VERSIONS,
  clientIp,
  clientUserAgent,
  contractCardState,
  contractDocuments,
  operatorBlock,
  type ContractVersion,
} from '@/lib/contracts';

/**
 * The contract card's decisions: which buttons a reader gets, what the
 * documents list says, and the two values the application hands the
 * database — the operator block and where an acceptance came from. The
 * database checks all of it again; these are the checks that keep the
 * screen from offering a button that always fails.
 */

function version(n: number, patch: Partial<ContractVersion> = {}): ContractVersion {
  return {
    contractId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    version: n,
    contractNumber: 'CT-2026-A1B2C3D4',
    templateVersion: '1.0',
    snapshotHash: 'a'.repeat(64),
    generatedAt: '2026-09-24T10:30:00Z',
    generatedByName: 'Ștefan Țurcanu',
    generatedBySide: 'carrier',
    isLatest: false,
    carrierAcceptedAt: null,
    carrierAcceptedBy: null,
    clientAcceptedAt: null,
    clientAcceptedBy: null,
    ...patch,
  };
}

const headers = (entries: Record<string, string>) => new Headers(entries);

describe('the contract card', () => {
  it('offers only „Generează" before anything exists', () => {
    const s = contractCardState([], 'client', 'order_confirmed');
    expect(s.latest).toBeNull();
    expect(s.canGenerate).toBe(true);
    expect(s.canAccept).toBe(false);
  });

  it('shows the newest version and keeps the others as history', () => {
    const s = contractCardState([version(1), version(3), version(2)], 'carrier', 'in_transit');
    expect(s.latest?.version).toBe(3);
    expect(s.earlier.map((v) => v.version)).toEqual([2, 1]);
  });

  it('lets each party accept the latest version once', () => {
    const v = version(2, { carrierAcceptedAt: '2026-09-24T11:05:00Z', carrierAcceptedBy: 'Ștefan Țurcanu' });
    const carrier = contractCardState([v], 'carrier', 'order_confirmed');
    expect(carrier.acceptedByMe).toBe(true);
    expect(carrier.canAccept).toBe(false);
    const client = contractCardState([v], 'client', 'order_confirmed');
    expect(client.acceptedByMe).toBe(false);
    expect(client.canAccept).toBe(true);
    expect(client.bothAccepted).toBe(false);
  });

  it('never offers staff an acceptance, only a new version', () => {
    const s = contractCardState([version(1)], 'staff', 'order_confirmed');
    expect(s.canAccept).toBe(false);
    expect(s.canGenerate).toBe(true);
  });

  it('draws nothing for a reader with no side — a driver, a stranger', () => {
    const s = contractCardState([], null, 'order_confirmed');
    expect(s.canGenerate).toBe(false);
    expect(s.canAccept).toBe(false);
  });

  it('keeps a cancelled order’s versions readable and offers nothing new', () => {
    const s = contractCardState([version(1)], 'client', 'cancelled');
    expect(s.latest?.version).toBe(1);
    expect(s.canGenerate).toBe(false);
    expect(s.canAccept).toBe(false);
  });

  it('stops offering a new version at the limit the database enforces', () => {
    const many = Array.from({ length: MAX_CONTRACT_VERSIONS }, (_, i) => version(i + 1));
    expect(contractCardState(many, 'client', 'order_confirmed').canGenerate).toBe(false);
  });

  it('says „Semnat de" with the time, and says what it means here', () => {
    expect(contractCopy.signedBy('Ioana Bălășescu', '24.09.2026, 14:05')).toBe(
      'Semnat de Ioana Bălășescu la 24.09.2026, 14:05',
    );
    expect(contractCopy.whatSigned).toContain('acceptare electronică în platformă');
    expect(contractCopy.whatSigned).toContain('nu semnătură electronică calificată');
    expect(contractCopy.accept.explain).toContain('adresa IP');
    expect(contractCopy.accept.explain).toContain('nu este o semnătură electronică calificată');
  });
});

describe('the documents list', () => {
  it('lists every version, newest first, with where it stands', () => {
    const docs = contractDocuments('a1b2c3d4-0000-4000-8000-000000000001', [
      version(1, { carrierAcceptedAt: 'x', clientAcceptedAt: 'y' }),
      version(2, { clientAcceptedAt: 'y' }),
    ]);
    expect(docs.map((d) => d.label)).toEqual([
      'Contract de transport, versiunea 2',
      'Contract de transport, versiunea 1',
    ]);
    expect(docs[0]?.detail).toContain('acceptat de beneficiar');
    expect(docs[1]?.detail).toContain('acceptat de ambele părți');
    expect(docs[0]?.href).toBe(
      '/cont/transporturi/a1b2c3d4-0000-4000-8000-000000000001/contract/00000000-0000-4000-8000-000000000002',
    );
    expect(docs[0]?.downloadHref).toMatch(/\?descarca=1$/);
  });
});

describe('what the application sends the database', () => {
  it('sends the brand and only the operator details that are filled in', () => {
    const block = operatorBlock();
    expect(block.brand).toBeTruthy();
    for (const value of Object.values(block)) expect(value.trim()).not.toBe('');
    expect(Object.keys(block).every((k) => ['brand', 'legal_name', 'cui', 'reg_com', 'address', 'email', 'phone'].includes(k))).toBe(true);
  });

  it('takes the client address from the first forwarded hop', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientIp(headers({}))).toBeNull();
  });

  it('stores nothing that is not an address', () => {
    expect(clientIp(headers({ 'x-forwarded-for': "1.2.3.4'; drop table x" }))).toBeNull();
    expect(clientIp(headers({ 'x-forwarded-for': '999.1.1.1' }))).toBeNull();
    expect(clientIp(headers({ 'x-forwarded-for': 'localhost' }))).toBeNull();
  });

  it('cuts the browser string to what the column keeps', () => {
    expect(clientUserAgent(headers({ 'user-agent': 'x'.repeat(1000) }))?.length).toBe(400);
    expect(clientUserAgent(headers({}))).toBeNull();
  });
});

describe('the file links', () => {
  // A <Link> prefetches, and a prefetch of the file route would draw the
  // PDF for nobody. Every file link is a plain anchor.
  it('are plain anchors, never <Link>', () => {
    for (const path of [
      'src/components/orders/contract-card.tsx',
      'src/components/admin/order-contracts.tsx',
      'src/components/orders/evidence-gallery.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).not.toMatch(/<Link[^>]*contractFileRoute|<Link[^>]*doc\.href/);
    }
  });
});
