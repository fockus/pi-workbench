import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.environ.get("PI_WORKBENCH_INTEGRATION") == "1", "requires npm registry access")
class FreshInstallTests(unittest.TestCase):
    def test_install_fresh_home_preserves_plugins_and_starts_pinned_core(self):
        with tempfile.TemporaryDirectory(prefix="pi-workbench-install-") as temporary:
            root = Path(temporary)
            repo = root / "checkout"
            repo.mkdir()
            for name in ("scripts", "patches", "agent"):
                shutil.copytree(ROOT / name, repo / name, ignore=shutil.ignore_patterns(
                    "node_modules", "backups", "__pycache__", "*.pyc",
                ))
            for name in ("package.json", "package-lock.json"):
                shutil.copy2(ROOT / name, repo / name)
            home = root / "home"
            home.mkdir()
            env = {"HOME": str(home), "PATH": os.environ["PATH"], "TMPDIR": str(root)}
            for name in ("npm_config_cache", "npm_config_registry"):
                if name in os.environ:
                    env[name] = os.environ[name]
            result = subprocess.run(
                ["sh", str(repo / "scripts/install.sh")], cwd=root, env=env,
                capture_output=True, text=True, timeout=600,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            installed = home / ".pi/agent"
            self.assertEqual(
                json.loads((installed / "settings.json").read_text())["packages"],
                json.loads((repo / "agent/settings.json").read_text())["packages"],
            )
            self.assertFalse((installed / "auth.json").exists())
            self.assertFalse((installed / "sessions").exists())
            status = subprocess.run(
                ["node", str(installed / "panel-visibility/install.mjs"), "status"],
                env=env, capture_output=True, text=True, check=True,
            )
            self.assertEqual(status.stdout.strip(), "installed")
            inspect_source = (installed / "npm/node_modules/pi-inspect/extensions/inspect.ts").read_text()
            self.assertIn("const activeContexts = new Map", inspect_source)
            version = subprocess.run(
                ["sh", str(repo / "scripts/pi"), "--version"], cwd=root,
                env=env, capture_output=True, text=True, timeout=30, check=True,
            )
            self.assertEqual(version.stdout.strip(), "1.5.0")


if __name__ == "__main__":
    unittest.main()
