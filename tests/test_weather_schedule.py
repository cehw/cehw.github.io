import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'scripts/weather/gnn/install_schedule.py'
spec = importlib.util.spec_from_file_location('weather_schedule', path)
schedule = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schedule)


class WeatherScheduleTests(unittest.TestCase):
    def test_upgrade_preserves_collectors_and_is_idempotent(self):
        other = '*/10 * * * * /workspace/wanghan/Stellerus_CLP/scripts/fetch_hko.sh'
        old = other + '\n# Personal observation-only GNN: every three hours (server HKT)\n27 */3 * * * /bin/bash /workspace/wanghan/personal/weather/run.sh >> old.log 2>&1\n'
        updated = schedule.updated_crontab(old)
        self.assertIn(other, updated.splitlines())
        self.assertIn(schedule.GNN, updated.splitlines())
        self.assertIn(schedule.OBS, updated.splitlines())
        self.assertNotIn('27 */3', updated)
        self.assertEqual(schedule.updated_crontab(updated), updated)
