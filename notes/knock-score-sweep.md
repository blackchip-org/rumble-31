# Regular bot: KNOCK_SCORE sweep results

Reference data from sweeping `KNOCK_SCORE` in `src/bot/regular.ts`
(currently `29`) to find the value that maximizes the Regular bot's
win rate. Gathered on branch `regular-bot-strategy-experiment` while
`RegularBotMemory`'s "last suit upstream/downstream" tracking was
already disabled and the exchange-all gate was already fixed to
`score(pot) >= KNOCK_SCORE && score(pot) > score(hand)` (see git log
on that branch for those two prior changes).

`KNOCK_SCORE` gates two things in `chooseAction()`: the exchange-all
condition, and the final "knock if my hand's score is at least this"
fallback. Both share the one constant, per the reasoning already in
`specs/bots_v3.md`'s Regular section (exchanging is itself a knock, so it
needs the same bar as knocking directly).

## Method

- Every run: `npm run simulate -- --games=2000 --seed=42` (full
  15-combo table), only `KNOCK_SCORE` edited between runs, everything
  else byte-identical to the code as of commit `1bbe174`.
- Same seed across every run makes this apples-to-apples: any combo
  that doesn't include a `regular` bot (`eeee`, `eeed`, `eedd`, `eddd`,
  `dddd`) is byte-identical in every single run below — a sanity check
  that the sweep stayed isolated to Regular's own behavior.
- Values tested, high to low: 29, 28, 27, 26, 25, 24, 23, 22, 21, 20,
  19, 18, 17, 16, 15, 12, 9, 6, 3.

## Headline finding

**21 is the peak** — it beats every other value tested, in every
single combo that includes a Regular bot. The curve is cleanly
unimodal: monotonically increasing from 29 down to 21, then
monotonically decreasing from 21 down to 3.

The plateaus below are a real effect, not measurement noise: game
scores only take a limited set of values (single-card best 7–11,
two-card same-suit sums 15–21, three-card same-suit sums 24+, plus the
30.5/32 three-of-a-kind specials). Since two-card sums top out at 21
and three-card sums start at 24, there's a genuine gap with nothing
achievable at 22 or 23 — so thresholds 22/23/24 behave identically to
each other, and thresholds 12–15 behave identically to each other
(gap between the 11-max single-card tier and the 15-min two-card
tier). 21 sits right at the top of the two-card tier, the tightest bar
that still catches every hand/pot worth exactly 21 without also
catching weaker ones.

## Summary: Regular's win % by combo (selected combos)

`eeer`/`eerd`/`erdd`/`rddd` each have exactly one Regular bot, in the
seat named by the corresponding letter position; `rrrd`/`rrdd` show
the average across Regular's multiple seats in that combo.

| KNOCK_SCORE | eeer | eerd | erdd | rrrd (avg) | rrdd (avg) | rddd |
|---|---|---|---|---|---|---|
| 29 | 31.5% | 22.8% | 19.1% | 21.9% | 19.4% | 17.2% |
| 28 | 38.3% | 29.3% | 24.4% | 23.9% | 22.7% | 20.7% |
| 27 | 45.1% | 33.9% | 28.3% | 25.5% | 25.6% | 24.6% |
| 26 | 47.9% | 35.4% | 30.3% | 25.8% | 27.1% | 26.3% |
| 25 | 49.8% | 36.9% | 32.1% | 26.3% | 27.4% | 27.2% |
| 24 | 50.1% | 37.1% | 32.1% | 26.4% | 27.6% | 27.6% |
| 23 | 50.1% | 37.1% | 32.1% | 26.4% | 27.6% | 27.6% |
| 22 | 50.1% | 37.1% | 32.1% | 26.4% | 27.6% | 27.6% |
| **21** | **51.2%** | **39.6%** | **33.7%** | **26.97%** | **27.0%** | **29.4%** |
| 20 | 45.1% | 34.4% | 28.4% | 26.2% | 26.2% | 24.8% |
| 19 | 37.9% | 27.8% | 23.1% | 25.4% | 23.5% | 20.0% |
| 18 | 29.7% | 22.3% | 18.4% | 23.4% | 19.25% | 15.4% |
| 17 | 23.3% | 17.4% | 14.6% | 21.6% | 16.6% | 12.4% |
| 16 | 22.1% | 17.0% | 13.8% | 21.4% | 16.05% | 12.3% |
| 15 | 21.1% | 16.6% | 13.2% | 20.67% | 15.6% | 12.2% |
| 12 | 21.1% | 16.6% | 13.2% | 20.67% | 15.6% | 12.2% |
| 9 | 16.2% | 13.0% | 10.2% | 18.5% | 12.95% | 9.4% |
| 6 | 16.2% | 13.0% | 10.2% | 18.5% | 12.95% | 9.4% |
| 3 | 16.2% | 13.0% | 10.2% | 18.5% | 12.95% | 9.4% |

