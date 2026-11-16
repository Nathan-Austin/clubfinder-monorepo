jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../utils/NetworkCache', () => ({ __esModule: true, default: { resolveDNS: jest.fn() } }));

import nativeFetch from '../NativeFetchService';

function reply(status: number, body: string, contentType = 'text/html') {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(body, { status, headers: { 'content-type': contentType } })
  ) as jest.Mock;
}

describe('NativeFetchService', () => {
  // A server without a route answers SvelteKit's HTML error page. response.json() threw on it,
  // and the error had no status, so the app read every such 404 as a 500.
  it.each(['get', 'put', 'patch', 'delete'] as const)('%s keeps the status of a non-JSON error', async (method) => {
    reply(404, '<!doctype html><title>Not Found</title>');
    await expect(nativeFetch[method]('/api/missing', {})).rejects.toMatchObject({
      response: { status: 404 }
    });
  });

  it('still passes on a JSON error body', async () => {
    reply(400, JSON.stringify({ success: false, message: 'Choose a city' }), 'application/json');
    await expect(nativeFetch.put('/api/account/city', {})).rejects.toMatchObject({
      response: { status: 400, data: { message: 'Choose a city' } }
    });
  });

  it('still refuses a success that is not JSON', async () => {
    reply(200, '<html>maintenance</html>');
    await expect(nativeFetch.get('/api/mobile/config')).rejects.toThrow();
  });

  it('returns the parsed body of a success', async () => {
    reply(200, JSON.stringify({ success: true, city: 'paris' }), 'application/json');
    await expect(nativeFetch.put('/api/account/city', { city: 'paris' })).resolves.toEqual({
      success: true,
      city: 'paris'
    });
  });
});
