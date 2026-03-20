import { sanitizeValue, stripUndefined } from "../../../utils/sanitize.js";

// sanitizeValue
test('sanitizeValue returns empty string for null', () => {
    expect(sanitizeValue(null)).toBe('');
});

test('sanitizeValue returns empty string for "undefined" string', () => {
    expect(sanitizeValue('undefined')).toBe('');
});

test('sanitizeValue returns original string for valid input', () => {
    expect(sanitizeValue('Testing!')).toBe('Testing!');
});

// stripUndefined
test('stripUndefined returns empty object when called with no arguments', () => {
    expect(stripUndefined()).toEqual({});
});

test('stripUndefined returns empty object when given empty object', () => {
    expect(stripUndefined({})).toEqual({});
});

test('stripUndefined removes keys with null values', () => {
    expect(
        stripUndefined({ Test1: 'Wow', MyNullEntry: null })
    ).toEqual({ Test1: 'Wow' });
});

