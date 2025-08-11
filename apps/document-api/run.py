import json
from generate_report import generate_pdf

with open("sample_report.json") as f:
    data = json.load(f)

generate_pdf(data)