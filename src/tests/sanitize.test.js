import { sanitizeValue, stripUndefined } from "../utils/sanitize";

test('sanitize.js functioning properly', () => {
    // sanitizeValue
    expect(sanitizeValue(null)).toBe('');
    expect(sanitizeValue('undefined')).toBe('');
    expect(sanitizeValue('Testing!')).toBe('Testing!');

    // stripUndefined
    expect(stripUndefined()).toEqual({});
    expect(stripUndefined({})).toEqual({});
    expect(stripUndefined({'Test1': 'Wow', 'MyNullEntry': null})).toEqual({'Test1': 'Wow'});
});