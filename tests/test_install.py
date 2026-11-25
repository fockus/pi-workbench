import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class InstallSafetyTests(unittest.TestCase):
    def test_launcher_symlink_uses_core_from_checkout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            launcher = root / "repo/scripts/pi"
            launcher.parent.mkdir(parents=True)
            launcher.write_bytes((ROOT / "scripts/pi").read_bytes())
            launcher.chmod(0o755)
            core = root / "repo/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
            core.parent.mkdir(parents=True)
            core.write_text("console.log('checkout', process.argv[2]);\n")
            link = root / "pi"
            link.symlink_to(launcher)
            result = subprocess.run([str(link), "--version"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "checkout --version")

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
