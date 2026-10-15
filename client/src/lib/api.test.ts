import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '@/lib/api';

/**
 * A delete whose reply is lost.
 *
 * The connection dropped after the server had already removed the row, so the
 * user was told a delete had failed while the row was gone. Repeating the call
 * settles it either way: the second attempt removes it, or answers 404 because
 * the first one did - and both are the outcome that was asked for.
 */
describe('deletes over a connection that drops', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('accessToken', 'test-token');
  });

  const setup = () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  };

  it('retries once and reports success when the retry removes it', async () => {
    setup();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ message: 'Удалено' }),
      } as any);

    await expect(api.wishes.delete('id-1')).resolves.toEqual({ message: 'Удалено' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });

  it('treats 404 on the retry as done, not as a failure', async () => {
    setup();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        status: 404,
        ok: false,
        json: async () => ({ error: 'Список не найден' }),
      } as any);

    await expect(api.wishes.delete('id-1')).resolves.toEqual({ message: 'Уже удалено' });
  });

  it('does not repeat a create', async () => {
    setup();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(api.notes.create({ title: 'x', content: 'y' })).rejects.toThrow();
    // One attempt only: repeating a create is how the same row appears twice.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does repeat a read', async () => {
    setup();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ notes: [] }),
      } as any);

    await expect(api.notes.getAll()).resolves.toEqual({ notes: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up with a Russian message when the second attempt also fails', async () => {
    setup();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(api.notes.getAll()).rejects.toThrow(/подключения|недоступен/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});