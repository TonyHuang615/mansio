import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadFile } from './upload';

describe('uploadFile', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs multipart/form-data to /api/v1/sessions/:id/upload', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ path: '/Users/me/uploads/a.txt', name: 'a.txt' }),
    });

    const file = new File(['hi'], 'a.txt', { type: 'text/plain' });
    const result = await uploadFile('sess-123', file);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/sessions/sess-123/upload');
    expect((opts as RequestInit).method).toBe('POST');
    const body = (opts as RequestInit).body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBeInstanceOf(File);
    expect((body.get('file') as File).name).toBe('a.txt');

    expect(result).toEqual({ path: '/Users/me/uploads/a.txt', name: 'a.txt' });
  });

  it('throws on non-2xx response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ error: 'too large' }),
    });

    const file = new File(['x'], 'big.bin');
    await expect(uploadFile('sess', file)).rejects.toThrow(/too large|413/);
  });

  it('throws when fetch rejects', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    const file = new File(['x'], 'x.txt');
    await expect(uploadFile('sess', file)).rejects.toThrow(/network down/);
  });
});
