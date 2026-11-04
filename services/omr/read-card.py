import json
import sys
from itertools import combinations

import cv2
import numpy as np


def detect_answer_groups(image, gray, option_count=5):
    circles = cv2.HoughCircles(
        cv2.GaussianBlur(gray, (5, 5), 1.2),
        cv2.HOUGH_GRADIENT,
        1.2,
        18,
        param1=100,
        param2=24,
        minRadius=7,
        maxRadius=25,
    )
    found = []
    if circles is not None:
        found = [
            (int(x), int(y), int(radius))
            for x, y, radius in circles[0]
            if y > image.shape[0] * 0.2 and radius >= 8
        ]
    # On a tilted photo a row's y drifts across the sheet; estimate the tilt
    # from nearest right-hand neighbours and compare rows without it.
    tilts = []
    for x, y, radius in found:
        right = [(other_x - x, other_y - y) for other_x, other_y, _ in found
                 if radius * 1.5 < other_x - x < radius * 8 and abs(other_y - y) < (other_x - x) * .2]
        if right:
            dx, dy = min(right)
            tilts.append(dy / dx)
    tilt = float(np.median(tilts)) if tilts else 0.0

    def level(circle):
        return circle[1] - tilt * circle[0]

    found.sort(key=lambda circle: (level(circle), circle[0]))

    visual_rows = []
    for circle in found:
        row = next(
            (
                candidate
                for candidate in visual_rows
                if abs(level(candidate[0]) - level(circle)) < 12
            ),
            None,
        )
        if row is None:
            visual_rows.append([circle])
        else:
            row.append(circle)

    groups = []
    for row in visual_rows:
        row.sort(key=lambda circle: circle[0])
        index = 0
        while index <= len(row) - option_count:
            group = row[index : index + option_count]
            gaps = [group[item + 1][0] - group[item][0] for item in range(option_count - 1)]
            if max(gaps) - min(gaps) < 12:
                groups.append(group)
                index += option_count
            else:
                # Text or a mark can look circular. Skip that candidate rather
                # than shifting every response to its right by one position.
                index += 1
    return groups


def order_groups_by_column(groups):
    if not groups:
        return []
    radius = float(np.median([circle[2] for group in groups for circle in group]))
    tolerance = max(20.0, radius * 2.5)
    # A pair of circles that are not neighbours on the same row (one of them
    # was missed) spans a different width from the printed groups.
    width = float(np.median([group[-1][0] - group[0][0] for group in groups]))
    groups = [group for group in groups if abs(group[-1][0] - group[0][0] - width) <= width * .4]
    # Rows tilt with the photo; columns tilt the opposite way. Measure the
    # tilt along each group and work in deskewed coordinates.
    slope = float(np.median([(group[-1][1] - group[0][1]) / (group[-1][0] - group[0][0]) for group in groups]))

    def column_x(group):
        return sum(circle[0] + slope * circle[1] for circle in group) / len(group)

    columns = []
    for group in sorted(groups, key=column_x):
        center_x = column_x(group)
        column = next(
            (
                candidate
                for candidate in columns
                if abs(candidate["center_x"] - center_x) <= tolerance
            ),
            None,
        )
        if column is None:
            columns.append({"center_x": center_x, "groups": [group]})
        else:
            column["groups"].append(group)
            column["center_x"] = float(np.median([column_x(item) for item in column["groups"]]))

    columns.sort(key=lambda column: column["center_x"])
    return snap_to_grid([column["groups"] for column in columns], radius, slope)


