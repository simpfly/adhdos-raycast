import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('adhdos', Path(__file__).parents[1] / 'adhdos.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class CommandsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = patch.object(api, 'STATE', Path(self.temp.name))
        self.state.start()
        self.addCleanup(self.state.stop)

    def test_timeout_reuses_id_and_preserves_chinese_payload(self):
        ids = []
        def server(path, secret, operation):
            ids.append(operation['id'])
            self.assertEqual(operation['body']['content'], '中文 "内容"\n下一行')
            if len(ids) == 1:
                raise TimeoutError()
            return {'item': {'id': 'saved'}}
        with patch.object(api, 'request', side_effect=server), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(TimeoutError):
                api.add('board', '中文 "内容"\n下一行', 'secret')
            with self.assertRaises(ValueError):
                api.add('board', '其他内容', 'secret')
            with self.assertRaises(ValueError):
                api.add('board', '中文 "内容"\n下一行', 'other-account')
            api.add('board', '中文 "内容"\n下一行', 'secret')
        self.assertEqual(ids[0], ids[1])
        self.assertFalse((api.STATE / 'board-pending.json').exists())

    def test_definite_rejection_clears_pending(self):
        error = urllib.error.HTTPError('url', 401, 'invalid', {}, None)
        with patch.object(api, 'request', side_effect=error), self.assertRaises(urllib.error.HTTPError):
            api.add('brain', '买牛奶', 'secret')
        self.assertFalse((api.STATE / 'brain-pending.json').exists())

    def test_task_pagination_and_filter(self):
        output = io.StringIO()
        with patch.object(api, 'request', side_effect=[
            {'tasks': [{'text': '无关'}], 'nextOffset': 500},
            {'tasks': [{'text': '买牛奶', 'subtasks': [{'text': '查看库存', 'done': True}]}], 'nextOffset': None}
        ]) as request, contextlib.redirect_stdout(output):
            api.show('brain', '牛奶', 'secret')
        self.assertIn('offset=500', request.call_args_list[1].args[0])
        self.assertIn('买牛奶', output.getvalue())
        self.assertIn('✓ 查看库存', output.getvalue())
        self.assertNotIn('无关', output.getvalue())

    def test_board_query_encoding(self):
        with patch.object(api, 'request', return_value={'items': []}) as request, contextlib.redirect_stdout(io.StringIO()):
            api.show('board', '中文 & test', 'secret')
        self.assertIn('query=%E4%B8%AD%E6%96%87+%26+test', request.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
