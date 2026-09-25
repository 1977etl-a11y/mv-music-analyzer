"""Optional formal schema validation. Requires jsonschema >= 4.23 (test tooling only)."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator

root = Path(__file__).resolve().parent.parent
data = json.loads((root / "sample_music_analysis_v7.synthetic.json").read_text(encoding="utf-8"))
for name in ["music_analysis_schema_v6_1.json", "music_analysis_schema_v7.json"]:
    schema = json.loads((root / name).read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(data)
    print(f"PASS: {name}")
