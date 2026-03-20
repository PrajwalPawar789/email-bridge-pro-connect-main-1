import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeHtml,
  normalizePlainTextEmailBody,
  stripHtmlToPlainText,
} from '../../shared/email-content.js';

test('normalizePlainTextEmailBody strips accidental html tags from plain text content', () => {
  assert.equal(normalizePlainTextEmailBody('<p>Hello world</p>'), 'Hello world');
  assert.equal(
    normalizePlainTextEmailBody('<div>Hello<br />world</div>'),
    'Hello\nworld'
  );
});

test('normalizePlainTextEmailBody preserves regular plain text and markdown markers', () => {
  const text = 'Hi {{first_name}},\n\n**Hello** and __welcome__.';
  assert.equal(normalizePlainTextEmailBody(text), text);
  assert.equal(looksLikeHtml(text), false);
});

test('stripHtmlToPlainText converts list markup into readable bullets', () => {
  assert.equal(
    stripHtmlToPlainText('<ul><li>First</li><li>Second</li></ul>'),
    '- First\n- Second'
  );
});
