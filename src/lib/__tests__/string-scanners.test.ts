/**
 * CP9E string-scanners.ts characterisation + adversarial tests
 */
import { describe, it, expect } from 'vitest';
import { isFileApiUrl, isValidRLValue, extractLeadingEmoji } from '../string-scanners';

describe('SC1 isFileApiUrl valid', () => {
  it('basic', () => expect(isFileApiUrl('/api/files/42/photo')).toBe(true));
  it('query', () => expect(isFileApiUrl('/api/files/1234/doc?v=2')).toBe(true));
  it('zero id', () => expect(isFileApiUrl('/api/files/0/thumb')).toBe(true));
  it('single type', () => expect(isFileApiUrl('/api/files/1/x')).toBe(true));
  it('whitespace', () => expect(isFileApiUrl('  /api/files/5/photo  ')).toBe(true));
  it('complex query', () => expect(isFileApiUrl('/api/files/10/file?a=b&c=d')).toBe(true));
});

describe('SC2 isFileApiUrl invalid', () => {
  it('alpha id', () => expect(isFileApiUrl('/api/files/abc/photo')).toBe(false));
  it('uppercase type', () => expect(isFileApiUrl('/api/files/42/Photo')).toBe(false));
  it('empty type', () => expect(isFileApiUrl('/api/files/42/')).toBe(false));
  it('no type', () => expect(isFileApiUrl('/api/files/42')).toBe(false));
  it('absolute url', () => expect(isFileApiUrl('https://evil.com/api/files/1/x')).toBe(false));
  it('html', () => expect(isFileApiUrl('<html>Login</html>')).toBe(false));
  it('null', () => expect(isFileApiUrl(null)).toBe(false));
  it('undefined', () => expect(isFileApiUrl(undefined)).toBe(false));
  it('empty', () => expect(isFileApiUrl('')).toBe(false));
  it('number', () => expect(isFileApiUrl(42)).toBe(false));
  it('mixed id', () => expect(isFileApiUrl('/api/files/12abc/photo')).toBe(false));
  it('type with digit', () => expect(isFileApiUrl('/api/files/1/photo2')).toBe(false));
  it('wrong prefix', () => expect(isFileApiUrl('/api/file/1/photo')).toBe(false));
});

describe('SC3 isFileApiUrl adversarial', () => {
  it('100k numeric id', () => {
    const s = '/api/files/' + '9'.repeat(100000) + '/photo';
    const t = Date.now(); expect(isFileApiUrl(s)).toBe(true);
    expect(Date.now() - t).toBeLessThan(200);
  });
  it('100k alpha id', () => {
    const s = '/api/files/' + 'a'.repeat(100000) + '/photo';
    const t = Date.now(); expect(isFileApiUrl(s)).toBe(false);
    expect(Date.now() - t).toBeLessThan(200);
  });
  it('repeated ?', () => expect(isFileApiUrl('/api/files/1/photo???')).toBe(true));
  it('only slashes', () => expect(isFileApiUrl('////')).toBe(false));
  it('no id', () => expect(isFileApiUrl('/api/files//photo')).toBe(false));
  it('type uppercase end', () => expect(isFileApiUrl('/api/files/1/photoX')).toBe(false));
});

describe('SC4 isValidRLValue valid', () => {
  it('int', () => expect(isValidRLValue('100')).toBe(true));
  it('1dp', () => expect(isValidRLValue('99.5')).toBe(true));
  it('2dp', () => expect(isValidRLValue('10.25')).toBe(true));
  it('3dp', () => expect(isValidRLValue('100.000')).toBe(true));
  it('neg', () => expect(isValidRLValue('-5')).toBe(true));
  it('neg 3dp', () => expect(isValidRLValue('-0.018')).toBe(true));
  it('zero', () => expect(isValidRLValue('0')).toBe(true));
  it('whitespace', () => expect(isValidRLValue('  100.5  ')).toBe(true));
  it('large', () => expect(isValidRLValue('999999')).toBe(true));
});

