import { expect, test } from '@playwright/test';

test('the local process serves its health endpoint', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    name: 'chat-is-this-real', status: 'ok', milestone: 'M0'
  });
});