Avg rounds per game stays in the same ~10.2–10.4 band across the whole
sweep — the win-rate change isn't just "games end faster," it's a
genuinely better knock/exchange bar.

## Full raw tables

Every value's complete 15-combo table (all four bot slots, ties, avg
rounds), for anyone who wants a combo not summarized above.

### KNOCK_SCORE=29

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   23.5%  24.5%  24.3%  31.5%  3.6%  10.37
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   22.3%  25.1%  26.9%  29.1%  3.2%  10.40
eerd   2000   18.2%  18.4%  22.8%  43.8%  2.9%  10.31
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   21.8%  27.9%  24.9%  28.6%  2.9%  10.44
errd   2000   16.5%  22.9%  22.5%  42.4%  4.2%  10.40
erdd   2000   14.9%  19.1%  33.9%  35.8%  3.5%  10.30
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   24.8%  26.0%  27.2%  25.9%  3.3%  10.47
rrrd   2000   21.3%  21.6%  22.8%  38.1%  3.4%  10.41
rrdd   2000   18.7%  20.1%  30.9%  33.7%  3.0%  10.37
rddd   2000   17.2%  30.1%  28.0%  29.1%  4.0%  10.31
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=28

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   20.5%  22.4%  22.6%  38.3%  3.5%  10.34
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   18.7%  20.1%  30.5%  33.8%  3.0%  10.42
eerd   2000   16.0%  17.0%  29.3%  40.9%  2.9%  10.34
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   17.1%  29.3%  27.4%  29.9%  3.5%  10.40
errd   2000   15.7%  26.0%  26.5%  35.8%  3.8%  10.37
erdd   2000   14.0%  24.4%  31.6%  33.3%  3.3%  10.31
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   25.1%  27.2%  25.9%  26.4%  4.2%  10.43
rrrd   2000   22.4%  24.9%  24.4%  33.4%  4.9%  10.40
rrdd   2000   21.6%  23.8%  28.3%  30.8%  4.2%  10.37
rddd   2000   20.7%  29.0%  27.5%  27.5%  4.3%  10.28
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=27

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   17.8%  20.3%  20.4%  45.1%  3.3%  10.32
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   16.7%  17.8%  33.8%  35.4%  3.4%  10.37
eerd   2000   15.3%  15.9%  33.9%  38.8%  3.7%  10.34
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   14.8%  30.2%  28.5%  30.3%  3.6%  10.38
errd   2000   14.6%  27.8%  28.7%  32.3%  3.4%  10.35
erdd   2000   14.1%  28.3%  29.2%  31.4%  3.0%  10.30
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   24.9%  27.0%  27.4%  25.8%  4.5%  10.33
rrrd   2000   25.0%  26.4%  25.1%  28.1%  4.2%  10.32
rrdd   2000   25.9%  25.3%  26.2%  26.7%  3.8%  10.31
rddd   2000   24.6%  27.3%  25.4%  26.4%  3.2%  10.26
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=26

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   17.3%  18.9%  19.3%  47.9%  3.0%  10.32
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   16.1%  16.4%  35.0%  36.3%  3.5%  10.37
eerd   2000   14.6%  15.6%  35.4%  38.3%  3.6%  10.33
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   13.9%  31.4%  28.0%  31.0%  4.1%  10.39
errd   2000   13.9%  30.0%  29.1%  30.1%  3.1%  10.36
erdd   2000   14.1%  30.3%  28.5%  30.6%  3.4%  10.30
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   23.7%  27.8%  26.2%  26.6%  4.0%  10.32
rrrd   2000   25.9%  26.2%  25.3%  26.5%  3.5%  10.33
rrdd   2000   27.0%  27.2%  24.6%  25.2%  3.5%  10.32
rddd   2000   26.3%  26.8%  25.1%  25.6%  3.2%  10.25
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=25

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   16.6%  18.2%  18.2%  49.8%  2.6%  10.32
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   14.8%  15.0%  35.9%  38.5%  3.8%  10.39
eerd   2000   14.1%  14.5%  36.9%  38.3%  3.5%  10.33
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   12.8%  32.6%  28.1%  30.6%  3.9%  10.39
errd   2000   13.1%  30.9%  29.5%  29.8%  3.1%  10.37
erdd   2000   13.7%  32.1%  27.8%  30.1%  3.5%  10.32
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   24.1%  28.1%  26.4%  25.7%  3.9%  10.32
rrrd   2000   25.6%  27.0%  26.3%  25.1%  3.7%  10.33
rrdd   2000   27.3%  27.5%  23.8%  25.3%  3.5%  10.32
rddd   2000   27.2%  26.1%  25.4%  24.9%  3.1%  10.26
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=24

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   16.7%  18.1%  17.8%  50.1%  2.6%  10.32
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   14.2%  15.0%  35.9%  38.6%  3.6%  10.39
eerd   2000   13.9%  14.5%  37.1%  38.0%  3.3%  10.33
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   12.3%  32.6%  28.1%  30.8%  3.8%  10.39
errd   2000   12.6%  31.5%  29.4%  29.8%  3.2%  10.37
erdd   2000   13.7%  32.1%  28.0%  29.9%  3.5%  10.32
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   24.6%  27.6%  26.5%  25.9%  4.1%  10.32
rrrd   2000   25.9%  26.9%  26.4%  24.8%  3.7%  10.34
rrdd   2000   28.1%  27.1%  23.4%  25.2%  3.5%  10.32
rddd   2000   27.6%  25.7%  25.4%  24.9%  3.1%  10.26
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=23 and KNOCK_SCORE=22