def snap_to_grid(columns, radius, slope):
    """Rebuild each column as an evenly spaced grid of bubble positions.

    Low-resolution scans give noisy Hough circles: text far below the grid
    (e.g. a scanner-app footer) forms extra rows, and a row whose circles
    were missed shifts every later answer up by one question.
    """
    def row_of(group):
        # Constant along a printed row whatever the photo's tilt.
        return sum(circle[1] - slope * circle[0] for circle in group) / len(group)

    columns = [sorted(groups, key=row_of) for groups in columns]
    steps = [b - a for groups in columns for a, b in zip(map(row_of, groups), map(row_of, groups[1:]))]
    if len(steps) < 2:
        return [group for groups in columns for group in groups]
    pitch = float(np.median(steps))
    main = max(columns, key=len)
    top, bottom = row_of(main[0]) - pitch * .75, row_of(main[-1]) + pitch * .75
    columns = [kept for kept in ([g for g in groups if top <= row_of(g) <= bottom] for groups in columns) if kept]
    first = min(row_of(groups[0]) for groups in columns)
    radius = round(radius)
    ordered = []
    for groups in columns:
        found = [row_of(group) for group in groups]
        # Along a straight column each option's x and y are linear in the
        # row position; refit once without circles that landed off the line.
        fits = []
        for option in range(len(groups[0])):
            points = np.float32([group[option][:2] for group in groups])
            rows = np.float32(found)
            if len(set(found)) < 2:
                fits.append(lambda row, point=points[0]: point)
                continue
            fit = [np.polyfit(rows, points[:, axis], 1) for axis in (0, 1)]
            error = np.hypot(*(np.polyval(fit[axis], rows) - points[:, axis] for axis in (0, 1)))
            inliers = error <= max(radius, float(np.median(error)) * 3)
            if inliers.sum() >= 2 and len(set(rows[inliers])) > 1:
                fit = [np.polyfit(rows[inliers], points[inliers, axis], 1) for axis in (0, 1)]
            fits.append(lambda row, fit=fit: (np.polyval(fit[0], row), np.polyval(fit[1], row)))
        rows = [found[0]]
        for row in found[1:]:
            previous = rows[-1]
            missing = round((row - previous) / pitch)
            if missing >= 2 and abs((row - previous) / missing - pitch) < pitch * .25:
                rows.extend([previous + (row - previous) * step / missing for step in range(1, missing)])
            rows.append(row)
        # Columns share the first printed row; restore leading rows missed here.
        while rows[0] - pitch >= first - pitch * .4:
            rows.insert(0, rows[0] - pitch)
        for row in rows:
            ordered.append([(*(round(float(value)) for value in fit(row)), radius) for fit in fits])
    return ordered


