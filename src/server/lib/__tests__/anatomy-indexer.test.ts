/**
 * CP9E anatomy-indexer line-scanner tests
 * AI1 parseExportSymbol, AI2 parseComponentDecl, AI3 parseSqlCreateTable
 */
import { describe, it, expect } from 'vitest';
import { parseExportSymbol, parseComponentDecl, parseSqlCreateTable } from '../anatomy-indexer.js';

describe('AI1 parseExportSymbol', () => {
  it('function', () => expect(parseExportSymbol('export function foo() {}')).toBe('foo'));
  it('const', () => expect(parseExportSymbol('export const bar = 1')).toBe('bar'));
  it('class', () => expect(parseExportSymbol('export class MyClass {')).toBe('MyClass'));
  it('interface', () => expect(parseExportSymbol('export interface IFoo {')).toBe('IFoo'));
  it('type', () => expect(parseExportSymbol('export type MyType =')).toBe('MyType'));
  it('enum', () => expect(parseExportSymbol('export enum Color {')).toBe('Color'));
  it('default function', () => expect(parseExportSymbol('export default function handler(')).toBe('handler'));
  it('async function', () => expect(parseExportSymbol('export async function doThing(')).toBe('doThing'));
  it('default async', () => expect(parseExportSymbol('export default async function run(')).toBe('run'));
  it('dollar name', () => expect(parseExportSymbol('export const $store = 1')).toBe('$store'));
  it('underscore', () => expect(parseExportSymbol('export const _x = 1')).toBe('_x'));
  it('non-export', () => expect(parseExportSymbol('const x = 1')).toBeNull());
  it('indented', () => expect(parseExportSymbol('  export function foo() {}')).toBeNull());
  it('no keyword', () => expect(parseExportSymbol('export foo')).toBeNull());
  it('empty', () => expect(parseExportSymbol('')).toBeNull());
  it('100k name fast', () => {
    const name = 'a'.repeat(100000);
    const t = Date.now();
    const r = parseExportSymbol('export function ' + name + '() {}');
    expect(Date.now() - t).toBeLessThan(200);
    expect(r).toBe(name);
  });
});

describe('AI2 parseComponentDecl', () => {
  it('function MyComp', () => expect(parseComponentDecl('function MyComp() {')).toBe('MyComp'));
  it('export function', () => expect(parseComponentDecl('export function MyComp() {')).toBe('MyComp'));
  it('export default function', () => expect(parseComponentDecl('export default function MyComp() {')).toBe('MyComp'));
  it('lowercase', () => expect(parseComponentDecl('function myHelper() {')).toBeNull());
  it('arrow fn', () => expect(parseComponentDecl('const MyComp = () => {}')).toBeNull());
  it('empty', () => expect(parseComponentDecl('')).toBeNull());
  it('indented', () => expect(parseComponentDecl('  function MyComp() {')).toBeNull());
  it('100k name fast', () => {
    const name = 'A' + 'b'.repeat(99999);
    const t = Date.now();
    const r = parseComponentDecl('function ' + name + '() {}');
    expect(Date.now() - t).toBeLessThan(200);
    expect(r).toBe(name);
  });
});

describe('AI3 parseSqlCreateTable', () => {
  it('basic', () => expect(parseSqlCreateTable('CREATE TABLE users (')).toBe('users'));
  it('lowercase', () => expect(parseSqlCreateTable('create table orders (')).toBe('orders'));
  it('IF NOT EXISTS', () => expect(parseSqlCreateTable('CREATE TABLE IF NOT EXISTS jobs (')).toBe('jobs'));
  it('backtick', () => expect(parseSqlCreateTable('CREATE TABLE `my_table` (')).toBe('my_table'));
  it('underscore', () => expect(parseSqlCreateTable('CREATE TABLE job_photos (')).toBe('job_photos'));
  it('no match', () => expect(parseSqlCreateTable('SELECT * FROM users')).toBeNull());
  it('empty', () => expect(parseSqlCreateTable('')).toBeNull());
  it('no name', () => expect(parseSqlCreateTable('CREATE TABLE')).toBeNull());
  it('100k name fast', () => {
    const name = 'a'.repeat(100000);
    const t = Date.now();
    const r = parseSqlCreateTable('CREATE TABLE ' + name + ' (');
    expect(Date.now() - t).toBeLessThan(200);
    expect(r).toBe(name);
  });
  it('TABLESPACE near-miss', () => expect(parseSqlCreateTable('CREATE TABLESPACE ts')).toBeNull());
});
