const crypto = require('crypto');

function generateSyncToken(email, passwordHash) {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${email}:${timestamp}`;
  const hmac = crypto
    .createHmac('sha256', passwordHash)
    .update(data)
    .digest('hex');
  return `${data}:${hmac}`;
}

function validateSyncToken(token, email, passwordHash) {
  if (!token || !token.includes(':')) return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [email2, timestamp, hmac] = parts;
  
  if (email2.toLowerCase() !== email.toLowerCase()) return false;
  
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  // 5 minute window (300 seconds)
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }
  
  const data = `${email2}:${timestamp}`;
  const expectedHmac = crypto
    .createHmac('sha256', passwordHash)
    .update(data)
    .digest('hex');
    
  const hmacBuf = Buffer.from(hmac, 'utf8');
  const expectedBuf = Buffer.from(expectedHmac, 'utf8');
  
  if (hmacBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(hmacBuf, expectedBuf);
}

module.exports = {
  generateSyncToken,
  validateSyncToken
};
