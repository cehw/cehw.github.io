"""Regression checks for local gallery maintenance, without production media."""
import importlib.util
import json
import shutil
from contextlib import contextmanager
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def fixture_directory():
    scratch = ROOT / '_tmp'
    scratch.mkdir(exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix='gallery-test-', dir=scratch))
    try:
        yield directory
    finally:
        archive = ROOT / '_trash' / 'gallery-tests'
        archive.mkdir(parents=True, exist_ok=True)
        shutil.move(str(directory), str(archive / directory.name))


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / 'gallery' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GalleryMaintenanceTests(unittest.TestCase):
    def test_no_spotlight_keeps_date_unknown(self):
        module = load_script('generate_meta')
        with patch.object(module.shutil, 'which', return_value=None):
            self.assertEqual(module.mdls_creation_date(Path('image.jpg')), '')

    def test_partial_checkout_preserves_metadata_and_thumbnails(self):
        for name in ('generate_meta', 'generate_thumbs'):
            with self.subTest(script=name), fixture_directory() as directory:
                root = Path(directory)
                gallery = root / 'assets' / 'gallery'
                (gallery / 'thumbs').mkdir(parents=True)
                original = json.dumps([{'full': 'missing.jpg', 'thumb': 'thumbs/existing.webp'}])
                (gallery / 'meta.json').write_text(original)
                thumb = gallery / 'thumbs' / 'existing.webp'
                thumb.write_bytes(b'previous thumbnail')
                module = load_script(name)
                with patch.object(module, '__file__', str(root / 'scripts' / 'gallery' / f'{name}.py')):
                    with self.assertRaises(FileNotFoundError):
                        module.main()
                self.assertEqual((gallery / 'meta.json').read_text(), original)
                self.assertEqual(thumb.read_bytes(), b'previous thumbnail')

    def test_stale_thumbnail_is_recoverable(self):
        with fixture_directory() as directory:
            root = Path(directory)
            gallery = root / 'assets' / 'gallery'
            (gallery / 'thumbs' / 'album').mkdir(parents=True)
            (gallery / 'meta.json').write_text('[]')
            stale = gallery / 'thumbs' / 'album' / 'old.webp'
            stale.write_bytes(b'recoverable thumbnail')
            module = load_script('generate_thumbs')
            with patch.object(module, '__file__', str(root / 'scripts' / 'gallery' / 'generate_thumbs.py')):
                module.main()
            self.assertFalse(stale.exists())
            archived = list((root / '_trash').glob('*/album/old.webp'))
            self.assertEqual(len(archived), 1)
            self.assertEqual(archived[0].read_bytes(), b'recoverable thumbnail')


if __name__ == '__main__':
    unittest.main()
