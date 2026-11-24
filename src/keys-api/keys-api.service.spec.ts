import { USER_AGENT } from 'app.constants';
import { KeysApiService } from './keys-api.service';

describe('KeysApiService', () => {
  const logger = { error: jest.fn() } as any;
  const config = { KEYS_API_URL: 'http://keys-api.test' } as any;

  it('sends the User-Agent header', async () => {
    const fetchJson = jest.fn().mockResolvedValue({ data: {}, meta: {} });
    const service = new KeysApiService(logger, config, { fetchJson } as any);

    await service.getKeysApiStatus();

    expect(fetchJson).toHaveBeenCalledWith(
      'http://keys-api.test/v1/status',
      expect.objectContaining({ headers: { 'User-Agent': USER_AGENT } }),
    );
  });

  it('keeps the caller headers next to the User-Agent header', async () => {
    const fetchJson = jest.fn().mockResolvedValue({ data: [], meta: {} });
    const service = new KeysApiService(logger, config, { fetchJson } as any);

    await service.getKeysByPubkeys(['0x01']);

    expect(fetchJson).toHaveBeenCalledWith(
      'http://keys-api.test/v1/keys/find',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
        },
      }),
    );
  });
});