def compact_registration(gray, qr_points, profile):
    """Locate the four solid marks, then rectify their shared millimetre frame."""
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    minimum = max(5.0, min(gray.shape) * 0.003)
    maximum = min(gray.shape) * 0.045
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)
        if not (minimum <= w <= maximum and minimum <= h <= maximum):
            continue
        if not (0.65 < w / h < 1.5 and area / (w * h) > 0.72):
            continue
        _, (rect_width, rect_height), _ = cv2.minAreaRect(contour)
        if rect_width * rect_height <= 0 or area / (rect_width * rect_height) < .88:
            continue
        perimeter = cv2.arcLength(contour, True)
        if len(cv2.approxPolyDP(contour, .045 * perimeter, True)) != 4:
            continue
        candidates.append((x + w / 2, y + h / 2, (w + h) / 2))
    # Text and QR components can also be square. Require the known spacing,
    # similarly sized marks and the QR immediately to the left of the frame.
    qr_center = np.asarray(qr_points, np.float32).reshape(-1, 2).mean(axis=0)
    width, height = profile['widthMm'], profile['heightMm']
    destination = np.float32([[0, 0], [width * 10, 0], [width * 10, height * 10], [0, height * 10]])
    best = None
    for anchor in candidates:
        similar = [p for p in candidates if .72 < p[2] / anchor[2] < 1.38]
        # Prevent large text-heavy photographs from creating unbounded work.
        if len(similar) > 60:
            continue
        for others in combinations([p for p in similar if p != anchor], 3):
            points = np.float32([p[:2] for p in (anchor, *others)])
            sums, diffs = points.sum(axis=1), np.diff(points, axis=1).ravel()
            ordered = np.float32([points[sums.argmin()], points[diffs.argmin()], points[sums.argmax()], points[diffs.argmax()]])
            if len(set(map(tuple, ordered))) != 4 or not cv2.isContourConvex(ordered.reshape(-1, 1, 2)):
                continue
            # Only the top-left anchor evaluates this quadrilateral.
            if not np.array_equal(ordered[0], np.float32(anchor[:2])):
                continue
            for turn in range(4):
                oriented = np.roll(ordered, turn, axis=0)
                horizontal = (np.linalg.norm(oriented[1] - oriented[0]) + np.linalg.norm(oriented[2] - oriented[3])) / 2
                vertical = (np.linalg.norm(oriented[3] - oriented[0]) + np.linalg.norm(oriented[2] - oriented[1])) / 2
                if vertical < 1 or not 1.7 < horizontal / vertical < 3.8:
                    continue
                relative_mark = anchor[2] / horizontal
                expected_mark = profile['markerSizeMm'] / width
                if not .65 < relative_mark / expected_mark < 1.5:
                    continue
                matrix = cv2.getPerspectiveTransform(oriented, destination)
                qr_normal = cv2.perspectiveTransform(qr_center.reshape(1, 1, 2), matrix)[0, 0] / 10
                if not (-42 < qr_normal[0] < -3 and 0 < qr_normal[1] < height):
                    continue
                ratio_error = abs(horizontal / vertical - width / height)
                size_error = abs(relative_mark / expected_mark - 1)
                score = ratio_error + size_error
                if best is None or score < best[0]:
                    best = (score, matrix)
    if best is None:
        return None
    normalized = cv2.warpPerspective(gray, best[1], (int(width * 10) + 1, int(height * 10) + 1), borderValue=255)
    # Reject square text/QR components masquerading as a missing corner mark.
    # All printed bubble outlines must agree with the recovered geometry.
    outlines = []
    for index in range(profile['questionCount']):
        column, row = divmod(index, profile['rowsPerColumn'])
        y = round((profile['firstRowMm'] + row * profile['rowSpacingMm']) * 10)
        for option in range(len(profile['labels'])):
            x = round((profile['columnStartsMm'][column] + option * profile['columnSpacingMm']) * 10)
            mask = np.zeros_like(normalized)
            cv2.circle(mask, (x, y), round(profile['radiusMm'] * 11.6), 255, -1)
            cv2.circle(mask, (x, y), round(profile['radiusMm'] * 8.4), 0, -1)
            outlines.append(float((normalized[mask == 255] < 150).mean()))
    if min(outlines) < .12 or float(np.median(outlines)) < .2:
        return None
    return {'image': normalized, 'matrix': best[1]}


def read_compact(gray, qr_points, payload, profile):
    registration = compact_registration(gray, qr_points, profile)
    if registration is None:
        return {'qrPayload': payload, 'answers': [], 'requiresReview': True,
                'reviewReason': 'Não foi possível localizar as quatro marcas do cartão compacto. Fotografe o QR e todo o quadro de respostas.'}
    normalized = registration['image']
    answers = []
    for index in range(profile['questionCount']):
        column, row = divmod(index, profile['rowsPerColumn'])
        y = (profile['firstRowMm'] + row * profile['rowSpacingMm']) * 10
        ratios = []
        for option in range(len(profile['labels'])):
            x = (profile['columnStartsMm'][column] + option * profile['columnSpacingMm']) * 10
            mask = np.zeros_like(normalized)
            cv2.circle(mask, (round(x), round(y)), round(profile['radiusMm'] * 10 * .58), 255, -1)
            pixels = normalized[mask == 255]
            ratios.append(float((pixels < 130).mean()))
        marked = [label for label, ratio in zip(profile['labels'], ratios) if ratio >= .6]
        ambiguous = any(.15 < ratio < .6 for ratio in ratios)
        status = 'uncertain' if ambiguous else 'recognized' if len(marked) == 1 else 'blank' if not marked else 'multiple'
        answers.append({'questionNumber': index + 1, 'selectedLabels': marked, 'status': status,
                        'fillRatios': [round(value, 3) for value in ratios]})
    return {'qrPayload': payload, 'answers': answers,
            'requiresReview': any(answer['status'] != 'recognized' for answer in answers)}


# Indícios de foto inadequada. Nunca alteram a leitura: só pedem revisão
# humana ou nova foto. Limites conservadores (desfoque forte, foto escura).
QUALITY_HINTS = {'desfocada': 'a foto parece desfocada', 'escura': 'a foto está escura'}


