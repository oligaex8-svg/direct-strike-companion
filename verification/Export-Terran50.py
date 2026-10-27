"""Export one actual Hyperion armory console using the established M3 path."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('campaign48', Path(__file__).with_name('Export-Campaign48.py'))
campaign = importlib.util.module_from_spec(spec)
spec.loader.exec_module(campaign)
campaign.DEVICES['hyperion-armory'] = ('SM_HyperionArmoryConsole', 'Stand')
campaign.main()
