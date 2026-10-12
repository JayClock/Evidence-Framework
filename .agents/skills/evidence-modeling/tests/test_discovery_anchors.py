"""Executable examples and interaction flow contracts, not live behavior evidence."""
import hashlib
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
DISCOVERY = SKILLS / 'evidence-discovery'
EXAMPLES = DISCOVERY / 'examples'


class DiscoveryAnchorTests(unittest.TestCase):
    def test_examples_are_action_scoped_and_material_bound(self):
        self.assertIn('examples/README.md', (DISCOVERY / 'SKILL.md').read_text())
        index = (EXAMPLES / 'README.md').read_text()
        for name in ('focused-turn.md', 'navigation.md', 'control-and-recovery.md'):
            self.assertIn(f']({name})', index)
            self.assertTrue((EXAMPLES / name).is_file())
        self.assertIn('合成', index)
        self.assertIn('实际判断', index)

    def test_flow_has_failure_control_navigation_question_and_wait_exits(self):
        text = (DISCOVERY / 'references/interview.md').read_text()
        graph = re.search(r'```mermaid\n(.*?)```', text, re.S)
        self.assertIsNotNone(graph)
        assert graph is not None
        edges = set(re.findall(r'(?m)^\s*(\w+) -->\s*(?:\|[^|]+\|\s*)?(\w+)', graph[1]))
        required = {('input', 'understanding'), ('understanding', 'language'),
                    ('language', 'languageSaved'), ('languageSaved', 'failed'),
                    ('languageSaved', 'control'), ('control', 'stop'), ('control', 'navigation'),
                    ('control', 'selection'), ('selection', 'wait'), ('selection', 'focus'),
                    ('navigation', 'wait'), ('focus', 'needed'), ('needed', 'question'),
                    ('needed', 'handoff'), ('question', 'wait')}
        self.assertTrue(required.issubset(edges), edges)
        self.assertFalse(any(start in {'failed', 'stop', 'handoff', 'wait'} for start, _ in edges))

    def test_source_free_glossary_passes_real_checker_without_writes(self):
        path = EXAMPLES / 'glossary.json'
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        run = subprocess.run([sys.executable, '-B', str(SKILLS / 'evidence-fm/scripts/check_glossary.py'),
                              str(path)], capture_output=True, text=True, timeout=30, check=False)
        self.assertEqual(0, run.returncode, run.stdout + run.stderr)
        result = json.loads(run.stdout)
        self.assertTrue(result['valid'])
        self.assertEqual(1, result['termCount'])
        self.assertNotIn('sourceRefs', json.loads(path.read_text())['terms'][0])
        self.assertEqual(before, hashlib.sha256(path.read_bytes()).hexdigest())

    def test_focused_displays_have_only_necessary_questions(self):
        text = (EXAMPLES / 'focused-turn.md').read_text()
        displays = re.findall(r'```text\n(.*?)```', text, re.S)
        self.assertEqual(3, len(displays))
        self.assertEqual([1, 0, 1], [display.count('？') for display in displays])
        for display in displays:
            self.assertTrue(display.startswith('当前位置：'))
            self.assertNotRegex(display, r'已明确：|正在澄清：|尚缺依据：|https?://')
        self.assertIn('退款申请（Refund Application）〔履约请求〕', displays[0])
        self.assertIn('责任人：读者（Reader）', displays[0])
        self.assertIn('客户领域（Customer Domain）→ 客户档案（Customer Profile）', displays[2])
        self.assertNotIn('履约请求', displays[2])


if __name__ == '__main__':
    unittest.main()
