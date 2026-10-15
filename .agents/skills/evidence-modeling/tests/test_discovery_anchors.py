"""Executable examples and interaction flow contracts, not live behavior evidence."""
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
DISCOVERY = SKILLS / 'evidence-discovery'
EXAMPLES = DISCOVERY / 'examples'


class DiscoveryAnchorTests(unittest.TestCase):
    def test_examples_are_action_scoped_and_material_bound(self):
        self.assertIn('examples/README.md', (DISCOVERY / 'SKILL.md').read_text())
        index = (EXAMPLES / 'README.md').read_text()
        self.assertEqual({'README.md', 'tracing.md', 'navigation.md', 'control-and-recovery.md'},
                         {path.name for path in EXAMPLES.glob('*.md')})
        for name in ('tracing.md', 'navigation.md', 'control-and-recovery.md'):
            self.assertIn(f']({name})', index)
            self.assertTrue((EXAMPLES / name).is_file())
        self.assertIn('合成', index)
        self.assertIn('实际判断', index)

    def test_control_shell_routes_into_tracing_and_preserves_wait_exits(self):
        text = (DISCOVERY / 'references/interview.md').read_text()
        graph = re.search(r'```mermaid\n(.*?)```', text, re.S)
        self.assertIsNotNone(graph)
        assert graph is not None
        edges = set(re.findall(r'(?m)^\s*(\w+) -->\s*(?:\|[^|]+\|\s*)?(\w+)', graph[1]))
        required = {('input', 'understanding'), ('understanding', 'language'),
                    ('control', 'focus'),
                    ('language', 'control'), ('control', 'stop'), ('control', 'navigation'),
                    ('control', 'selection'), ('selection', 'wait'), ('selection', 'focus'),
                    ('navigation', 'wait'), ('focus', 'reuse'), ('reuse', 'judgment'),
                    ('needed', 'group'), ('group', 'question'), ('needed', 'handoff'),
                    ('question', 'wait')}
        self.assertTrue(required.issubset(edges), edges)
        self.assertFalse(any(start in {'stop', 'handoff', 'wait'} for start, _ in edges))

    def test_control_display_reuses_answer_and_stops_without_new_questions(self):
        text = (EXAMPLES / 'control-and-recovery.md').read_text()
        displays = re.findall(r'```text\n(.*?)```', text, re.S)
        self.assertEqual(1, len(displays))
        display = displays[0]
        self.assertTrue(display.startswith('当前位置：'))
        self.assertEqual(0, display.count('？'))
        self.assertNotRegex(display, r'已明确：|正在澄清：|尚缺依据：|https?://')
        self.assertIn('退款申请（Refund Application）〔履约请求〕', display)
        self.assertIn('责任人：读者（Reader）', display)
        self.assertIn('没有修改模型', display)
        for phrase in ('实际文件', '外部新增', '原标识', '已建模定义', '模型编辑授权'):
            self.assertIn(phrase, text)


if __name__ == '__main__':
    unittest.main()
