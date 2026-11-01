import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), insert: vi.fn(), upsert: vi.fn(), from: vi.fn() }));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@/lib/email-templates/send-email', () => ({ sendTemplateEmail: mocks.send }));
import { sendRegisteredAppEmail } from '@/lib/email/sendRegisteredAppEmail.server';
import { recordEmailEvent } from '@/lib/email/recordEmailEvent.server';
const request = () => new Request('https://example.test', { method: 'POST', body: JSON.stringify({ templateName: 'owner-submission', idempotencyKey: 'owner-submission-contact-row', templateData: { kind: 'contact' } }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({ insert: mocks.insert, upsert: mocks.upsert });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.upsert.mockResolvedValue({ error: null });
});
describe('managed owner email audit', () => {
  it('logs sent after sending to the fixed owner with event idempotency', async () => {
    mocks.send.mockResolvedValue({ sent: true });
    expect(await (await sendRegisteredAppEmail(request())).json()).toEqual({ success: true });
    expect(mocks.send).toHaveBeenCalledWith('owner-submission', 'matt@verdantgrowdiary.com', { templateData: { kind: 'contact' }, idempotencyKey: 'owner-submission-contact-row' });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
    expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
  });
  it('records suppressed without retrying', async () => {
    mocks.send.mockResolvedValue({ sent: false, reason: 'recipient_suppressed' });
    expect(await (await sendRegisteredAppEmail(request())).json()).toEqual({ success: false, reason: 'email_suppressed' });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'suppressed' }));
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('records failed and keeps provider errors out of the response', async () => {
    mocks.send.mockRejectedValue(new Error('provider failure'));
    const result = await sendRegisteredAppEmail(request());
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'Email send failed' });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error_message: 'provider failure' }));
  });
  it('rejects caller recipient overrides without sending', async () => {
    const body = await request().json();
    const result = await sendRegisteredAppEmail(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ ...body, recipientEmail: 'other@example.test' }) }));
    expect(result.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
describe('signed outcome persistence', () => {
  const event = { event_id: '00000000-0000-4000-8000-000000000001', run_id: 'run', type: 'email.bounced', project_id: 'fixture', environment: 'prod', timestamp: '2026-11-01T06:00:00Z', version: '1', data: { event: 'email.bounced', recipient: 'Grower@Example.test', message_id: 'message' } } as const;
  it('preserves bounce reason, normalized address and deduplicates using the event identity', async () => {
    await recordEmailEvent(event);
    expect(mocks.upsert).toHaveBeenNthCalledWith(1, { email: 'grower@example.test', reason: 'bounce', metadata: null }, { onConflict: 'email' });
    expect(mocks.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: event.event_id, status: 'bounced', template_name: 'system', metadata: null }), { onConflict: 'id', ignoreDuplicates: true });
  });
  it('throws when outcome storage fails so the signed webhook retries', async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { code: 'denied' } });
    await expect(recordEmailEvent(event)).rejects.toThrow('Failed to record email outcome');
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws when audit storage fails instead of silently losing the event', async () => {
    mocks.upsert.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { code: 'denied' } });
    await expect(recordEmailEvent(event)).rejects.toThrow('Failed to record email event');
  });
});
