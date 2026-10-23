"""Produce synthetic files for HTTP integration tests; no institution data."""
import importlib.util
import shutil
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('fixtures', Path(__file__).with_name('attachment_extract_test.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
fixture = module.AttachmentTest()
fixture.setUp()
try:
    for make in (fixture.pdf, fixture.xlsx, fixture.hwpx):
        source = make()
        shutil.copyfile(source, Path(sys.argv[1]) / source.name)
finally:
    fixture.doCleanups()
