class RateLimitService {
  constructor() {
    this.limits = new Map();
  }

  async checkLimit(userId, key, options) {
    const id = `${userId}:${key}`;
    const now = Date.now();
    const record = this.limits.get(id);

    if (!record || now > record.reset) {
      this.limits.set(id, { count: 1, reset: now + options.windowMs });
      return true;
    }

    if (record.count >= options.maxRequests) {
      return false;
    }

    record.count += 1;
    return true;
  }
}

module.exports = { RateLimitService };
