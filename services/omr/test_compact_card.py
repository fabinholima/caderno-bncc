"""Focused image tests: python -m unittest services/omr/test_compact_card.py."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('card_reader', Path(__file__).with_name('read-card.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def profile_for(template):
    module = (ROOT / 'lib/compact-assessment.mjs').as_uri()
    code = f"import {{ compactCardProfile }} from '{module}'; process.stdout.write(JSON.stringify(compactCardProfile('{template}', 10)));"
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code], text=True))


def card(profile, marked=True):
    image = np.full((1500, 1200, 3), 255, np.uint8)
    scale, origin = 6, (440, 320)
    payload = 'CBS1:00000000-0000-4000-8000-000000000001:0123456789abcdef0123'
    qr = cv2.QRCodeEncoder_create().encode(payload)
    qr = cv2.resize(qr, (210, 210), interpolation=cv2.INTER_NEAREST)
    image[340:550, 200:410] = cv2.cvtColor(qr, cv2.COLOR_GRAY2BGR)
    half = round(profile['markerSizeMm'] * scale / 2)
    for x in [0, profile['widthMm']]:
        for y in [0, profile['heightMm']]:
            cx, cy = round(origin[0] + x * scale), round(origin[1] + y * scale)
            cv2.rectangle(image, (cx - half, cy - half), (cx + half, cy + half), (0, 0, 0), -1)
    for index in range(10):
        column, row = divmod(index, 5)
        for option in range(len(profile['labels'])):
            center = (round(origin[0] + (profile['columnStartsMm'][column] + option * profile['columnSpacingMm']) * scale),
                      round(origin[1] + (profile['firstRowMm'] + row * profile['rowSpacingMm']) * scale))
            cv2.circle(image, center, round(profile['radiusMm'] * scale), (0, 0, 0), 2)
            (text_width, text_height), _ = cv2.getTextSize(profile['labels'][option], cv2.FONT_HERSHEY_SIMPLEX, .27, 1)
            cv2.putText(image, profile['labels'][option],
                        (center[0] - text_width // 2, center[1] + text_height // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, .27, (140, 140, 140), 1, cv2.LINE_AA)
            if marked and option == index % len(profile['labels']):
                cv2.circle(image, center, round(profile['radiusMm'] * scale * .85), (0, 0, 0), -1)
    return image


def standard_judgment_card(question_count=10, marked=True):
    """Synthetic photo for the regular (non-compact) Certo/Errado sheet."""
    image = np.full((1600, 2000, 3), 255, np.uint8)
    payload = 'CBS1:00000000-0000-4000-8000-000000000001:0123456789abcdef0123'
    qr = cv2.QRCodeEncoder_create().encode(payload)
    qr = cv2.resize(qr, (220, 220), interpolation=cv2.INTER_NEAREST)
    image[80:300, 80:300] = cv2.cvtColor(qr, cv2.COLOR_GRAY2BGR)
    columns = min(6, int(np.ceil(question_count / 15)))
    rows_per_column = int(np.ceil(question_count / columns))
    for column in range(columns):
        for row in range(rows_per_column):
            index = column * rows_per_column + row
            if index >= question_count:
                continue
            y = 450 + row * 55
            for option, x in enumerate((350 + column * 260, 398 + column * 260)):
                cv2.circle(image, (x, y), 14, (0, 0, 0), 2)
                label = 'CE'[option]
                (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, .4, 1)
                cv2.putText(image, label, (x - text_width // 2, y + text_height // 2),
                            cv2.FONT_HERSHEY_SIMPLEX, .4, (0, 0, 0), 1, cv2.LINE_AA)
                if marked and option == index % 2:
                    cv2.circle(image, (x, y), 11, (0, 0, 0), -1)
    return image


def standard_five_option_card(question_count=100):
    """Synthetic photo with the same column-major order as the printed A-E grid."""
    image = np.full((1750, 1700, 3), 255, np.uint8)
    payload = 'CBS1:00000000-0000-4000-8000-000000000001:0123456789abcdef0123'
    qr = cv2.QRCodeEncoder_create().encode(payload)
    qr = cv2.resize(qr, (220, 220), interpolation=cv2.INTER_NEAREST)
    image[80:300, 80:300] = cv2.cvtColor(qr, cv2.COLOR_GRAY2BGR)
    columns = min(4, int(np.ceil(question_count / 15)))
    rows_per_column = int(np.ceil(question_count / columns))
    for index in range(question_count):
        column, row = divmod(index, rows_per_column)
        for option in range(5):
            x, y = 220 + column * 350 + option * 42, 370 + row * 50
            cv2.circle(image, (x, y), 17, (0, 0, 0), 2)
            label = 'ABCDE'[option]
            (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, .45, 1)
            cv2.putText(image, label, (x - text_width // 2, y + text_height // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, .45, (0, 0, 0), 1, cv2.LINE_AA)
            if option == index % 5:
                cv2.circle(image, (x, y), 13, (0, 0, 0), -1)
    if question_count == 100:
        # A circular stray mark before the last row must not hide item 100.
        cv2.circle(image, (1215, 1570), 17, (0, 0, 0), 2)
    return image


class CompactCardReading(unittest.TestCase):
    def read(self, image, profile):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'photo.png')
            cv2.imwrite(path, image)
            return reader.read_card(path, profile)

    def test_two_formats_and_rotated_photo(self):
        for template in ('compacto-10-v1', 'certo-errado-10-v1'):
            profile = profile_for(template)
            image = card(profile)
            for picture in (image, cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)):
                result = self.read(picture, profile)
                self.assertFalse(result['requiresReview'])
                self.assertEqual([row['selectedLabels'] for row in result['answers']],
                                 [[profile['labels'][index % len(profile['labels'])]] for index in range(10)])

    def test_missing_registration_and_blank_responses_require_review(self):
        profile = profile_for('compacto-10-v1')
        blank = self.read(card(profile, False), profile)
        self.assertTrue(blank['requiresReview'])
        self.assertTrue(all(row['status'] == 'blank' for row in blank['answers']))
        missing = card(profile)
        x, y = round(440 + profile['widthMm'] * 6), round(320 + profile['heightMm'] * 6)
        cv2.rectangle(missing, (x-16, y-16), (x+16, y+16), (255, 255, 255), -1)
        result = self.read(missing, profile)
        self.assertTrue(result['requiresReview'])
        self.assertEqual(result['answers'], [])

    def test_regular_judgment_sheet_reads_certo_and_errado(self):
        result = self.read(standard_judgment_card(), {'labels': ['C', 'E']})
        self.assertFalse(result['requiresReview'])
        self.assertEqual(
            [row['selectedLabels'] for row in result['answers']],
            [['C' if index % 2 == 0 else 'E'] for index in range(10)],
        )

    def test_regular_judgment_sheet_does_not_count_printed_letters_as_marks(self):
        result = self.read(standard_judgment_card(marked=False), {'labels': ['C', 'E']})
        self.assertTrue(result['requiresReview'])
        self.assertTrue(all(row['status'] == 'blank' for row in result['answers']))

    def test_regular_judgment_sheet_reads_six_vertical_blocks_in_question_order(self):
        result = self.read(standard_judgment_card(100), {'labels': ['C', 'E']})
        self.assertFalse(result['requiresReview'])
        self.assertEqual(len(result['answers']), 100)
        self.assertEqual(
            [row['selectedLabels'] for row in result['answers']],
            [['C' if index % 2 == 0 else 'E'] for index in range(100)],
        )

    def test_regular_five_option_sheet_reads_four_vertical_blocks_in_question_order(self):
        result = self.read(standard_five_option_card(), {'labels': list('ABCDE')})
        self.assertFalse(result['requiresReview'])
        self.assertEqual(len(result['answers']), 100)
        self.assertEqual(
            [row['selectedLabels'] for row in result['answers']],
            [[list('ABCDE')[index % 5]] for index in range(100)],
        )


if __name__ == '__main__':
    unittest.main()
