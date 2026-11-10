"""Run sample generation + all gates; logs to hone/."""
import subprocess
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
hone = here.parent / "hone"
(hone / "gates.done").unlink(missing_ok=True)
for script, log in (("make_sample.py", "sample.log"), ("gates.py", "gates.log")):
    with open(hone / log, "w", encoding="utf-8") as fh:
        subprocess.run([sys.executable, "-u", script], cwd=here, stdout=fh, stderr=subprocess.STDOUT)
