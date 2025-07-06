const { RateLimitService } = require('../src/services/rate-limit-service');

test('rate limit allows first request and blocks after max', async () => {
  const service = new RateLimitService();
  const options = { maxRequests: 2, windowMs: 1000 };
  expect(await service.checkLimit('user1', 'test', options)).toBe(true);
  expect(await service.checkLimit('user1', 'test', options)).toBe(true);
  expect(await service.checkLimit('user1', 'test', options)).toBe(false);
});
