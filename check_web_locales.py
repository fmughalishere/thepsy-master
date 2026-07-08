
import os
import json
import re

def parse_ts_to_dict(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract the JSON-like object from 'export const lang = { ... };'
    match = re.search(r'export const \w+ = (\{.*\});', content, re.DOTALL)
    if not match:
        # Try alternative structure if translation is nested
        match = re.search(r'export const \w+ = (\{.*\})', content, re.DOTALL)
    
    if match:
        obj_str = match.group(1)
        # Simplify common JS non-JSON syntax for parsing
        obj_str = re.sub(r'(\w+):', r'"\1":', obj_str) # quote keys
        obj_str = re.sub(r',\s*\}', '}', obj_str) # remove trailing commas
        try:
            return json.loads(obj_str)
        except:
            # If complex nesting, manually find blocks
            return {"raw_extraction_failed": True}
    return None

def get_flattened_keys(obj, prefix=""):
    keys = set()
    if not isinstance(obj, dict):
        return keys
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        keys.add(full_key)
        if isinstance(v, dict):
            keys.update(get_flattened_keys(v, full_key))
    return keys

base_path = 'c:/Users/Dastageer/AndroidStudioProjects/ThePsyFullStack/psy_web/src/i18n/locales/'
en_data = parse_ts_to_dict(os.path.join(base_path, 'en.ts'))

if en_data:
    # Use the 'translation' key as root
    en_keys = get_flattened_keys(en_data.get('translation', {}))
    print(f"Total English Keys (nested): {len(en_keys)}")
    
    for lang in ['de', 'el', 'hr']:
        lang_path = os.path.join(base_path, f'{lang}.ts')
        lang_data = parse_ts_to_dict(lang_path)
        if lang_data:
            lang_keys = get_flattened_keys(lang_data.get('translation', {}))
            missing = en_keys - lang_keys
            print(f"{lang.upper()}: {len(lang_keys)} keys found, {len(missing)} missing.")
            if missing:
                sample = sorted(list(missing))[:5]
                print(f"  Missing sample: {sample}")