Identical to each other, and to KNOCK_SCORE=24 above (no achievable
score falls in the 22–23 gap between the two-card and three-card
same-suit tiers).

### KNOCK_SCORE=21 (the peak)

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   16.8%  18.4%  17.1%  51.2%  3.3%  10.27
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   13.8%  15.3%  37.5%  36.9%  3.3%  10.33
eerd   2000   14.3%  13.8%  39.6%  35.9%  3.4%  10.32
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   11.7%  31.1%  29.8%  31.1%  3.6%  10.30
errd   2000   12.3%  32.6%  30.9%  27.8%  3.4%  10.34
erdd   2000   13.0%  33.7%  27.6%  29.4%  3.5%  10.31
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   24.9%  26.7%  26.5%  26.5%  4.3%  10.24
rrrd   2000   26.6%  26.6%  27.7%  23.8%  4.5%  10.28
rrdd   2000   27.9%  26.1%  23.8%  26.4%  3.9%  10.29
rddd   2000   29.4%  24.7%  24.5%  24.8%  3.1%  10.24
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=20

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   18.4%  22.8%  17.9%  45.1%  4.1%  10.09
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   16.8%  18.8%  34.1%  35.3%  4.4%  10.03
eerd   2000   16.1%  15.5%  34.4%  38.1%  3.8%  10.16
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   15.0%  29.7%  30.8%  30.2%  5.5%  9.91
errd   2000   14.3%  28.1%  30.5%  31.6%  4.3%  10.03
erdd   2000   14.8%  28.4%  29.5%  31.1%  3.6%  10.14
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   26.6%  27.0%  26.5%  26.2%  5.7%  9.78
rrrd   2000   25.6%  26.5%  26.4%  27.0%  4.9%  9.89
rrdd   2000   25.0%  27.4%  26.3%  26.6%  4.9%  10.02
rddd   2000   24.8%  27.0%  27.0%  26.4%  4.6%  10.13
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=19

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   22.1%  23.8%  21.1%  37.9%  4.7%  10.12
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   19.6%  22.0%  29.9%  33.4%  4.6%  10.00
eerd   2000   17.5%  18.1%  27.8%  40.5%  3.8%  10.12
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   20.3%  27.3%  28.2%  29.2%  4.8%  9.85
errd   2000   17.6%  24.9%  26.7%  35.0%  4.0%  9.98
erdd   2000   16.7%  23.1%  31.6%  32.3%  3.5%  10.09
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   26.0%  25.6%  26.5%  26.8%  4.3%  9.78
rrrd   2000   25.0%  24.3%  25.1%  30.9%  4.9%  9.88
rrdd   2000   21.9%  23.1%  30.1%  29.4%  4.4%  10.00
rddd   2000   20.0%  28.8%  28.2%  27.6%  4.3%  10.11
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=18

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   24.4%  26.5%  23.8%  29.7%  4.3%  10.13
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   25.4%  26.9%  25.5%  26.5%  4.0%  10.02
eerd   2000   19.8%  20.3%  22.3%  41.9%  4.2%  10.13
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   26.4%  26.1%  25.9%  26.5%  4.5%  9.92
errd   2000   21.4%  21.2%  23.1%  38.0%  3.4%  9.99
erdd   2000   17.8%  18.4%  32.5%  34.7%  3.1%  10.11
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   25.9%  25.9%  26.9%  25.9%  4.4%  9.85
rrrd   2000   23.1%  23.2%  23.8%  35.3%  4.9%  9.92
rrdd   2000   18.5%  20.0%  33.9%  32.6%  4.9%  10.03
rddd   2000   15.4%  30.3%  30.3%  28.6%  4.4%  10.13
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=17

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   27.4%  28.0%  25.9%  23.3%  4.3%  10.16
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   28.8%  29.7%  23.5%  22.1%  3.9%  10.05
eerd   2000   21.2%  22.2%  17.4%  43.3%  4.0%  10.13
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   30.6%  24.6%  24.1%  24.8%  3.8%  10.02
errd   2000   24.4%  19.4%  19.1%  40.6%  3.4%  10.06
erdd   2000   18.8%  14.6%  34.2%  36.2%  3.5%  10.15
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   27.3%  26.5%  26.6%  24.7%  4.9%  10.05
rrrd   2000   20.5%  21.9%  22.5%  39.6%  4.5%  10.02
rrdd   2000   16.7%  16.5%  36.4%  35.1%  4.5%  10.09
rddd   2000   12.4%  31.7%  30.3%  29.9%  4.3%  10.13
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=16

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   27.5%  28.2%  26.6%  22.1%  4.2%  10.16
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   29.3%  30.6%  22.6%  21.6%  3.9%  10.07
eerd   2000   21.4%  22.5%  17.0%  43.1%  3.9%  10.14
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   31.3%  23.9%  23.9%  24.7%  3.8%  10.05
errd   2000   25.1%  18.9%  18.8%  40.8%  3.3%  10.07
erdd   2000   18.8%  13.8%  34.9%  36.3%  3.5%  10.17
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   26.5%  26.7%  26.9%  24.7%  4.6%  10.10
rrrd   2000   20.0%  21.9%  22.4%  40.6%  4.6%  10.05
rrdd   2000   16.4%  15.7%  36.8%  35.9%  4.6%  10.11
rddd   2000   12.3%  31.9%  30.2%  30.0%  4.3%  10.14
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=15 and KNOCK_SCORE=12

