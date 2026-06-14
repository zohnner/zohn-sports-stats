"""Evergreen MLB fun facts for the social digest — date-seeded rotation.
These are stable, well-known facts; still worth a sanity check before posting.
"""
from datetime import date

FACTS = [
    "A regulation baseball has exactly 108 double stitches.",
    "The bases are 90 feet apart, and the pitcher's rubber sits 60 feet 6 inches from home plate.",
    "Joe DiMaggio's 56-game hitting streak (1941) has stood for over 80 years.",
    "Cal Ripken Jr. played 2,632 consecutive games — the 'Iron Man' streak.",
    "Cy Young won 511 games, a career record that may never be broken.",
    "Nolan Ryan threw a record seven no-hitters.",
    "Rickey Henderson is the all-time stolen base leader with 1,406.",
    "Barry Bonds hit 73 home runs in 2001, the single-season record.",
    "Babe Ruth started his career as a pitcher for the Boston Red Sox.",
    "The Chicago Cubs went 108 years between World Series titles (1908–2016).",
    "Jackie Robinson's No. 42 is retired across all of Major League Baseball.",
    "Fenway Park, opened in 1912, is the oldest active ballpark in MLB.",
    "Fenway's left-field wall, the Green Monster, stands 37 feet tall.",
    "An 'immaculate inning' is striking out the side on nine pitches.",
    "A 'golden sombrero' is striking out four times in a single game.",
    "Ichiro Suzuki collected 262 hits in 2004 — the most in a single season.",
    "The 'Mendoza Line' refers to a .200 batting average.",
    "Hank Aaron held the career home run record (755) for 33 years.",
    "MLB teams play a 162-game regular season.",
    "A baseball weighs between 5 and 5.25 ounces.",
    "The seventh-inning stretch is a baseball tradition more than a century old.",
    "The Cy Young Award is named for pitcher Denton 'Cy' Young.",
]

def pick(d: date | None = None) -> str:
    """Deterministic fact for a given date — rotates daily, repeats yearly-ish."""
    d = d or date.today()
    return FACTS[d.toordinal() % len(FACTS)]