def image_quality(gray):
    scale = 1000 / max(gray.shape)
    small = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else gray
    issues = []
    if float(np.percentile(np.abs(cv2.Laplacian(small, cv2.CV_64F)), 99.5)) < 30:
        issues.append('desfocada')
    if float(small.mean()) < 80:
        issues.append('escura')
    return issues


def recapture_hint(issues):
    if not issues:
        return ''
    return '; ' + ' e '.join(QUALITY_HINTS[issue] for issue in issues) + \
        '. Fotografe novamente com boa luz, sem sombras e com o celular firme.'


def with_quality(result, issues):
    if not issues:
        return result
    return {**result, 'qualityIssues': issues, 'requiresReview': True,
            'reviewReason': 'Foto com qualidade insuficiente' + recapture_hint(issues) +
            ' Se preferir manter esta foto, confira cada marcação antes de confirmar.'}


def decode_small_qr(image):
    """Decode a QR too small or squashed for the detector's own sampling.

    Scanner apps often shrink the page so each module is ~3 px. The detector
    still finds the code on an enlarged copy; rectifying that quad onto a
    large square with a quiet zone lets the decoder sample it reliably.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    detector = cv2.QRCodeDetector()
    for scale in (2, 3):
        found, points = detector.detect(cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC))
        if not found or points is None:
            continue
        quad = points.reshape(-1, 2).astype(np.float32) / scale
        center = quad.mean(axis=0)
        side, quiet = 400, 60
        destination = np.float32([[quiet, quiet], [quiet + side, quiet], [quiet + side, quiet + side], [quiet, quiet + side]])
        for margin in (0, .03, .06):
            source = (center + (quad - center) * (1 + margin)).astype(np.float32)
            matrix = cv2.getPerspectiveTransform(source, destination)
            warped = cv2.warpPerspective(gray, matrix, (side + 2 * quiet,) * 2, flags=cv2.INTER_CUBIC, borderValue=255)
            binary = cv2.threshold(cv2.GaussianBlur(warped, (3, 3), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
            for candidate in (warped, binary):
                payload = detector.detectAndDecode(candidate)[0]
                if payload:
                    return payload, quad.reshape(1, -1, 2)
    return '', None


def read_card(file_name, profile=None, qr_only=False):
    image = cv2.imread(file_name)
    if image is None:
        raise ValueError("Imagem do cartão não pôde ser aberta")
    issues = image_quality(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
    payload, qr_points = '', None
    for turns in range(4):
        candidate = np.ascontiguousarray(np.rot90(image, turns))
        payload, qr_points, _ = cv2.QRCodeDetector().detectAndDecode(candidate)
        if not payload:
            payload, qr_points = decode_small_qr(candidate)
        if payload:
            image = candidate
            break
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if not payload:
        raise ValueError("QR Code não localizado" + recapture_hint(issues))

    if qr_only:
        return {'qrPayload': payload}
    if profile and profile.get('id') in ('compacto-10-v1', 'certo-errado-10-v1'):
        return with_quality(read_compact(gray, qr_points, payload, profile), issues)
    labels = profile.get('labels', list('ABCDE')) if profile else list('ABCDE')
    groups = order_groups_by_column(detect_answer_groups(image, gray, len(labels)))
    answers = []
    for number, group in enumerate(groups, 1):
        ratios = []
        for x, y, radius in group:
            mask = np.zeros_like(gray)
            cv2.circle(mask, (x, y), max(3, int(radius * 0.58)), 255, -1)
            ratios.append(float((gray[mask == 255] < 130).mean()))
        marked = [
            labels[index]
            for index, ratio in enumerate(ratios)
            if ratio > 0.45
        ]
        status = (
            "recognized"
            if len(marked) == 1
            else "blank"
            if not marked
            else "multiple"
        )
        answers.append(
            {
                "questionNumber": number,
                "selectedLabels": marked,
                "status": status,
                "fillRatios": [round(value, 3) for value in ratios],
            }
        )
    return with_quality({
        "qrPayload": payload,
        "answers": answers,
        "requiresReview": not answers
        or any(answer["status"] != "recognized" for answer in answers),
    }, issues)


if __name__ == "__main__":
    profile = json.loads(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != '--qr-only' else None
    print(json.dumps(read_card(sys.argv[1], profile, '--qr-only' in sys.argv[2:])))
