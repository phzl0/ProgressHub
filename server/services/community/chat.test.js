const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMessage, parseIds } = require('./chat');
test('chat validates bounded plain text and a retry identity, without accepting client identity fields', () => {
  assert.deepEqual(validateMessage({ text: '  Olá\r\ncomunidade!  ', requestId: '0123456789abcdef', githubId: 'fake', xp: 9000 }), { text: 'Olá\ncomunidade!', requestId: '0123456789abcdef' });
  assert.equal(validateMessage({ text: '😀'.repeat(600), requestId: '0123456789abcdef' }).text.length, 1200);
  for (const text of ['', '   ', 'x'.repeat(601), 'a\n'.repeat(7), 'a\0b']) assert.throws(() => validateMessage({ text, requestId: '0123456789abcdef' }), { status: 400 });
  assert.throws(() => validateMessage({ text: 'ok', requestId: 'bad' }), { status: 400 });
});
test('chat cursors accept only bounded MongoDB identifiers', () => {
  assert.equal(parseIds('012345678901234567890123,012345678901234567890123').length, 1);
  assert.throws(() => parseIds({ $ne: null }), { status: 400 });
  assert.throws(() => parseIds('not-an-id'), { status: 400 });
  assert.throws(() => parseIds(Array.from({length:181},(_,i)=>i.toString(16).padStart(24,'0')).join(',')), {status:400});
});
