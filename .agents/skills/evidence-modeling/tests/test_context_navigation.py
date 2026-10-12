"""Navigation documentation contracts, not proof of live agent behavior."""
import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


class ContextNavigationTests(unittest.TestCase):
    def test_navigation_and_completion_rules_have_one_protocol_owner(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in (
            '合同上下文总览与选择', '首次消化资料', '通过界面表达相同意图',
            '已澄清结束的合同仍展示，但不可选择或切换进入',
            '自然语言指定也同样拒绝', '不提供重新开启入口',
            'clarificationCompletionSourceRefs', '不分配业务 Q-ID',
            '取消保留原焦点和原问题', '先重新核对目标存在且未结束',
            '清除不再适用的', '保留原问题记录', '用编号列表展示',
            '未识别到合同', '全部结束', '只读查看或仅浏览不写焦点',
        ):
            self.assertIn(phrase, text)

    def test_overview_only_projects_identified_contexts_and_selection_enters_fulfillment(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in (
            '依据充分的合同上下文', '不展示候选／已确认分类',
            '先分析哪个合同上下文？', '选择只决定分析焦点',
            '先承接已知双方和全部主履约', '不再泛问交易如何成立',
            '既有记录', '不自动迁移',
        ):
            self.assertIn(phrase, text)
        self.assertNotIn('未取得明确边界确认依据时显示候选', text)

    def test_operating_purpose_is_visible_but_material_metadata_is_internal(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in (
            '经营主线', '现金权责', '目标与实际', '观察主体',
            '谁与谁签订什么合同，以实现什么具体经营目的',
            '不包含资料名称、文件路径、版本、来源 ID',
            '只留在内部来源记录', '独立边界不充分',
        ):
            self.assertIn(phrase, text)
        example = (SKILLS / 'evidence-discovery/examples/navigation.md').read_text()
        display = example.split('```text', 1)[1].split('```', 1)[0]
        self.assertIn('经营主线：现金权责（买方支出）', display)
        self.assertIn('买方与卖方签订采购协议', display)
        self.assertNotIn('sourceRefs', display)
        self.assertNotIn('.md', display)

    def test_completion_stores_source_references_on_the_original_agreement(self):
        template = json.loads((SKILLS / 'evidence-discovery/assets/discovery-template.json').read_text())
        field = template['business']['agreements'][0]['clarificationCompletionSourceRefs'][0]
        self.assertIn('可选', field)
        self.assertIn('原话及覆盖版本', field)
        self.assertIn('未取得省略', field)
        self.assertNotIn('contextMenu', template)
        self.assertIn('总览导航', template['handoff']['viewRefs'][0])

    def test_behavior_cases_cover_navigation_not_just_display(self):
        data = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())
        indexed = {item['category']: item for item in data['evals']}
        for name in (
            'context-overview-selection', 'completed-context-not-selectable',
            'context-navigation-empty-headless', 'material-contexts-not-candidates',
            'insufficient-material-no-context-menu', 'legacy-candidate-record-recheck',
        ):
            case = indexed[name]
            self.assertGreaterEqual(len(case['expectations']), 4)
            self.assertIn('follow_up', case)


if __name__ == '__main__':
    unittest.main()
