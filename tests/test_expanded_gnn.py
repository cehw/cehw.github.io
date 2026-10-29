"""Run with the climet3 han-fdn environment and weather runtime on PYTHONPATH."""
import sys
import unittest
from pathlib import Path

if not Path('/workspace/wanghan/Stellerus_CLP').is_dir():
    raise unittest.SkipTest('Model integration checks run on climet3 with the private CLP checkpoint')

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/weather/gnn'))
import numpy as np
import torch
from expanded import (ExpandedGNN, station_metadata, anchor_temperature,
                      original_core_runtime, retain_original_core, CHECKPOINT)
from forecast import read_csv, CLP
from stellerus_clp.clp_10min_model import CLPModelConfig, CLP10MinuteForecaster
from stellerus_clp.clp_10min_dataset import cyclic_time_features


class ExpandedTests(unittest.TestCase):
    def test_station_identity_and_available_variables(self):
        nodes=station_metadata();by_code={n['code']:n for n in nodes}
        self.assertEqual(len(nodes),53)
        self.assertEqual(len(by_code),53)
        self.assertEqual([sum(f in n['feeds'] for n in nodes) for f in ['temperature','humidity','wind']],[39,26,30])
        for temperature,wind in [('TY1','SHL'),('TU1','TUN'),('STY','BHD')]:
            self.assertNotEqual((by_code[temperature]['lat'],by_code[temperature]['lon']),
                                (by_code[wind]['lat'],by_code[wind]['lon']))
            self.assertNotIn('wind',by_code[temperature]['feeds'])
        self.assertEqual(by_code['HSS']['feeds'],['wind'])

    def test_temperature_anchor_and_missing_observations(self):
        prediction=np.array([[[25.,70.,3.],[24.,71.,4.]],[[28.,60.,2.],[27.,62.,3.]]])
        history=np.full((432,2,6),np.nan)
        history[-2,0,0]=22.
        history[-7,1,0]=10. # Too old to anchor to; remains unpublished by live checks.
        actual=anchor_temperature(prediction,history)
        np.testing.assert_array_equal(actual[0,:,0],[22.,21.])
        np.testing.assert_array_equal(actual[:,:,1:],prediction[:,:,1:])
        np.testing.assert_array_equal(actual[1],prediction[1])
        self.assertEqual(prediction[0,0,0],25.)

    def test_original_checkpoint_numerical_equivalence(self):
        saved=torch.load(CHECKPOINT,map_location='cpu',weights_only=False)
        old=CLP10MinuteForecaster(CLPModelConfig(**saved['model_config']),saved['model_state']['adjacency']).eval()
        old.load_state_dict(saved['model_state'])
        metadata=read_csv(CLP/'config/core_source_nodes.csv')
        nodes=[dict(code=n['source_station_code'],lat=float(n['latitude']),lon=float(n['longitude'])) for n in metadata]
        new=ExpandedGNN(saved,nodes).eval();new.adjacency.copy_(old.adjacency)
        torch.manual_seed(42)
        x=torch.randn(1,12,432,6);mask=torch.rand_like(x)>.2;times=torch.randn(1,432,4)
        with torch.no_grad():
            np.testing.assert_allclose(new(x,mask,times).numpy(),old(x,mask,times)[:,:,:36].numpy(),atol=1e-6)

    def test_core_retention_only_replaces_original_nodes(self):
        nodes=station_metadata();runtime=original_core_runtime(nodes)
        rng=np.random.default_rng(42)
        history=rng.normal(size=(432,len(nodes),6)).astype(np.float32)
        times=np.arange(np.datetime64('2026-01-01T00:00'),np.datetime64('2026-01-04T00:00'),np.timedelta64(10,'m'))
        result=retain_original_core(np.full((len(nodes),36,4),123.,dtype=np.float32),history,times,runtime)
        indices=runtime[2];other=[i for i in range(len(nodes)) if i not in indices]
        np.testing.assert_array_equal(result[other],123.)
        model,stats,_=runtime;raw=history[:,indices];mask=np.isfinite(raw)
        with torch.no_grad():
            expected=model(torch.tensor(stats.normalize(raw).transpose(1,0,2)[None]),
                           torch.tensor(mask.transpose(1,0,2)[None]),torch.tensor(cyclic_time_features(times)[None])).numpy()
        np.testing.assert_allclose(result[indices],stats.denormalize_targets(expected,model.config.target_names)[0,:,:36],atol=1e-6)


if __name__=='__main__':
    torch.set_num_threads(2)
    unittest.main()
