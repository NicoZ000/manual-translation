"""
restore.py — Local restore script for Field Manual translation pipeline.

Usage:
    python restore.py original.docx translation.txt output.docx

Arguments:
    original.docx    The original English .docx file (with formatting and images)
    translation.txt  The translated text file downloaded from the Vercel app
    output.docx      The output file to create (translated + formatting preserved)

Requirements:
    pip install lxml

Example:
    python restore.py "A_Field_Manual_v9.docx" "translation-de-sonnet.txt" "field-manual-de.docx"
"""

import sys, re, os, zipfile, shutil
from lxml import etree

W  = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'


def parse_translations(txt_path):
    """Parse ⟦PXX⟧ marker lines into a dict of {marker_id: translated_text}."""
    with open(txt_path, encoding='utf-8') as f:
        lines = f.read().splitlines()

    translations = {}
    current_key = None
    current_parts = []

    for line in lines:
        m = re.match(r'^\u27e6(P\d+|IMG\d+)\u27e7\s*(.*)', line)
        if m:
            if current_key:
                translations[current_key] = ' '.join(current_parts).strip()
            current_key = m.group(1)
            rest = m.group(2).strip()
            current_parts = [rest] if rest else []
        elif current_key and line.strip():
            current_parts.append(line.strip())

    if current_key:
        translations[current_key] = ' '.join(current_parts).strip()

    p_count = sum(1 for k in translations if k.startswith('P'))
    print(f"Parsed {p_count} paragraph translations from {txt_path}")
    return translations


def has_image(para):
    return (para.find('.//{%s}inline' % WP) is not None or
            para.find('.//{%s}anchor' % WP) is not None)


def is_duplicated_content(para):
    """Detect content control boxes where text is duplicated in w:t elements.
    These appear as IMG+TEXT paragraphs but their content is already present
    in standalone sibling paragraphs — skip them from the counter."""
    t_elems = para.findall('.//{%s}t' % W)
    texts = [t.text or '' for t in t_elems if t.text and t.text.strip()]
    full = ''.join(texts)
    half = len(full) // 2
    return len(full) > 50 and full[:half] == full[half:]


def find_first_copy_plaintexts(all_paras):
    """Find positions of first-copy PlainText duplicate blocks."""
    plain_pos = {}
    for i, p in enumerate(all_paras):
        pPr = p.find('{%s}pPr' % W)
        style = 'Normal'
        if pPr is not None:
            ps = pPr.find('{%s}pStyle' % W)
            if ps is not None: style = ps.get('{%s}val' % W, 'Normal')
        if style != 'PlainText': continue
        text = ''.join(t.text or '' for t in p.findall('.//{%s}t' % W)).strip()
        if text:
            key = text[:80]
            if key not in plain_pos: plain_pos[key] = []
            plain_pos[key].append(i)
    first_copies = set()
    for key, positions in plain_pos.items():
        if len(positions) >= 2:
            for pos in positions[:-1]:
                first_copies.add(pos)
    return first_copies


def in_skip(para):
    """Skip TOC (sdt) and hyperlinks — but NOT tables (they contain content)."""
    parent = para.getparent()
    while parent is not None:
        local = etree.QName(parent.tag).localname
        if local in ('sdt', 'hyperlink', 'txbx', 'txbxContent', 'textbox'):
            return True
        parent = parent.getparent()
    return False


