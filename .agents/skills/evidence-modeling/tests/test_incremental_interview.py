"""Incremental context consumption contracts, not measured interview behavior."""
import json
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SKILLS = REPO / '.agents/skills'


class IncrementalInterviewTests(unittest.TestCase):
    def section(self, heading):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        match = re.search(rf'(?ms)^{re.escape(heading)}\n(.*?)(?=^#{{1,3}} |\Z)', text)
        self.assertIsNotNone(match)
        assert match is not None
        return match[1]

    def test_project_distinguishes_continuation_from_restart(self):
        self.assertIn('连续问答不是任务重启', (REPO / 'AGENTS.md').read_text())
        self.assertIn('不重复工程开工检查', (REPO / 'docs/guides/index.md').read_text())

    def test_recovery_consumes_provided_focus_and_control(self):
        text = self.section('### 首次进入或恢复')
        for phrase in ('必要方法', '材料和交接', '请求或确认', '原问题', '停止／暂缓', '上下文不足'):
            self.assertIn(phrase, text)

    def test_continuation_reuses_methods_and_absorbs_all_input(self):
        text = self.section('### 连续问答')
        for phrase in ('授权未变', '仍在上下文', '未变化', '全部输入', '受影响依赖',
                       '受影响术语', '焦点外', '每轮重新计算', '未答项不视为默认同意', '任一写入失败就停止'):
            self.assertIn(phrase, text)
        self.assertLess(text.index('全部输入'), text.index('维护受影响术语'))

    def test_reads_follow_dependencies_and_real_term_freshness(self):
        text = self.section('### 最小读取范围与新鲜度')
        for phrase in ('当前节点', '必要材料片段', '适用版本', '对应 FM 目标',
                       '沿依赖继续追读', '影响范围不能确定', '扩大读取', '写入前', '实际文件'):
            self.assertIn(phrase, text)

    def test_events_preserve_global_confirmation_and_invalidation(self):
        text = self.section('### 按事件扩大核对')
        for event in ('切换合同', '新增异常义务', '更正业务依据', '全部追责结束',
                      '方法或材料变化', '上下文压缩', '术语保存中断'):
            self.assertRegex(text, rf'(?m)^\| {event}.*\|$')
        for phrase in ('完整责任图', '全部终点', '全局明确确认', '失效'):
            self.assertIn(phrase, text)

    def test_method_ownership_and_composition_stay_portable(self):
        workflow = (SKILLS / 'evidence-modeling/references/workflow.md').read_text()
        self.assertIn('不是每轮回答后的必经步骤', workflow)
        self.assertIn('不重做专业分析', workflow)
        language = (SKILLS / 'evidence-fm/references/domain-language.md').read_text()
        self.assertIn('依据本轮已明确的业务含义，当轮维护词汇入口', language)
        self.assertIn('不要求每轮全文重读', language)
        for skill in ('evidence-discovery', 'evidence-modeling', 'evidence-fm', 'evidence-handoff'):
            for doc in (SKILLS / skill).rglob('*.md'):
                self.assertNotIn('docs/guides/', doc.read_text())

    def test_evals_cover_loading_and_term_failure(self):
        cases = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())['evals']
        indexed = {case['category']: case for case in cases}
        for category in ('incremental-entry-recovery', 'incremental-continuous-answer',
                         'incremental-context-switch', 'incremental-source-correction',
                         'incremental-global-closure', 'incremental-context-loss',
                         'incremental-external-change', 'incremental-save-failure'):
            case = indexed[category]
            self.assertEqual(['evidence-fm'], case['knowledgeSkills'])
            self.assertTrue(any('读取' in item for item in case['expectations']))


if __name__ == '__main__':
    unittest.main()
