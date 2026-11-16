jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

type Client = typeof import('../axiosClient').default;

/** The axios instance, built against a mocked NativeFetchService */
function clientWith(fetchMock: Record<string, jest.Mock>): Client {
  let client: Client | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../services/NativeFetchService', () => ({ __esModule: true, default: fetchMock }));
    client = require('../axiosClient').default;
  });
  return client as Client;
}

afterEach(() => jest.resetModules());

describe('axiosClient adapter', () => {
  // It passed only config.data to NativeFetchService, so axiosClient.get(url, { params }) sent
  // no query string at all: the server saw none of it
  it('puts axios params into the URL', async () => {
    const get = jest.fn().mockResolvedValue({ ok: true });
    const client = clientWith({ get });

    await client.get('/api/mobile/bars', { params: { city: 'london', date: '2031-06-21' } });

    expect(get).toHaveBeenCalledWith('/api/mobile/bars?city=london&date=2031-06-21');
  });

  it('leaves a URL without params alone, and skips empty values', async () => {
    const get = jest.fn().mockResolvedValue({});
    const client = clientWith({ get });

    await client.get('/api/mobile/config');
    await client.get('/api/mobile/bars?city=london', { params: { date: undefined, page: 2 } });

    expect(get).toHaveBeenNthCalledWith(1, '/api/mobile/config');
    expect(get).toHaveBeenNthCalledWith(2, '/api/mobile/bars?city=london&page=2');
  });

  it('keeps the status of a failed request on the axios error', async () => {
    const put = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('HTTP error 404'), { response: { status: 404 } }));
    const client = clientWith({ put });

    await expect(client.put('/api/account/city', { city: 'paris' })).rejects.toMatchObject({
      response: { status: 404 }
    });
  });

  it('reports a network failure as a 500 with its message', async () => {
    const post = jest.fn().mockRejectedValue(new Error('Network request failed'));
    const client = clientWith({ post });

    await expect(client.post('/api/mobile/login', {})).rejects.toMatchObject({
      response: { status: 500, statusText: 'Network request failed' }
    });
  });
});
