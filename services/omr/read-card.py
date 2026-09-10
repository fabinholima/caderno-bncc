import json
import sys

import cv2
import numpy as np


def detect_answer_groups(image, gray):
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
    found.sort(key=lambda circle: (circle[1], circle[0]))

    visual_rows = []
    for circle in found:
        row = next(
            (
                candidate
                for candidate in visual_rows
                if abs(candidate[0][1] - circle[1]) < 12
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
        for index in range(0, len(row), 5):
            group = row[index : index + 5]
            if len(group) != 5:
                continue
            gaps = [group[item + 1][0] - group[item][0] for item in range(4)]
            if max(gaps) - min(gaps) < 12:
                groups.append(group)
    return groups


def order_groups_by_column(groups):
    if not groups:
        return []
    radius = float(np.median([circle[2] for group in groups for circle in group]))
    tolerance = max(20.0, radius * 2.5)
    columns = []
    for group in sorted(groups, key=lambda item: sum(c[0] for c in item) / 5):
        center_x = sum(circle[0] for circle in group) / 5
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
            centers = [
                sum(circle[0] for circle in item) / 5
                for item in column["groups"]
            ]
            column["center_x"] = float(np.median(centers))

    columns.sort(key=lambda column: column["center_x"])
    ordered = []
    for column in columns:
        ordered.extend(
            sorted(
                column["groups"],
                key=lambda group: sum(circle[1] for circle in group) / 5,
            )
        )
    return ordered


def read_card(file_name):
    image = cv2.imread(file_name)
    if image is None:
        raise ValueError("Imagem do cartão não pôde ser aberta")
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    payload, _, _ = cv2.QRCodeDetector().detectAndDecode(image)
    if not payload:
        raise ValueError("QR Code não localizado")

    groups = order_groups_by_column(detect_answer_groups(image, gray))
    answers = []
    for number, group in enumerate(groups, 1):
        ratios = []
        for x, y, radius in group:
            mask = np.zeros_like(gray)
            cv2.circle(mask, (x, y), max(3, int(radius * 0.58)), 255, -1)
            ratios.append(float((gray[mask == 255] < 130).mean()))
        marked = [
            chr(65 + index)
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
    return {
        "qrPayload": payload,
        "answers": answers,
        "requiresReview": not answers
        or any(answer["status"] != "recognized" for answer in answers),
    }


if __name__ == "__main__":
    print(json.dumps(read_card(sys.argv[1])))
