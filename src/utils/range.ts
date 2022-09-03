function* positiveIterator(start: number, end: number) {
  for (let i = start; i < end; i++) yield i;
}

function* negativeIterator(start: number, end: number) {
  for (let i = start; i > end; i--) yield i;
}

export const range = (start: number, end: number) => {
  const delta = start - end;
  const iterator = delta < 0 ? positiveIterator : negativeIterator;

  return [...iterator(start, end)];
};