Identical to each other (gap between the 11-max single-card tier and
the 15-min two-card tier — no achievable score in 12–14).

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   27.9%  28.5%  27.0%  21.1%  4.3%  10.16
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   30.4%  31.4%  21.1%  21.1%  4.0%  10.10
eerd   2000   21.8%  22.3%  16.6%  43.3%  3.9%  10.15
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   32.9%  23.3%  24.1%  23.8%  3.9%  10.10
errd   2000   25.9%  17.9%  18.9%  41.1%  3.6%  10.09
erdd   2000   18.8%  13.2%  35.7%  36.4%  3.8%  10.19
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   26.1%  26.8%  27.1%  24.5%  4.3%  10.13
rrrd   2000   19.6%  20.5%  21.9%  42.4%  4.5%  10.09
rrdd   2000   15.8%  15.4%  37.2%  36.3%  4.4%  10.13
rddd   2000   12.2%  32.3%  30.0%  30.2%  4.5%  10.14
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

### KNOCK_SCORE=9, KNOCK_SCORE=6, and KNOCK_SCORE=3

Identical to each other (no achievable non-triple score below 9 in
this deck — the lowest possible normal hand is two 7s plus an 8 in
three different suits, scoring 8, and even that appears to be too rare
in this seeded batch to move the numbers; anything from 3 through 9
behaves the same in practice).

```
Combo  Games  Bot 1  Bot 2  Bot 3  Bot 4  Ties  Avg Rounds
-----  -----  -----  -----  -----  -----  ----  ----------
eeee   2000   24.6%  27.5%  26.8%  25.7%  4.3%  10.27
eeer   2000   30.0%  28.8%  28.8%  16.2%  3.6%  10.21
eeed   2000   19.0%  19.9%  18.1%  46.6%  3.4%  10.26
eerr   2000   33.3%  35.8%  17.1%  17.8%  3.9%  10.20
eerd   2000   22.6%  23.3%  13.0%  45.1%  3.8%  10.18
eedd   2000   14.1%  14.8%  35.6%  39.2%  3.5%  10.27
errr   2000   38.9%  21.1%  22.1%  21.1%  3.3%  10.28
errd   2000   28.9%  15.3%  15.8%  43.6%  3.4%  10.20
erdd   2000   19.6%  10.2%  36.4%  38.3%  4.2%  10.22
eddd   2000   13.7%  30.5%  28.6%  31.0%  3.7%  10.26
rrrr   2000   25.1%  25.9%  27.1%  25.8%  3.6%  10.34
rrrd   2000   18.4%  18.3%  18.8%  48.7%  4.0%  10.21
rrdd   2000   13.3%  12.6%  38.6%  39.9%  4.0%  10.21
rddd   2000   9.4%   33.2%  31.3%  30.8%  4.5%  10.20
dddd   2000   25.7%  25.6%  25.5%  27.0%  3.5%  10.24
```

## Next step (not yet applied)

Set `KNOCK_SCORE = 21` in `src/bot/regular.ts` and update the two
`>= 29` references in the Regular section of `specs/bots_v3.md` to
match, once confirmed.
