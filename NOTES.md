# Benchmark: markdown-render-speed-02 entry vs baseline

## Environment

- **Machine**: x86-64 Linux, AMD EPYC 9D25 126-Core Processor
- **Memory**: 7.7 GiB total
- **Node**: v22
- **Kit data**: 720 practice cases from the competition kit

## Method

1. One warmup run per program (discarded).
2. 6 retained runs per program, alternating entry then baseline each round.
3. Each run is a fresh `node main.ts` process started via `subprocess.run`.
4. Wall clock measured with `time.perf_counter()`; CPU time measured as the delta of `resource.getrusage(RUSAGE_CHILDREN).ru_utime + ru_stime` before and after each child process.
5. Median of 6 runs reported.

## Raw numbers

### Entry (this parse.js)

| Run | Wall (s) | CPU (s) |
|-----|----------|---------|
| 1   | 1.6967   | 2.3822  |
| 2   | 1.7236   | 2.4792  |
| 3   | 1.7664   | 2.5323  |
| 4   | 1.6910   | 2.3817  |
| 5   | 1.7096   | 2.3659  |
| 6   | 1.7674   | 2.5378  |

### Baseline (marked 18.1.3 via vendor/marked)

| Run | Wall (s) | CPU (s) |
|-----|----------|---------|
| 1   | 1.4008   | 1.8183  |
| 2   | 1.3909   | 1.8199  |
| 3   | 1.4550   | 1.9469  |
| 4   | 1.3486   | 1.7785  |
| 5   | 1.3191   | 1.7269  |
| 6   | 1.2787   | 1.7233  |

## Results

| Metric        | Entry   | Baseline | Ratio (base/entry) |
|---------------|---------|----------|--------------------|
| Median wall   | 1.7166s | 1.3697s  | 0.80x              |
| Median CPU    | 2.4307s | 1.7984s  | 0.74x              |

**The entry is slower than the baseline.** The baseline (marked 18.1.3) uses approximately 0.74× the CPU time of this entry, meaning this entry uses about 1.35× more CPU time. In wall-clock terms the baseline is about 1.25× faster.
