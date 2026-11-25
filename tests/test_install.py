import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class InstallSafetyTests(unittest.TestCase):
    def test_install_existing_agent_preserves_data_before_running_npm(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            target = home / ".pi" / "agent"
            target.mkdir(parents=True)
            sentinel = target / "auth.json"
            sentinel.write_text("private sentinel\n")
            bin_dir = home / "bin"
            bin_dir.mkdir()
            npm = bin_dir / "npm"
            npm.write_text('#!/bin/sh\nprintf called > "$HOME/npm-called"\nexit 99\n')
            npm.chmod(0o755)
            result = subprocess.run(
                ["sh", str(ROOT / "scripts" / "install.sh")],
                env={**os.environ, "HOME": str(home), "PATH": f"{bin_dir}:{os.environ['PATH']}"},
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn("already exists", result.stderr)
            self.assertEqual(sentinel.read_text(), "private sentinel\n")
            self.assertFalse((home / "npm-called").exists())

    def test_install_dangling_agent_symlink_is_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            target = home / ".pi" / "agent"
            target.parent.mkdir()
            target.symlink_to(home / "missing")
            result = subprocess.run(
                ["sh", str(ROOT / "scripts" / "install.sh")],
                env={**os.environ, "HOME": str(home)}, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn("already exists", result.stderr)
            self.assertTrue(target.is_symlink())


if __name__ == "__main__":
    unittest.main()