describe('SC5 isValidRLValue invalid', () => {
  it('4dp', () => expect(isValidRLValue('100.0001')).toBe(false));
  it('empty', () => expect(isValidRLValue('')).toBe(false));
  it('spaces', () => expect(isValidRLValue('   ')).toBe(false));
  it('letters', () => expect(isValidRLValue('abc')).toBe(false));
  it('double minus', () => expect(isValidRLValue('--5')).toBe(false));
  it('plus', () => expect(isValidRLValue('+5')).toBe(false));
  it('trailing dot', () => expect(isValidRLValue('5.')).toBe(false));
  it('leading dot', () => expect(isValidRLValue('.5')).toBe(false));
  it('two dots', () => expect(isValidRLValue('1.2.3')).toBe(false));
  it('comma', () => expect(isValidRLValue('1,5')).toBe(false));
  it('NaN', () => expect(isValidRLValue('NaN')).toBe(false));
  it('hex', () => expect(isValidRLValue('0xFF')).toBe(false));
});

describe('SC6 isValidRLValue adversarial', () => {
  it('100k digits', () => {
    const s = '9'.repeat(100000);
    const t = Date.now(); expect(isValidRLValue(s)).toBe(true);
    expect(Date.now() - t).toBeLessThan(200);
  });
  it('50k + 4dp', () => {
    const s = '9'.repeat(50000) + '.9999';
    const t = Date.now(); expect(isValidRLValue(s)).toBe(false);
    expect(Date.now() - t).toBeLessThan(200);
  });
  it('repeated dots', () => expect(isValidRLValue('1......')).toBe(false));
  it('minus middle', () => expect(isValidRLValue('1-2')).toBe(false));
  it('3dp passes', () => expect(isValidRLValue('1.123')).toBe(true));
  it('4dp fails at last char', () => expect(isValidRLValue('1.1234')).toBe(false));
});

describe('SC7 extractLeadingEmoji ranges', () => {
  it('U+1F600', () => { const r = extractLeadingEmoji('😀 hi'); expect(r.codePointAt(0)).toBe(0x1F600); });
  it('U+1F4A9', () => { const r = extractLeadingEmoji('💩 t'); expect(r.codePointAt(0)).toBe(0x1F4A9); });
  it('U+2600', () => expect(extractLeadingEmoji('☀ s')).toBe('☀'));
  it('U+27BF', () => expect(extractLeadingEmoji('➿ t')).toBe('➿'));
  it('U+1F004', () => { const r = extractLeadingEmoji('🀄 t'); expect(r.codePointAt(0)).toBe(0x1F004); });
  it('U+1F0CF', () => { const r = extractLeadingEmoji('🃏 t'); expect(r.codePointAt(0)).toBe(0x1F0CF); });
  it('surrogate pair length 2', () => {
    const r = extractLeadingEmoji('🔥 f');
    expect(r.length).toBe(2);
    expect(r.codePointAt(0)).toBe(0x1F525);
  });
});

describe('SC8 extractLeadingEmoji non-emoji', () => {
  it('ASCII', () => expect(extractLeadingEmoji('A hi')).toBe(''));
  it('digit', () => expect(extractLeadingEmoji('1 hi')).toBe(''));
  it('empty', () => expect(extractLeadingEmoji('')).toBe(''));
  it('U+2599 below range', () => expect(extractLeadingEmoji('▙ t')).toBe(''));
  it('U+2600 in range', () => expect(extractLeadingEmoji('☀ t')).toBe('☀'));
  it('U+1F2FF below range', () => expect(extractLeadingEmoji('🋿 t')).toBe(''));
  it('U+1F300 in range', () => { const r = extractLeadingEmoji('🌀 t'); expect(r.codePointAt(0)).toBe(0x1F300); });
  it('100k fast', () => {
    const s = 'a'.repeat(100000);
    const t = Date.now(); expect(extractLeadingEmoji(s)).toBe('');
    expect(Date.now() - t).toBeLessThan(10);
  });
  it('lone surrogate no crash', () => expect(() => extractLeadingEmoji('�')).not.toThrow());
  it('space before emoji', () => expect(extractLeadingEmoji(' 😀')).toBe(''));
});
