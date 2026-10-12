"""Host-independent skill contracts; these do not execute an agent interview."""

import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class UISeparationTests(unittest.TestCase):
    def test_core_protocol_has_no_ui_tool_payload_or_result_dispatch(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for token in ('evidence_ui_', 'switch-context', 'currentAgreementRef',
                      'kind: fulfillment', '`position`', '`story`', '`prompt`'):
            self.assertNotIn(token, text)
        for phrase in ('普通对话是完整交互路径', '自然语言', '取消',
                       '同一问题', '已经收到的回答用于业务理解', '任一写入失败就停止'):
            self.assertIn(phrase, text)

    def test_distributed_runtime_has_no_host_specific_dependency(self):
        for name in ('evidence-discovery', 'evidence-modeling'):
            package = SKILLS / name
            paths = [package / 'SKILL.md', *(package / 'references').glob('*.md'),
                     *(package / 'assets').glob('*.json')]
            for path in paths:
                with self.subTest(path=path.name):
                    self.assertNotRegex(path.read_text(),
                                        r'evidence_ui_|pi-ui|\.pi/|/skill:|/evidence-model|\\bPi\\b')
        self.assertEqual({'interview.md'}, {
            path.name for path in (SKILLS / 'evidence-discovery/references').glob('*.md')
        })

    def test_native_entry_is_complete_without_extension_installation(self):
        entry = (SKILLS / 'evidence-modeling/SKILL.md').read_text()
        self.assertIn('不依赖界面扩展', entry)
        self.assertIn('无需专门的 Skill 调用工具', entry)
        constitution = (REPO / 'AGENTS.md').read_text()
        self.assertIn('显式建模从 `/skill:evidence-modeling`', constitution)
        self.assertIn('可选 UI 包装', constitution)
        guide = (REPO / 'docs/evidence-modeling.md').read_text()
        self.assertIn('普通对话是完整交互路径', guide)
        self.assertIn('/evidence-model', guide)

    def test_behavior_evals_cover_three_transport_modes_and_save_failure(self):
        data = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())
        indexed = {case['category']: case for case in data['evals']}
        for category in ('no-ui-complete-interview', 'ui-text-semantic-parity',
                         'ui-loss-resume', 'ui-answer-save-failure'):
            with self.subTest(category=category):
                case = indexed[category]
                self.assertIn('follow_up', case)
                self.assertGreaterEqual(len(case['expectations']), 4)
        instructions = (SKILLS / 'evidence-discovery/evals/README.md').read_text()
        self.assertIn('不注册任何 UI 工具', instructions)
        self.assertIn('没有实际执行就保持未执行', instructions)


if __name__ == '__main__':
    unittest.main()
