const crypto = require('crypto');

const key = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2oOQ85c5BVieUZjkISnwiSUWBF+wrTeO7lwlbXUSSE9W+3ZQOknKY9z7zfKe1ParGjAP72Q7LRpNMcHY0Xx4r7U7UWEJ0PrIT/7WbNdLML52Fmobw4nYdjzdg8lZu7pDMfyuBeKom6VywiSZ0Z6+j4+Jrzn8LFGWpviM3njGWTiZz7zhgf6mUv+6xEFdPXs1QMHQffXknTlJr6aRIOd2/q623b6Prkqb+9CTkz0TZlw68ejdrGHn2xPYCf4cXs0lcld69o731J1GemV8VCtW8sWWJK6pqa2DhbPjtYvG953qzpT6El+JK+yDEzDwgiJ9EOAkz6cS9+W3QQpI45XB8QIDAQAB";

function getExtensionId(publicKey) {
    const hash = crypto.createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest().slice(0, 16);
    let id = '';
    for (let i = 0; i < hash.length; i++) {
        const byte = hash[i];
        id += String.fromCharCode(97 + (byte >> 4));
        id += String.fromCharCode(97 + (byte & 0x0F));
    }
    return id;
}

console.log(getExtensionId(key));
