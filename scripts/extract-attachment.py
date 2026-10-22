"""Bounded local text extraction. No Office execution, macros, links, or OCR."""
import hashlib
import io
import json
import logging
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAX_FILE = 20 * 1024 * 1024
MAX_XML = 8 * 1024 * 1024
MAX_UNITS = 1000
MAX_TEXT = 300000


class ExtractionError(Exception):
    def __init__(self, code):
        self.code = code


def require(ok, code):
    if not ok:
        raise ExtractionError(code)


def local(tag):
    return tag.rsplit('}', 1)[-1]


def xml(data):
    require(len(data) <= MAX_XML, 'XML_LIMIT')
    # Remove NULs for UTF-16/32 declaration detection before parsing.
    upper = data.replace(b'\x00', b'').upper()
    require(b'<!DOCTYPE' not in upper and b'<!ENTITY' not in upper, 'UNSAFE_XML')
    return ET.fromstring(data)


class Package:
    def __init__(self, raw):
        self.zip = zipfile.ZipFile(io.BytesIO(raw))
        entries = self.zip.infolist()
        require(len(entries) <= 2048 and sum(e.file_size for e in entries) <= 50 * 1024 * 1024, 'ZIP_LIMIT')
        self.names = set()
        for e in entries:
            require(e.filename not in self.names, 'DUPLICATE_PART')
            require(not e.flag_bits & 1, 'ENCRYPTED')
            self.names.add(e.filename)

    def read(self, name):
        require(name in self.names, 'MISSING_PART')
        require(self.zip.getinfo(name).file_size <= MAX_XML, 'XML_LIMIT')
        with self.zip.open(name) as stream:
            data = stream.read(MAX_XML + 1)
        require(len(data) <= MAX_XML, 'XML_LIMIT')
        return data

    def tree(self, name):
        return xml(self.read(name))


def part_path(base, target):
    require(isinstance(target, str) and not re.search(r'[:\\?#%]', target), 'EXTERNAL_PART')
    name = posixpath.normpath(posixpath.join(base, target.lstrip('/'))) if not target.startswith('/') else target[1:]
    require(name.startswith(base + '/') and '..' not in name.split('/'), 'EXTERNAL_PART')
    return name


