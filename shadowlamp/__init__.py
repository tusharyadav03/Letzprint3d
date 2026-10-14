"""Shadow Lamp engine — themes / photos / text -> printable lithophane & shadow lamps.

    python -m shadowlamp themes
    python -m shadowlamp make --theme om --text "Shubh Deepavali" --with-base --out out/om
    python -m shadowlamp make --image photo.jpg --mode litho --out out/photo
    python -m shadowlamp samples --out out/samples
"""
from .lamp import LampSpec, build, compose  # noqa: F401
from .themes import THEMES  # noqa: F401

__version__ = "0.1.0"
