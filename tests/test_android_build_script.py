"""Argument checks must finish before any toolchain download/build activity."""
from pathlib import Path
import subprocess
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/build_android_apk.sh'

class AndroidBuildArguments(unittest.TestCase):
    def run_script(self, *args):
        return subprocess.run(['bash', str(SCRIPT), *args], capture_output=True, text=True, timeout=5)

    def test_help_is_available_without_build_prerequisites(self):
        result = self.run_script('--help')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--local-qa', result.stdout)

    def test_app_dir_requires_a_value(self):
        result = self.run_script('--app-dir')
        self.assertEqual(result.returncode, 2)
        self.assertIn('--app-dir requires', result.stderr)

    def test_app_dir_does_not_consume_an_option(self):
        result = self.run_script('--app-dir', '--prep-only')
        self.assertEqual(result.returncode, 2)
        self.assertIn('--app-dir requires', result.stderr)

if __name__ == '__main__':
    unittest.main()