def extract(file):
    file = Path(file)
    require(file.is_file() and file.stat().st_size <= MAX_FILE, 'FILE_LIMIT')
    with file.open('rb') as stream:
        raw = stream.read(MAX_FILE + 1)
    require(len(raw) <= MAX_FILE, 'FILE_LIMIT')
    kind = file.suffix.lower().lstrip('.')
    require(kind in ('pdf', 'xlsx', 'hwpx'), 'UNSUPPORTED_FORMAT')
    units, warnings = [], []
    length = 0

    def add(unit_id, location, text):
        nonlocal length
        text = text.strip()
        if not text:
            return
        length += len(text)
        require(len(text) <= 30000 and length <= MAX_TEXT and len(units) < MAX_UNITS, 'TEXT_LIMIT')
        units.append({'id': unit_id, 'location': location, 'text': text})

    if kind == 'pdf':
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ExtractionError('PDF_DEPENDENCY_MISSING')
        logging.getLogger('pypdf').setLevel(logging.CRITICAL)
        reader = PdfReader(io.BytesIO(raw), strict=True)
        require(not reader.is_encrypted, 'ENCRYPTED')
        require(len(reader.pages) <= 100, 'PAGE_LIMIT')
        warnings.append('PDF_LAYOUT_NOT_PRESERVED')
        for number, page in enumerate(reader.pages, 1):
            contents = page.get_contents()
            require(contents is None or len(contents.get_data()) <= MAX_XML, 'CONTENT_LIMIT')
            text = page.extract_text() or ''
            if not text.strip() and 'PDF_TEXTLESS_PAGES' not in warnings:
                warnings.append('PDF_TEXTLESS_PAGES')
            add(f'p{number}', {'page': number}, text)
    elif kind == 'xlsx':
        package = Package(raw)
        workbook = package.tree('xl/workbook.xml')
        relationships = [r for r in package.tree('xl/_rels/workbook.xml.rels') if local(r.tag) == 'Relationship']
        rels = {r.get('Id'): r for r in relationships}
        require(None not in rels and len(rels) == len(relationships), 'DUPLICATE_RELATIONSHIP')
        shared = []
        for rel in rels.values():
            if (rel.get('Type') or '').endswith('/sharedStrings'):
                require(rel.get('TargetMode') != 'External', 'EXTERNAL_PART')
                tree = package.tree(part_path('xl', rel.get('Target')))
                shared = [''.join(n.text or '' for n in item.iter() if local(n.tag) == 't') for item in tree if local(item.tag) == 'si']
        warnings.append('XLSX_RAW_CELL_VALUES')
        sheets = [n for n in workbook.iter() if local(n.tag) == 'sheet']
        require(len(sheets) <= 100, 'SHEET_LIMIT')
        for index, sheet in enumerate(sheets, 1):
            if sheet.get('state', 'visible') != 'visible':
                if 'XLSX_HIDDEN_SHEETS_SKIPPED' not in warnings:
                    warnings.append('XLSX_HIDDEN_SHEETS_SKIPPED')
                continue
            sheet_name = sheet.get('name', '')
            require(0 < len(sheet_name) <= 100, 'INVALID_SHEET')
            rid = next((v for k, v in sheet.attrib.items() if k.endswith('}id')), None)
            rel = rels.get(rid)
            require(rel is not None and rel.get('TargetMode') != 'External' and (rel.get('Type') or '').endswith('/worksheet'), 'EXTERNAL_PART')
            tree = package.tree(part_path('xl', rel.get('Target')))
            seen = set()
            for cell in tree.iter():
                if local(cell.tag) != 'c':
                    continue
                address = cell.get('r', '')
                require(re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,6}', address) and address not in seen, 'INVALID_CELL')
                seen.add(address)
                require(len(seen) <= 10000, 'CELL_LIMIT')
                value = next((c.text or '' for c in cell if local(c.tag) == 'v'), '')
                formula = next((c for c in cell if local(c.tag) == 'f'), None)
                if formula is not None:
                    value = '=' + (formula.text or '[shared formula]')
                    if 'XLSX_FORMULAS_NOT_EVALUATED' not in warnings:
                        warnings.append('XLSX_FORMULAS_NOT_EVALUATED')
                elif cell.get('t') == 's':
                    require(value.isdigit() and int(value) < len(shared), 'INVALID_SHARED_STRING')
                    value = shared[int(value)]
                elif cell.get('t') == 'inlineStr':
                    value = ''.join(c.text or '' for c in cell.iter() if local(c.tag) == 't')
                elif cell.get('t') == 'b':
                    require(value in ('0', '1'), 'INVALID_CELL')
                    value = 'TRUE' if value == '1' else 'FALSE'
                add(f's{index}-{address}', {'sheet': sheet_name, 'cell': address}, value)
    else:
        package = Package(raw)
        require(package.read('mimetype').strip() == b'application/hwp+zip', 'INVALID_HWPX')
        if 'META-INF/manifest.xml' in package.names:
            manifest = package.tree('META-INF/manifest.xml')
            require(not any('encryption' in local(n.tag).lower() for n in manifest.iter()), 'ENCRYPTED')
        hpf = package.tree('Contents/content.hpf')
        entries = [n for n in hpf.iter() if local(n.tag) == 'item']
        manifest = {n.get('id'): n.get('href') for n in entries}
        require(None not in manifest and len(manifest) == len(entries), 'INVALID_SPINE')
        refs = [n.get('idref') for n in hpf.iter() if local(n.tag) == 'itemref']
        require(0 < len(refs) <= 101 and len(set(refs)) == len(refs), 'INVALID_SPINE')
        warnings.append('HWPX_LAYOUT_NOT_PRESERVED')
        section = 0
        for ref in refs:
            target = manifest.get(ref)
            # Hancom's package uses root-relative Contents/... references.
            # Also accept paths relative to content.hpf without permitting external parts.
            if isinstance(target, str) and target.startswith('Contents/'):
                target = '/' + target
            name = part_path('Contents', target)
            if name == 'Contents/header.xml':
                require(name in package.names, 'MISSING_PART')
                continue
            require(re.fullmatch(r'Contents/section\d+\.xml', name), 'INVALID_SPINE')
            section += 1
            require(section <= 100, 'SECTION_LIMIT')
            tree = package.tree(name)
            paragraphs = [n for n in tree.iter() if local(n.tag) == 'p']
            require(len(paragraphs) <= 10000, 'PARAGRAPH_LIMIT')

            def own_text(node):
                if local(node.tag) == 't':
                    return ''.join(node.itertext())
                return ''.join(own_text(child) for child in node if local(child.tag) != 'p')

            for paragraph, node in enumerate(paragraphs, 1):
                add(f's{section}-p{paragraph}', {'section': section, 'paragraph': paragraph}, own_text(node))
    require(bool(units), 'NO_TEXT')
    return {'schemaVersion': 1, 'filename': file.name, 'format': kind, 'sha256': hashlib.sha256(raw).hexdigest(), 'warnings': warnings, 'units': units}


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        require(len(sys.argv) == 2, 'USAGE')
        print(json.dumps(extract(sys.argv[1]), ensure_ascii=False))
    except ExtractionError as error:
        print(json.dumps({'error': error.code})); sys.exit(1)
    except Exception:
        print(json.dumps({'error': 'EXTRACTION_FAILED'})); sys.exit(1)
