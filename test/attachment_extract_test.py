import importlib.util
import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('extractor', ROOT / 'scripts/extract-attachment.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class AttachmentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def package(self, name, parts):
        file = self.root / name
        with zipfile.ZipFile(file, 'w', zipfile.ZIP_DEFLATED) as archive:
            for key, value in parts.items():
                archive.writestr(key, value)
        return file

    def xlsx(self, **overrides):
        parts = {
            'xl/workbook.xml': '<workbook xmlns:r="urn:rels"><sheets><sheet name="예산" r:id="r1"/><sheet name="숨김" state="hidden" r:id="hidden"/></sheets></workbook>',
            'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="r1" Type="urn/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="strings" Type="urn/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
            'xl/sharedStrings.xml': '<sst><si><t>합성증빙</t></si></sst>',
            'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B12"><v>1000</v></c><c r="C12"><f>SUM(B12)</f><v>9999</v></c><c r="D1" t="inlineStr"><is><t>참고</t></is></c><c r="E1" t="b"><v>1</v></c></row></sheetData></worksheet>',
        }
        parts.update(overrides)
        return self.package('fixture.xlsx', parts)

    def hwpx(self, **overrides):
        parts = {
            'mimetype': 'application/hwp+zip',
            'Contents/content.hpf': '<package><manifest><item id="s0" href="section0.xml"/><item id="s1" href="section1.xml"/></manifest><spine><itemref idref="s1"/><itemref idref="s0"/></spine></package>',
            'Contents/section0.xml': '<sec><p><run><t>나중 문단</t></run></p></sec>',
            'Contents/section1.xml': '<sec><p><run><t>먼저 문단</t><tbl><p><run><t>표 안 문단</t></run></p></tbl></run></p></sec>',
        }
        parts.update(overrides)
        return self.package('fixture.hwpx', parts)

    def pdf(self, encrypted=False, blank=False):
        writer = PdfWriter()
        page = writer.add_blank_page(width=300, height=300)
        if not blank:
            font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
            page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
            stream = DecodedStreamObject(); stream.set_data(b'BT /F1 12 Tf 10 250 Td (Synthetic evidence 1000) Tj ET')
            page[NameObject('/Contents')] = writer._add_object(stream)
            writer.add_blank_page(width=300, height=300)
        if encrypted:
            writer.encrypt('fixture-only')
        file = self.root / 'fixture.pdf'; writer.write(file)
        return file

    def rejects(self, file, code):
        with self.assertRaises(extractor.ExtractionError) as caught:
            extractor.extract(file)
        self.assertEqual(caught.exception.code, code)

    def test_xlsx_values_locations_and_no_formula_execution(self):
        result = extractor.extract(self.xlsx())
        self.assertEqual([u['text'] for u in result['units']], ['합성증빙', '1000', '=SUM(B12)', '참고', 'TRUE'])
        self.assertEqual(result['units'][1]['location'], {'sheet': '예산', 'cell': 'B12'})
        self.assertIn('XLSX_HIDDEN_SHEETS_SKIPPED', result['warnings'])
        self.assertIn('XLSX_FORMULAS_NOT_EVALUATED', result['warnings'])

    def test_hwpx_spine_order_and_nested_paragraphs(self):
        result = extractor.extract(self.hwpx())
        self.assertEqual([u['text'] for u in result['units']], ['먼저 문단', '표 안 문단', '나중 문단'])
        self.assertEqual(result['units'][1]['location'], {'section': 1, 'paragraph': 2})
        self.assertEqual(result['units'][2]['location']['section'], 2)

    def test_pdf_page_locations_and_textless_warning(self):
        result = extractor.extract(self.pdf())
        self.assertEqual(len(result['units']), 1)
        self.assertEqual(result['units'][0]['location'], {'page': 1})
        self.assertIn('Synthetic evidence', result['units'][0]['text'])
        self.assertIn('PDF_TEXTLESS_PAGES', result['warnings'])

    def test_hwpx_hancom_root_paths_and_header_spine(self):
        hpf = '<package><manifest><item id="header" href="Contents/header.xml"/><item id="section0" href="Contents/section0.xml"/></manifest><spine><itemref idref="header"/><itemref idref="section0"/></spine></package>'
        result = extractor.extract(self.hwpx(**{'Contents/content.hpf': hpf, 'Contents/header.xml': '<head/>'}))
        self.assertEqual(result['units'], [{'id': 's1-p1', 'location': {'section': 1, 'paragraph': 1}, 'text': '나중 문단'}])

    def test_encrypted_and_textless_documents(self):
        self.rejects(self.pdf(encrypted=True), 'ENCRYPTED')
        self.rejects(self.pdf(blank=True), 'NO_TEXT')
        self.rejects(self.hwpx(**{'META-INF/manifest.xml': '<manifest><encryption-data/></manifest>'}), 'ENCRYPTED')

    def test_xml_entities_and_external_relationships(self):
        for content in ['<!DOCTYPE x [<!ENTITY x "private">]><workbook/>', '<!DOCTYPE x><workbook/>'.encode('utf-16')]:
            self.rejects(self.xlsx(**{'xl/workbook.xml': content}), 'UNSAFE_XML')
        for target in ['https://example.invalid/private', '../../private.xml']:
            self.rejects(self.xlsx(**{'xl/_rels/workbook.xml.rels': f'<Relationships><Relationship Id="r1" Type="urn/worksheet" Target="{target}"/></Relationships>'}), 'EXTERNAL_PART')

    def test_duplicate_parts_and_text_limits(self):
        file = self.xlsx()
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            with zipfile.ZipFile(file, 'a') as archive:
                archive.writestr('xl/workbook.xml', '<workbook/>')
        self.rejects(file, 'DUPLICATE_PART')
        self.rejects(self.hwpx(**{'Contents/section1.xml': '<sec><p><t>' + 'x' * 30001 + '</t></p></sec>'}), 'TEXT_LIMIT')

    def test_unsupported_hwp_and_invalid_spine(self):
        file = self.root / 'fixture.hwp'; file.write_bytes(b'not-supported')
        self.rejects(file, 'UNSUPPORTED_FORMAT')
        self.rejects(self.hwpx(**{'Contents/content.hpf': '<package><spine/></package>'}), 'INVALID_SPINE')

    def test_node_cli_extract_bind_search_and_preserve_input(self):
        import os
        import sys
        dataset = self.root / 'input.json'; output = self.root / 'output.json'
        create = "import {createDemoDataset} from './src/demo.mjs'; import fs from 'node:fs'; fs.writeFileSync(process.argv[1], JSON.stringify(createDemoDataset(new Date('2026-10-22T00:00:00Z'))));"
        subprocess.run(['node', '--input-type=module', '-e', create, str(dataset)], cwd=ROOT, check=True, capture_output=True)
        before = dataset.read_bytes()
        env = dict(os.environ, ATTACHMENT_PYTHON=sys.executable)
        result = subprocess.run(['node', 'scripts/attach-extract.mjs', str(dataset), 'doc-001', str(self.xlsx()), 'fixture', str(output)], cwd=ROOT, env=env, check=True, capture_output=True, text=True, encoding='utf-8')
        self.assertTrue(json.loads(result.stdout)['ok'])
        self.assertEqual(dataset.read_bytes(), before)
        search = "import fs from 'node:fs'; import {validateDataset} from './src/schema.mjs'; import {searchDocuments} from './src/tasks.mjs'; const r=searchDocuments(validateDataset(JSON.parse(fs.readFileSync(process.argv[1]))),'합성증빙',new Date('2026-10-22T00:00:00Z')); if(r.hits.length!==1||r.hits[0].locationLabel!=='예산 · A1') process.exit(1);"
        subprocess.run(['node', '--input-type=module', '-e', search, str(output)], cwd=ROOT, check=True, capture_output=True)
        failed = subprocess.run(['node', 'scripts/attach-extract.mjs', str(dataset), 'doc-001', str(self.xlsx()), 'fixture', str(dataset)], cwd=ROOT, env=env, capture_output=True)
        self.assertNotEqual(failed.returncode, 0); self.assertEqual(dataset.read_bytes(), before)
        saved = output.read_bytes()
        failed = subprocess.run(['node', 'scripts/attach-extract.mjs', str(dataset), 'doc-001', str(self.pdf(encrypted=True)), 'fixture', str(output)], cwd=ROOT, env=env, capture_output=True)
        self.assertNotEqual(failed.returncode, 0); self.assertEqual(output.read_bytes(), saved)


if __name__ == '__main__':
    unittest.main()
