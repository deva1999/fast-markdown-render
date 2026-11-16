# Development and benchmark record

The starting draft passed 706/720 practice cases. All six deliverables were written in full in this recorded session; that rewrite retained 706/720. Subsequent fixes reached 720/720: all 680 specification examples and all 40 generated documents. The final driver output also matches every reference string. This verifies the practice set; it does not prove equivalence for every possible Markdown input or the unreleased scored set.

The fixes address link-label backtick scanning, HTML anchor state, invalid HTML candidates in emphasis planning, interacting emphasis runs, whitespace after terminated HTML blocks, and tab preservation and fence dedenting. The parser keeps all mutable reference and rendering state within a parse call. It has no dependencies, output lookup tables, clock reads, network access, or cross-case caches.

## Optimization hypothesis

The reference-collection pass discarded rendered HTML, so skipping its inline rendering should reduce CPU use without changing the discovered definitions. Reusing the block-tag regular expression, rejecting non-HTML lines early, checking email boundaries before matching, bypassing delimiter planning for plain text, and scanning ordinary inline text in runs should reduce repeated work. Every retained optimization passed a complete 720-case comparison. A local CPU profile guided these changes; profiling was disabled for the final measurements.

An early trial measured approximately 3.724348 s median entry CPU against 1.759416 s baseline CPU. Its last pair overlapped a profiling experiment, so it is diagnostic only. An intermediate clean trial measured 2.663078 s entry CPU and 1.799675 s baseline CPU. The final clean trial below is the benchmark for the submitted files.

## Final benchmark

Environment: Linux, AMD EPYC 9D25 126-Core Processor host, 4 CPUs visible through os.cpu_count(), Node v24.22.1. Processes were not pinned to a CPU. Node 22 was not available locally, so the competition's pinned Node 22.23.4 container was not benchmarked. These local numbers are not cgroup measurements and do not subtract a null-entry control.

Both programs read the same practice/input/cases.json and write html.json through the MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR overrides. The entry command was `node main.ts` from this repository; the baseline command was `node baselines/main.ts` from the kit. A Python parent alternated entry then baseline, starting a fresh Node process for every execution. Wall time used the parent's monotonic performance counter; CPU time was the child user-plus-system delta from resource.getrusage(RUSAGE_CHILDREN), including Node startup and worker threads. Measurement clocks exist only in the external benchmark tool, not the deliverables.

One warmup per program was discarded: entry wall/CPU 1.913612/2.639570 s; baseline 1.387745/1.741710 s. Five subsequent runs per program were retained:

| Run | Entry wall (s) | Entry CPU (s) | Baseline wall (s) | Baseline CPU (s) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1.695241 | 2.367415 | 1.331907 | 1.745163 |
| 2 | 1.857437 | 2.571551 | 1.386232 | 1.822575 |
| 3 | 2.075429 | 2.950024 | 1.408993 | 1.786517 |
| 4 | 1.799380 | 2.587896 | 1.469215 | 1.919540 |
| 5 | 1.914740 | 2.690653 | 1.425849 | 1.812949 |
| Median | 1.857437 | 2.587896 | 1.408993 | 1.812949 |

CPU speedup, baseline divided by entry: 0.700549x. Wall speedup: 0.758568x. The entry is slower than marked in this environment despite the retained optimizations; no claim of beating the baseline is made.

## Correctness and determinism

The final parser passed 720/720 against both the vendored marked 18.1.3 and the practice expected.json. Two fresh driver executions produced byte-identical html.json files, checked with cmp, and every decoded output string matched the expected reference. Determinism was checked again after optimization. All six deliverable files together are below the 1 MiB repository cap; scratch tools and checkpoints are excluded from commits.

No remote grade, transcript-gate verdict, push, or submission was performed. Reading and retyping draft code does not by itself establish authored coverage under the competition's transcript rules.
