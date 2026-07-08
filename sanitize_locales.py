
import os
import re

ALLOWED_TOP_LEVEL = {
    'admin', 'auth', 'booking', 'calendar', 'common', 'dashboard', 'earnings',
    'forTherapists', 'gender', 'journal', 'languages', 'login', 'matching',
    'notifications', 'patient', 'payment', 'profile', 'pwa', 'questionnaire',
    'questions', 'rating', 'role_selection', 'settings', 'signup', 'therapist',
    'therapist_profile', 'users', 'welcome'
}

def sanitize_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the translation block start
    start_match = re.search(r'(translation|["\']translation["\']):\s*\{', content)
    if not start_match: return
    
    prefix = content[:start_match.end()]
    body = content[start_match.end():]
    
    # Braces counting to find the end of the translation block
    brace_count = 1
    trans_end = -1
    for i in range(len(body)):
        if body[i] == '{': brace_count += 1
        elif body[i] == '}': 
            brace_count -= 1
            if brace_count == 0:
                trans_end = i
                break
    if trans_end == -1: return
    
    actual_body = body[:trans_end]
    suffix = body[trans_end:]

    blocks = {}
    
    # We'll use a more robust block extractor
    # Look for "^        "key": {"
    matches = list(re.finditer(r'^\s+"([a-zA-Z0-9_]+)":\s*\{', actual_body, re.MULTILINE))
    
    def get_block_end(data, start_pos):
        count = 1
        for i in range(start_pos + 1, len(data)):
            if data[i] == '{': count += 1
            elif data[i] == '}':
                count -= 1
                if count == 0:
                    # Capture up to next comma or newline
                    next_comma = data.find(',', i)
                    if next_comma != -1 and next_comma < i + 10:
                        return next_comma + 1
                    return i + 1
        return -1

    for m in matches:
        key = m.group(1)
        if key not in ALLOWED_TOP_LEVEL: continue
        
        # Check if it's REALLY top level (should be indented by 8 spaces)
        indent = len(m.group(0)) - len(m.group(0).lstrip())
        if indent < 4: continue # Too little indent?
        
        end = get_block_end(actual_body, m.end() - 1)
        if end != -1:
            block_content = actual_body[m.start():end].strip()
            # De-duplicate: keep the longest one
            if key not in blocks or len(block_content) > len(blocks[key]):
                blocks[key] = block_content

    # Reassemble cleanly
    new_body = ""
    for k in sorted(blocks.keys()):
        text = blocks[k]
        if not text.endswith(','): text += ','
        new_body += "\n        " + text

    with open(path, 'w', encoding='utf-8') as f:
        f.write(prefix + new_body + "\n    " + suffix)
    print(f"Sanitized {path} - kept {len(blocks)} blocks")

base_path = 'c:/Users/Dastageer/AndroidStudioProjects/ThePsyFullStack/psy_web/src/i18n/locales/'
for lang in ['en', 'de', 'el', 'hr']:
    p = os.path.join(base_path, f'{lang}.ts')
    if os.path.exists(p):
        sanitize_file(p)
