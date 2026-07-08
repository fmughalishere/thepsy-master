import os
import json
import re

def parse_ts_to_dict(path):
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    match = re.search(r'export const \w+ = (\{.*\});', content, re.DOTALL)
    if not match:
        match = re.search(r'export const \w+ = (\{.*\})', content, re.DOTALL)
    
    if match:
        obj_str = match.group(1)
        obj_str = re.sub(r'(\w+):', r'"\1":', obj_str)
        obj_str = re.sub(r',\s*\}', '}', obj_str)
        try:
            return json.loads(obj_str)
        except Exception as e:
            print(f"JSON Error: {e}")
            keys = {}
            for line in content.split('\n'):
                line_match = re.search(r'"(\w+)":\s*"([^"]*)"', line)
                if line_match:
                    keys[line_match.group(1)] = line_match.group(2)
            return {"translation": keys} if keys else {"raw_extraction_failed": True}
    return {}

path = r'c:\Users\XD\Studio projects\ThePsy fullstack\psy_web\src\i18n\locales\en.ts'
data = parse_ts_to_dict(path)
print(json.dumps(data, indent=2)[:1000])
