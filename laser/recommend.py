"""Laser settings from the baseline in InvenTree plus logged attempts.

Port of LaserLog's src/lib/server/recommend.ts. Each data point gets a weight

    outcome score x recency x thickness closeness (x 0.5 for the baseline)

and speed, power and passes are the weighted averages of the good ones.
Failed and risky attempts are left out of the average and become a warning.
"""
from dataclasses import dataclass

OUTCOME_SCORES = {'failed': 0.0, 'risky': 0.25, 'partial': 0.6, 'clean': 1.0}
BASELINE_WEIGHT = 0.5
HALF_LIFE_DAYS = 90
THICKNESS_TOLERANCE_MM = 1.0

# Above ~90 % the tube gives hardly any extra power and the supply is stressed.
MAX_POWER = 90

# Engrave strength s runs 0..1; the averages hold for s = 0.5.
# power x (POWER_BASE + s), speed x (SPEED_BASE - s): stronger = more power, slower.
DEFAULT_STRENGTH = 0.5
POWER_BASE = 0.5
SPEED_BASE = 1.5


@dataclass
class Point:
    thickness_mm: float
    speed: float
    power: float
    passes: int
    outcome: str
    baseline: bool = False
    days_old: float = 0.0
    strength: float | None = None


def strength_factors(strength: float) -> tuple[float, float]:
    """(speed factor, power factor) for an engrave strength of 0..1."""
    s = min(max(strength, 0.0), 1.0)
    return SPEED_BASE - s, POWER_BASE + s


def normalise(p: Point) -> Point:
    """Bring an engrave attempt back to what it would be at the default strength."""
    if p.strength is None:
        return p
    speed_f, power_f = strength_factors(p.strength)
    return Point(p.thickness_mm, p.speed / speed_f, p.power / power_f, p.passes,
                 p.outcome, p.baseline, p.days_old, None)


def recommend(points: list[Point], thickness_mm: float, operation: str,
              strength: float = DEFAULT_STRENGTH) -> dict:
    near = [normalise(p) for p in points
            if abs(p.thickness_mm - thickness_mm) <= THICKNESS_TOLERANCE_MM]
    # The library holds a row for exactly this thickness: that row is the
    # baseline, not a blend with the neighbouring thicknesses. Reports still count.
    if any(p.baseline and p.thickness_mm == thickness_mm for p in near):
        near = [p for p in near if not p.baseline or p.thickness_mm == thickness_mm]
    nearest = min((p.thickness_mm for p in points),
                  key=lambda t: abs(t - thickness_mm), default=None)

    good = [p for p in near if OUTCOME_SCORES[p.outcome] > 0.25]
    bad = [p for p in near if OUTCOME_SCORES[p.outcome] <= 0.25]

    warning = None
    if bad:
        lo, hi = min(p.power for p in bad), max(p.power for p in bad)
        what = 'fire / melting' if any(p.outcome == 'risky' for p in bad) else 'no result'
        power = f'{lo:.0f}' if lo == hi else f'{lo:.0f}-{hi:.0f}'
        warning = f"{len(bad)} {'attempt' if len(bad) == 1 else 'attempts'} at power {power} % gave {what}"

    reports = sum(1 for p in good if not p.baseline)
    if not good:
        return {'operation': operation, 'speed': None, 'power': None, 'passes': None,
                'confidence': 'none', 'reportCount': 0, 'nearestThickness': nearest,
                'avoidWarning': warning, 'capped': False}

    total = speed = power = passes = 0.0
    for p in good:
        recency = 1.0 if p.baseline else 0.5 ** (p.days_old / HALF_LIFE_DAYS)
        closeness = 1 / (1 + abs(p.thickness_mm - thickness_mm))
        w = OUTCOME_SCORES[p.outcome] * recency * closeness * (BASELINE_WEIGHT if p.baseline else 1)
        speed += p.speed * w
        power += p.power * w
        passes += p.passes * w
        total += w

    speed, power, passes = speed / total, power / total, passes / total
    if operation == 'engrave':
        speed_f, power_f = strength_factors(strength)
        speed, power = speed * speed_f, power * power_f

    capped = power > MAX_POWER
    confidence = 'baseline' if reports == 0 else 'low' if reports < 3 else 'good'
    return {
        'operation': operation,
        'speed': round(speed),
        'power': round(min(power, MAX_POWER)),
        'passes': max(1, round(passes)),
        'confidence': confidence,
        'reportCount': reports,
        'nearestThickness': nearest,
        'avoidWarning': warning,
        'capped': capped,
    }
