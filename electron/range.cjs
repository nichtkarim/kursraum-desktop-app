function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) throw new Error('INVALID_RANGE');
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!suffix) throw new Error('INVALID_RANGE');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) throw new Error('INVALID_RANGE');
  return { start, end };
}

module.exports = { parseRange };