def restore(original_docx, translation_txt, output_docx):
    translations = parse_translations(translation_txt)

    # Copy original to output path
    shutil.copy(original_docx, output_docx)

    # Read document.xml from the zip
    with zipfile.ZipFile(output_docx) as z:
        xml_bytes = z.read('word/document.xml')

    tree = etree.fromstring(xml_bytes)
    all_paras_list = list(tree.findall('.//{%s}p' % W))
    first_copies = find_first_copy_plaintexts(all_paras_list)

    p_counter = 0
    replaced = 0
    skipped_xml = 0

    for _ri, para in enumerate(all_paras_list):
        if _ri in first_copies:
            continue
        if in_skip(para):
            continue

        has_img = has_image(para)
        t_elems = para.findall('.//{%s}t' % W)
        visible = ''.join((t.text or '') for t in t_elems).strip()

        if not visible:
            continue

        # Skip paragraphs whose text IS XML (field codes stored as text in TOC)
        if '<w:' in visible or '</w:' in visible:
            skipped_xml += 1
            continue

        if has_img:
            # Skip content control boxes where text is duplicated
            if is_duplicated_content(para):
                continue
            # Mixed image+text paragraph: translate the text, leave image untouched
            if visible:
                p_counter += 1
                mid = f'P{p_counter:03d}'
                if mid in translations and t_elems:
                    t_elems[0].text = translations[mid]
                    t_elems[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    for t in t_elems[1:]:
                        t.text = ''
                    replaced += 1
            continue

        p_counter += 1
        mid = f'P{p_counter:03d}'

        if mid not in translations or not t_elems:
            continue

        french = translations[mid]
        if not french:
            continue

        # Preserve run-level bold/italic formatting.
        # Strategy: map original run structure onto translated text.
        # We know the original runs in order with their formatting.
        # We distribute the translation proportionally by character count,
        # but always ensure bold runs get bold text and normal runs get normal text.

        runs = para.findall('{%s}r' % W)
        if not runs:
            continue

        # Build run info: (run_element, is_bold, original_char_count, t_elements)
        # Whitespace-only runs keep their whitespace — not included in content budget
        run_info = []
        for r in runs:
            rPr = r.find('{%s}rPr' % W)
            is_bold = rPr is not None and rPr.find('{%s}b' % W) is not None
            t_list  = r.findall('{%s}t' % W)
            orig    = ''.join(t.text or '' for t in t_list)
            is_whitespace_only = not orig.strip()
            run_info.append({'r': r, 'bold': is_bold, 'orig': orig,
                             'ts': t_list, 'chars': len(orig),
                             'whitespace_only': is_whitespace_only})

        # Only content runs (non-whitespace) participate in budget distribution
        content_runs = [ri for ri in run_info if not ri['whitespace_only']]
        total_orig_chars = sum(ri['chars'] for ri in content_runs)

        if total_orig_chars == 0:
            # All runs are whitespace — fallback: put everything in first run
            if run_info and run_info[0]['ts']:
                run_info[0]['ts'][0].text = french
                run_info[0]['ts'][0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                for ri in run_info[1:]:
                    for t in ri['ts']:
                        t.text = ''
            replaced += 1
            continue

        # Distribute translated text proportionally across CONTENT runs only
        # Whitespace-only runs keep their original whitespace unchanged
        total_trans_chars = len(french)

        if len(content_runs) == 1:
            # Only one content run — put everything there
            ri = content_runs[0]
            if ri['ts']:
                ri['ts'][0].text = french
                ri['ts'][0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                for t in ri['ts'][1:]:
                    t.text = ''
            replaced += 1
            continue

        # Check if original has a clean punctuation boundary between bold and normal
        # Pattern: first content run is bold, remaining are normal, and
        # the first normal run starts with ':' or ','
        # In this case, split translation at the first ':' or ','
        def find_punctuation_split(text, orig_normal_start):
            trigger = (orig_normal_start or '')[:1]
            if trigger in (':', ','):
                idx = text.find(trigger)
                if idx > 0:
                    return idx + 1  # include the punctuation in bold portion
            return None

        first_bold = content_runs[0]['bold'] if content_runs else False
        rest_all_normal = all(not ri['bold'] for ri in content_runs[1:])
        first_normal_start = content_runs[1]['orig'] if len(content_runs) > 1 else ''

        if first_bold and rest_all_normal:
            split_idx = find_punctuation_split(french, first_normal_start)
            if split_idx:
                bold_text   = french[:split_idx].rstrip()
                normal_text = french[split_idx:].lstrip()
                # Write bold into first content run
                ri0 = content_runs[0]
                if ri0['ts']:
                    ri0['ts'][0].text = bold_text
                    ri0['ts'][0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    for t in ri0['ts'][1:]: t.text = ''
                # Put all remaining text into first normal run, empty the rest
                for j, ri in enumerate(content_runs[1:], 1):
                    if j == 1:
                        if ri['ts']:
                            ri['ts'][0].text = ' ' + normal_text
                            ri['ts'][0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                            for t in ri['ts'][1:]: t.text = ''
                    else:
                        for t in ri['ts']:
                            t.text = ''
                replaced += 1
                continue

        # Fallback: distribute by word count proportionally
        # Split translation into words, assign words to runs proportionally
        words = french.split()
        n_words = len(words)
        n_runs  = len(content_runs)

        # Assign word counts per run proportionally to original char counts
        word_budgets = []
        allocated_words = 0
        for i, ri in enumerate(content_runs):
            if i == n_runs - 1:
                word_budgets.append(n_words - allocated_words)
            else:
                wbud = max(0, round(ri['chars'] / total_orig_chars * n_words))
                word_budgets.append(wbud)
                allocated_words += wbud

        # Build text chunks with proper spacing
        content_texts = []
        word_idx = 0
        for i, wb in enumerate(word_budgets):
            chunk_words = words[word_idx:word_idx + wb]
            word_idx += wb
            text_chunk = ' '.join(chunk_words)
            # Add trailing space if there are more runs after this
            if i < n_runs - 1 and text_chunk:
                text_chunk += ' '
            content_texts.append(text_chunk)

        # Write back: content runs get translated text, whitespace runs keep whitespace
        content_idx = 0
        for ri in run_info:
            if ri['whitespace_only']:
                # Keep original whitespace unchanged
                pass
            else:
                text_chunk = content_texts[content_idx] if content_idx < len(content_texts) else ''
                content_idx += 1
                if ri['ts']:
                    ri['ts'][0].text = text_chunk
                    ri['ts'][0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    for t in ri['ts'][1:]:
                        t.text = ''
                else:
                    new_t = etree.SubElement(ri['r'], '{%s}t' % W)
                    new_t.text = text_chunk
                    new_t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')

        replaced += 1

    print(f"Replaced:    {replaced} paragraphs")
    print(f"Skipped XML: {skipped_xml} field-code paragraphs (TOC etc.)")
    print(f"Images:      untouched")

    # Serialise with lxml — preserves all namespaces exactly
    new_xml = etree.tostring(tree, xml_declaration=True, encoding='UTF-8', standalone=True)

    # Write back directly into the zip
    with zipfile.ZipFile(output_docx) as zin:
        members = {n: zin.read(n) for n in zin.namelist()}

    members['word/document.xml'] = new_xml

    tmp = output_docx + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for name, data in members.items():
            zout.writestr(name, data)

    os.replace(tmp, output_docx)

    size_mb = os.path.getsize(output_docx) / 1024 / 1024
    print(f"\nOutput: {output_docx} ({size_mb:.1f} MB)")
    return replaced


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    original  = sys.argv[1]
    translated = sys.argv[2]
    output    = sys.argv[3]

    if not os.path.exists(original):
        print(f"Error: original file not found: {original}")
        sys.exit(1)

    if not os.path.exists(translated):
        print(f"Error: translation file not found: {translated}")
        sys.exit(1)

    print(f"Original:    {original}")
    print(f"Translation: {translated}")
    print(f"Output:      {output}")
    print()

    restore(original, translated, output)
    print("\nDone. Open the output file in Word to verify.")
