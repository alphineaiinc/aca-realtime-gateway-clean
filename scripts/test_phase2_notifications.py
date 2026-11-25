"""Offline regression checks for Phase 2 issue notification detector (no GitHub writes)."""
import os
import pathlib
import subprocess
import tempfile
import unittest

WORKFLOW = pathlib.Path(__file__).resolve().parents[1] / ".github/workflows/phase2-item-notifications.yml"
def run_detector(old, new):
    workflow = WORKFLOW.read_text()
    start = workflow.index("          python3 - <<'PY'\n") + len("          python3 - <<'PY'\n")
    end = workflow.index("\n          PY", start)
    script = "\n".join(line[10:] for line in workflow[start:end].splitlines())
    with tempfile.TemporaryDirectory() as temp:
        output = pathlib.Path(temp) / "output"
        env = {**os.environ, "OLD_BODY": old, "NEW_BODY": new,
               "GITHUB_OUTPUT": str(output), "GITHUB_REPOSITORY": "example/repo"}
        p = subprocess.run(["python3", "-c", script], env=env, capture_output=True, text=True, cwd=temp)
        if p.returncode: raise AssertionError(p.stderr)
        return output.read_text(), (pathlib.Path("/tmp/phase2-message.txt").read_text())

class NotificationTests(unittest.TestCase):
    def test_checked_transition(self):
        output, message = run_detector("- [ ] Finish task", "- [x] Finish task")
        self.assertIn("notify=true", output)
        self.assertIn("Finish task", message)
    def test_unrelated_edit_no_notification(self):
        output, _ = run_detector("- [x] Finish task\nold", "- [x] Finish task\nnew")
        self.assertIn("notify=false", output)
    def test_checked_item_rename_no_notification(self):
        output, _ = run_detector("- [x] Old task", "- [x] Renamed task")
        self.assertIn("notify=false", output)
    def test_new_checked_item_no_notification(self):
        output, _ = run_detector("", "- [x] New task")
        self.assertIn("notify=false", output)
    def test_manual_intervention(self):
        output, message = run_detector("abc", "abc\n<!-- phase2-owner-action: Approve PR 119 -->")
        self.assertIn("notify=true", output)
        self.assertIn("Approve PR 119", message)
    def test_no_repeat_manual_intervention(self):
        marker = "<!-- phase2-owner-action: Approve PR 119 -->"
        output, _ = run_detector(marker, marker + "\nother update")
        self.assertIn("notify=false", output)

if __name__ == "__main__":
    unittest.main()
