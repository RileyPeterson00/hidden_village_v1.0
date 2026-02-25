import Latin from "../../../components/utilities/latin_square";

test('Latin square has correct dimensions', () => {
  const latin = new Latin(4);

  expect(latin.square.length).toBe(4);
  latin.square.forEach(row => {
    expect(row.length).toBe(4);
  });
});

test('Each row contains numbers 1..n exactly once', () => {
  const size = 4;
  const latin = new Latin(size);

  latin.square.forEach(row => {
    const sorted = [...row].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3, 4]);
  });
});

test('Each column contains numbers 1..n exactly once', () => {
  const size = 4;
  const latin = new Latin(size);

  const expected = Array.from({ length: size }, (_, i) => i + 1);

  for (let col = 0; col < size; col++) {
    const column = latin.square.map(row => row[col]);
    const sorted = column.sort((a, b) => a - b);
    expect(sorted).toEqual(expected);
  }
});

test('Latin Square produces identical outputs for given inputs', () => {
  const a = new Latin(4);
  const b = new Latin(4);

  expect(a.square).toEqual(b.square);
});
