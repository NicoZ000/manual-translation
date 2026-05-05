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


def in_skip(para):
    """Skip TOC (sdt) and hyperlinks — but NOT tables (they contain content)."""
    parent = para.getparent()
    while parent is not None:
        local = etree.QName(parent.tag).localname
        if local in ('sdt', 'hyperlink'):
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

    p_counter = 0
    replaced = 0
    skipped_xml = 0

    for para in tree.findall('.//{%s}p' % W):
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

        t_elems[0].text = french
        t_elems[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        for t in t_elems[1:]:
            t.text = ''
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
