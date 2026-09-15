import json
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "p": "http://schemas.openxmlformats.org/package/2006/relationships"}


def column_index(reference):
    letters = "".join(char for char in reference if char.isalpha())
    value = 0
    for char in letters:
        value = value * 26 + ord(char.upper()) - 64
    return value - 1


def text_value(cell, shared):
    kind = cell.get("t")
    value = cell.find("m:v", NS)
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS))
    if value is None:
        return None
    if kind == "s":
        return shared[int(value.text)]
    return value.text


def read_rows(path, sheet_name):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in item.findall(".//m:t", NS))
                      for item in root.findall("m:si", NS)]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.get("Id"): item.get("Target") for item in rels.findall("p:Relationship", NS)}
        sheet = next((item for item in workbook.findall("m:sheets/m:sheet", NS)
                      if item.get("name") == sheet_name), None)
        if sheet is None:
            raise ValueError(f"Aba não encontrada: {sheet_name}")
        target = targets[sheet.get("{%s}id" % NS["r"])].lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        root = ET.fromstring(archive.read(target))
        rows = []
        for row in root.findall("m:sheetData/m:row", NS):
            if int(row.get("r")) < 5:
                continue
            values = [None] * 5
            for cell in row.findall("m:c", NS):
                index = column_index(cell.get("r"))
                if 0 <= index < 5:
                    values[index] = text_value(cell, shared)
            rows.append(values)
        return rows


if __name__ == "__main__":
    print(json.dumps(read_rows(sys.argv[1], sys.argv[2]), ensure_ascii=False))
