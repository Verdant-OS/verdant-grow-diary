const bench = (size: number, iterations: number) => {
  const arr = Array.from({ length: size }, (_, i) => `tent-${i}`);

  const startUnmemo = performance.now();
  for (let i = 0; i < iterations; i++) {
    const set = arr && arr.length > 0 ? new Set(arr) : null;
  }
  const endUnmemo = performance.now();

  const startMemo = performance.now();
  const memoSet = arr && arr.length > 0 ? new Set(arr) : null;
  for (let i = 0; i < iterations; i++) {
    const set = memoSet;
  }
  const endMemo = performance.now();

  console.log(`Size: ${size}, Iterations: ${iterations}`);
  console.log(`Unmemoized: ${endUnmemo - startUnmemo} ms`);
  console.log(`Memoized: ${endMemo - startMemo} ms`);
};

bench(10, 1000000);
bench(100, 1000000);
