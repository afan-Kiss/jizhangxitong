#!/usr/bin/env python3
"""apply-port80-account.py — 见 fix-nginx-account80.py（保留兼容入口）"""
import runpy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
runpy.run_path(str(Path(__file__).resolve().parent / "fix-nginx-account80.py"), run_name="__main__")
